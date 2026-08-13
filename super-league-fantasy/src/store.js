import { reactive, watch } from 'vue';
import { io } from 'socket.io-client';

// VITE_API_BASE is set per-environment (Vercel project settings for prod,
// .env.local for local dev) and must be the backend's origin WITHOUT a
// trailing slash or /api suffix, e.g. https://your-app.onrender.com — falls
// back to localhost so `npm run dev` keeps working with no .env file at all.
export const API_ORIGIN = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
export const API_BASE = `${API_ORIGIN}/api`;
const DEFAULT_TEAM_BUDGET = 100.0;

let socketInstance = null;

// NOTE: there used to be a "normalizeBudget" that auto-multiplied by 10 when
// the balance was <= 20, to paper over the old backend defaulting
// virtualBalance = 10.0 while player prices were already on a 100.0 scale.
// That hack ONLY applied on page load / login, not after buyPlayer()/
// sellPlayer() (which assign `this.budget = data.newBalance` straight from
// the backend) — so the displayed balance was artificially "inflated" on
// first load, then collapsed by exactly the scale difference right after the
// first transaction (reported bug: 100M -> buy for 4.2M -> left with 0.8M
// instead of 95.8M). Fixed at the root in the backend (default
// virtualBalance = 100.0, see migration 20260724140000_fix_virtual_balance_scale)
// so DO NOT reintroduce a multiply/divide scale hack here — the displayed
// budget must always equal exactly what the backend returns.
const normalizeBudget = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : DEFAULT_TEAM_BUDGET;
};

// ============================================================
// SESSION EXPIRY - Requirement: log in again every time the site is opened,
// EXCEPT when reopened within 30 minutes of CLOSING it (closing the tab/
// browser, or switching tabs/minimizing for too long). The clock starts from
// when it was closed — not from when the user logged in — so if the tab
// stays open and in use, the session never auto-expires.
//
// Mechanism: every time the page is hidden/closed (visibilitychange
// 'hidden', pagehide, beforeunload), "auth_closed_at" is written to
// localStorage. The next time the site is opened (or the tab regains
// focus), if now - auth_closed_at > 30 minutes, the session is treated as
// expired, the old session is wiped, and login is required again.
//
// Note: this is a client-side gate — the real JWT is still valid for its
// backend-set TTL (routes/auth.js). Someone who deliberately clears
// "auth_closed_at" from localStorage could bypass this gate. Separately, an
// httpOnly refreshToken cookie (routes/auth.js: /refresh, /logout) lets a
// returning user silently get a new access token without re-entering their
// password once the 1-day JWT expires — see refreshAccessToken() below,
// used by refreshProfile() on app boot.
// ============================================================
const SESSION_GRACE_MS = 30 * 60 * 1000; // 30 minutes

function isSessionExpired() {
  const closedAt = Number(localStorage.getItem('auth_closed_at'));
  if (!closedAt) return false; // no recorded close event yet -> session still valid
  return Date.now() - closedAt > SESSION_GRACE_MS;
}

function clearAuthStorage() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  localStorage.removeItem('auth_closed_at');
  localStorage.removeItem('fantasy_squad');
  localStorage.removeItem('fantasy_budget');
  localStorage.removeItem('fantasy_penalty');
  localStorage.removeItem('fantasy_captain');
  localStorage.removeItem('fantasy_vice_captain');
  localStorage.removeItem('fantasy_locked');
}

// Closed for more than 30 minutes -> wipe the old session BEFORE reading any
// state below, treating the user as not logged in.
if (isSessionExpired()) {
  clearAuthStorage();
}

// ============================================================
// AUTH STATE - Initialized from localStorage if a previous (still valid)
// session exists
// ============================================================
const savedToken = localStorage.getItem('auth_token') || null;
const savedUser  = JSON.parse(localStorage.getItem('auth_user')) || null;

// ============================================================
// SQUAD STATE - Only loaded if logged in (to prevent spoofed data)
// ============================================================
const savedSquad       = savedToken ? (JSON.parse(localStorage.getItem('fantasy_squad'))   || []) : [];
const savedCaptain     = savedToken ? (localStorage.getItem('fantasy_captain')             || null) : null;
const savedViceCaptain = savedToken ? (localStorage.getItem('fantasy_vice_captain')        || null) : null;
const savedLocked      = savedToken ? localStorage.getItem('fantasy_locked') === 'true'    : false;

// "fantasy_budget"/"fantasy_penalty" are updated after EVERY buy/sell (see
// the watch() at the end of the file), so they're always more current than
// "auth_user" in localStorage (which is just a snapshot of the balance at
// login time, never updated afterwards). BUG FIXED: the old version wrongly
// prioritized auth_user.virtualBalance -> every page reload would "restore"
// the balance to exactly what it was at login even though real money had
// been spent, producing the exact symptom "shows 100M but can't afford
// anything because funds are actually gone". Always prefer the more current
// localStorage value; auth_user is only used when there has been no
// transaction at all yet (fantasy_budget/fantasy_penalty never written).
const hasFreshBudget  = savedToken && localStorage.getItem('fantasy_budget') !== null;
const hasFreshPenalty = savedToken && localStorage.getItem('fantasy_penalty') !== null;
const savedBudget = savedToken
  ? (hasFreshBudget ? normalizeBudget(parseFloat(localStorage.getItem('fantasy_budget'))) : normalizeBudget(savedUser?.virtualBalance))
  : DEFAULT_TEAM_BUDGET;
const savedPenalty = savedToken
  ? (hasFreshPenalty ? (parseInt(localStorage.getItem('fantasy_penalty'), 10) || 0) : (savedUser?.penaltyPoints || 0))
  : 0;

// Preload sounds (play() can be blocked by autoplay policy, fail safely)
const soundGoal = new Audio('https://actions.google.com/sounds/v1/crowds/crowd_cheer.ogg');
const soundCoin = new Audio('https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg');
const playSound = (audio) => { try { audio.currentTime = 0; audio.play().catch(() => {}); } catch (_) {} };

export const globalStore = reactive({
  // ============================================================
  // AUTH STATE
  // ============================================================
  authToken: savedToken,
  currentUser: savedUser, // { id, username, virtualBalance, penaltyPoints }
  // Shown once, right after register() succeeds (never after login()) — a
  // short welcome walkthrough of the 4 main gameplay steps. Not persisted to
  // localStorage on purpose: it's an in-memory flag for "this specific
  // session just created the account", not a permanent "has this user ever
  // seen onboarding" record, so it never reappears on a later login.
  showWelcomeModal: false,

  get isAuthenticated() {
    return !!this.authToken && !!this.currentUser;
  },

  // ============================================================
  // SQUAD STATE
  // ============================================================
  budget: savedBudget,
  penaltyPoints: savedPenalty,
  captainId: savedCaptain ? parseInt(savedCaptain) : null,
  viceCaptainId: savedViceCaptain ? parseInt(savedViceCaptain) : null,
  eventFeed: [],
  toasts: [],
  squad: savedSquad,
  squadLocked: savedLocked, // true after a successful "Run Matchday" — locks buy/sell/substitutions
  isRunningMatchday: false,

  // Getter: tactical formation
  get currentFormation() {
    const starters = this.squad.filter(p => p.isStarting);
    const def = starters.filter(p => p.position === 'DEF').length;
    const mid = starters.filter(p => p.position === 'MID').length;
    const fwd = starters.filter(p => p.position === 'FWD').length;
    if (starters.length < 11) return 'Building...';
    return `${def} - ${mid} - ${fwd}`;
  },

  // Getter: total live points for the starting lineup
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
      this.addToast('This player is already in your squad!', 'error');
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
        this.addToast('The starting XI can only have 1 Goalkeeper. The new goalkeeper was moved to the bench.', 'info');
      }

      if (!this.captainId && isStarting) this.captainId = player.id;
      playSound(soundCoin); // FEATURE 3: player purchase sound
      return true;
    }
    return false;
  },

  // Note: must call the backend (POST /api/squad/captain) to write the real
  // captainId to UserSquad — previously this only changed this.captainId on
  // the client, so /api/matchday/run (which reads captainId from the DB)
  // always saw null and reported "no Captain selected" even though the UI
  // was already showing the captain armband.
  async setCaptain(playerId, gameweek = 1) {
    const player = this.squad.find(p => p.id === playerId);
    if (!player || !player.isStarting) {
      this.addToast('Captain can only be picked from the starting XI!', 'error');
      return false;
    }

    const previousCaptainId = this.captainId;
    if (playerId === this.viceCaptainId) this.viceCaptainId = null;
    this.captainId = playerId;

    try {
      const res = await fetch(`${API_BASE}/squad/captain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body: JSON.stringify({ playerId, gameweek })
      });
      const data = await res.json();
      if (res.status === 401) { this.forceLogout(data.error); return false; }
      if (!data.success) throw new Error(data.error);

      this.addToast(`Captain armband given to ${player.name}!`, 'info');
      return true;
    } catch (err) {
      this.captainId = previousCaptainId; // rollback if the backend rejects it
      this.addToast(err.message || 'Could not save Captain. Please try again.', 'error');
      return false;
    }
  },

  // Mirrors setCaptain(): must persist to UserSquad.viceCaptainId on the
  // backend, not just this.viceCaptainId on the client — matchdayService's
  // Captain-didn't-play fallback (feedback item A6) reads viceCaptainId
  // straight from the DB, so a client-only change would silently never take
  // effect during "Run Matchday".
  async setViceCaptain(playerId, gameweek = 1) {
    const player = this.squad.find(p => p.id === playerId);
    if (!player || !player.isStarting) {
      this.addToast('Vice-Captain can only be picked from the starting XI!', 'error');
      return false;
    }
    if (playerId === this.captainId) {
      this.addToast('The Captain cannot also be Vice-Captain!', 'error');
      return false;
    }

    const previousViceCaptainId = this.viceCaptainId;
    this.viceCaptainId = playerId;

    try {
      const res = await fetch(`${API_BASE}/squad/vice-captain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body: JSON.stringify({ playerId, gameweek })
      });
      const data = await res.json();
      if (res.status === 401) { this.forceLogout(data.error); return false; }
      if (!data.success) throw new Error(data.error);

      this.addToast(`Vice-Captain armband given to ${player.name}!`, 'info');
      return true;
    } catch (err) {
      this.viceCaptainId = previousViceCaptainId; // rollback if the backend rejects it
      this.addToast(err.message || 'Could not save Vice-Captain. Please try again.', 'error');
      return false;
    }
  },

  // Feedback item A4 ("phần ưu tiên thay đổi cầu thủ... chưa thấy thể
  // hiện"): persists the bench's substitute priority order so
  // matchdayService's auto-substitution pass actually has an order to
  // follow, instead of an arbitrary/unordered bench.
  async saveBenchOrder(gameweek = 1) {
    const order = this.squad.filter(p => !p.isStarting).map(p => p.id);
    if (order.length === 0) return true;

    try {
      const res = await fetch(`${API_BASE}/squad/bench-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body: JSON.stringify({ order, gameweek })
      });
      const data = await res.json();
      if (res.status === 401) { this.forceLogout(data.error); return false; }
      if (!data.success) throw new Error(data.error);
      return true;
    } catch (err) {
      this.addToast(err.message || 'Could not save the bench order.', 'error');
      return false;
    }
  },

  // ============================================================
  // TRANSFER ACTIONS - Call the backend directly; balance/penalty points
  // always come from the server's response (never computed on the client),
  // matching NFR-04 (the server never trusts a client-supplied balance).
  // ============================================================

  async buyPlayer(player, sellPlayerId = null) {
    if (this.squad.find(p => p.id === player.id)) {
      this.addToast('This player is already in your squad!', 'error');
      return false;
    }
    if (!sellPlayerId && !this.canAddPlayer(player.position)) {
      this.addToast(`No open slots for position ${player.position}!`, 'error');
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/transfers/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body: JSON.stringify({ playerIdToBuy: player.id, playerIdToSell: sellPlayerId })
      });
      const data = await res.json();
      if (res.status === 401) { this.forceLogout(data.error); return false; }
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
      this.addToast(err.message || 'Transaction failed. Please try again.', 'error');
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
      if (res.status === 401) { this.forceLogout(data.error); return false; }
      if (!data.success) throw new Error(data.error);

      this.squad.splice(idx, 1);
      this.budget = data.newBalance;
      this.penaltyPoints = data.penaltyPoints;
      if (this.captainId === playerId) this.captainId = null;
      if (this.viceCaptainId === playerId) this.viceCaptainId = null;
      this.addToast(`Sold ${player.name} for $${data.sellPrice.toFixed(1)}M`, 'info');
      playSound(soundCoin);
    } catch (err) {
      this.addToast(err.message || 'Could not sell player.', 'error');
    }
  },

  swapPlayers(draggedId, targetId) {
    const p1 = this.squad.find(p => p.id === draggedId);
    const p2 = this.squad.find(p => p.id === targetId);
    if (!p1 || !p2) return;

    // Both on the bench -> this is a REORDER (feedback item A4: substitute
    // priority order), not a starter/bench swap. Swap their benchOrder
    // values (defaulting to their current on-screen position if unset) and
    // persist the new order so matchdayService's auto-substitution pass
    // actually has a priority to follow.
    if (!p1.isStarting && !p2.isStarting) {
      const bench = this.squad.filter(p => !p.isStarting);
      const order1 = p1.benchOrder ?? (bench.indexOf(p1) + 1);
      const order2 = p2.benchOrder ?? (bench.indexOf(p2) + 1);
      p1.benchOrder = order2;
      p2.benchOrder = order1;
      this.addToast(`Bench order updated: ${p1.name} ↔ ${p2.name}`, 'success');
      this.saveBenchOrder();
      return;
    }

    if (p1.isStarting !== p2.isStarting) {
      const incomingStarter = p1.isStarting ? p2 : p1;
      const outgoingStarter = p1.isStarting ? p1 : p2;
      const hasOtherStartingGK = this.squad.some(
        p => p.id !== outgoingStarter.id && p.isStarting && p.position === 'GK'
      );

      if (incomingStarter.position === 'GK' && hasOtherStartingGK) {
        this.addToast('The starting XI can only have 1 Goalkeeper!', 'error');
        return;
      }

      const temp = p1.isStarting;
      p1.isStarting = p2.isStarting;
      p2.isStarting = temp;
      if (this.captainId === draggedId || this.captainId === targetId) {
        this.captainId = null;
        this.addToast('Your Captain was substituted out — please pick a new one!', 'error');
      } else if (this.viceCaptainId === draggedId || this.viceCaptainId === targetId) {
        this.viceCaptainId = null;
        this.addToast('Your Vice-Captain was substituted out — please pick a new one!', 'error');
      } else {
        this.addToast(`Substitution made: ${p1.name} ↔ ${p2.name}`, 'success');
      }
    }
  },

  // Calls the backend to actually delete the SquadPick rows and refund at the
  // current price (not the 90% sell price) — PREVIOUSLY this function only
  // cleared client state without touching the DB, so after "resetting" and
  // reloading the page, the old squad would reappear intact.
  async resetSquad() {
    if (!this.isAuthenticated) {
      this.squad = [];
      this.captainId = null;
      this.budget = DEFAULT_TEAM_BUDGET;
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/squad/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.status === 401) { this.forceLogout(data.error); return; }
      if (!data.success) throw new Error(data.error);

      this.squad = [];
      this.captainId = null;
      this.viceCaptainId = null;
      this.squadLocked = false;
      this.budget = data.newBalance;
      this.penaltyPoints = data.penaltyPoints;
      this.addToast('Squad reset successfully!', 'info');
    } catch (err) {
      this.addToast(err.message || 'Could not reset squad.', 'error');
    }
  },

  // ============================================================
  // MATCHDAY ACTION - Runs a full gameweek: calls the backend to compute
  // points (Algorithm 2 - CalculatePlayerMatchPoints) for the 11 starting
  // players, then updates livePoints + "player stats" directly on the squad.
  // Scores/stats always come from the server's response (never computed on
  // the client), keeping the same NFR-04 principle applied to
  // buyPlayer/sellPlayer above.
  // ============================================================
  async runMatchday(gameweek = 1) {
    if (this.squadLocked) {
      this.addToast('This gameweek has already been scored!', 'info');
      return false;
    }
    const starterCount = this.squad.filter(p => p.isStarting).length;
    if (starterCount !== 11) {
      this.addToast(`Your starting XI needs exactly 11 players (currently ${starterCount}).`, 'error');
      return false;
    }
    if (!this.captainId) {
      this.addToast('Please pick a Captain before running Matchday!', 'error');
      return false;
    }

    this.isRunningMatchday = true;
    try {
      const res = await fetch(`${API_BASE}/matchday/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.authToken}` },
        body: JSON.stringify({ gameweek })
      });
      const data = await res.json();
      if (res.status === 401) { this.forceLogout(data.error); return false; }
      if (!data.success) throw new Error(data.error);

      data.breakdown.forEach(entry => {
        const player = this.squad.find(p => p.id === entry.playerId);
        if (!player) return;

        player.livePoints = entry.points;
        player.lastMatchStats = entry.stats;

        // Each stat becomes its own labelled segment joined with a visible
        // "•" separator (not just a space) — previously this was just an
        // emoji + "x1" with a bare space between segments, so if the emoji
        // glyph failed to render (missing font on the presenting machine),
        // multiple badges collapsed into unreadable run-together text like
        // "x1 x1 Clean sheet". The "•" and word labels keep it legible even
        // with zero emoji support.
        const badges = [];
        if (entry.stats) {
          if (entry.stats.minutesPlayed === 0) badges.push('Did not play');
          if (entry.stats.goals) badges.push(`⚽ Goal x${entry.stats.goals}`);
          if (entry.stats.assists) badges.push(`🅰️ Assist x${entry.stats.assists}`);
          if (entry.stats.cleanSheet) badges.push('🧤 Clean sheet');
          if (entry.stats.yellowCards) badges.push(`🟨 Yellow x${entry.stats.yellowCards}`);
          if (entry.stats.redCards) badges.push('🟥 Red card');
        }
        if (entry.isCaptain) badges.push('★ x2 Captain');
        player.liveEvent = badges.join('  •  ');

        this.eventFeed.unshift({
          id: `${Date.now()}_${entry.playerId}`,
          time: new Date().toLocaleTimeString(),
          text: `${player.name}: ${entry.points >= 0 ? '+' : ''}${entry.points} points${entry.isCaptain ? ' (Captain x2)' : ''}`
        });
      });

      this.squadLocked = true;
      playSound(soundGoal);
      this.addToast(`🏁 Gameweek ${data.gameweek} finished! Total points: ${data.totalPoints}`, 'success');
      return true;
    } catch (err) {
      this.addToast(err.message || 'Could not run Matchday. Please try again.', 'error');
      return false;
    } finally {
      this.isRunningMatchday = false;
    }
  },

  // ============================================================
  // AUTH ACTIONS
  // ============================================================

  async login(username, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // required to receive the httpOnly refreshToken cookie
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    this._setAuthSession(data.token, data.user);
    this.addToast(`Welcome back, ${data.user.username}! 🏆`, 'success');
  },

  async register(username, password) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // required to receive the httpOnly refreshToken cookie
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    this._setAuthSession(data.token, data.user);
    this.addToast(`Welcome to Super League, ${data.user.username}! ⚽`, 'success');
    this.showWelcomeModal = true;
  },

  dismissWelcomeModal() {
    this.showWelcomeModal = false;
  },

  async logout(silent = false) {
    // Revoke the refresh token server-side (and clear its cookie) BEFORE
    // wiping local state — otherwise a leaked-but-unused refresh token would
    // stay valid until it naturally expires (30 days) even after "logging out".
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // Backend unreachable — local state is cleared below regardless.
    }

    this.authToken   = null;
    this.currentUser = null;
    this.squad       = [];
    this.budget      = DEFAULT_TEAM_BUDGET;
    this.penaltyPoints = 0;
    this.captainId   = null;
    this.viceCaptainId = null;
    this.eventFeed   = [];
    this.squadLocked = false;
    clearAuthStorage();
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    if (!silent) this.addToast('Logged out successfully!', 'info');
  },

  // "Forced" logout — used when the session has expired (site closed for
  // more than 30 minutes) or the backend returns 401 (expired/invalid token)
  // mid-action. Unlike a normal logout(), this shows the user the reason.
  forceLogout(reason) {
    this.logout(true);
    this.addToast(reason || 'Your session has expired. Please log in again.', 'error');
  },

  _setAuthSession(token, user) {
    this.authToken   = token;
    this.currentUser = user;
    this.budget      = normalizeBudget(user.virtualBalance);
    this.penaltyPoints = user.penaltyPoints || 0;
    // Clear any old squad in state/localStorage BEFORE reloading — in case a
    // DIFFERENT account previously logged in on this same browser and closed
    // the tab without clicking "Log out" (logout() is the only place that
    // clears fantasy_squad/... — skipping this step would let the new user
    // briefly see the previous user's squad until refreshSquad() returns).
    this.squad = [];
    this.captainId = null;
    this.viceCaptainId = null;
    this.squadLocked = false;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.removeItem('auth_closed_at'); // freshly opened session -> no "closed" timestamp yet
    this.initRealtime();
    this.refreshSquad();
  },

  // Exchanges the httpOnly refreshToken cookie (sent automatically by the
  // browser via credentials: 'include') for a brand-new access token,
  // without requiring the user to re-enter their password. Returns true/false
  // rather than throwing, since every caller just needs a yes/no to decide
  // whether to retry or fall back to forceLogout.
  async refreshAccessToken() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!data.success) return false;
      this.authToken = data.token;
      localStorage.setItem('auth_token', data.token);
      return true;
    } catch {
      return false;
    }
  },

  // ============================================================
  // RESYNC WITH BACKEND - Called on app startup (if a session is still
  // active) and immediately after login/register, so the displayed budget/
  // penaltyPoints/squad ALWAYS matches the real data in Postgres — not just
  // localStorage (which can drift: multiple tabs, switching browsers, or any
  // client-side sync bug). This is the second line of defense, after fixing
  // the wrong-value-priority bug in the savedBudget/savedPenalty
  // initialization above.
  // ============================================================
  async refreshProfile() {
    if (!this.authToken) return;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      const data = await res.json();
      if (res.status === 401) {
        // The 1-day access token may simply have expired — try the refresh
        // cookie once before forcing a full re-login.
        if (await this.refreshAccessToken()) return this.refreshProfile();
        this.forceLogout(data.error);
        return;
      }
      if (!data.success) return;

      this.currentUser = { ...this.currentUser, ...data.user };
      this.budget = normalizeBudget(data.user.virtualBalance);
      this.penaltyPoints = data.user.penaltyPoints || 0;
    } catch (err) {
      // Backend not running / network down -> keep whatever value is already
      // in localStorage (already the most recent value as of the last action).
    }
  },

  async refreshSquad(gameweek = 1) {
    if (!this.authToken) return;
    try {
      const res = await fetch(`${API_BASE}/squad?gameweek=${gameweek}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      const data = await res.json();
      if (res.status === 401) { this.forceLogout(data.error); return; }
      if (!data.success) return;

      if (!data.squad) {
        // The backend has no squad for this gameweek yet (new account, or
        // never bought anyone) -> the client squad must also be empty, to
        // avoid showing "ghost" players left over in localStorage.
        this.squad = [];
        this.captainId = null;
        this.squadLocked = false;
        return;
      }

      this.squad = data.squad.picks.map((p) => {
        const existing = this.squad.find((s) => s.id === p.playerId);
        return {
          id: p.playerId,
          name: p.name,
          position: p.position,
          price: p.price,
          team_id: p.team_id,
          teamName: p.teamName,
          form: p.form,
          isStarting: p.isStarting,
          benchOrder: p.benchOrder,
          livePoints: p.points,
          liveEvent: existing?.liveEvent || '',
        };
      });
      this.captainId = data.squad.captainId;
      this.viceCaptainId = data.squad.viceCaptainId;
      this.squadLocked = data.squad.isLocked;
    } catch (err) {
      // Backend not running / network down -> keep the localStorage cache as-is.
    }
  },

  initRealtime() {
    if (socketInstance) return; // already connected, avoid opening a duplicate socket
    const socket = io(API_ORIGIN);
    socketInstance = socket;

    socket.on('connect', () => {
      // Gameweek 1 by default — no gameweek-switching UI exists yet.
      // The server only broadcasts LIVE_SCORE_UPDATE to this room (room-based fan-out).
      socket.emit('join_gameweek', 1);
    });

    socket.on('LIVE_SCORE_UPDATE', (data) => {
      this.squad.forEach(player => {
        if (player.id === data.playerId) {
          if (!player.isStarting) {
            this.addToast(`${player.name} scored but is on the bench!`, 'error');
            return;
          }
          const isCaptain = player.id === this.captainId;
          const finalPoints = isCaptain ? (data.pointsAdded * 2) : data.pointsAdded;
          player.livePoints += finalPoints;
          player.liveEvent = isCaptain ? `${data.message}  •  ★ x2 Captain` : data.message;
          this.eventFeed.unshift({ id: Date.now(), time: new Date().toLocaleTimeString(), text: `${player.name} just earned ${finalPoints} points!` });
          playSound(soundGoal); // FEATURE 3: goal sound
          this.addToast(`🔥 LIVE: ${player.name} +${finalPoints} points!`, 'success');
          setTimeout(() => { player.liveEvent = ''; }, 3000);
        }
      });
    });
  }
});

// Persisted to localStorage every time squad / budget / penaltyPoints /
// captainId change. IMPORTANT: this is the MOST CURRENT value, and must
// always be prioritized over "auth_user" (a snapshot from login time) when
// re-initializing the store — see savedBudget/savedPenalty above.
watch(
  () => [globalStore.squad, globalStore.budget, globalStore.penaltyPoints, globalStore.captainId, globalStore.viceCaptainId, globalStore.squadLocked],
  () => {
    localStorage.setItem('fantasy_squad', JSON.stringify(globalStore.squad));
    localStorage.setItem('fantasy_budget', globalStore.budget.toString());
    localStorage.setItem('fantasy_penalty', globalStore.penaltyPoints.toString());
    if (globalStore.captainId) localStorage.setItem('fantasy_captain', globalStore.captainId.toString());
    if (globalStore.viceCaptainId) localStorage.setItem('fantasy_vice_captain', globalStore.viceCaptainId.toString());
    localStorage.setItem('fantasy_locked', globalStore.squadLocked ? 'true' : 'false');
  },
  { deep: true }
);

// ============================================================
// OAUTH REDIRECT HANDOFF - After "Continue with Google/Facebook/X"
// (AuthModal.vue's social buttons -> routes/oauth.js), the backend redirects
// the browser back here with ?oauth_token=<JWT> on success or
// ?oauth_error=<message> on failure. Consumed once at boot, then stripped
// from the URL immediately so a reload/back-button can't resubmit it. A
// fresh OAuth redirect never has a `savedToken` yet (this is a brand-new
// browser navigation), so this never races the `if (savedToken)` resync below.
// ============================================================
async function handleOAuthRedirect() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const oauthToken = params.get('oauth_token');
  const oauthError = params.get('oauth_error');
  if (!oauthToken && !oauthError) return;

  params.delete('oauth_token');
  params.delete('oauth_error');
  const cleanQuery = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (cleanQuery ? `?${cleanQuery}` : '') + window.location.hash);

  if (oauthError) {
    globalStore.addToast(oauthError, 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${oauthToken}` } });
    const data = await res.json();
    if (!data.success) {
      globalStore.addToast(data.error || 'Login failed. Please try again.', 'error');
      return;
    }
    globalStore._setAuthSession(oauthToken, data.user);
    globalStore.addToast(`Welcome, ${data.user.username}! 🏆`, 'success');
  } catch (err) {
    globalStore.addToast('Could not complete login. Please try again.', 'error');
  }
}
handleOAuthRedirect();

// Only open the realtime connection if a previous login session exists;
// otherwise initRealtime() will be called from _setAuthSession().
// Also resyncs budget/penaltyPoints/squad with the backend right at app
// startup — the second line of defense against data drift (see
// refreshProfile/refreshSquad above).
if (savedToken) {
  globalStore.initRealtime();
  globalStore.refreshProfile();
  globalStore.refreshSquad();
}

// ============================================================
// SESSION EXPIRY - Records the "site closed" timestamp when the tab is
// hidden/closed, and re-checks it as soon as the tab is reopened/refocused
// (no need to wait for a page reload to detect expiry). See the full
// explanation in the SESSION EXPIRY block above.
// ============================================================
function markClosedNow() {
  if (globalStore.authToken) {
    localStorage.setItem('auth_closed_at', Date.now().toString());
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      markClosedNow();
    } else if (document.visibilityState === 'visible') {
      if (globalStore.authToken && isSessionExpired()) {
        globalStore.forceLogout('Your session has expired (site was closed for more than 30 minutes). Please log in again.');
      } else {
        localStorage.removeItem('auth_closed_at'); // back within the grace period -> clear the old close timestamp
      }
    }
  });
  window.addEventListener('pagehide', markClosedNow);
  window.addEventListener('beforeunload', markClosedNow);
}
