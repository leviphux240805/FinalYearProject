require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;

const PER_PAGE = Number(process.env.SPORTMONKS_SEED_PER_PAGE || 100);
const MAX_PAGES = Number(process.env.SPORTMONKS_SEED_MAX_PAGES || 120);
const TARGET_COUNT = Number(process.env.SPORTMONKS_SEED_TARGET || 2500);
const TOP5_LEAGUE_IDS = String(process.env.SPORTMONKS_TOP5_LEAGUE_IDS || '8,564,301,82,384')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(Number.isFinite);
const DATABASE_URL = process.env.DATABASE_URL || '';

const POSITION_ID_MAP = {
  // Note: this mapping may vary depending on the Sportmonks dataset; mapping by name is preferred first
  24: 'FWD',
  25: 'MID',
  26: 'DEF',
  27: 'GK',
};

const randPrice = (min = 4.0, max = 14.0) => {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(1));
};

const toFantasyPosition = (player) => {
  const text = [
    player?.position?.name,
    player?.position?.developer_name,
    player?.detailedPosition?.name,
    player?.detailedPosition?.developer_name,
    player?.detailedPosition?.type?.name,
    player?.detailedPosition?.type?.developer_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (text.includes('goal')) return 'GK';
  if (text.includes('def')) return 'DEF';
  if (text.includes('mid')) return 'MID';
  if (text.includes('forward') || text.includes('striker') || text.includes('wing')) return 'FWD';

  if (POSITION_ID_MAP[player?.position_id]) return POSITION_ID_MAP[player.position_id];
  return 'MID';
};

const hasTop5LeagueSignal = (player) => {
  // Prefer the latest fixture league
  const latestLeagues = (player?.latest || [])
    .map(item => item?.fixture?.league?.id)
    .filter(Number.isFinite);

  if (latestLeagues.some(id => TOP5_LEAGUE_IDS.includes(id))) return true;

  // If there's no "latest" data, let it through to avoid wrongly excluding a
  // player due to a missing include. Can be tightened later once the
  // include/team-season data is standardized in production.
  return latestLeagues.length === 0;
};

const toPlayerRecord = (p) => {
  const teamId =
    p?.team_id ||
    p?.latest?.[0]?.team_id ||
    p?.statistics?.[0]?.team_id ||
    p?.teams?.[0]?.team_id ||
    p?.teams?.[0]?.team?.id;

  if (!Number.isFinite(Number(p?.id)) || !teamId) return null;

  return {
    id: Number(p.id),
    name: p.display_name || p.common_name || p.name || `Player ${p.id}`,
    position: toFantasyPosition(p),
    currentPrice: randPrice(),
    teamId: Number(teamId),
    form: ['D', 'D', 'D'],
  };
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function fetchPlayersPage(page) {
  const response = await axios.get(`${SPORTMONKS_BASE_URL}/players`, {
    params: {
      api_token: API_TOKEN,
      page,
      per_page: PER_PAGE,
      include: 'detailedPosition;position;teams.team;latest.fixture.league',
    },
    timeout: 15000,
  });

  return response.data;
}

async function assertDatabaseReady() {
  if (!DATABASE_URL) {
    throw new Error('Missing DATABASE_URL in .env');
  }

  if (DATABASE_URL.includes('yourpassword')) {
    throw new Error('DATABASE_URL is still using the "yourpassword" placeholder. Please update it with a real user/password before seeding.');
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const message = error?.message || 'Unknown DB error';
    throw new Error(
      `Could not connect to PostgreSQL. Make sure the DB is running and DATABASE_URL is valid. Details: ${message}`
    );
  }
}

async function seedDatabase() {
  if (!API_TOKEN) {
    throw new Error('Missing SPORTMONKS_API_TOKEN in .env');
  }

  console.log('🔍 Checking PostgreSQL connection...');
  await assertDatabaseReady();
  console.log('✅ PostgreSQL ready.');

  console.log('⏳ Pulling data from Sportmonks Top 5 Leagues...');
  console.log(`📦 Config: perPage=${PER_PAGE}, maxPages=${MAX_PAGES}, target=${TARGET_COUNT}`);

  const uniquePlayers = new Map();
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES && uniquePlayers.size < TARGET_COUNT) {
    const payload = await fetchPlayersPage(page);
    const rows = payload?.data || [];

    if (!rows.length) break;

    for (const raw of rows) {
      if (!hasTop5LeagueSignal(raw)) continue;
      const record = toPlayerRecord(raw);
      if (!record) continue;
      if (!uniquePlayers.has(record.id)) uniquePlayers.set(record.id, record);
      if (uniquePlayers.size >= TARGET_COUNT) break;
    }

    const pagination = payload?.pagination;
    hasMore = Boolean(
      pagination?.has_more ||
      pagination?.next_page ||
      pagination?.current_page < pagination?.last_page ||
      payload?.links?.next
    );

    process.stdout.write(`\r🔄 Page ${page} | collected ${uniquePlayers.size} players...`);
    page += 1;
  }

  console.log('\n💾 Starting to load into PostgreSQL...');

  const records = Array.from(uniquePlayers.values());
  let inserted = 0;

  for (const batch of chunk(records, 500)) {
    const result = await prisma.player.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  console.log(`✅ Seed complete. Collected: ${records.length} | Newly inserted: ${inserted}`);
}

seedDatabase()
  .catch((err) => {
    console.error('❌ Seed failed:', err?.response?.data || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
