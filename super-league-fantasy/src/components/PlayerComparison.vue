<template>
  <div class="comparison-container">
    <div class="comparison-header">
      <h2>⚖️ Trung tâm Phân tích & So sánh</h2>
      <p>Chọn 2 cầu thủ cùng vị trí để đối chiếu các chỉ số chuyên sâu</p>
    </div>

    <div class="selector-section">
      <div class="player-select-box">
        <label>Cầu thủ 1 (Màu Xanh):</label>
        <select v-model="selectedPlayer1" @change="updateChart" class="custom-select p1-select">
          <option :value="null" disabled>-- Chọn cầu thủ --</option>
          <option v-for="p in store.squad" :key="'p1s' + p.id" :value="p">{{ p.name }} ({{ p.position }}) - Đội hình</option>
          <option v-for="p in marketPlayers" :key="'p1m' + p.id" :value="p">{{ p.name }} ({{ p.position }}) - Thị trường</option>
        </select>
      </div>

      <div class="vs-badge">VS</div>

      <div class="player-select-box">
        <label>Cầu thủ 2 (Màu Đỏ):</label>
        <select v-model="selectedPlayer2" @change="updateChart" class="custom-select p2-select">
          <option :value="null" disabled>-- Chọn cầu thủ --</option>
          <option v-for="p in marketPlayers" :key="'p2m' + p.id" :value="p">{{ p.name }} ({{ p.position }}) - Thị trường</option>
          <option v-for="p in store.squad" :key="'p2s' + p.id" :value="p">{{ p.name }} ({{ p.position }}) - Đội hình</option>
        </select>
      </div>
    </div>

    <!-- Biểu đồ Radar -->
    <div class="chart-wrapper" v-show="selectedPlayer1 && selectedPlayer2">
      <div class="chart-box">
        <canvas ref="compareCanvas"></canvas>
      </div>
    </div>

    <!-- Tactical Fit (Algorithm 3, tính server-side) -->
    <div class="tactical-fit-row" v-if="selectedPlayer1 && selectedPlayer2">
      <div class="tactical-fit-card p1-fit">
        <span class="fit-label">Tactical Fit — {{ selectedPlayer1.name }}</span>
        <span class="fit-score">{{ tacticalFit1 !== null ? `${tacticalFit1}/100` : '—' }}</span>
        <span class="fit-team" v-if="tacticalFitTeam1">{{ tacticalFitTeam1 }}</span>
      </div>
      <div class="tactical-fit-card p2-fit">
        <span class="fit-label">Tactical Fit — {{ selectedPlayer2.name }}</span>
        <span class="fit-score">{{ tacticalFit2 !== null ? `${tacticalFit2}/100` : '—' }}</span>
        <span class="fit-team" v-if="tacticalFitTeam2">{{ tacticalFitTeam2 }}</span>
      </div>
    </div>

    <!-- Bảng so sánh chi tiết (thay đổi theo vị trí) -->
    <div class="stats-table-wrapper" v-if="selectedPlayer1 && selectedPlayer2">
      <div class="position-badge">{{ positionLabel }} — Bộ chỉ số chuyên biệt</div>
      <table class="compare-table">
        <thead>
          <tr>
            <th class="p1-header">{{ selectedPlayer1.name }}</th>
            <th>CHỈ SỐ</th>
            <th class="p2-header">{{ selectedPlayer2.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="row.label">
            <td :class="{ winner: row.p1wins }">
              {{ row.v1 }}
            </td>
            <td class="stat-label">{{ row.label }}</td>
            <td :class="{ winner: row.p2wins }">
              {{ row.v2 }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="empty-state">
      Vui lòng chọn đủ 2 cầu thủ để xem bảng so sánh và phân tích.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { globalStore } from '../store';
import Chart from 'chart.js/auto';

const store = globalStore;
const marketPlayers = ref([]);

const selectedPlayer1 = ref(null);
const selectedPlayer2 = ref(null);
const compareCanvas   = ref(null);
let chartInstance     = null;

const p1Stats = ref({ xG: 0, xA: 0, keyPasses: 0, shots: 0, form: 0 });
const p2Stats = ref({ xG: 0, xA: 0, keyPasses: 0, shots: 0, form: 0 });
const tableRows = ref([]);
const positionLabel = ref('');

const tacticalFit1 = ref(null);
const tacticalFit2 = ref(null);
const tacticalFitTeam1 = ref('');
const tacticalFitTeam2 = ref('');

const fetchTacticalFit = async (player) => {
  try {
    const res = await fetch(`http://localhost:3000/api/players/${player.id}/tactical-fit`);
    const data = await res.json();
    if (!data.success) return { score: null, teamName: '' };
    return { score: data.score, teamName: data.teamName || '' };
  } catch (err) {
    console.error('[PlayerComparison] Không thể tải Tactical Fit:', err.message);
    return { score: null, teamName: '' };
  }
};

onMounted(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/players');
    marketPlayers.value = await res.json();
  } catch (err) {
    console.error('[PlayerComparison] Không thể tải danh sách cầu thủ:', err.message);
  }
});

const getPlayerPrice = (player) =>
  player.price ?? player.currentPrice ?? 0;

const getFormScore = (formArray) => {
  if (!formArray || !formArray.length) return 0;
  return formArray.reduce((acc, val) => acc + (val === 'W' ? 3 : val === 'D' ? 1 : 0), 0);
};

// Giá trị tối đa thực tế theo từng vị trí để chuẩn hóa radar về 0-100
const normalize = (value, max) => Math.min(100, Math.round((value / (max || 1)) * 100));
const formPct   = (player) => Math.round(getFormScore(player.form) / 9 * 100);
const valuePct  = (player) => Math.min(100, Math.round((15 - getPlayerPrice(player)) / 15 * 100));

// ============================================================
// BỘ CHỈ SỐ CHUYÊN BIỆT THEO VỊ TRÍ
// ============================================================
const POSITION_CONFIG = {
  GK: {
    name: '🧤 Thủ Môn (GK)',
    labels: ['Phân phối', 'Ổn định', 'Phong độ', 'Phản xạ', 'Hiệu quả giá'],
    getScores: (p, s) => [
      normalize(+s.keyPasses, 0.25),
      normalize(1 - +s.xG,   0.99),
      formPct(p),
      normalize(+s.shots,    0.12),
      valuePct(p),
    ],
    tableRowsFn: (p1, s1, p2, s2) => [
      { label: 'Giá tiền (Rẻ hơn là Tốt)',  v1: `$${getPlayerPrice(p1)}M`, v2: `$${getPlayerPrice(p2)}M`, p1wins: getPlayerPrice(p1) < getPlayerPrice(p2), p2wins: getPlayerPrice(p2) < getPlayerPrice(p1) },
      { label: 'Phong độ (3 trận)',          v1: (p1.form||[]).join(' - '), v2: (p2.form||[]).join(' - '), p1wins: getFormScore(p1.form) > getFormScore(p2.form), p2wins: getFormScore(p2.form) > getFormScore(p1.form) },
      { label: 'Phân phối (Key Passes)',     v1: s1.keyPasses,              v2: s2.keyPasses,              p1wins: +s1.keyPasses > +s2.keyPasses, p2wins: +s2.keyPasses > +s1.keyPasses },
      { label: 'Phản xạ (Shots)',            v1: s1.shots,                  v2: s2.shots,                  p1wins: +s1.shots > +s2.shots,         p2wins: +s2.shots > +s1.shots },
      { label: 'Ổn định (xG thấp = Tốt)',   v1: s1.xG,                     v2: s2.xG,                     p1wins: +s1.xG < +s2.xG,              p2wins: +s2.xG < +s1.xG },
    ],
  },
  DEF: {
    name: '🛡️ Hậu Vệ (DEF)',
    labels: ['Tấn công (xG)', 'Kiến tạo (xA)', 'Phong độ', 'Chuyền bóng', 'Hiệu quả giá'],
    getScores: (p, s) => [
      normalize(+s.xG,        0.35),
      normalize(+s.xA,        0.60),
      formPct(p),
      normalize(+s.keyPasses, 0.75),
      valuePct(p),
    ],
    tableRowsFn: (p1, s1, p2, s2) => [
      { label: 'Giá tiền (Rẻ hơn là Tốt)',    v1: `$${getPlayerPrice(p1)}M`, v2: `$${getPlayerPrice(p2)}M`, p1wins: getPlayerPrice(p1) < getPlayerPrice(p2), p2wins: getPlayerPrice(p2) < getPlayerPrice(p1) },
      { label: 'Phong độ (3 trận)',            v1: (p1.form||[]).join(' - '), v2: (p2.form||[]).join(' - '), p1wins: getFormScore(p1.form) > getFormScore(p2.form), p2wins: getFormScore(p2.form) > getFormScore(p1.form) },
      { label: 'Tấn công Kỳ vọng (xG)',       v1: s1.xG,                     v2: s2.xG,                     p1wins: +s1.xG > +s2.xG,              p2wins: +s2.xG > +s1.xG },
      { label: 'Kiến tạo Kỳ vọng (xA)',       v1: s1.xA,                     v2: s2.xA,                     p1wins: +s1.xA > +s2.xA,              p2wins: +s2.xA > +s1.xA },
      { label: 'Chuyền bóng (Key Passes)',     v1: s1.keyPasses,              v2: s2.keyPasses,              p1wins: +s1.keyPasses > +s2.keyPasses, p2wins: +s2.keyPasses > +s1.keyPasses },
    ],
  },
  MID: {
    name: '⚡ Tiền Vệ (MID)',
    labels: ['Ghi bàn (xG)', 'Kiến tạo (xA)', 'Phong độ', 'Chuyền bóng', 'Hiệu quả giá'],
    getScores: (p, s) => [
      normalize(+s.xG,        0.85),
      normalize(+s.xA,        0.96),
      formPct(p),
      normalize(+s.keyPasses, 0.96),
      valuePct(p),
    ],
    tableRowsFn: (p1, s1, p2, s2) => [
      { label: 'Giá tiền (Rẻ hơn là Tốt)',  v1: `$${getPlayerPrice(p1)}M`, v2: `$${getPlayerPrice(p2)}M`, p1wins: getPlayerPrice(p1) < getPlayerPrice(p2), p2wins: getPlayerPrice(p2) < getPlayerPrice(p1) },
      { label: 'Phong độ (3 trận)',          v1: (p1.form||[]).join(' - '), v2: (p2.form||[]).join(' - '), p1wins: getFormScore(p1.form) > getFormScore(p2.form), p2wins: getFormScore(p2.form) > getFormScore(p1.form) },
      { label: 'Ghi bàn Kỳ vọng (xG)',      v1: s1.xG,                     v2: s2.xG,                     p1wins: +s1.xG > +s2.xG,              p2wins: +s2.xG > +s1.xG },
      { label: 'Kiến tạo Kỳ vọng (xA)',     v1: s1.xA,                     v2: s2.xA,                     p1wins: +s1.xA > +s2.xA,              p2wins: +s2.xA > +s1.xA },
      { label: 'Chuyền bóng (Key Passes)',   v1: s1.keyPasses,              v2: s2.keyPasses,              p1wins: +s1.keyPasses > +s2.keyPasses, p2wins: +s2.keyPasses > +s1.keyPasses },
    ],
  },
  FWD: {
    name: '⚽ Tiền Đạo (FWD)',
    labels: ['Ghi bàn (xG)', 'Sút bóng', 'Phong độ', 'Kiến tạo (xA)', 'Hiệu quả giá'],
    getScores: (p, s) => [
      normalize(+s.xG,    1.00),
      normalize(+s.shots, 1.00),
      formPct(p),
      normalize(+s.xA,   0.60),
      valuePct(p),
    ],
    tableRowsFn: (p1, s1, p2, s2) => [
      { label: 'Giá tiền (Rẻ hơn là Tốt)',  v1: `$${getPlayerPrice(p1)}M`, v2: `$${getPlayerPrice(p2)}M`, p1wins: getPlayerPrice(p1) < getPlayerPrice(p2), p2wins: getPlayerPrice(p2) < getPlayerPrice(p1) },
      { label: 'Phong độ (3 trận)',          v1: (p1.form||[]).join(' - '), v2: (p2.form||[]).join(' - '), p1wins: getFormScore(p1.form) > getFormScore(p2.form), p2wins: getFormScore(p2.form) > getFormScore(p1.form) },
      { label: 'Ghi bàn Kỳ vọng (xG)',      v1: s1.xG,                     v2: s2.xG,                     p1wins: +s1.xG > +s2.xG,   p2wins: +s2.xG > +s1.xG },
      { label: 'Số lần Sút (Shots)',         v1: s1.shots,                  v2: s2.shots,                  p1wins: +s1.shots > +s2.shots, p2wins: +s2.shots > +s1.shots },
      { label: 'Kiến tạo Kỳ vọng (xA)',     v1: s1.xA,                     v2: s2.xA,                     p1wins: +s1.xA > +s2.xA,   p2wins: +s2.xA > +s1.xA },
    ],
  },
};

const generateStats = (player) => {
  if (player.stats) {
    return {
      xG:        Number(player.stats.xG).toFixed(2),
      xA:        Number(player.stats.xA).toFixed(2),
      keyPasses: Number(player.stats.keyPasses).toFixed(2),
      shots:     Number(player.stats.shots).toFixed(2),
      form:      Number(player.stats.form).toFixed(2),
    };
  }
  const pos = player.position || 'MID';
  const rand = (max) => (Math.random() * max).toFixed(2);
  const maxMap = {
    GK:  { xG: 0.10, xA: 0.15, kp: 0.25, sh: 0.12 },
    DEF: { xG: 0.35, xA: 0.60, kp: 0.75, sh: 0.32 },
    MID: { xG: 0.85, xA: 0.96, kp: 0.96, sh: 0.70 },
    FWD: { xG: 1.00, xA: 0.60, kp: 0.50, sh: 1.00 },
  };
  const m = maxMap[pos] || maxMap.MID;
  return { xG: rand(m.xG), xA: rand(m.xA), keyPasses: rand(m.kp), shots: rand(m.sh), form: rand(1) };
};

const updateChart = async () => {
  if (!selectedPlayer1.value || !selectedPlayer2.value) return;

  const p1 = selectedPlayer1.value;
  const p2 = selectedPlayer2.value;

  p1Stats.value = generateStats(p1);
  p2Stats.value = generateStats(p2);

  tacticalFit1.value = null;
  tacticalFit2.value = null;
  fetchTacticalFit(p1).then(({ score, teamName }) => { tacticalFit1.value = score; tacticalFitTeam1.value = teamName; });
  fetchTacticalFit(p2).then(({ score, teamName }) => { tacticalFit2.value = score; tacticalFitTeam2.value = teamName; });

  // Dùng vị trí P1 làm chuẩn (nếu 2 cầu thủ khác vị trí, dùng vị trí P1)
  const pos    = p1.position || 'MID';
  const config = POSITION_CONFIG[pos] || POSITION_CONFIG.MID;

  positionLabel.value = config.name;
  tableRows.value     = config.tableRowsFn(p1, p1Stats.value, p2, p2Stats.value);

  await nextTick();

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const ctx = compareCanvas.value.getContext('2d');

  chartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: config.labels,
      datasets: [
        {
          label: p1.name,
          data: config.getScores(p1, p1Stats.value),
          backgroundColor: 'rgba(15, 185, 177, 0.35)',
          borderColor: '#0fb9b1',
          pointBackgroundColor: '#0fb9b1',
          pointRadius: 4,
          borderWidth: 2
        },
        {
          label: p2.name,
          data: config.getScores(p2, p2Stats.value),
          backgroundColor: 'rgba(238, 82, 83, 0.35)',
          borderColor: '#ff4757',
          pointBackgroundColor: '#ff4757',
          pointRadius: 4,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          angleLines: { color: 'rgba(255,255,255,0.1)' },
          grid:       { color: 'rgba(255,255,255,0.1)' },
          pointLabels: { color: '#d1d8e0', font: { size: 12, weight: 'bold' } },
          ticks: { display: false }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#fff', font: { size: 13 }, padding: 16 }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleFont: { size: 13 },
          bodyFont:  { size: 12 }
        }
      }
    }
  });
};
</script>

<style scoped>
.comparison-container {
  padding: 30px;
  background: #1e272e;
  border-radius: 16px;
  border: 1px solid #2f3640;
  color: white;
  min-height: 600px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

/* Header */
.comparison-header { text-align: center; margin-bottom: 30px; }
.comparison-header h2 { color: #f7b731; font-size: 24px; margin-bottom: 6px; }
.comparison-header p  { color: #a4b0be; font-size: 14px; }

/* Selector row */
.selector-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2d3436;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 30px;
  border: 1px solid #636e72;
  gap: 16px;
}
.player-select-box { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.player-select-box label { font-size: 12px; font-weight: bold; color: #b2bec3; text-transform: uppercase; letter-spacing: 0.8px; }
.custom-select {
  padding: 12px 14px;
  border-radius: 8px;
  border: 2px solid transparent;
  background: #1e272e;
  color: white;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  width: 100%;
}
.p1-select { border-color: rgba(15, 185, 177, 0.4); }
.p1-select:focus { border-color: #0fb9b1; box-shadow: 0 0 10px rgba(15, 185, 177, 0.3); }
.p2-select { border-color: rgba(255, 71, 87, 0.4); }
.p2-select:focus { border-color: #ff4757; box-shadow: 0 0 10px rgba(255, 71, 87, 0.3); }

.vs-badge {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #0fb9b1 0%, #ff4757 100%);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: 900;
  font-size: 17px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.4);
  border: 3px solid #2d3436;
}

/* Chart */
.chart-wrapper { display: flex; justify-content: center; margin-bottom: 30px; }
.chart-box {
  width: 100%;
  max-width: 520px;
  height: 400px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 20px;
  border: 1px dashed #636e72;
}

/* Tactical Fit */
.tactical-fit-row { display: flex; gap: 16px; margin-bottom: 20px; }
.tactical-fit-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px;
  border-radius: 12px;
  background: #2d3436;
  border: 1px solid #636e72;
}
.p1-fit { border-color: rgba(15, 185, 177, 0.4); }
.p2-fit { border-color: rgba(255, 71, 87, 0.4); }
.fit-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #a4b0be; }
.fit-score { font-size: 26px; font-weight: 900; color: #f7b731; }
.fit-team { font-size: 12px; color: #636e72; }

/* Comparison table */
.stats-table-wrapper { overflow: hidden; border-radius: 12px; border: 1px solid #636e72; }
.position-badge { background: linear-gradient(135deg, #1e3a5f, #2d3436); color: #0fb9b1; font-size: 13px; font-weight: 700; padding: 10px 18px; letter-spacing: 0.5px; border-bottom: 1px solid #636e72; }
.compare-table { width: 100%; border-collapse: collapse; text-align: center; }
.compare-table th { padding: 14px; font-size: 15px; font-weight: 900; background: #2d3436; }
.p1-header { color: #0fb9b1; width: 32%; }
.p2-header { color: #ff4757; width: 32%; }
.compare-table td { padding: 14px; border-bottom: 1px solid #2f3640; font-size: 14px; background: #1e272e; transition: background 0.2s; }
.stat-label { color: #a4b0be; font-size: 12px; font-weight: bold; text-transform: uppercase; background: #2d3436 !important; letter-spacing: 0.6px; }
.winner { color: #2ecc71 !important; font-weight: 900; background: rgba(46, 204, 113, 0.08) !important; }

/* Empty state */
.empty-state {
  text-align: center;
  color: #636e72;
  padding: 60px 20px;
  font-style: italic;
  font-size: 15px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  border: 1px dashed #2f3640;
}
</style>
