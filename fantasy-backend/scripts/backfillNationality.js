// ============================================================
// Backfills Player.nationality for players seeded BEFORE that field existed
// (scripts/seedTop5Free.js now captures it going forward — see that file's
// comment — but the ~357 players already loaded had it silently discarded
// the first time round, since nothing ever wrote it to the DB).
//
// Unlike scripts/backfillLeagueNames.js (which only needed 5 lightweight
// /teams requests), nationality only exists on the bulk /players response,
// so this has to re-walk the exact same paginated /players?league=X&page=N
// calls seedTop5Free.js originally made — same request cost as the
// original seed (~250-280 requests across 5 leagues), same free-tier limits
// (100 requests/day, page-3 hard cap per league). Progress is checkpointed
// separately from seedTop5Free.js's own .seedTop5Progress.json so re-running
// one script never confuses the other's "done" state.
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const SEASON = 2024; // must match the season seedTop5Free.js originally seeded from
const REQUEST_DELAY_MS = 6500; // stays within the 10 requests/minute free-tier limit
const RATE_LIMIT_RETRY_MS = 65000;
const MAX_RATE_LIMIT_RETRIES = 3;
const PROGRESS_FILE = path.join(__dirname, '.backfillNationalityProgress.json');

const LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 78, name: 'Bundesliga' },
  { id: 135, name: 'Serie A' },
  { id: 61, name: 'Ligue 1' }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function backfillPage(players) {
  let updated = 0;
  for (const entry of players) {
    const nationality = entry.player?.nationality || null;
    if (!nationality) continue;
    const id = entry.player?.id;
    if (!id) continue;
    // updateMany (not update) so a player row that no longer exists locally
    // (e.g. trimmed by a later cleanup pass) doesn't throw and abort the run.
    const result = await prisma.player.updateMany({ where: { id }, data: { nationality } });
    updated += result.count;
  }
  return updated;
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
  let totalUpdated = 0;
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
          console.log(`   🧱 Free plan hard cap hit at page 3 for this league (matches seedTop5Free.js's own ceiling). Treating it as done.`);
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
      const updated = await backfillPage(players);
      totalUpdated += updated;

      const totalPages = payload.paging?.total || page;
      state.totalPages = totalPages;
      state.lastCompletedPage = page;
      saveProgress(progress);

      console.log(`   ✓ Page ${page}/${totalPages} — ${updated} players tagged with nationality (session total: ${totalUpdated})`);

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
  console.log(`\n💾 Tagged ${totalUpdated} players with nationality in this session.`);
  if (allDone) {
    console.log('✅ ALL 5 leagues are complete!');
  } else if (quotaExhausted) {
    console.log('⏸️  Not finished yet — re-run "npm run backfill:nationality" tomorrow (quota resets by UTC) to continue.');
  }
}

run()
  .catch((err) => {
    console.error('❌ Backfill failed:', err?.response?.data || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
