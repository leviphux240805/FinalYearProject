// ================================================================
// Fixtures API — powers:
//   - A2 (checklist item): the match list for the currently-selected
//     gameweek, so the player knows who's actually playing before picking
//     a squad.
//   - A7: per-gameweek projected fantasy points for a player, used by
//     PlayerComparison.vue instead of comparing only historical form/xG.
// Read-only, no auth required (same as GET /api/players, /api/teams) — this
// is public match-schedule data, not account data.
// ================================================================
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { projectPlayerPoints } = require('../services/predictionService');

const prisma = new PrismaClient();

function serializeFixture(f) {
  return {
    id: f.id,
    gameweek: f.gameweek,
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    homeTeamName: f.homeTeamName,
    awayTeamName: f.awayTeamName,
    kickoff: f.kickoff,
    status: f.status,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    homeExpectedGoals: f.homeExpectedGoals,
    awayExpectedGoals: f.awayExpectedGoals,
    homeWinProb: f.homeWinProb,
    drawProb: f.drawProb,
    awayWinProb: f.awayWinProb,
  };
}

// ================================================================
// GET /api/fixtures/gameweeks — distinct gameweek numbers that have a
// schedule, so the frontend can populate a gameweek selector without
// guessing how many were seeded.
// ================================================================
router.get('/gameweeks', async (req, res) => {
  try {
    const rows = await prisma.fixture.findMany({
      select: { gameweek: true },
      distinct: ['gameweek'],
      orderBy: { gameweek: 'asc' },
    });
    res.json({ success: true, gameweeks: rows.map(r => r.gameweek) });
  } catch (error) {
    console.error('[Fixtures/Gameweeks] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not load the list of gameweeks.' });
  }
});

// ================================================================
// GET /api/fixtures?gameweek=N — every fixture for that gameweek.
// ================================================================
router.get('/', async (req, res) => {
  const gameweek = Number(req.query.gameweek) || 1;

  try {
    const fixtures = await prisma.fixture.findMany({
      where: { gameweek },
      orderBy: { kickoff: 'asc' },
    });
    res.json({ success: true, gameweek, fixtures: fixtures.map(serializeFixture) });
  } catch (error) {
    console.error('[Fixtures/List] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not load fixtures for this gameweek.' });
  }
});

module.exports = router;
