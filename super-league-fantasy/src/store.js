import { reactive, watch } from 'vue';
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:3000/api';
const DEFAULT_TEAM_BUDGET = 100.0;

let socketInstance = null;

const normalizeBudget = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TEAM_BUDGET;
  // Migration: dữ liệu cũ dùng scale 10.0 (M) -> nâng lên scale 100.0 (M)
  if (n <= 20) return Math.round(n * 10 * 10) / 10;
  return Math.round(n * 10) / 10;
};

// ============================================================
// AUTH STATE - Khởi tạo từ localStorage nếu có phiên cũ
// ============================================================
const savedToken = localStorage.getItem('auth_token') || null;
const savedUser  = JSON.parse(localStorage.getItem('auth_user')) || null;

// ============================================================
// SQUAD STATE - Chỉ tải nếu đã đăng nhập (phòng giả mạo dữ liệu)
// ============================================================
const savedSquad       = savedToken ? (JSON.parse(localStorage.getItem('fantasy_squad'))   || []) : [];
const savedBudget      = savedToken ? normalizeBudget(parseFloat(localStorage.getItem('fantasy_budget'))) : DEFAULT_TEAM_BUDGET;
const savedCaptain     = savedToken ? (localStorage.getItem('fantasy_captain')             || null) : null;
const savedViceCaptain = savedToken ? (localStorage.getItem('fantasy_vice_captain')        || null) : null;

// Tải sẵn âm thanh (play() có thể bị block bởi autoplay policy, bắt lỗi an toàn)
const soundGoal = new Audio('https://actions.google.com/sounds/v1/crowds/crowd_cheer.ogg');
const soundCoin = new Audio('https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg');
const playSound = (audio) => { try { audio.currentTime = 0; audio.play().catch(() => {}); } catch (_) {} };

export const globalStore = reactive({
  // ============================================================
  // AUTH STATE
  // ============================================================
  authToken: savedToken,
  currentUser: savedUser, // { id, username, virtualBalance, penaltyPoints }

  get isAuthenticated() {
    return !!this.authToken && !!this.currentUser;
  },

  // ============================================================
  // SQUAD STATE
  // ============================================================
  budget: savedUser ? normalizeBudget(savedUser.virtualBalance ?? savedBudget) : savedBudget,
  penaltyPoints: savedUser ? (savedUser.penaltyPoints || 0) : 0,
  captainId: savedCaptain ? parseInt(savedCaptain) : null,
  viceCaptainId: savedViceCaptain ? parseInt(savedViceCaptain) : null,
  eventFeed: [],
  toasts: [],
  squad: savedSquad,

  // Getter: sơ đồ chiến thuật
  get currentFormation() {
    const starters = this.squad.filter(p => p.isStarting);
    const def = starters.filter(p => p.position === 'DEF').length;
    const mid = starters.filter(p => p.position === 'MID').length;
    const fwd = starters.filter(p => p.position === 'FWD').length;
    if (starters.length < 11) return 'Đang xây dựng...';
    return `${def} - ${mid} - ${fwd}`;
  },

  // Getter: tổng điểm live của đội hình xuất phát
  get totalLivePoints() {
    return this.squad
      .filter(p => p.isStarting)
      .reduce((sum, p) => sum + (p.livePoints || 0), 0);
  },

  addToast(message, type = 'success') {
    const id = Date.now();
    this.toasts.push({ id, message, type });
    setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 3000);
  },

  canAddPlayer(position) {
    const limits = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
    return this.squad.filter(p => p.position === position).length < limits[position];
  },

  addPlayerToSquad(player) {
    if (this.squad.find(p => p.id === player.id)) {
      this.addToast('Cầu thủ này đã có trong đội hình!', 'error');
      return false;
    }
    if (this.canAddPlayer(player.position)) {
      const starterCount = this.squad.filter(p => p.isStarting).length;
      const hasStartingGK = this.squad.some(p => p.isStarting && p.position === 'GK');
      const isStarting =
        starterCount < 11 &&
        (player.position !== 'GK' || !hasStartingGK);

      this.squad.push({ ...player, livePoints: 0, liveEvent: '', isStarting });

      if (player.position === 'GK' && !isStarting) {
        this.addToast('Đội hình xuất phát chỉ được có 1 Thủ môn. Thủ môn mới đã đưa xuống dự bị.', 'info');
      }

      if (!this.captainId && isStarting) this.captainId = player.id;
      playSound(soundCoin); // TÍNH NĂNG 3: Âm thanh mua cầu thủ
      return true;
    }
    return false;
  },

  setCaptain(playerId) {
    const player = this.squad.find(p => p.id === playerId);
    if (player && player.isStarting) {
      if (playerId === this.viceCaptainId) this.viceCaptainId = null;
      this.captainId = playerId;
      this.addToast(`Đã trao băng Đội trưởng cho ${player.name}!`, 'info');
    } else {
      this.addToast('Chỉ được chọn Đội trưởng từ Đội hình xuất phát!', 'error');
    }
  },

  setViceCaptain(playerId) {
    const player = this.squad.find(p => p.id === playerId);
    if (player && player.isStarting) {
      if (playerId === this.captainId) {
        this.addToast('Đội trưởng không thể là Phó đội trưởng!', 'error');
        return;
      }
      this.viceCaptainId = playerId;
      this.addToast(`Đã trao băng Phó Đội trưởng cho ${player.name}!`, 'info');
    } else {
      this.addToast('Chỉ được chọn Phó Đội trưởng từ Đội hình xuất phát!', 'error');
    }
  },

  // ============================================================
  // TRANSFER ACTIONS - Gọi thẳng backend, số dư/điểm phạt luôn
  // lấy từ phản hồi server (không tự tính toán ở client) để khớp
  // với NFR-04 (server không tin số dư do client gửi lên).
  // ============================================================

  async buyPlayer(player, sellPlayerId = null) {
    if (this.squad.find(p => p.id === player.id)) {
      this.addToast('Cầu thủ này đã có trong đội hình!', 'error');
      return false;
    }
    if (!sellPlayerId && !this.canAddPlayer(player.position)) {
      this.addToast(`Hết chỗ trống cho vị trí ${player.position}!`, 'error');
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/transfers/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body: JSON.stringify({ playerIdToBuy: player.id, playerIdToSell: sellPlayerId })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (sellPlayerId) {
        const idx = this.squad.findIndex(p => p.id === sellPlayerId);
        if (idx !== -1) this.squad.splice(idx, 1);
      }
      this.addPlayerToSquad(player);
      this.budget = data.newBalance;
      this.penaltyPoints = data.penaltyPoints;
      return true;
    } catch (err) {
      this.addToast(err.message || 'Giao dịch thất bại. Vui lòng thử lại.', 'error');
      return false;
    }
  },

  async sellPlayer(playerId) {
    const idx = this.squad.findIndex(p => p.id === playerId);
    if (idx === -1) return;
    const player = this.squad[idx];

    try {
      const res = await fetch(`${API_BASE}/transfers/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body: JSON.stringify({ playerId })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      this.squad.splice(idx, 1);
      this.budget = data.newBalance;
      this.penaltyPoints = data.penaltyPoints;
      if (this.captainId === playerId) this.captainId = null;
      if (this.viceCaptainId === playerId) this.viceCaptainId = null;
      this.addToast(`Đã bán ${player.name} với giá $${data.sellPrice.toFixed(1)}M`, 'info');
      playSound(soundCoin);
    } catch (err) {
      this.addToast(err.message || 'Không thể bán cầu thủ.', 'error');
    }
  },

  swapPlayers(draggedId, targetId) {
    const p1 = this.squad.find(p => p.id === draggedId);
    const p2 = this.squad.find(p => p.id === targetId);
    if (p1 && p2 && p1.isStarting !== p2.isStarting) {
      const incomingStarter = p1.isStarting ? p2 : p1;
      const outgoingStarter = p1.isStarting ? p1 : p2;
      const hasOtherStartingGK = this.squad.some(
        p => p.id !== outgoingStarter.id && p.isStarting && p.position === 'GK'
      );

      if (incomingStarter.position === 'GK' && hasOtherStartingGK) {
        this.addToast('Đội hình xuất phát chỉ được có 1 Thủ môn!', 'error');
        return;
      }

      const temp = p1.isStarting;
      p1.isStarting = p2.isStarting;
      p2.isStarting = temp;
      if (this.captainId === draggedId || this.captainId === targetId) {
        this.captainId = null;
        this.addToast('Đội trưởng bị thay ra, vui lòng chọn mới!', 'error');
      } else {
        this.addToast(`Đã thay người: ${p1.name} ↔ ${p2.name}`, 'success');
      }
    }
  },

  resetSquad() {
    this.squad = [];
    this.captainId = null;
    this.budget = DEFAULT_TEAM_BUDGET;
    this.penaltyPoints = 0;
    this.addToast('Đã làm mới lại toàn bộ đội hình!', 'info');
  },

  // ============================================================
  // AUTH ACTIONS
  // ============================================================

  async login(username, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    this._setAuthSession(data.token, data.user);
    this.addToast(`Chào mừng trở lại, ${data.user.username}! 🏆`, 'success');
  },

  async register(username, password) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    this._setAuthSession(data.token, data.user);
    this.addToast(`Chào mừng ${data.user.username} đến với Super League! ⚽`, 'success');
  },

  logout() {
    this.authToken   = null;
    this.currentUser = null;
    this.squad       = [];
    this.budget      = DEFAULT_TEAM_BUDGET;
    this.penaltyPoints = 0;
    this.captainId   = null;
    this.viceCaptainId = null;
    this.eventFeed   = [];
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('fantasy_squad');
    localStorage.removeItem('fantasy_budget');
    localStorage.removeItem('fantasy_captain');
    localStorage.removeItem('fantasy_vice_captain');
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    this.addToast('Đã đăng xuất thành công!', 'info');
  },

  _setAuthSession(token, user) {
    this.authToken   = token;
    this.currentUser = user;
    this.budget      = normalizeBudget(user.virtualBalance);
    this.penaltyPoints = user.penaltyPoints || 0;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    this.initRealtime();
  },

  initRealtime() {
    if (socketInstance) return; // đã kết nối, tránh mở trùng socket
    const socket = io('http://localhost:3000');
    socketInstance = socket;

    socket.on('connect', () => {
      // Gameweek 1 mặc định — chưa có UI chuyển vòng đấu.
      // Server chỉ phát LIVE_SCORE_UPDATE tới phòng này (room-based fan-out).
      socket.emit('join_gameweek', 1);
    });

    socket.on('LIVE_SCORE_UPDATE', (data) => {
      this.squad.forEach(player => {
        if (player.id === data.playerId) {
          if (!player.isStarting) {
            this.addToast(`${player.name} ghi bàn nhưng đang ngồi dự bị!`, 'error');
            return;
          }
          const isCaptain = player.id === this.captainId;
          const finalPoints = isCaptain ? (data.pointsAdded * 2) : data.pointsAdded;
          player.livePoints += finalPoints;
          player.liveEvent = isCaptain ? `${data.message} (x2 Captain)` : data.message;
          this.eventFeed.unshift({ id: Date.now(), time: new Date().toLocaleTimeString(), text: `${player.name} vừa nhận ${finalPoints} điểm!` });
          playSound(soundGoal); // TÍNH NĂNG 3: Âm thanh bàn thắng
          this.addToast(`🔥 LIVE: ${player.name} +${finalPoints} điểm!`, 'success');
          setTimeout(() => { player.liveEvent = ''; }, 3000);
        }
      });
    });
  }
});

// Lưu vào localStorage mỗi khi squad / budget / captainId thay đổi
watch(
  () => [globalStore.squad, globalStore.budget, globalStore.captainId, globalStore.viceCaptainId],
  () => {
    localStorage.setItem('fantasy_squad', JSON.stringify(globalStore.squad));
    localStorage.setItem('fantasy_budget', globalStore.budget.toString());
    if (globalStore.captainId) localStorage.setItem('fantasy_captain', globalStore.captainId.toString());
    if (globalStore.viceCaptainId) localStorage.setItem('fantasy_vice_captain', globalStore.viceCaptainId.toString());
  },
  { deep: true }
);

// Chỉ mở kết nối realtime nếu đã có phiên đăng nhập từ trước;
// nếu chưa đăng nhập, initRealtime() sẽ được gọi trong _setAuthSession().
if (savedToken) globalStore.initRealtime();