// ============================================================
// Seeds a MOCK match schedule (Fixture table) across several gameweeks.
//
// WHY MOCK: the real clubs are currently in their off-season break, so
// there is no live fixture list to pull from any provider right now (see
// the discussion that led to this — checklist-feedback-giangvien.md, item
// A2/A7). This generates a plausible round-robin-style schedule from the
// real clubs already loaded into the Player table (via seedTop5Free.js),
// and computes a prediction (expected goals + win/draw/win probabilities)
// for each fixture via predictionService.js — the SAME heuristic used
// everywhere else in the app (Player Comparison's projected points, the
// upcoming Fixtures list).
//
// GW1-FINISHED_GAMEWEEKS are marked FINISHED with a plausible final score
// (rounded from the predicted expected goals, ± a small random wobble) —
// scripts/seedMockMatchStats.js then generates per-player match stats FROM
// those scores, giving the Player detail history (A1) and "Run Matchday"
// something real to show. Every later gameweek is left SCHEDULED with no
// score, exactly like a real upcoming fixture list (used by the Fixtures
// tab and Player Comparison's projected points).
//
// Swap this file for a real provider call later (football-data.org /
// API-Football both already have fixtures endpoints, and their tokens are
// already in .env) without changing anything downstream — routes/fixtures.js
// and predictionService.js only care about the Fixture table's shape, not
// where its rows came from.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { predictMatchup } = require('../services/predictionService');

const prisma = new PrismaClient();

const GAMEWEEKS_TO_SEED = 5;
// GW1-3 are treated as already played (FINISHED, mock scores) so there's
// enough gameweek-by-gameweek history for the Player detail table (feedback
// item A1) to show something real; GW4-5 stay SCHEDULED so the Fixtures tab
// (A2) and Player Comparison's projected points (A7) still have upcoming
// matches to project from.
const FINISHED_GAMEWEEKS = 3;
const SEASON_START = new Date('2026-08-15T15:00:00.000Z'); // arbitrary Saturday kickoff slot
const DAYS_PER_GAMEWEEK = 7;

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Simple round-robin pairing for one gameweek: shuffles the team list, then
// pairs consecutive teams. Home/away is alternated by gameweek parity so the
// same team isn't always "home" across every gameweek it's paired the same
// way.
function pairTeamsForGameweek(teams, gameweekIndex) {
  const shuffled = shuffle(teams);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const [a, b] = [shuffled[i], shuffled[i + 1]];
    const home = gameweekIndex % 2 === 0 ? a : b;
    const away = gameweekIndex % 2 === 0 ? b : a;
    pairs.push({ home, away });
  }
  return pairs; // odd team left out gets a "bye" this gameweek, same as a real league
}

// Rounds expected goals into a plausible final score for GW1 (already
// "finished"): rounds to the nearest integer, then applies a small ±1
// random wobble so scores aren't just the raw prediction re-displayed.
function mockFinalScore(expectedGoals) {
  const wobble = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
  return Math.max(0, Math.round(expectedGoals) + wobble);
}

async function main() {
  console.log('🔍 Checking PostgreSQL connection...');
  await prisma.$queryRaw`SELECT 1`;
  console.log('✅ PostgreSQL ready.\n');

  const players = await prisma.player.findMany({
    where: { teamName: { not: null } },
    select: { teamId: true, teamName: true },
    distinct: ['teamId'],
  });

  if (players.length < 2) {
    console.error('❌ Fewer than 2 distinct clubs found in the Player table. Run scripts/seedTop5Free.js first.');
    process.exitCode = 1;
    return;
  }

  const teams = players.map(p => ({ teamId: p.teamId, teamName: p.teamName }));
  console.log(`📦 Found ${teams.length} distinct real clubs to schedule.\n`);

  let created = 0;
  for (let gwIndex = 0; gwIndex < GAMEWEEKS_TO_SEED; gwIndex++) {
    const gameweek = gwIndex + 1;
    const pairs = pairTeamsForGameweek(teams, gwIndex);
    const kickoff = new Date(SEASON_START.getTime() + gwIndex * DAYS_PER_GAMEWEEK * 24 * 60 * 60 * 1000);
    const isFinished = gameweek <= FINISHED_GAMEWEEKS;

    for (const { home, away } of pairs) {
      const prediction = await predictMatchup(home.teamId, away.teamId);
      const data = {
        gameweek,
        homeTeamId: home.teamId,
        awayTeamId: away.teamId,
        homeTeamName: home.teamName,
        awayTeamName: away.teamName,
        kickoff,
        status: isFinished ? 'FINISHED' : 'SCHEDULED',
        homeScore: isFinished ? mockFinalScore(prediction.homeExpectedGoals) : null,
        awayScore: isFinished ? mockFinalScore(prediction.awayExpectedGoals) : null,
        homeExpectedGoals: prediction.homeExpectedGoals,
        awayExpectedGoals: prediction.awayExpectedGoals,
        homeWinProb: prediction.homeWinProb,
        drawProb: prediction.drawProb,
        awayWinProb: prediction.awayWinProb,
      };

      await prisma.fixture.upsert({
        where: { gameweek_homeTeamId_awayTeamId: { gameweek, homeTeamId: home.teamId, awayTeamId: away.teamId } },
        update: data,
        create: data,
      });
      created++;
    }
    console.log(`   GW${gameweek}: ${pairs.length} fixtures (${isFinished ? 'FINISHED, mock scores' : 'SCHEDULED'})`);
  }

  console.log(`\n✅ Seeded/updated ${created} mock fixtures across ${GAMEWEEKS_TO_SEED} gameweeks.`);
  console.log('   Replace this generator with a real provider call once the season restarts.');
}

main()
  .catch((err) => {
    console.error('❌ Seeding fixtures failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
