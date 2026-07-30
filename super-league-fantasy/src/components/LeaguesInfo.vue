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
        <h3>{{ league.flag }} {{ league.name }}</h3>
        <span class="club-count">{{ (groupedTeams[league.name] || []).length }} clubs in game</span>
      </div>
      <p class="league-blurb">{{ league.blurb }}</p>

      <div v-if="(groupedTeams[league.name] || []).length" class="club-grid">
        <div v-for="team in groupedTeams[league.name]" :key="team.teamId" class="club-card">
          <span class="club-name">{{ team.teamName }}</span>
          <span class="club-player-count">{{ team.playerCount }} players</span>
        </div>
      </div>
      <p v-else class="no-clubs">No clubs from this league are loaded into the game yet.</p>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { API_BASE } from '../store';

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
.club-count { font-size: 12px; color: #7f8fa6; font-weight: 600; white-space: nowrap; }

.league-blurb {
  font-size: 13px;
  line-height: 1.6;
  color: #d1d8e0;
  margin-bottom: 14px;
}

.club-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.club-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: #1e272e;
  border: 1px solid #2f3640;
  border-radius: 8px;
  padding: 10px 12px;
  transition: border-color 0.2s;
}
.club-card:hover { border-color: #0fb9b1; }
.club-name { font-size: 13px; font-weight: 700; color: #fff; }
.club-player-count { font-size: 11px; color: #7f8fa6; }

.no-clubs { font-size: 13px; color: #7f8fa6; font-style: italic; }
</style>
