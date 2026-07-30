<template>
  <div class="fixtures-wrapper">
    <div class="fixtures-header">
      <h3>📅 Fixtures</h3>
      <select v-model.number="selectedGameweek" class="gw-select" @change="loadFixtures">
        <option v-for="gw in gameweeks" :key="gw" :value="gw">Gameweek {{ gw }}</option>
      </select>
    </div>

    <div v-if="loading" class="fixtures-loading">Loading fixtures...</div>
    <div v-else-if="fixtures.length === 0" class="fixtures-empty">
      No fixtures scheduled for this gameweek yet.
    </div>
    <div v-else class="fixtures-list">
      <div v-for="f in fixtures" :key="f.id" class="fixture-card">
        <div class="fixture-teams">
          <span class="team-name home">{{ f.homeTeamName }}</span>
          <span class="fixture-score" v-if="f.status === 'FINISHED'">{{ f.homeScore }} - {{ f.awayScore }}</span>
          <span class="fixture-vs" v-else>vs</span>
          <span class="team-name away">{{ f.awayTeamName }}</span>
        </div>
        <div class="fixture-meta">
          <span class="fixture-status" :class="f.status.toLowerCase()">{{ f.status === 'FINISHED' ? 'FT' : 'Upcoming' }}</span>
          <span class="fixture-kickoff">{{ formatKickoff(f.kickoff) }}</span>
        </div>
        <div class="fixture-probs" :title="'Predicted outcome — a simplified heuristic, not a guarantee (see predictionService.js)'">
          <div class="prob-bar">
            <span class="prob-seg home" :style="{ width: (f.homeWinProb * 100) + '%' }"></span>
            <span class="prob-seg draw" :style="{ width: (f.drawProb * 100) + '%' }"></span>
            <span class="prob-seg away" :style="{ width: (f.awayWinProb * 100) + '%' }"></span>
          </div>
          <div class="prob-labels">
            <span>{{ Math.round(f.homeWinProb * 100) }}%</span>
            <span>{{ Math.round(f.drawProb * 100) }}%</span>
            <span>{{ Math.round(f.awayWinProb * 100) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { API_BASE } from '../store';

const gameweeks = ref([1]);
const selectedGameweek = ref(1);
const fixtures = ref([]);
const loading = ref(false);

const formatKickoff = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const loadFixtures = async () => {
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/fixtures?gameweek=${selectedGameweek.value}`);
    const data = await res.json();
    fixtures.value = data.success ? data.fixtures : [];
  } catch (err) {
    console.error('[GameweekFixtures] Could not load fixtures:', err.message);
    fixtures.value = [];
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/fixtures/gameweeks`);
    const data = await res.json();
    if (data.success && data.gameweeks.length > 0) {
      gameweeks.value = data.gameweeks;
      selectedGameweek.value = data.gameweeks[0];
    }
  } catch (err) {
    console.error('[GameweekFixtures] Could not load gameweek list:', err.message);
  }
  await loadFixtures();
});
</script>

<style scoped>
.fixtures-wrapper {
  background: linear-gradient(165deg, rgba(34, 44, 51, 0.85), rgba(26, 34, 40, 0.85));
  padding: 18px 20px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.1);
  border-top: 2px solid #f7b731;
  color: white;
}
.fixtures-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.fixtures-header h3 { font-size: 15px; color: #f7b731; letter-spacing: 0.3px; }
.gw-select { background: #262f37; border: 1px solid #3c454e; border-radius: 8px; padding: 6px 10px; color: #fff; font-size: 12px; cursor: pointer; }

.fixtures-loading, .fixtures-empty { font-size: 12px; color: #7f8fa6; font-style: italic; padding: 10px 0; }

.fixtures-list { display: flex; flex-direction: column; gap: 10px; }
.fixture-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 14px; }
.fixture-teams { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 700; }
.team-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.team-name.away { text-align: right; }
.fixture-score { font-family: 'Courier New', monospace; font-weight: 900; color: #55efc4; padding: 0 10px; flex-shrink: 0; }
.fixture-vs { color: #7f8fa6; font-size: 11px; padding: 0 10px; flex-shrink: 0; }

.fixture-meta { display: flex; justify-content: space-between; font-size: 10.5px; color: #8a9bad; margin: 6px 0 8px; }
.fixture-status { font-weight: 700; padding: 1px 8px; border-radius: 10px; }
.fixture-status.finished { background: rgba(85,239,196,0.15); color: #55efc4; }
.fixture-status.scheduled { background: rgba(247,183,49,0.15); color: #f7b731; }

.fixture-probs { display: flex; flex-direction: column; gap: 4px; }
.prob-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: #1e272e; }
.prob-seg.home { background: #0fb9b1; }
.prob-seg.draw { background: #7f8fa6; }
.prob-seg.away { background: #ff4757; }
.prob-labels { display: flex; justify-content: space-between; font-size: 10px; color: #8a9bad; }
</style>
