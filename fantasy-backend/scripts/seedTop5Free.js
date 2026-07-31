// ============================================================
// Seeds real top-5-European-league players from API-Football's
// free tier (api-sports.io), replacing the 60-player curated stub
// in data/backupPlayers.js.
//
// Requires a free key from https://dashboard.api-football.com/register
// set as API_FOOTBALL_KEY in .env.
//
// Free-tier constraints this script works around:
//  - 100 requests/day (hard cap) -> progress is checkpointed to
//    scripts/.seedTop5Progress.json after every page, so re-running
//    this script on a later day resumes where it left off instead
//    of starting over or double-spending quota.
//  - Free tier only has season data for 2022-2024, not the live
//    current season -> SEASON below is pinned to 2024 (most recent
//    available), which is "recent squads", not literally live.
//
// All 5 leagues together run to roughly 250-280 requests (Premier
// League alone is ~57 pages), so this needs about 3 daily runs.
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const SEASON = 2024; // most recent season available on the free tier
// API-Football's free tier is limited to ~10 requests/minute (DIFFERENT
// from the 100 requests/DAY limit). 800ms is too fast (~75 req/min) and
// gets hit with a 429 almost immediately — not because the daily quota is
// exhausted, as an earlier version of this log incorrectly assumed.
// 6.5s/request stays within the per-minute limit with a safety margin.
const REQUEST_DELAY_MS = 6500;
const RATE_LIMIT_RETRY_MS = 65000; // wait out one full minute cycle, then retry
const MAX_RATE_LIMIT_RETRIES = 3;
const PROGRESS_FILE = path.join(__dirname, '.seedTop5Progress.json');

const LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 78, name: 'Bundesliga' },
  { id: 135, name: 'Serie A' },
  { id: 61, name: 'Ligue 1' }
];

const POSITION_MAP = {
  Goalkeeper: 'GK',
  Defender: 'DEF',
  Midfielder: 'MID',
  Attacker: 'FWD'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randPrice = (min = 4.0, max = 14.0) => Number((Math.random() * (max - min) + min).toFixed(1));

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    const initial = {};
    for (const league of LEAGUES) initial[league.id] = { lastCompletedPage: 0, totalPages: null, done: false };
    return initial;
  }
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function fetchPlayersPage(leagueId, page) {
  const response = await axios.get(`${BASE_URL}/players`, {
    headers: { 'x-apisports-key': API_KEY },
    params: { league: leagueId, season: SEASON, page },
    timeout: 15000
  });
  return response.data;
}

// Normalizes API-Football's raw stats (per-season totals) into per-90-minute
// stats, then compresses them onto a 0-1 scale (the radar chart multiplies
// by 100 to get a %). The API-Football free tier does NOT have real xG/xA
// (that's paid data like Opta/StatsBomb), so the "xG"/"xA" here are only
// proxies derived from actual goals/assists — not true Expected Goals. The
// normalization ceilings (6 shots/90, 4 key passes/90...) were chosen at a
// "very high" level for a typical attacking player, to avoid every player
// being pushed to 100%.
function buildStatsFromApiFootball(stats) {
  const minutes = Number(stats?.games?.minutes) || 0;
  if (minutes <= 0) return null; // Not enough data for a reliable per-90 estimate

  const per90 = (total) => (Number(total) || 0) / minutes * 90;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  const shots = clamp01(per90(stats?.shots?.total) / 6);
  const keyPasses = clamp01(per90(stats?.passes?.key) / 4);
  const xA = clamp01(per90(stats?.goals?.assists) / 0.6); // proxy: real assists/90
  const xG = clamp01(per90(stats?.goals?.total) / 0.8);   // proxy: real goals/90
  const form = clamp01((Number(stats?.games?.rating) || 6.0) / 10);

  const out = { shots, keyPasses, xA, xG, form };

  // Real defensive stats (tackles + interceptions per-90) — used to replace
  // the xG-derived formula for the defender's "Defending" axis (more accurate).
  const defensiveActions = (Number(stats?.tackles?.total) || 0) + (Number(stats?.tackles?.interceptions) || 0);
  if (defensiveActions > 0) out.defensiveActions = clamp01(per90(defensiveActions) / 8);

  // Real goalkeeper save count — replaces the xG-derived formula for the
  // "Saves" axis.
  if (stats?.goals?.saves != null) out.saves = clamp01(per90(stats.goals.saves) / 5);

  return out;
}

async function upsertPlayersFromPage(players, leagueId) {
  let count = 0;
  for (const entry of players) {
    const stats = entry.statistics?.[0];
    if (!stats?.team?.id) continue;

    const position = POSITION_MAP[stats.games?.position] || 'MID';
    const record = {
      id: entry.player.id,
      name: entry.player.name,
      position,
      currentPrice: randPrice(),
      teamId: stats.team.id,
      form: ['D', 'D', 'D'],
      stats: buildStatsFromApiFootball(stats),
      // API-Football already returns a photo URL for every player at no
      // extra request cost — just need to save the field that was
      // previously being ignored.
      photoUrl: entry.player?.photo || null,
      teamName: stats.team?.name || null,
      // Already present on this same response at no extra request cost —
      // just wasn't being read before scripts/backfillNationality.js needed it.
      nationality: entry.player?.nationality || null,
    };
    await prisma.player.upsert({ where: { id: record.id }, update: record, create: record });
    count += 1;
  }
  return count;
}

async function assertDatabaseReady() {
  if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL in .env');
  await prisma.$queryRaw`SELECT 1`;
}

async function run() {
  if (!API_KEY) {
    throw new Error('Missing API_FOOTBALL_KEY in .env. Register for free at https://dashboard.api-football.com/register');
  }

  console.log('🔍 Checking PostgreSQL connection...');
  await assertDatabaseReady();
  console.log('✅ PostgreSQL ready.\n');

  const progress = loadProgress();
  let totalUpserted = 0;
  let quotaExhausted = false;

  for (const league of LEAGUES) {
    const state = progress[league.id];
    if (state.done) {
      console.log(`⏭️  ${league.name}: already completed previously, skipping.`);
      continue;
    }

    console.log(`\n📦 League: ${league.name} (resuming from page ${state.lastCompletedPage + 1})`);

    let page = state.lastCompletedPage + 1;
    while (true) {
      let payload;
      let rateLimitRetries = 0;
      while (true) {
        try {
          payload = await fetchPlayersPage(league.id, page);
          break;
        } catch (error) {
          const status = error?.response?.status;
          if (status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
            rateLimitRetries += 1;
            console.log(`   ⏳ Hit the 10 requests/minute limit (429) on page ${page}. Waiting ${RATE_LIMIT_RETRY_MS / 1000}s then retrying (${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})...`);
            await sleep(RATE_LIMIT_RETRY_MS);
            continue;
          }
          console.log(`   ❌ Network error on page ${page}: ${error.message}. Stopping, progress has been saved.`);
          quotaExhausted = true;
          payload = null;
          break;
        }
      }
      if (!payload) break;

      const hasErrors = payload.errors && (Array.isArray(payload.errors) ? payload.errors.length > 0 : Object.keys(payload.errors).length > 0);
      if (hasErrors && payload.results === 0) {
        const errorText = JSON.stringify(payload.errors);
        const isPageCeiling = errorText.toLowerCase().includes('page parameter');

        if (isPageCeiling) {
          // Free plan hard-caps at page 3 (60 players) per league, permanently
          // — not a daily quota issue, retrying tomorrow won't help.
          console.log(`   🧱 Free plan hard cap hit at page 3 for this league (${errorText}). Treating it as done.`);
          state.done = true;
          state.totalPages = state.lastCompletedPage;
          saveProgress(progress);
        } else {
          console.log(`   🛑 API stopped on page ${page}: ${errorText}`);
          console.log('   → Most likely the 100 requests/day quota is exhausted. Re-run this script tomorrow to continue.');
          quotaExhausted = true;
        }
        break;
      }

      const players = payload.response || [];
      const upserted = await upsertPlayersFromPage(players, league.id);
      totalUpserted += upserted;

      const totalPages = payload.paging?.total || page;
      state.totalPages = totalPages;
      state.lastCompletedPage = page;
      saveProgress(progress);

      console.log(`   ✓ Page ${page}/${totalPages} — ${upserted} players (session total: ${totalUpserted})`);

      if (page >= totalPages) {
        state.done = true;
        saveProgress(progress);
        console.log(`   🎉 ${league.name} complete!`);
        break;
      }

      page += 1;
      await sleep(REQUEST_DELAY_MS);
    }

    if (quotaExhausted) break;
  }

  const allDone = LEAGUES.every((l) => progress[l.id].done);
  console.log(`\n💾 Loaded ${totalUpserted} players in this session.`);
  if (allDone) {
    console.log('✅ ALL 5 leagues are complete! You can delete scripts/.seedTop5Progress.json if you want.');
  } else if (quotaExhausted) {
    console.log('⏸️  Not finished yet — re-run "npm run seed:top5-free" tomorrow (quota resets by UTC) to continue.');
  }
}

run()
  .catch((err) => {
    console.error('❌ Seed failed:', err?.response?.data || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
