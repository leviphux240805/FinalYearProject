// ============================================================
// Seeds the real top-5-European-league player registry from
// football-data.org (v4), replacing the 60-player curated stub
// in data/backupPlayers.js with the actual current squads.
//
// Requires a free API token from https://www.football-data.org/client/register
// set as FOOTBALL_DATA_API_TOKEN in .env. All 5 leagues below are on
// the free "TIER_ONE" plan, but every endpoint still requires auth.
//
// Free plan is rate-limited to 10 requests/minute. This script makes
// ~101 requests (5 competitions + ~96 teams), so a full run takes
// roughly 11-12 minutes by design — do not lower REQUEST_DELAY_MS
// below 6500 or you will start hitting 429s.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const BASE_URL = 'https://api.football-data.org/v4';
const API_TOKEN = process.env.FOOTBALL_DATA_API_TOKEN;
const REQUEST_DELAY_MS = 6500; // stays under the 10 req/min free-tier ceiling

// England, Spain, Germany, Italy, France
const TOP5_COMPETITIONS = ['PL', 'PD', 'BL1', 'SA', 'FL1'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randPrice = (min = 4.0, max = 14.0) => Number((Math.random() * (max - min) + min).toFixed(1));

const toFantasyPosition = (position) => {
  const text = String(position || '').toLowerCase();
  if (text.includes('keeper') || text.includes('goal')) return 'GK';
  if (text.includes('back') || text.includes('defen')) return 'DEF';
  if (text.includes('midfield')) return 'MID';
  if (text.includes('wing') || text.includes('forward') || text.includes('striker') || text.includes('offen') || text.includes('attack')) return 'FWD';
  return 'MID';
};

async function apiGet(path) {
  const response = await axios.get(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': API_TOKEN },
    timeout: 15000
  });
  await sleep(REQUEST_DELAY_MS);
  return response.data;
}

async function apiGetWithRetry(path, retries = 3) {
  try {
    return await apiGet(path);
  } catch (error) {
    if (error.response?.status === 429 && retries > 0) {
      const retryAfter = Number(error.response.headers['retry-after']) || 60;
      console.log(`   ⏳ Rate-limited, chờ ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      return apiGetWithRetry(path, retries - 1);
    }
    throw error;
  }
}

async function assertDatabaseReady() {
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL trong .env');
  await prisma.$queryRaw`SELECT 1`;
}

async function seedFromFootballData() {
  if (!API_TOKEN) {
    throw new Error('Thiếu FOOTBALL_DATA_API_TOKEN trong .env. Đăng ký miễn phí tại https://www.football-data.org/client/register');
  }

  console.log('🔍 Kiểm tra kết nối PostgreSQL...');
  await assertDatabaseReady();
  console.log('✅ PostgreSQL sẵn sàng.');

  const estimatedMinutes = Math.ceil((TOP5_COMPETITIONS.length + 100) * REQUEST_DELAY_MS / 60000);
  console.log(`⏳ Bắt đầu hút dữ liệu Top 5 giải đấu châu Âu từ football-data.org...`);
  console.log(`   (Free plan giới hạn 10 request/phút — dự kiến mất khoảng ${estimatedMinutes} phút)`);

  const allPlayers = new Map(); // playerId -> record, dedupes players who appear on multiple loaded rosters

  for (const code of TOP5_COMPETITIONS) {
    console.log(`\n📦 Giải đấu: ${code}`);
    const teamsPayload = await apiGetWithRetry(`/competitions/${code}/teams`);
    const teams = teamsPayload?.teams || [];
    console.log(`   → ${teams.length} CLB`);

    for (const team of teams) {
      process.stdout.write(`   🔄 ${team.name}...`);
      const teamDetail = await apiGetWithRetry(`/teams/${team.id}`);
      const squad = teamDetail?.squad || [];

      for (const player of squad) {
        if (!Number.isFinite(Number(player?.id))) continue;
        allPlayers.set(Number(player.id), {
          id: Number(player.id),
          name: player.name || `Player ${player.id}`,
          position: toFantasyPosition(player.position),
          currentPrice: randPrice(),
          teamId: team.id,
          form: ['D', 'D', 'D']
        });
      }
      console.log(` ${squad.length} cầu thủ (tổng ${allPlayers.size})`);
    }
  }

  console.log(`\n💾 Bắt đầu bơm ${allPlayers.size} cầu thủ vào PostgreSQL...`);
  const records = Array.from(allPlayers.values());
  let upserted = 0;
  for (const record of records) {
    await prisma.player.upsert({ where: { id: record.id }, update: record, create: record });
    upserted += 1;
    if (upserted % 100 === 0) process.stdout.write(`\r   ...${upserted}/${records.length}`);
  }

  console.log(`\n✅ Seed hoàn tất. ${records.length} cầu thủ từ Top 5 giải đấu đã có trong PostgreSQL.`);
}

seedFromFootballData()
  .catch((err) => {
    console.error('❌ Seed thất bại:', err?.response?.data || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
