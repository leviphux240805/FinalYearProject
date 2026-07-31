<template>
  <div class="leagues-container">
    <div class="leagues-header">
      <h2>🌍 Leagues &amp; Clubs in This Game</h2>
      <p>Super League Pro draws its squads from Europe's five biggest top-flight leagues. Here's what each one is, and exactly which clubs from it you can actually draft right now.</p>
    </div>

    <div v-if="loading" class="state-msg">Loading clubs…</div>
    <div v-else-if="loadError" class="state-msg error">Couldn't load club data from the server. Make sure the backend is running.</div>

    <section v-else v-for="league in LEAGUE_ORDER" :key="league.name" class="league-section">
      <div class="league-title-row">
        <img
          v-if="!brokenLeagueBadgeIds.has(league.name)"
          :src="getLeagueBadgeUrl(league.name)"
          class="league-title-badge"
          alt=""
          @error="brokenLeagueBadgeIds.add(league.name)"
        />
        <h3>{{ league.flag }} {{ league.name }}</h3>
        <span class="club-count">{{ (groupedTeams[league.name] || []).length }} clubs in game</span>
      </div>
      <p class="league-blurb">{{ league.blurb }}</p>

      <div v-if="(groupedTeams[league.name] || []).length" class="club-grid">
        <button
          v-for="team in groupedTeams[league.name]"
          :key="team.teamId"
          type="button"
          class="club-card"
          @click="openClub(team)"
        >
          <img
            v-if="!brokenClubBadgeIds.has(team.teamId)"
            :src="getClubBadgeUrl(team.teamId)"
            class="club-badge-img"
            alt=""
            @error="brokenClubBadgeIds.add(team.teamId)"
          />
          <div v-else class="club-badge-fallback">{{ team.teamName?.[0] || '?' }}</div>
          <div class="club-card-text">
            <span class="club-name">{{ team.teamName }}</span>
            <span class="club-player-count">{{ team.playerCount }} players</span>
          </div>
        </button>
      </div>
      <p v-else class="no-clubs">No clubs from this league are loaded into the game yet.</p>
    </section>

    <!-- Club roster panel: photo + full name + nationality only, no stats -->
    <div v-if="selectedClub" class="roster-overlay" @click.self="closeClub">
      <div class="roster-panel">
        <div class="roster-header">
          <img
            v-if="!brokenClubBadgeIds.has(selectedClub.teamId)"
            :src="getClubBadgeUrl(selectedClub.teamId)"
            class="roster-club-badge"
            alt=""
            @error="brokenClubBadgeIds.add(selectedClub.teamId)"
          />
          <h3>{{ selectedClub.teamName }}</h3>
          <button type="button" class="roster-close" @click="closeClub">✕</button>
        </div>

        <div v-if="rosterLoading" class="state-msg">Loading squad…</div>
        <div v-else-if="rosterPlayers.length === 0" class="state-msg">No players loaded for this club yet.</div>
        <ul v-else class="roster-list">
          <li v-for="player in rosterPlayers" :key="player.id" class="roster-player">
            <img
              v-if="player.photoUrl && !brokenPlayerPhotoIds.has(player.id)"
              :src="player.photoUrl"
              class="roster-player-photo"
              alt=""
              @error="brokenPlayerPhotoIds.add(player.id)"
            />
            <div v-else class="roster-player-photo-fallback">{{ player.name?.[0] || '?' }}</div>
            <div class="roster-player-info">
              <span class="roster-player-name">{{ player.name }}</span>
              <span class="roster-player-nationality">{{ player.nationality || 'Nationality unknown' }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { API_BASE } from '../store';
import { getClubBadgeUrl } from '../clubColors';
import { getLeagueBadgeUrl } from '../leagueBadges';

const LEAGUE_ORDER = [
  {
    name: 'Premier League',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    blurb: 'England\'s top division and the most-watched football league in the world, known for its pace, physicality, and unpredictability — any team can beat any other on a given weekend.'
  },
  {
    name: 'La Liga',
    flag: '🇪🇸',
    blurb: 'Spain\'s top division, historically the home of technical, possession-based football, and the stage for some of the sport\'s most decorated clubs and individual talents.'
  },
  {
    name: 'Bundesliga',
    flag: '🇩🇪',
    blurb: 'Germany\'s top division, famous for high-intensity pressing football, some of the best-attended stadiums in world football, and a strong pipeline of young talent.'
  },
  {
    name: 'Serie A',
    flag: '🇮🇹',
    blurb: 'Italy\'s top division, with a rich tactical tradition built around organised defending and disciplined game management, alongside some of football\'s oldest and most storied clubs.'
  },
  {
    name: 'Ligue 1',
    flag: '🇫🇷',
    blurb: 'France\'s top division — a league that regularly produces some of the world\'s most sought-after young attacking talent, anchored by a small number of dominant, heavily-resourced clubs.'
  }
];

const groupedTeams = ref({});
const loading = ref(true);
const loadError = ref(false);

// Broken-image tracking (same pattern as TransferMarket.vue / GameweekFixtures.vue):
// a 404'd badge/photo silently falls back rather than showing a broken-image icon.
const brokenClubBadgeIds = reactive(new Set());
const brokenLeagueBadgeIds = reactive(new Set());
const brokenPlayerPhotoIds = reactive(new Set());

// Full player list is fetched once and reused for every club roster lookup —
// avoids adding a new backend endpoint, same approach as TransferMarket.vue.
let allPlayersCache = null;

const selectedClub = ref(null);
const rosterPlayers = ref([]);
const rosterLoading = ref(false);

async function openClub(team) {
  selectedClub.value = team;
  rosterLoading.value = true;
  rosterPlayers.value = [];
  try {
    if (!allPlayersCache) {
      const res = await fetch(`${API_BASE}/players`);
      allPlayersCache = await res.json();
    }
    rosterPlayers.value = allPlayersCache
      .filter(p => p.teamId === team.teamId)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[LeaguesInfo] Could not load club roster:', err.message);
  } finally {
    rosterLoading.value = false;
  }
}

function closeClub() {
  selectedClub.value = null;
}

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/teams`);
    const teams = await res.json();

    const grouped = {};
    teams.forEach(team => {
      const league = team.leagueName || 'Other';
      if (!grouped[league]) grouped[league] = [];
      grouped[league].push(team);
    });
    Object.values(grouped).forEach(list => list.sort((a, b) => b.playerCount - a.playerCount));

    groupedTeams.value = grouped;
  } catch (err) {
    console.error('[LeaguesInfo] Could not load club list:', err.message);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.leagues-container {
  padding: 30px;
  background: #1e272e;
  border-radius: 16px;
  border: 1px solid #2f3640;
  color: #e0e6ed;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.leagues-header { text-align: center; margin-bottom: 28px; }
.leagues-header h2 { color: #f7b731; font-size: 24px; margin-bottom: 8px; }
.leagues-header p { color: #a4b0be; font-size: 14px; max-width: 640px; margin: 0 auto; }

.state-msg { text-align: center; padding: 40px; color: #a4b0be; font-style: italic; }
.state-msg.error { color: #ff7979; }

.league-section {
  background: #232b36;
  border: 1px solid #2f3640;
  border-radius: 12px;
  padding: 18px 22px;
  margin-bottom: 18px;
}
.league-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.league-title-row h3 { color: #0fb9b1; font-size: 17px; }
.club-count { font-size: 12px; color: #7f8fa6; font-weight: 600; white-space: nowrap; margin-left: auto; }
.league-title-badge { width: 24px; height: 24px; object-fit: contain; flex-shrink: 0; }

.league-blurb {
  font-size: 13px;
  line-height: 1.6;
  color: #d1d8e0;
  margin-bottom: 14px;
}

.club-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
}
.club-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1e272e;
  border: 1px solid #2f3640;
  border-radius: 8px;
  padding: 10px 12px;
  transition: border-color 0.2s, transform 0.15s;
  cursor: pointer;
  font: inherit;
  text-align: left;
  width: 100%;
}
.club-card:hover { border-color: #0fb9b1; transform: translateY(-1px); }
.club-badge-img { width: 32px; height: 32px; object-fit: contain; flex-shrink: 0; }
.club-badge-fallback {
  width: 32px; height: 32px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: #2f3640; border-radius: 50%;
  font-size: 13px; font-weight: 700; color: #7f8fa6;
}
.club-card-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.club-name { font-size: 13px; font-weight: 700; color: #fff; }
.club-player-count { font-size: 11px; color: #7f8fa6; }

.no-clubs { font-size: 13px; color: #7f8fa6; font-style: italic; }

.roster-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}
.roster-panel {
  background: #1e272e;
  border: 1px solid #2f3640;
  border-radius: 14px;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
}
.roster-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid #2f3640;
}
.roster-club-badge { width: 32px; height: 32px; object-fit: contain; }
.roster-header h3 { flex: 1; color: #fff; font-size: 16px; }
.roster-close {
  background: none;
  border: none;
  color: #7f8fa6;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
}
.roster-close:hover { color: #fff; }

.roster-list {
  overflow-y: auto;
  padding: 10px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.roster-player {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
  background: #232b36;
}
.roster-player-photo { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #2f3640; }
.roster-player-photo-fallback {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: #2f3640; font-size: 15px; font-weight: 700; color: #7f8fa6;
}
.roster-player-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.roster-player-name { font-size: 13px; font-weight: 700; color: #fff; }
.roster-player-nationality { font-size: 12px; color: #a4b0be; }
</style>
