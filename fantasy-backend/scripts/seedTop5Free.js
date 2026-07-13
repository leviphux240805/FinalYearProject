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
const REQUEST_DELAY_MS = 800;
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
      form: ['D', 'D', 'D']
    };
    await prisma.player.upsert({ where: { id: record.id }, update: record, create: record });
    count += 1;
  }
  return count;
}

async function assertDatabaseReady() {
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL trong .env');
  await prisma.$queryRaw`SELECT 1`;
}

async function run() {
  if (!API_KEY) {
    throw new Error('Thiếu API_FOOTBALL_KEY trong .env. Đăng ký miễn phí tại https://dashboard.api-football.com/register');
  }

  console.log('🔍 Kiểm tra kết nối PostgreSQL...');
  await assertDatabaseReady();
  console.log('✅ PostgreSQL sẵn sàng.\n');

  const progress = loadProgress();
  let totalUpserted = 0;
  let quotaExhausted = false;

  for (const league of LEAGUES) {
    const state = progress[league.id];
    if (state.done) {
      console.log(`⏭️  ${league.name}: đã hoàn tất trước đó, bỏ qua.`);
      continue;
    }

    console.log(`\n📦 Giải đấu: ${league.name} (tiếp tục từ trang ${state.lastCompletedPage + 1})`);

    let page = state.lastCompletedPage + 1;
    while (true) {
      let payload;
      try {
        payload = await fetchPlayersPage(league.id, page);
      } catch (error) {
        console.log(`   ❌ Lỗi mạng ở trang ${page}: ${error.message}. Dừng lại, tiến trình đã lưu.`);
        quotaExhausted = true;
        break;
      }

      const hasErrors = payload.errors && (Array.isArray(payload.errors) ? payload.errors.length > 0 : Object.keys(payload.errors).length > 0);
      if (hasErrors && payload.results === 0) {
        const errorText = JSON.stringify(payload.errors);
        const isPageCeiling = errorText.toLowerCase().includes('page parameter');

        if (isPageCeiling) {
          // Free plan hard-caps at page 3 (60 players) per league, permanently
          // — not a daily quota issue, retrying tomorrow won't help.
          console.log(`   🧱 Free plan giới hạn cứng ở trang 3 cho giải này (${errorText}). Coi như đã xong.`);
          state.done = true;
          state.totalPages = state.lastCompletedPage;
          saveProgress(progress);
        } else {
          console.log(`   🛑 API dừng ở trang ${page}: ${errorText}`);
          console.log('   → Rất có thể đã hết quota 100 request/ngày. Chạy lại script này vào ngày mai để tiếp tục.');
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

      console.log(`   ✓ Trang ${page}/${totalPages} — ${upserted} cầu thủ (tổng phiên này: ${totalUpserted})`);

      if (page >= totalPages) {
        state.done = true;
        saveProgress(progress);
        console.log(`   🎉 ${league.name} hoàn tất!`);
        break;
      }

      page += 1;
      await sleep(REQUEST_DELAY_MS);
    }

    if (quotaExhausted) break;
  }

  const allDone = LEAGUES.every((l) => progress[l.id].done);
  console.log(`\n💾 Đã nạp ${totalUpserted} cầu thủ trong phiên này.`);
  if (allDone) {
    console.log('✅ TẤT CẢ 5 giải đấu đã hoàn tất! Có thể xoá scripts/.seedTop5Progress.json nếu muốn.');
  } else if (quotaExhausted) {
    console.log('⏸️  Chưa xong hết — chạy lại "npm run seed:top5-free" vào ngày mai (quota reset theo UTC) để tiếp tục.');
  }
}

run()
  .catch((err) => {
    console.error('❌ Seed thất bại:', err?.response?.data || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
