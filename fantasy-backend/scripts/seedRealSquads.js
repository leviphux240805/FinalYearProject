// ============================================================
// WHY THIS SCRIPT IS NEEDED (instead of seedTop5Free.js):
//
// seedTop5Free.js uses GET /players?league=X&season=2024&page=N. The
// API-Football free tier HARD-CAPS at page 3 (60 players/league) — and
// more importantly, the returned order is NOT by fame but seemingly by
// internal playerId, so the first 60 players collected were almost all
// obscure/mostly-retired players (e.g. R. Falcao, A. Danjuma...) — a real
// check confirmed Haaland, Salah, Saka, De Bruyne, and Bellingham were ALL
// missing from the 297 players loaded. That's why every player photo was
// showing the default icon (silhouette) — not a display bug, but because
// most players in the DB genuinely have no real photo / aren't playing in
// a top-tier league anymore.
//
// Fix: use GET /players/squads?team=ID — returns a club's ENTIRE CURRENT
// SQUAD (no pagination, no page-3 cap) — including exactly the real stars
// (Haaland at Man City, Salah at Liverpool...) with real photos.
// Trade-off: this endpoint does NOT include season stats (shots/xG/saves...)
// like /players does, so players loaded via this script won't have "stats"
// yet (the radar chart will show "no data yet" — the UI already handles
// this, see TransferMarket.vue). To get "stats" for a few notable stars,
// also run scripts/seedMarqueeStats.js (costs extra quota, not required).
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const REQUEST_DELAY_MS = 6500; // see the explanation of the 10 req/min limit in seedTop5Free.js
const RATE_LIMIT_RETRY_MS = 65000;
const MAX_RATE_LIMIT_RETRIES = 3;
const PROGRESS_FILE = path.join(__dirname, '.seedRealSquadsProgress.json');

const LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 78, name: 'Bundesliga' },
  { id: 135, name: 'Serie A' },
  { id: 61, name: 'Ligue 1' },
];

const POSITION_MAP = {
  Goalkeeper: 'GK',
  Defender: 'DEF',
  Midfielder: 'MID',
  Attacker: 'FWD',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randPrice = (min = 4.0, max = 14.0) => Number((Math.random() * (max - min) + min).toFixed(1));

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    return { phase: 'teams', leagueIndex: 0, teams: [], teamIndex: 0, done: false };
  }
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

async function requestWithRetry(url, params) {
  let attempt = 0;
  while (true) {
    try {
      const res = await axios.get(url, { headers: { 'x-apisports-key': API_KEY }, params, timeout: 15000 });
      return res.data;
    } catch (error) {
      const status = error?.response?.status;
      if (status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        attempt += 1;
        console.log(`   ⏳ Hit the 10 requests/minute limit (429). Waiting ${RATE_LIMIT_RETRY_MS / 1000}s then retrying (${attempt}/${MAX_RATE_LIMIT_RETRIES})...`);
        await sleep(RATE_LIMIT_RETRY_MS);
        continue;
      }
      throw error;
    }
  }
}

async function assertDatabaseReady() {
  if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL in .env');
  await prisma.$queryRaw`SELECT 1`;
}

async function run() {
  if (!API_KEY) {
    throw new Error('Missing API_FOOTBALL_KEY in .env.');
  }

  console.log('🔍 Checking PostgreSQL connection...');
  await assertDatabaseReady();
  console.log('✅ PostgreSQL ready.\n');

  const progress = loadProgress();

  // ---- PHASE 1: get the list of 98 clubs across 5 leagues (5 requests) ----
  if (progress.phase === 'teams') {
    console.log('⏳ Fetching the club list for each league...');
    const allTeams = [];
    for (let i = progress.leagueIndex; i < LEAGUES.length; i++) {
      const league = LEAGUES[i];
      const data = await requestWithRetry(`${BASE_URL}/teams`, { league: league.id, season: 2024 });
      const teams = (data.response || []).map(t => ({ id: t.team.id, name: t.team.name }));
      allTeams.push(...teams);
      console.log(`   ✓ ${league.name}: ${teams.length} clubs`);
      progress.teams = allTeams;
      progress.leagueIndex = i + 1;
      saveProgress(progress);
      await sleep(REQUEST_DELAY_MS);
    }
    progress.phase = 'squads';
    progress.teamIndex = 0;
    saveProgress(progress);
    console.log(`\n✅ ${progress.teams.length} clubs total. Starting to load each club's squad...\n`);
  }

  // ---- PHASE 2: fetch each club's squad (1 request/club) ----
  const teams = progress.teams;
  let totalPlayers = 0;
  for (let i = progress.teamIndex; i < teams.length; i++) {
    const team = teams[i];
    let data;
    try {
      data = await requestWithRetry(`${BASE_URL}/players/squads`, { team: team.id });
    } catch (error) {
      console.log(`   ❌ Error on club ${team.name} (id ${team.id}): ${error.message}. Stopping, progress has been saved — re-run this command to continue.`);
      progress.teamIndex = i;
      saveProgress(progress);
      await prisma.$disconnect();
      return;
    }

    const squad = data.response?.[0]?.players || [];
    for (const p of squad) {
      const position = POSITION_MAP[p.position] || 'MID';
      const record = {
        id: p.id,
        name: p.name,
        position,
        currentPrice: randPrice(),
        teamId: team.id,
        form: ['D', 'D', 'D'],
        photoUrl: p.photo || null,
        teamName: team.name,
      };
      await prisma.player.upsert({ where: { id: record.id }, update: record, create: record });
      totalPlayers += 1;
    }
    console.log(`   ✓ [${i + 1}/${teams.length}] ${team.name} — ${squad.length} players (total: ${totalPlayers})`);

    progress.teamIndex = i + 1;
    saveProgress(progress);
    await sleep(REQUEST_DELAY_MS);
  }

  progress.done = true;
  saveProgress(progress);
  console.log(`\n✅ Done! Loaded real squads (with real photos) for ${teams.length} clubs, ${totalPlayers} total player entries.`);
  console.log('   → Re-run scripts/removeCuratedPlayers.js to match the GW1 data (Haaland, Salah...) to the real playerIds just loaded.');
}

run()
  .catch((err) => {
    console.error('❌ Seeding real squads failed:', err?.response?.data || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
