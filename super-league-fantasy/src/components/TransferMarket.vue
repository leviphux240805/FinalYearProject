<template>
  <div class="market-container">
    <div class="market-header">
      <h3>🛒 Transfer Market</h3>
      <button class="btn-reset" @click="store.resetSquad()">🔄 Reset Squad</button>
    </div>
    <div v-if="store.squadLocked" class="market-locked-notice">
      🔒 Squad locked for this gameweek — cannot buy/sell players.
    </div>

    <div class="wallet-info">
      <span class="wallet-label">Wallet</span>
      <span class="wallet-amount" :class="{ 'balance-up': walletFlash === 'up', 'balance-down': walletFlash === 'down' }">${{ animatedWallet.toFixed(1) }}M</span>
      <span v-if="store.penaltyPoints > 0" class="penalty-text">⚠️ -{{ store.penaltyPoints }} pts</span>
    </div>

    <div class="filter-bar">
      <input type="text" v-model="searchQuery" placeholder="🔍 Search players..." class="search-input" />
      <select v-model="posFilter" class="pos-select">
        <option value="ALL">All positions</option>
        <option value="FWD">Forward (FWD)</option>
        <option value="MID">Midfielder (MID)</option>
        <option value="DEF">Defender (DEF)</option>
        <option value="GK">Goalkeeper (GK)</option>
      </select>
      <select v-model="sortBy" class="pos-select">
        <option value="default">Sort by...</option>
        <option value="price-desc">Price ↓ high → low</option>
        <option value="price-asc">Price ↑ low → high</option>
        <option value="form-desc">Best form</option>
        <option value="name-asc">Name A → Z</option>
      </select>
    </div>

    <div class="table-scroll">
      <table class="market-table">
        <colgroup>
          <col class="col-player" />
          <col class="col-club" />
          <col class="col-price" />
          <col class="col-action" />
        </colgroup>
        <thead>
          <tr>
            <th class="col-player">Player</th>
            <th class="col-club">Club</th>
            <th class="col-price">Price</th>
            <th class="col-action">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="player in filteredPlayers" :key="player.id" class="market-row">
            <td class="player-name-cell" @click="showAnalytics(player)">
              <img
                v-if="player.photoUrl && !brokenPhotoIds.has(player.id)"
                :src="player.photoUrl"
                class="player-photo"
                alt=""
                @error="onPhotoError(player.id)"
              />
              <div v-else class="player-photo player-photo-fallback">
                <span :class="'pos-badge pos-badge-lg ' + player.position">{{ player.position }}</span>
              </div>
              <div class="player-name-wrap">
                <span class="player-name">{{ player.name }}</span>
                <span :class="'pos-badge ' + player.position">{{ player.position }}</span>
              </div>
              <span class="info-icon" title="View analytics">📈</span>
            </td>
            <td class="club-cell">
              <div class="cell-center club-badges-group">
                <div class="club-league-icons">
                  <img
                    v-if="getClubBadgeUrl(player.teamId) && !brokenClubBadgeIds.has(player.teamId)"
                    :src="getClubBadgeUrl(player.teamId)"
                    class="club-badge-icon"
                    alt=""
                    :title="player.teamName || ''"
                    @error="onClubBadgeError(player.teamId)"
                  />
                  <img
                    v-if="getLeagueBadgeUrl(player.leagueName) && !brokenLeagueBadgeIds.has(player.leagueName)"
                    :src="getLeagueBadgeUrl(player.leagueName)"
                    class="league-badge-icon"
                    alt=""
                    :title="player.leagueName || ''"
                    @error="onLeagueBadgeError(player.leagueName)"
                  />
                </div>
                <span class="club-badge" :style="clubBadgeStyle(player)" :title="player.teamName || ''">{{ getClubName(player) }}</span>
              </div>
            </td>
            <td class="price-cell"><div class="cell-center price-text">${{ player.price.toFixed(1) }}M</div></td>
            <td class="action-cell"><div class="cell-right"><button class="buy-btn" :disabled="store.squadLocked" @click="attemptBuy(player)">+ Buy</button></div></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- BNPL MODAL -->
    <div v-if="showBnplModal" class="modal-overlay">
      <div class="modal-content">
        <h4>⚠️ Virtual Overdraft (BNPL)</h4>
        <p>You're short ${{ missingAmount.toFixed(1) }}M. Take out credit (-4 points)?</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showBnplModal = false">Cancel</button>
          <button class="btn-confirm" @click="confirmBnplBuy">Borrow Now</button>
        </div>
      </div>
    </div>

    <!-- CHART.JS RADAR MODAL -->
    <div v-if="showAnalyticsModal" class="modal-overlay" @click.self="closeAnalytics">
      <div class="modal-content analytics-content">
        <div class="analytics-header">
          <span :class="'pos-badge ' + selectedPlayer?.position">{{ selectedPlayer?.position }}</span>
          <h4>{{ selectedPlayer?.name }}</h4>
        </div>
        <template v-if="hasAnalyticsData">
          <p class="role-desc">{{ analyticsRole }}</p>
          <div class="chart-container">
            <canvas ref="radarCanvas"></canvas>
          </div>
        </template>
        <p v-else class="no-data-notice">📊 This player doesn't have detailed analytics data yet (the free API-Football plan doesn't provide minutes-played data for every player).</p>

        <!-- MATCH HISTORY (feedback item A1 — "bảng chi tiết: điểm số từng
             vòng, số trận thi đấu, số phút thi đấu") -->
        <div class="history-section">
          <h5 class="history-title">📋 Gameweek-by-Gameweek History</h5>
          <div v-if="historyLoading" class="history-loading">Loading...</div>
          <template v-else-if="playerHistory.length > 0">
            <div class="history-summary">
              <span>Matches played: <strong>{{ historyMatchesPlayed }}</strong></span>
              <span>Total points so far: <strong>{{ historyTotalPoints }}</strong></span>
            </div>
            <div class="history-table-scroll">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>GW</th><th>Min</th><th>G</th><th>A</th><th>CS</th><th>YC</th><th>RC</th><th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in playerHistory" :key="row.gameweek">
                    <td>{{ row.gameweek }}</td>
                    <td>{{ row.minutesPlayed }}</td>
                    <td>{{ row.goals }}</td>
                    <td>{{ row.assists }}</td>
                    <td>{{ row.cleanSheet ? '✅' : '—' }}</td>
                    <td>{{ row.yellowCards || '—' }}</td>
                    <td>{{ row.redCards || '—' }}</td>
                    <td class="history-pts">{{ row.points }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <p v-else class="no-data-notice">📅 No match history recorded for this player yet.</p>
        </div>

        <button class="btn-cancel" @click="closeAnalytics">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue';
import { globalStore, API_BASE } from '../store';
import Chart from 'chart.js/auto';
import { useAnimatedNumber } from '../composables/useAnimatedNumber';
import { getClubColor, isLightColor, getClubBadgeUrl } from '../clubColors';
import { getLeagueBadgeUrl } from '../leagueBadges';

const store = globalStore;
const animatedWallet = useAnimatedNumber(() => Number(store.budget));
const walletFlash = ref(null);
let walletFlashTimer = null;
watch(() => store.budget, (newVal, oldVal) => {
  if (typeof oldVal !== 'number' || newVal === oldVal) return;
  walletFlash.value = newVal > oldVal ? 'up' : 'down';
  clearTimeout(walletFlashTimer);
  walletFlashTimer = setTimeout(() => { walletFlash.value = null; }, 700);
});
const marketPlayers = ref([]);
// Photos from media.api-sports.io occasionally 404 for a handful of players —
// track failures by id to automatically fall back to the pos-badge instead
// of showing a broken image icon.
const brokenPhotoIds = reactive(new Set());
const onPhotoError = (id) => brokenPhotoIds.add(id);
// Same broken-image fallback pattern as player photos, applied to the two
// new market badges (club crest + league/competition crest) — a handful of
// clubs/leagues outside the Top-5 dataset (or any leftover curated player
// with a non-API-Football teamId) will 404 on the media.api-sports.io CDN,
// so these hide themselves instead of showing a broken-image icon.
const brokenClubBadgeIds = reactive(new Set());
const brokenLeagueBadgeIds = reactive(new Set());
const onClubBadgeError = (teamId) => brokenClubBadgeIds.add(teamId);
const onLeagueBadgeError = (leagueName) => brokenLeagueBadgeIds.add(leagueName);
const searchQuery = ref('');
const posFilter = ref('ALL');
const sortBy = ref('default');
const showBnplModal = ref(false);
const showAnalyticsModal = ref(false);
const missingAmount = ref(0);
const selectedPlayer = ref(null);
const radarCanvas = ref(null);
const analyticsRole = ref('');
const hasAnalyticsData = ref(true);
let chartInstance = null;

// Match history state (feedback item A1)
const playerHistory = ref([]);
const historyLoading = ref(false);
const historyMatchesPlayed = ref(0);
const historyTotalPoints = ref(0);

const fetchPlayerHistory = async (player) => {
  historyLoading.value = true;
  playerHistory.value = [];
  try {
    const res = await fetch(`${API_BASE}/players/${player.id}/history`);
    const data = await res.json();
    if (data.success) {
      playerHistory.value = data.history;
      historyMatchesPlayed.value = data.matchesPlayed;
      historyTotalPoints.value = data.totalPoints;
    }
  } catch (err) {
    console.error('[TransferMarket] Could not load player history:', err.message);
  } finally {
    historyLoading.value = false;
  }
};

const MIN_BUILD_SIZE = 11;
const MAX_PLAYERS_PER_CLUB = 3; // must match services/transferService.js — enforced server-side too, this is only a pre-check for a faster/clearer error
const SUPERSTAR_RULES = {
  legendaryPrice: 11.0,
  elitePrice: 9.5,
  maxLegendary: 2,
  maxElite: 4,
};

// Feedback item A3 — club badge colored by the real kit color instead of a
// generic gray pill, so it visually matches the shirt colors now shown on
// the pitch (SquadPitch.vue).
const clubBadgeStyle = (player) => {
  const color = getClubColor(player.teamName);
  return {
    backgroundColor: color,
    borderColor: color,
    color: isLightColor(color) ? '#1e272e' : '#ffffff',
  };
};

// Feedback item A3 ("quan trọng"): pre-checks the same MAX_PLAYERS_PER_CLUB
// rule the backend enforces (transferService.js), so the user sees a clear
// warning immediately instead of only finding out via a rejected-transaction
// toast after clicking Buy.
const canPassClubLimit = (candidate) => {
  const sameClubCount = store.squad.filter(p => p.team_id === candidate.team_id).length;
  if (sameClubCount >= MAX_PLAYERS_PER_CLUB) {
    return {
      ok: false,
      reason: `Squad limit: maximum ${MAX_PLAYERS_PER_CLUB} players from the same club (${candidate.teamName || 'this club'}).`
    };
  }
  return { ok: true };
};

const getPositionAnalytics = (player) => {
  const s = player.stats || {};
  switch (player.position) {
    case 'GK': return {
      labels: ['Reflexes', 'Distribution', 'Form', 'Aerial Ability', 'Saves'],
      data: [
        (s.shots    ?? 0) * 100,
        (s.keyPasses?? 0) * 100,
        (s.form     ?? 0) * 100,
        (s.xA       ?? 0) * 100,
        // Prefer REAL save counts (from API-Football, only available for
        // the ~300 real-dataset players) — far more accurate than the old
        // xG-derived formula (which only worked for the 65 curated players
        // that had xG available). If neither is available, return 0 rather
        // than a made-up number.
        s.saves != null ? s.saves * 100
          : s.xG != null ? Math.max(0, (1 - s.xG * 8)) * 100
          : 0,
      ],
      color: '#74b9ff', bg: 'rgba(116,185,255,0.25)',
      role: '🧤 Goalkeeper — Reflexes and distribution are key. A high Saves rating shows strong game-reading and shot-stopping ability in dangerous situations.',
    };
    case 'DEF': return {
      labels: ['Defending', 'Duels Won', 'Creativity', 'Form', 'Attacking Threat'],
      data: [
        // Prefer real defensive stats (tackles + interceptions per-90, from
        // API-Football). Fall back to the xG-derived estimate for the 65
        // curated players.
        s.defensiveActions != null ? s.defensiveActions * 100
          : s.xG != null ? Math.max(0, (1 - s.xG) * 100)
          : 0,
        (s.shots    ?? 0) * 100,
        (s.xA       ?? 0) * 100,
        (s.form     ?? 0) * 100,
        (s.keyPasses?? 0) * 100,
      ],
      color: '#a29bfe', bg: 'rgba(162,155,254,0.25)',
      role: '🛡️ Defender — Solid defending is the foundation. High Attacking Threat and Creativity ratings show a defender who contributes effectively going forward.',
    };
    case 'MID': return {
      labels: ['Goals', 'Assists', 'Key Passes', 'Form', 'Long Shots'],
      data: [
        (s.xG       ?? 0) * 100,
        (s.xA       ?? 0) * 100,
        (s.keyPasses?? 0) * 100,
        (s.form     ?? 0) * 100,
        (s.shots    ?? 0) * 100,
      ],
      color: '#55efc4', bg: 'rgba(85,239,196,0.25)',
      role: '🎯 Midfielder — The conductor of play. Key Passes and Assists reflect their ability to orchestrate the game, while Goals show their attacking instincts.',
    };
    default: return {
      labels: ['Goals', 'Assists', 'Shots on Target', 'Form', 'Chance Creation'],
      data: [
        (s.xG       ?? 0) * 100,
        (s.xA       ?? 0) * 100,
        (s.shots    ?? 0) * 100,
        (s.form     ?? 0) * 100,
        (s.keyPasses?? 0) * 100,
      ],
      color: '#fd79a8', bg: 'rgba(253,121,168,0.25)',
      role: '⚡ Forward — The penalty-box finisher. Goals and Shots on Target are the primary measures, while Assists show their ability to combine with teammates.',
    };
  }
};

// Previously hard-mapped 10 curated clubs (teamId 1-10) — that dataset has
// since been removed. Now uses the real teamName straight from
// API-Football (seedTop5Free.js); the column is narrow so CSS truncates it
// and shows the full name via the tooltip (title attribute).
const getClubName = (player) => player.teamName || 'UNK';

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/players`);
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
      reason: `Squad limit: maximum ${SUPERSTAR_RULES.maxLegendary} LEGENDARY superstars (≥ $${SUPERSTAR_RULES.legendaryPrice}M).`
    };
  }

  const eliteCount = store.squad.filter(p => p.price >= SUPERSTAR_RULES.elitePrice).length + (candidate.price >= SUPERSTAR_RULES.elitePrice ? 1 : 0);
  if (eliteCount > SUPERSTAR_RULES.maxElite) {
    return {
      ok: false,
      reason: `Squad limit: maximum ${SUPERSTAR_RULES.maxElite} ELITE players (≥ $${SUPERSTAR_RULES.elitePrice}M).`
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
    // Not enough market data to be certain -> allow it through
    return { ok: true };
  }

  const reserveNeeded = cheapestRemaining.reduce((sum, p) => sum + p, 0);
  if (budgetAfter < reserveNeeded) {
    return {
      ok: false,
      reason: `Buying ${candidate.name} would make it hard to complete a ${MIN_BUILD_SIZE}-player squad. Keep at least $${reserveNeeded.toFixed(1)}M for the remaining ${remainingSlots} slots.`
    };
  }

  return { ok: true };
};

const attemptBuy = async (player) => {
  selectedPlayer.value = player;

  if (store.squadLocked) {
    store.addToast('Squad is locked after running Matchday. Cannot buy players.', 'error');
    return;
  }

  if (!store.isAuthenticated) {
    store.addToast('Please log in to make transactions!', 'error');
    return;
  }

  const clubLimitCheck = canPassClubLimit(player);
  if (!clubLimitCheck.ok) {
    store.addToast(clubLimitCheck.reason, 'error');
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
      store.addToast(`Successfully signed ${player.name}!`, 'success');
    }
  } else {
    missingAmount.value = player.price - store.budget;
    if (missingAmount.value <= 2.0) {
      showBnplModal.value = true;
    } else {
      // Don't assume this is a "shortfall exceeds the BNPL cap" error — the
      // real reason the backend blocks it might actually be the club/position
      // limit (the backend checks the club/position limit BEFORE checking the
      // balance). Call the backend directly to get the real reason instead of
      // guessing, to avoid showing a misleading message.
      await store.buyPlayer(player);
    }
  }
};

const confirmBnplBuy = async () => {
  showBnplModal.value = false;
  if (await store.buyPlayer(selectedPlayer.value)) {
    store.addToast(`BNPL activated to buy ${selectedPlayer.value.name}. (-4 pts)`, 'info');
  }
};

const showAnalytics = async (player) => {
  selectedPlayer.value = player;
  showAnalyticsModal.value = true;
  fetchPlayerHistory(player);
  // Only the 65 curated players (data/backupPlayers.js) have real analytics
  // data; the rest, loaded from Sportmonks/API-Football, don't have this
  // field yet. Don't draw a fake radar (all zeros) — show an honest notice
  // instead.
  hasAnalyticsData.value = !!(player.stats && Object.keys(player.stats).length > 0);
  await nextTick();
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  if (!hasAnalyticsData.value) return;
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
.market-container {
  padding: 18px 20px 20px;
  background: linear-gradient(165deg, #212b33 0%, #1a2229 100%);
  border-radius: 16px;
  border: 1px solid #2f3640;
  border-top: 2px solid #0fb9b1;
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}

/* Header row */
.market-header { display: flex; justify-content: space-between; align-items: center; }
.market-header h3 { font-size: 18px; font-weight: 800; color: #fff; margin: 0; letter-spacing: 0.2px; }

/* Wallet info row */
.wallet-info { display: flex; align-items: center; gap: 10px; background: rgba(43,203,186,0.12); border: 1px solid rgba(43,203,186,0.25); padding: 9px 18px; border-radius: 20px; align-self: flex-start; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
.wallet-label { font-size: 12px; color: #a4b0be; }
.wallet-amount { font-size: 17px; font-weight: 900; color: #2bcbba; transition: color 0.3s ease; letter-spacing: 0.3px; }
.wallet-amount.balance-up { animation: wallet-flash-up 0.7s ease; }
.wallet-amount.balance-down { animation: wallet-flash-down 0.7s ease; }
@keyframes wallet-flash-up {
  0% { color: #2bcbba; }
  25% { color: #55efc4; text-shadow: 0 0 10px rgba(85,239,196,0.7); }
  100% { color: #2bcbba; text-shadow: none; }
}
@keyframes wallet-flash-down {
  0% { color: #2bcbba; }
  25% { color: #ff7979; text-shadow: 0 0 10px rgba(255,121,121,0.7); }
  100% { color: #2bcbba; text-shadow: none; }
}
@media (prefers-reduced-motion: reduce) {
  .wallet-amount.balance-up, .wallet-amount.balance-down { animation: none; }
}
.penalty-text { font-size: 12px; font-weight: bold; color: #ff6b81; }

/* Reset button */
.btn-reset { background: rgba(255,71,87,0.15); border: 1px solid rgba(255,71,87,0.4); color: #ff6b81; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.2s; }
.btn-reset:hover { background: rgba(255,71,87,0.3); }

/* Filter bar */
.filter-bar { display: flex; gap: 12px; }
.search-input { flex: 1; background: #262f37; border: 1px solid #3c454e; border-radius: 9px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.search-input:focus { border-color: #0fb9b1; box-shadow: 0 0 0 3px rgba(15,185,177,0.15); }
.pos-select { background: #262f37; border: 1px solid #3c454e; border-radius: 9px; padding: 10px 12px; color: #fff; font-size: 13px; cursor: pointer; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.pos-select:focus { border-color: #0fb9b1; box-shadow: 0 0 0 3px rgba(15,185,177,0.15); }

/* Scrollable table wrapper */
.table-scroll { max-height: 560px; overflow-y: auto; border-bottom: 1px solid #2f3640; }
.table-scroll::-webkit-scrollbar { width: 8px; }
.table-scroll::-webkit-scrollbar-track { background: #1e272e; }
.table-scroll::-webkit-scrollbar-thumb { background: #0fb9b1; border-radius: 4px; }
.table-scroll::-webkit-scrollbar-thumb:hover { background: #2bcbba; }

/* Table */
.market-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
.market-table thead tr { background: #252e35; }
.market-table th { padding: 11px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #8a9bad; border-bottom: 2px solid #0fb9b1; white-space: nowrap; overflow: hidden; position: sticky; top: 0; z-index: 5; background-color: #2d3436; }
.col-player { width: 40%; }
.col-club   { width: 24%; }
.col-price  { width: 16%; }
.col-action { width: 20%; text-align: right; }
.market-table th.col-club,
.market-table th.col-price { text-align: center; }

/* Rows */
.market-row { transition: background 0.15s; }
.market-row:nth-child(even) { background: rgba(255,255,255,0.02); }
.market-row:hover { background: rgba(15,185,177,0.07); }
.market-table td { padding: 10px; border-bottom: 1px solid rgba(47,54,64,0.8); vertical-align: middle; overflow: hidden; height: 76px; }
.col-price.price-cell { padding-right: 14px; }
.col-action.action-cell { padding-left: 14px; }

/* Player cell */
.player-name-cell { cursor: pointer; display: flex; align-items: center; gap: 12px; min-width: 0; }
.player-photo { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; object-position: top center; flex-shrink: 0; background: #1e272e; border: 2px solid rgba(255,255,255,0.15); }
.player-photo-fallback { display: flex; align-items: center; justify-content: center; }
.pos-badge-lg { font-size: 12px; padding: 6px 8px; }
.player-name-wrap { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; flex: 1; min-width: 0; }
.player-name { color: #e0e6ed; font-weight: 600; font-size: 14.5px; white-space: nowrap; transition: color 0.15s; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.market-row:hover .player-name { color: #0fb9b1; }
.info-icon { font-size: 13px; opacity: 0; transition: opacity 0.2s; cursor: pointer; flex-shrink: 0; }
.market-row:hover .info-icon { opacity: 1; }

.cell-center { display: inline-flex; align-items: center; justify-content: center; width: 100%; }
.cell-right { display: inline-flex; align-items: center; justify-content: flex-end; width: 100%; }

.club-cell,
.price-cell { text-align: center; }

.action-cell { text-align: right; white-space: nowrap; }

/* Position badge */
.pos-badge { padding: 4px 9px; border-radius: 6px; font-size: 10px; font-weight: 800; color: white; letter-spacing: 0.6px; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
.FWD { background: linear-gradient(135deg, #c0392b, #e74c3c); }
.MID { background: linear-gradient(135deg, #d35400, #e67e22); }
.DEF { background: linear-gradient(135deg, #1a5276, #2980b9); }
.GK  { background: linear-gradient(135deg, #6c3483, #9b59b6); }

/* Club badge — enlarged real crest + league crest, colored name pill kept as
   a fallback/caption underneath (still shows even if both images 404). */
.club-badges-group { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-width: 0; }
.club-league-icons { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.club-badge-icon { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; background: rgba(255,255,255,0.06); border-radius: 6px; padding: 2px; }
.league-badge-icon { width: 26px; height: 26px; object-fit: contain; flex-shrink: 0; opacity: 0.95; }
.club-badge { display: inline-block; background: rgba(99,110,114,0.25); color: #a4b0be; font-size: 10px; font-weight: 700; letter-spacing: 0.6px; padding: 3px 9px; border-radius: 20px; border: 1px solid rgba(99,110,114,0.45); white-space: nowrap; max-width: 130px; overflow: hidden; text-overflow: ellipsis; }

/* Price */
.price-text { font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; color: #f7b731; letter-spacing: 0.3px; white-space: nowrap; }

/* Buy button */
.buy-btn { background: linear-gradient(135deg, #0fb9b1, #01a3a4); color: white; border: none; padding: 7px 16px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 12px; letter-spacing: 0.3px; transition: all 0.2s; white-space: nowrap; display: inline-block; }
.buy-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(15,185,177,0.45); filter: brightness(1.1); }
.buy-btn:active { transform: translateY(0); }
.buy-btn { min-width: 64px; text-align: center; }
.buy-btn:disabled { background: #3a4552; color: #7f8fa6; cursor: not-allowed; box-shadow: none; filter: none; transform: none; }

.market-locked-notice { margin: -6px 0 14px; background: rgba(241, 196, 15, 0.12); border: 1px solid rgba(241, 196, 15, 0.4); color: #f7b731; font-size: 12px; font-weight: 700; padding: 8px 14px; border-radius: 8px; }

/* Modal CSS unchanged */
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
.no-data-notice { font-size: 13px; color: #a4b0be; line-height: 1.6; margin: 4px 0 18px; padding: 14px 16px; background: rgba(255,255,255,0.04); border-radius: 8px; border-left: 3px solid #636e72; text-align: left; }

/* Match history (feedback item A1) */
.history-section { margin: 0 0 16px; text-align: left; }
.history-title { font-size: 13px; color: #f7b731; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.history-loading { font-size: 12px; color: #a4b0be; font-style: italic; padding: 8px 0; }
.history-summary { display: flex; gap: 18px; font-size: 12px; color: #a4b0be; margin-bottom: 8px; }
.history-summary strong { color: #0fb9b1; }
.history-table-scroll { max-height: 180px; overflow-y: auto; border-radius: 8px; border: 1px solid #3c454e; }
.history-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.history-table th { position: sticky; top: 0; background: #252e35; color: #8a9bad; padding: 6px 8px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; text-align: center; }
.history-table td { padding: 6px 8px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); color: #d1d8e0; }
.history-table tr:nth-child(even) { background: rgba(255,255,255,0.02); }
.history-pts { font-weight: 800; color: #55efc4; }

/* Form indicator dots */
.form-indicator { display: inline-flex; gap: 5px; align-items: center; justify-content: center; }
.form-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.form-dot.win  { background-color: #2ecc71; }
.form-dot.draw { background-color: #f1c40f; }
.form-dot.lose { background-color: #e74c3c; }
</style>
