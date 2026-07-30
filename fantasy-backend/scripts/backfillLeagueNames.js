// ============================================================
// Backfills the missing Player.leagueName field — which league a club
// belongs to has, until now, only ever existed temporarily in the memory
// of seedRealSquads.js while it runs, never written to the DB. This script
// calls the same endpoint (/teams?league=X&season=2024) that
// seedRealSquads.js used to get the club list, then updates leagueName for
// every Player with a matching teamId.
// Only costs 5 requests (1 per league), very safe against the 100/day quota.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const SEASON = 2024; // matches the season used when seeding real squads (seedRealSquads.js)

const LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 78, name: 'Bundesliga' },
  { id: 135, name: 'Serie A' },
  { id: 61, name: 'Ligue 1' }
];

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

  const matchedTeamIds = new Set();

  for (const league of LEAGUES) {
    const { data } = await axios.get(`${BASE_URL}/teams`, {
      headers: { 'x-apisports-key': API_KEY },
      params: { league: league.id, season: SEASON },
      timeout: 15000
    });

    const teamIds = (data.response || []).map(t => t.team.id);
    teamIds.forEach(id => matchedTeamIds.add(id));

    const result = await prisma.player.updateMany({
      where: { teamId: { in: teamIds } },
      data: { leagueName: league.name }
    });

    console.log(`✓ ${league.name}: ${teamIds.length} clubs found on API-Football, ${result.count} players tagged with leagueName`);
  }

  const unmatched = await prisma.player.findMany({
    where: { leagueName: null },
    select: { id: true, name: true, teamName: true, teamId: true }
  });

  console.log(`\n${unmatched.length === 0 ? '✅' : '⚠️ '} Players not matched to any league: ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log(unmatched.slice(0, 20).map(p => `   - ${p.name} (teamId=${p.teamId}, teamName=${p.teamName})`).join('\n'));
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
