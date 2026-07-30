// ============================================================
// Seeds MOCK PlayerGameweekStat rows for every FINISHED Fixture (see
// scripts/seedFixtures.js — GW1-3 by default), so the Player detail
// history table (feedback item A1) and "Run Matchday" scoring have real
// data to show for the ~300 real API-Football players, not just the small
// matched subset the old curated-player GW1 data covered.
//
// WHY MOCK: same reasoning as Fixture itself — the real clubs are in their
// off-season break, no live match-stats provider is wired up. Generating
// stats FROM the fixture's own mock final score (rather than independently
// per player) keeps the story internally consistent: a club that won 3-0
// has its clean sheet AND 3 goals distributed among ITS OWN players,
// visible consistently across the Fixtures tab (A2), Player history (A1),
// and "Run Matchday" scoring.
//
// Because the API-Football free tier's page cap (3 pages/league) means
// only a handful of real players per club are in the DB, every player on a
// team is simply assumed to have played the full 90 minutes — there isn't
// enough roster depth in the free-tier dataset to meaningfully simulate
// substitutions/rotation.
// ============================================================
require('dotenv').config();
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

const YELLOW_CARD_CHANCE = 0.08;
const RED_CARD_CHANCE = 0.01;
const ASSIST_CHANCE_PER_GOAL = 0.7;

function pickWeighted(candidates, weightFn) {
  const weights = candidates.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return candidates[Math.floor(Math.random() * candidates.length)];
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    if (roll < weights[i]) return candidates[i];
    roll -= weights[i];
  }
  return candidates[candidates.length - 1];
}

// Attacking players (FWD, then MID) are weighted far more likely to score
// than defenders/goalkeepers — uses the player's own xG stat when available
// (curated/real players with enough minutes data), otherwise a flat
// position-based weight.
function goalWeight(player) {
  const xG = player.stats?.xG;
  if (xG != null) return 1 + Number(xG) * 10;
  return { FWD: 6, MID: 3, DEF: 1, GK: 0.1 }[player.position] ?? 1;
}

function assistWeight(player) {
  const xA = player.stats?.xA;
  if (xA != null) return 1 + Number(xA) * 10;
  return { MID: 5, FWD: 2, DEF: 1.5, GK: 0.1 }[player.position] ?? 1;
}

async function generateTeamStats(teamId, goalsScored, conceded, gameweek) {
  const players = await prisma.player.findMany({ where: { teamId } });
  if (players.length === 0) return 0;

  const goalScorers = [];
  for (let i = 0; i < goalsScored; i++) {
    goalScorers.push(pickWeighted(players, goalWeight));
  }

  const assistsByPlayerId = new Map();
  for (const scorer of goalScorers) {
    if (Math.random() >= ASSIST_CHANCE_PER_GOAL) continue;
    const assistCandidates = players.filter((p) => p.id !== scorer.id);
    if (assistCandidates.length === 0) continue;
    const assister = pickWeighted(assistCandidates, assistWeight);
    assistsByPlayerId.set(assister.id, (assistsByPlayerId.get(assister.id) || 0) + 1);
  }

  const goalsByPlayerId = new Map();
  for (const scorer of goalScorers) {
    goalsByPlayerId.set(scorer.id, (goalsByPlayerId.get(scorer.id) || 0) + 1);
  }

  const cleanSheet = conceded === 0;

  await Promise.all(
    players.map((player) => {
      const goals = goalsByPlayerId.get(player.id) || 0;
      const assists = assistsByPlayerId.get(player.id) || 0;
      const yellowCards = Math.random() < YELLOW_CARD_CHANCE ? 1 : 0;
      const redCards = yellowCards === 0 && Math.random() < RED_CARD_CHANCE ? 1 : 0;
      // Saves scale with how much the opponent actually threatened (their
      // real expected goals this fixture), not a flat random number.
      const saves = player.position === 'GK'
        ? Math.max(0, Math.round(conceded * 1.5 + Math.random() * 2))
        : 0;

      const data = {
        minutesPlayed: 90,
        goals,
        assists,
        yellowCards,
        redCards,
        cleanSheet,
        saves,
      };

      return prisma.playerGameweekStat.upsert({
        where: { playerId_gameweek: { playerId: player.id, gameweek } },
        update: data,
        create: { playerId: player.id, gameweek, ...data },
      });
    })
  );

  return players.length;
}

// Backfills Player.stats (the season-level xG/xA/keyPasses/shots/form used
// by the radar chart / analytics modal in TransferMarket.vue) for any
// player who still has stats = null — typically because the free
// API-Football tier had no minutes-played data for them at seed time (see
// buildStatsFromApiFootball in seedTop5Free.js). Derived from the SAME mock
// PlayerGameweekStat rows just generated above, so the radar chart and the
// match-history table tell a consistent story instead of one being filled
// and the other still showing "no data yet".
async function backfillMissingPlayerStats() {
  // Json fields can't be filtered with a plain `null` literal — Prisma
  // needs an explicit sentinel: DbNull means "the column itself is SQL
  // NULL", JsonNull means "the column stores the literal JSON value
  // `null`". Checking both since it depends on exactly how the writing
  // script (seedTop5Free.js, passing plain JS `null`) ended up persisting it.
  const players = await prisma.player.findMany({
    where: { OR: [{ stats: { equals: Prisma.DbNull } }, { stats: { equals: Prisma.JsonNull } }] },
  });
  let updated = 0;

  for (const player of players) {
    const rows = await prisma.playerGameweekStat.findMany({ where: { playerId: player.id } });
    const totalMinutes = rows.reduce((sum, r) => sum + r.minutesPlayed, 0);
    if (totalMinutes <= 0) continue; // still no data at all -> leave null, honest "no data" notice stays

    const per90 = (total) => (total / totalMinutes) * 90;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const totalGoals = rows.reduce((sum, r) => sum + r.goals, 0);
    const totalAssists = rows.reduce((sum, r) => sum + r.assists, 0);
    const cleanSheets = rows.filter((r) => r.cleanSheet).length;

    const stats = {
      xG: clamp01(per90(totalGoals) / 0.8),
      xA: clamp01(per90(totalAssists) / 0.6),
      keyPasses: clamp01(per90(totalAssists + totalGoals) / 4), // proxy — no real key-pass mock data
      shots: clamp01(per90(totalGoals) / 6),
      form: clamp01((rows.length > 0 ? cleanSheets / rows.length : 0.5) + 0.4),
    };

    await prisma.player.update({ where: { id: player.id }, data: { stats } });
    updated++;
  }

  return updated;
}

async function main() {
  console.log('🔍 Checking PostgreSQL connection...');
  await prisma.$queryRaw`SELECT 1`;
  console.log('✅ PostgreSQL ready.\n');

  const finishedFixtures = await prisma.fixture.findMany({ where: { status: 'FINISHED' } });
  if (finishedFixtures.length === 0) {
    console.error('❌ No FINISHED fixtures found. Run "npm run seed:fixtures" first.');
    process.exitCode = 1;
    return;
  }

  console.log(`📦 Found ${finishedFixtures.length} finished fixtures to generate stats for.\n`);

  let totalPlayers = 0;
  for (const fixture of finishedFixtures) {
    const homeCount = await generateTeamStats(fixture.homeTeamId, fixture.homeScore, fixture.awayScore, fixture.gameweek);
    const awayCount = await generateTeamStats(fixture.awayTeamId, fixture.awayScore, fixture.homeScore, fixture.gameweek);
    totalPlayers += homeCount + awayCount;
    console.log(`   GW${fixture.gameweek}: ${fixture.homeTeamName} ${fixture.homeScore}-${fixture.awayScore} ${fixture.awayTeamName} (${homeCount + awayCount} players updated)`);
  }

  console.log(`\n✅ Generated mock match stats for ${totalPlayers} player-gameweek rows across ${finishedFixtures.length} fixtures.`);

  const backfilled = await backfillMissingPlayerStats();
  console.log(`✅ Backfilled Player.stats (radar/analytics data) for ${backfilled} players who previously had none.`);
}

main()
  .catch((err) => {
    console.error('❌ Seeding mock match stats failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
