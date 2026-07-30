const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const matchdayService = require('../services/matchdayService');

// ================================================================
// POST /api/matchday/run  (Requires JWT)
// Runs an entire gameweek for the user's current squad: scores each
// starting player (Algorithm 2 — scoringService), locks the squad, and
// returns a breakdown so the frontend can update "player stats" + the
// total score immediately.
// Body: { gameweek?: number }  (defaults to Gameweek 1 — matching the
// DEFAULT_GAMEWEEK shared with transferService.js, since the UI doesn't
// have a gameweek selector yet)
// ================================================================
router.post('/run', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const gameweek = Number.isFinite(Number(req.body?.gameweek))
    ? Number(req.body.gameweek)
    : matchdayService.DEFAULT_GAMEWEEK;

  try {
    const result = await matchdayService.runMatchday({ userId, gameweek });

    console.log(`[Matchday] User ${userId}: GW${result.gameweek} done, total ${result.totalPoints} points.`);

    // Sync into the Redis leaderboard (best-effort — the Leaderboard isn't
    // the source of truth; UserSquad.totalPoints in Postgres is the real one).
    const redisClient = req.app.get('redisClient');
    if (redisClient && redisClient.isReady) {
      try {
        await redisClient.zAdd('global_leaderboard', {
          score: result.totalPoints,
          value: userId,
        });
      } catch (redisErr) {
        console.warn('[Matchday] Could not update the Redis leaderboard:', redisErr.message);
      }
    }

    res.json({
      success: true,
      message: `Finished scoring Gameweek ${result.gameweek}!`,
      gameweek: result.gameweek,
      totalPoints: result.totalPoints,
      breakdown: result.breakdown,
    });
  } catch (error) {
    if (error instanceof matchdayService.NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof matchdayService.SquadIncompleteError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof matchdayService.AlreadyLockedError) {
      return res.status(409).json({ success: false, error: error.message });
    }
    console.error('[Matchday/Run] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server error while running matchday.' });
  }
});

module.exports = router;
