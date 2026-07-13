<template>
  <div class="market-container">
    <div class="market-header">
      <h3>🛒 Thị trường Chuyển nhượng</h3>
      <button class="btn-reset" @click="store.resetSquad()">🔄 Reset Đội</button>
    </div>

    <div class="wallet-info">
      <span class="wallet-label">Ví tiền</span>
      <span class="wallet-amount">${{ store.budget.toFixed(1) }}M</span>
      <span v-if="store.penaltyPoints > 0" class="penalty-text">⚠️ -{{ store.penaltyPoints }} pts</span>
    </div>

    <div class="filter-bar">
      <input type="text" v-model="searchQuery" placeholder="🔍 Tìm cầu thủ..." class="search-input" />
      <select v-model="posFilter" class="pos-select">
        <option value="ALL">Tất cả vị trí</option>
        <option value="FWD">Tiền đạo (FWD)</option>
        <option value="MID">Tiền vệ (MID)</option>
        <option value="DEF">Hậu vệ (DEF)</option>
        <option value="GK">Thủ môn (GK)</option>
      </select>
      <select v-model="sortBy" class="pos-select">
        <option value="default">Sắp xếp...</option>
        <option value="price-desc">Giá ↓ cao → thấp</option>
        <option value="price-asc">Giá ↑ thấp → cao</option>
        <option value="form-desc">Phong độ tốt nhất</option>
        <option value="name-asc">Tên A → Z</option>
      </select>
    </div>

    <div class="table-scroll">
      <table class="market-table">
        <colgroup>
          <col class="col-player" />
          <col class="col-club" />
          <col class="col-form" />
          <col class="col-price" />
          <col class="col-action" />
        </colgroup>
        <thead>
          <tr>
            <th class="col-player">Cầu thủ</th>
            <th class="col-club">CLB</th>
            <th class="col-form">Phong độ</th>
            <th class="col-price">Giá</th>
            <th class="col-action">Hành động</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="player in filteredPlayers" :key="player.id" class="market-row">
            <td class="player-name-cell" @click="showAnalytics(player)">
              <span :class="'pos-badge ' + player.position">{{ player.position }}</span>
              <span class="player-name">{{ player.name }}</span>
              <span class="info-icon" title="Xem phân tích">📈</span>
            </td>
            <td class="club-cell">
              <div class="cell-center"><span class="club-badge">{{ getClubName(player.team_id) }}</span></div>
            </td>
            <td class="form-cell">
              <div class="cell-center form-indicator">
              <span v-for="(f, i) in (player.form || [])"
                :key="i"
                :class="['form-dot', f === 'W' ? 'win' : f === 'D' ? 'draw' : 'lose']"
                :title="f === 'W' ? 'Thắng' : f === 'D' ? 'Hòa' : 'Thua'"
              ></span>
              </div>
            </td>
            <td class="price-cell"><div class="cell-center price-text">${{ player.price.toFixed(1) }}M</div></td>
            <td class="action-cell"><div class="cell-right"><button class="buy-btn" @click="attemptBuy(player)">+ Mua</button></div></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- MODAL BNPL -->
    <div v-if="showBnplModal" class="modal-overlay">
      <div class="modal-content">
        <h4>⚠️ Thấu chi ảo (BNPL)</h4>
        <p>Bạn thiếu ${{ missingAmount.toFixed(1) }}M. Vay tín dụng (-4 điểm)?</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showBnplModal = false">Hủy</button>
          <button class="btn-confirm" @click="confirmBnplBuy">Vay ngay</button>
        </div>
      </div>
    </div>

    <!-- MODAL RADAR CHART.JS -->
    <div v-if="showAnalyticsModal" class="modal-overlay" @click.self="closeAnalytics">
      <div class="modal-content analytics-content">
        <div class="analytics-header">
          <span :class="'pos-badge ' + selectedPlayer?.position">{{ selectedPlayer?.position }}</span>
          <h4>{{ selectedPlayer?.name }}</h4>
        </div>
        <p class="role-desc">{{ analyticsRole }}</p>
        <div class="chart-container">
          <canvas ref="radarCanvas"></canvas>
        </div>
        <button class="btn-cancel" @click="closeAnalytics">Đóng</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { globalStore } from '../store';
import Chart from 'chart.js/auto';

const store = globalStore;
const marketPlayers = ref([]);
const searchQuery = ref('');
const posFilter = ref('ALL');
const sortBy = ref('default');
const showBnplModal = ref(false);
const showAnalyticsModal = ref(false);
const missingAmount = ref(0);
const selectedPlayer = ref(null);
const radarCanvas = ref(null);
const analyticsRole = ref('');
let chartInstance = null;

const MIN_BUILD_SIZE = 11;
const SUPERSTAR_RULES = {
  legendaryPrice: 11.0,
  elitePrice: 9.5,
  maxLegendary: 2,
  maxElite: 4,
};

const getPositionAnalytics = (player) => {
  const s = player.stats || {};
  switch (player.position) {
    case 'GK': return {
      labels: ['Phản xạ', 'Phân phối', 'Phong độ', 'Không chiến', 'Cản phá'],
      data: [
        (s.shots    ?? 0) * 100,
        (s.keyPasses?? 0) * 100,
        (s.form     ?? 0) * 100,
        (s.xA       ?? 0) * 100,
        Math.max(0, (1 - (s.xG ?? 0) * 8)) * 100,
      ],
      color: '#74b9ff', bg: 'rgba(116,185,255,0.25)',
      role: '🧤 Thủ môn — Phản xạ và phân phối bóng là chìa khóa. Chỉ số Cản phá cao cho thấy khả năng đọc trận và xử lý tình huống nguy hiểm.',
    };
    case 'DEF': return {
      labels: ['Phòng thủ', 'Tranh chấp', 'Kiến tạo', 'Phong độ', 'Lên công'],
      data: [
        Math.max(0, (1 - (s.xG ?? 0)) * 100),
        (s.shots    ?? 0) * 100,
        (s.xA       ?? 0) * 100,
        (s.form     ?? 0) * 100,
        (s.keyPasses?? 0) * 100,
      ],
      color: '#a29bfe', bg: 'rgba(162,155,254,0.25)',
      role: '🛡️ Hậu vệ — Phòng thủ vững chắc là nền tảng. Chỉ số Lên công và Kiến tạo cao cho thấy hậu vệ có khả năng tham gia tấn công hiệu quả.',
    };
    case 'MID': return {
      labels: ['Ghi bàn', 'Kiến tạo', 'Chuyền chìa khóa', 'Phong độ', 'Sút cú xa'],
      data: [
        (s.xG       ?? 0) * 100,
        (s.xA       ?? 0) * 100,
        (s.keyPasses?? 0) * 100,
        (s.form     ?? 0) * 100,
        (s.shots    ?? 0) * 100,
      ],
      color: '#55efc4', bg: 'rgba(85,239,196,0.25)',
      role: '🎯 Tiền vệ — Nhạc trưởng điều phối lối chơi. Chuyền chìa khóa và Kiến tạo phản ánh khả năng tổ chức, trong khi Ghi bàn thể hiện bản năng tấn công.',
    };
    default: return {
      labels: ['Ghi bàn', 'Kiến tạo', 'Sút trúng đích', 'Phong độ', 'Tạo cơ hội'],
      data: [
        (s.xG       ?? 0) * 100,
        (s.xA       ?? 0) * 100,
        (s.shots    ?? 0) * 100,
        (s.form     ?? 0) * 100,
        (s.keyPasses?? 0) * 100,
      ],
      color: '#fd79a8', bg: 'rgba(253,121,168,0.25)',
      role: '⚡ Tiền đạo — Sát thủ vòng cấm. Ghi bàn và Sút trúng đích là thước đo chính, còn Kiến tạo thể hiện khả năng phối hợp với đồng đội.',
    };
  }
};

const getClubName = (teamId) => {
  const clubs = { 1:'PSG', 2:'ARS', 3:'BAR', 4:'MCI', 5:'LIV', 6:'RMA', 7:'BAY', 8:'AVL', 9:'NEW', 10:'CHE' };
  return clubs[teamId] || 'UNK';
};

onMounted(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/players');
    marketPlayers.value = await res.json();
  } catch (error) { console.error('API Error', error); }
});

const formScore = (p) => (p.form || []).reduce((acc, v) => acc + (v === 'W' ? 3 : v === 'D' ? 1 : 0), 0);

const filteredPlayers = computed(() => {
  let list = marketPlayers.value.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesPos = posFilter.value === 'ALL' || p.position === posFilter.value;
    return matchesSearch && matchesPos;
  });
  if (sortBy.value === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
  else if (sortBy.value === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
  else if (sortBy.value === 'form-desc') list = [...list].sort((a, b) => formScore(b) - formScore(a));
  else if (sortBy.value === 'name-asc') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return list;
});

const canPassSuperstarRule = (candidate) => {
  const legendaryCount = store.squad.filter(p => p.price >= SUPERSTAR_RULES.legendaryPrice).length + (candidate.price >= SUPERSTAR_RULES.legendaryPrice ? 1 : 0);
  if (legendaryCount > SUPERSTAR_RULES.maxLegendary) {
    return {
      ok: false,
      reason: `Giới hạn đội hình: tối đa ${SUPERSTAR_RULES.maxLegendary} siêu sao LEGENDARY (≥ $${SUPERSTAR_RULES.legendaryPrice}M).`
    };
  }

  const eliteCount = store.squad.filter(p => p.price >= SUPERSTAR_RULES.elitePrice).length + (candidate.price >= SUPERSTAR_RULES.elitePrice ? 1 : 0);
  if (eliteCount > SUPERSTAR_RULES.maxElite) {
    return {
      ok: false,
      reason: `Giới hạn đội hình: tối đa ${SUPERSTAR_RULES.maxElite} cầu thủ ELITE (≥ $${SUPERSTAR_RULES.elitePrice}M).`
    };
  }

  return { ok: true };
};

const canKeepBudgetForBuild11 = (candidate) => {
  const projectedSize = store.squad.length + 1;
  if (projectedSize >= MIN_BUILD_SIZE) return { ok: true };

  const remainingSlots = MIN_BUILD_SIZE - projectedSize;
  const budgetAfter = store.budget - candidate.price;

  const ownedIds = new Set(store.squad.map(p => p.id));
  ownedIds.add(candidate.id);

  const cheapestRemaining = marketPlayers.value
    .filter(p => !ownedIds.has(p.id))
    .map(p => p.price)
    .sort((a, b) => a - b)
    .slice(0, remainingSlots);

  if (cheapestRemaining.length < remainingSlots) {
    // Không đủ dữ liệu thị trường để tính chắc chắn -> cho qua
    return { ok: true };
  }

  const reserveNeeded = cheapestRemaining.reduce((sum, p) => sum + p, 0);
  if (budgetAfter < reserveNeeded) {
    return {
      ok: false,
      reason: `Mua ${candidate.name} sẽ khiến bạn khó hoàn thiện ${MIN_BUILD_SIZE} cầu thủ. Cần giữ tối thiểu $${reserveNeeded.toFixed(1)}M cho ${remainingSlots} suất còn lại.`
    };
  }

  return { ok: true };
};

const attemptBuy = async (player) => {
  selectedPlayer.value = player;

  if (!store.isAuthenticated) {
    store.addToast('Vui lòng đăng nhập để giao dịch!', 'error');
    return;
  }

  const superstarCheck = canPassSuperstarRule(player);
  if (!superstarCheck.ok) {
    store.addToast(superstarCheck.reason, 'error');
    return;
  }

  const reserveCheck = canKeepBudgetForBuild11(player);
  if (!reserveCheck.ok) {
    store.addToast(reserveCheck.reason, 'error');
    return;
  }

  if (store.budget >= player.price) {
    if (await store.buyPlayer(player)) {
      store.addToast(`Đã chiêu mộ thành công ${player.name}!`, 'success');
    }
  } else {
    missingAmount.value = player.price - store.budget;
    if (missingAmount.value <= 2.0) { showBnplModal.value = true; }
    else { store.addToast('Giao dịch hủy. BNPL chỉ cho phép vay tối đa $2.0M.', 'error'); }
  }
};

const confirmBnplBuy = async () => {
  showBnplModal.value = false;
  if (await store.buyPlayer(selectedPlayer.value)) {
    store.addToast(`Đã kích hoạt BNPL mua ${selectedPlayer.value.name}. (-4 pts)`, 'info');
  }
};

const showAnalytics = async (player) => {
  selectedPlayer.value = player;
  showAnalyticsModal.value = true;
  await nextTick();
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const cfg = getPositionAnalytics(player);
  analyticsRole.value = cfg.role;
  const ctx = radarCanvas.value.getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: cfg.labels,
      datasets: [{
        label: player.name,
        data: cfg.data,
        backgroundColor: cfg.bg,
        borderColor: cfg.color,
        pointBackgroundColor: '#f7b731',
        pointBorderColor: '#fff',
        borderWidth: 2,
      }]
    },
    options: {
      scales: {
        r: {
          min: 0, max: 100,
          angleLines: { color: 'rgba(255,255,255,0.2)' },
          grid: { color: 'rgba(255,255,255,0.2)' },
          pointLabels: { color: '#d1d8e0', font: { size: 12, weight: 'bold' } },
          ticks: { display: false }
        }
      },
      plugins: { legend: { labels: { color: cfg.color, font: { size: 13 } } } }
    }
  });
};

const closeAnalytics = () => {
  showAnalyticsModal.value = false;
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
};
</script>

<style scoped>
/* Container */
.market-container { padding: 16px; background: #1e272e; border-radius: 16px; border: 1px solid #2f3640; color: #fff; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }

/* Header row */
.market-header { display: flex; justify-content: space-between; align-items: center; }
.market-header h3 { font-size: 18px; font-weight: 800; color: #fff; margin: 0; }

/* Wallet info row */
.wallet-info { display: flex; align-items: center; gap: 8px; background: rgba(43,203,186,0.12); border: 1px solid rgba(43,203,186,0.25); padding: 7px 14px; border-radius: 20px; align-self: flex-start; }
.wallet-label { font-size: 12px; color: #a4b0be; }
.wallet-amount { font-size: 16px; font-weight: 900; color: #2bcbba; }
.penalty-text { font-size: 12px; font-weight: bold; color: #ff6b81; }

/* Reset button */
.btn-reset { background: rgba(255,71,87,0.15); border: 1px solid rgba(255,71,87,0.4); color: #ff6b81; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.2s; }
.btn-reset:hover { background: rgba(255,71,87,0.3); }

/* Filter bar */
.filter-bar { display: flex; gap: 10px; }
.search-input { flex: 1; background: #2d3436; border: 1px solid #636e72; border-radius: 8px; padding: 8px 12px; color: #fff; font-size: 13px; outline: none; }
.search-input:focus { border-color: #0fb9b1; }
.pos-select { background: #2d3436; border: 1px solid #636e72; border-radius: 8px; padding: 8px 10px; color: #fff; font-size: 13px; cursor: pointer; outline: none; }
.pos-select:focus { border-color: #0fb9b1; }

/* Scrollable table wrapper */
.table-scroll { max-height: 400px; overflow-y: auto; border-bottom: 1px solid #2f3640; }
.table-scroll::-webkit-scrollbar { width: 8px; }
.table-scroll::-webkit-scrollbar-track { background: #1e272e; }
.table-scroll::-webkit-scrollbar-thumb { background: #0fb9b1; border-radius: 4px; }
.table-scroll::-webkit-scrollbar-thumb:hover { background: #2bcbba; }

/* Table */
.market-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.market-table thead tr { background: #252e35; }
.market-table th { padding: 9px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #7f8fa6; border-bottom: 2px solid #0fb9b1; white-space: nowrap; overflow: hidden; position: sticky; top: 0; z-index: 5; background-color: #2d3436; }
.col-player { width: 44%; }
.col-club   { width: 12%; }
.col-form   { width: 12%; }
.col-price  { width: 14%; }
.col-action { width: 18%; text-align: right; }
.market-table th.col-club,
.market-table th.col-form,
.market-table th.col-price { text-align: center; }

/* Rows */
.market-row { transition: background 0.15s; }
.market-row:nth-child(even) { background: rgba(255,255,255,0.02); }
.market-row:hover { background: rgba(15,185,177,0.07); }
.market-table td { padding: 10px 8px; border-bottom: 1px solid rgba(47,54,64,0.8); vertical-align: middle; overflow: hidden; height: 58px; }

/* Player cell */
.player-name-cell { cursor: pointer; display: flex; align-items: center; gap: 8px; min-width: 0; }
.player-name { color: #e0e6ed; font-weight: 600; font-size: 14px; white-space: nowrap; transition: color 0.15s; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.market-row:hover .player-name { color: #0fb9b1; }
.info-icon { font-size: 13px; opacity: 0; transition: opacity 0.2s; cursor: pointer; flex-shrink: 0; }
.market-row:hover .info-icon { opacity: 1; }

.cell-center { display: inline-flex; align-items: center; justify-content: center; width: 100%; }
.cell-right { display: inline-flex; align-items: center; justify-content: flex-end; width: 100%; }

.club-cell,
.form-cell,
.price-cell { text-align: center; }

.action-cell { text-align: right; white-space: nowrap; }

/* Position badge */
.pos-badge { padding: 3px 7px; border-radius: 5px; font-size: 10px; font-weight: 800; color: white; letter-spacing: 0.5px; flex-shrink: 0; }
.FWD { background: linear-gradient(135deg, #c0392b, #e74c3c); }
.MID { background: linear-gradient(135deg, #d35400, #e67e22); }
.DEF { background: linear-gradient(135deg, #1a5276, #2980b9); }
.GK  { background: linear-gradient(135deg, #6c3483, #9b59b6); }

/* Club badge */
.club-badge { display: inline-block; background: rgba(99,110,114,0.3); color: #a4b0be; font-size: 11px; font-weight: 700; letter-spacing: 1px; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(99,110,114,0.4); }

/* Price */
.price-text { font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; color: #f7b731; letter-spacing: 0.2px; }

/* Buy button */
.buy-btn { background: linear-gradient(135deg, #0fb9b1, #01a3a4); color: white; border: none; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 12px; transition: all 0.2s; white-space: nowrap; display: inline-block; }
.buy-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(15,185,177,0.45); filter: brightness(1.1); }
.buy-btn:active { transform: translateY(0); }
.buy-btn { min-width: 76px; text-align: center; }

/* Modal CSS giữ nguyên */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(3px);}
.modal-content { background: #2d3436; padding: 25px; border-radius: 12px; text-align: center; color: white; border: 1px solid #636e72; box-shadow: 0 15px 30px rgba(0,0,0,0.5);}
.modal-actions { display: flex; justify-content: space-around; margin-top: 20px; }
.btn-cancel { background: #636e72; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.btn-confirm { background: #ff4757; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; box-shadow: 0 0 15px rgba(255, 71, 87, 0.4);}

/* Radar SVG - replaced by Chart.js */
.analytics-content { width: 480px; }
.analytics-header { display: flex; align-items: center; gap: 10px; justify-content: center; margin-bottom: 6px; }
.analytics-header h4 { margin: 0; font-size: 18px; font-weight: 800; color: #fff; }
.role-desc { font-size: 12px; color: #b2bec3; line-height: 1.5; margin: 0 0 12px; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 8px; border-left: 3px solid #0fb9b1; text-align: left; }
.chart-container { width: 380px; height: 380px; margin: 0 auto 16px; }

/* Form indicator dots */
.form-indicator { display: inline-flex; gap: 5px; align-items: center; justify-content: center; }
.form-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.form-dot.win  { background-color: #2ecc71; }
.form-dot.draw { background-color: #f1c40f; }
.form-dot.lose { background-color: #e74c3c; }
</style>