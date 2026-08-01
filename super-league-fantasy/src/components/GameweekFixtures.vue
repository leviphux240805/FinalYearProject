<template>
  <div class="fixtures-wrapper">
    <div class="fixtures-header">
      <h3>📅 Fixtures</h3>
      <div class="fixtures-filters">
        <select v-model="selectedLeague" class="gw-select">
          <option value="all">All Leagues</option>
          <option v-for="lg in availableLeagues" :key="lg" :value="lg">{{ lg }}</option>
        </select>
        <select v-model.number="selectedGameweek" class="gw-select" @change="loadFixtures">
          <option v-for="gw in gameweeks" :key="gw" :value="gw">Gameweek {{ gw }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="fixtures-loading">Loading fixtures...</div>
    <div v-else-if="filteredFixtures.length === 0" class="fixtures-empty">
      {{ selectedLeague === 'all' ? 'No fixtures scheduled for this gameweek yet.' : `No ${selectedLeague} fixtures in this gameweek.` }}
    </div>
    <div v-else class="fixtures-list">
      <div v-for="f in filteredFixtures" :key="f.id" class="fixture-card">
        <div class="fixture-teams">
          <div class="team-block home">
            <div class="team-badge-stack">
              <img
                v-if="getClubBadgeUrl(f.homeTeamId) && !brokenClubBadgeIds.has(f.homeTeamId)"
                :src="getClubBadgeUrl(f.homeTeamId)"
                class="team-club-badge"
                alt=""
                @error="onClubBadgeError(f.homeTeamId)"
              />
              <img
                v-if="getLeagueBadgeUrl(leagueOf(f.homeTeamId)) && !brokenLeagueBadgeIds.has(leagueOf(f.homeTeamId))"
                :src="getLeagueBadgeUrl(leagueOf(f.homeTeamId))"
                class="team-league-badge"
                :alt="leagueOf(f.homeTeamId) || ''"
                :title="leagueOf(f.homeTeamId) || ''"
                @error="onLeagueBadgeError(leagueOf(f.homeTeamId))"
              />
            </div>
            <span class="team-name home">{{ f.homeTeamName }}</span>
          </div>
          <span class="fixture-score" v-if="f.status === 'FINISHED'">{{ f.homeScore }} - {{ f.awayScore }}</span>
          <span class="fixture-vs" v-else>vs</span>
          <div class="team-block away">
            <span class="team-name away">{{ f.awayTeamName }}</span>
            <div class="team-badge-stack">
              <img
                v-if="getLeagueBadgeUrl(leagueOf(f.awayTeamId)) && !brokenLeagueBadgeIds.has(leagueOf(f.awayTeamId))"
                :src="getLeagueBadgeUrl(leagueOf(f.awayTeamId))"
                class="team-league-badge"
                :alt="leagueOf(f.awayTeamId) || ''"
                :title="leagueOf(f.awayTeamId) || ''"
                @error="onLeagueBadgeError(leagueOf(f.awayTeamId))"
              />
              <img
                v-if="getClubBadgeUrl(f.awayTeamId) && !brokenClubBadgeIds.has(f.awayTeamId)"
                :src="getClubBadgeUrl(f.awayTeamId)"
                class="team-club-badge"
                alt=""
                @error="onClubBadgeError(f.awayTeamId)"
              />
            </div>
          </div>
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
import { ref, reactive, computed, onMounted } from 'vue';
import { API_BASE } from '../store';
import { getClubBadgeUrl } from '../clubColors';
import { getLeagueBadgeUrl } from '../leagueBadges';

const gameweeks = ref([1]);
const selectedGameweek = ref(1);
const fixtures = ref([]);
const loading = ref(false);

// League filter — a fixture straddles two leagues whenever seedFixtures.js
// pairs clubs from different competitions (see the comment on teamLeagueById
// below), so "this league's fixtures" means "either side belongs to it",
// not "both sides do".
const selectedLeague = ref('all');

// Fixture rows only carry teamId/teamName (see routes/fixtures.js), not
// leagueName — and since scripts/seedFixtures.js pairs clubs across ALL 5
// leagues together rather than grouping by league, a fixture's two teams
// can genuinely belong to different leagues, so there's no single "this
// fixture's league" badge to show. Instead this builds a teamId ->
// leagueName lookup (from the same /api/teams endpoint LeaguesInfo.vue
// already uses) so each SIDE of the fixture shows its own real league badge.
const teamLeagueById = reactive(new Map());
const leagueOf = (teamId) => teamLeagueById.get(teamId) || null;

const availableLeagues = computed(() => {
  const set = new Set();
  for (const lg of teamLeagueById.values()) if (lg) set.add(lg);
  return Array.from(set).sort();
});

const filteredFixtures = computed(() => {
  if (selectedLeague.value === 'all') return fixtures.value;
  return fixtures.value.filter(
    f => leagueOf(f.homeTeamId) === selectedLeague.value || leagueOf(f.awayTeamId) === selectedLeague.value
  );
});

const brokenClubBadgeIds = reactive(new Set());
const brokenLeagueBadgeIds = reactive(new Set());
const onClubBadgeError = (teamId) => brokenClubBadgeIds.add(teamId);
const onLeagueBadgeError = (leagueName) => brokenLeagueBadgeIds.add(leagueName);

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
  try {
    const res = await fetch(`${API_BASE}/teams`);
    const teams = await res.json();
    for (const t of teams) teamLeagueById.set(t.teamId, t.leagueName);
  } catch (err) {
    console.error('[GameweekFixtures] Could not load team/league lookup:', err.message);
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
.fixtures-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 10px; flex-wrap: wrap; }
.fixtures-header h3 { font-size: 15px; color: #f7b731; letter-spacing: 0.3px; }
.fixtures-filters { display: flex; gap: 8px; }
.gw-select { background: #262f37; border: 1px solid #3c454e; border-radius: 8px; padding: 6px 10px; color: #fff; font-size: 12px; cursor: pointer; }

.fixtures-loading, .fixtures-empty { font-size: 12px; color: #7f8fa6; font-style: italic; padding: 10px 0; }

.fixtures-list { display: flex; flex-direction: column; gap: 10px; }
.fixture-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 14px; }
.fixture-teams { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 700; }
.team-block { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.team-block.away { flex-direction: row-reverse; }
.team-badge-stack { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; }
.team-club-badge { width: 32px; height: 32px; object-fit: contain; background: rgba(255,255,255,0.06); border-radius: 6px; padding: 2px; }
.team-league-badge { position: absolute; bottom: -3px; right: -3px; width: 15px; height: 15px; object-fit: contain; border-radius: 3px; background: #1a2228; padding: 1px; box-shadow: 0 0 0 1px rgba(255,255,255,0.15); }
.team-block.away .team-league-badge { right: auto; left: -3px; }
.team-name { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
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
