const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');

// ================================================================
// GET /api/leaderboard
// Fetches the Top 50 players from the Redis Sorted Set
// Complexity: O(log N) - Runs in < 1ms even with 100,000 players
// ================================================================
router.get('/', async (req, res) => {
  try {
    const redisClient = req.app.get('redisClient');

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ success: false, error: 'Redis is not connected. The leaderboard is not available yet.' });
    }

    const topPlayers = await redisClient.zRangeWithScores('global_leaderboard', 0, 49, { REV: true });

    // Rename keys to make the API response easier to read
    const leaderboard = topPlayers.map((entry, index) => ({
      rank: index + 1,
      userId: entry.value,
      score: Math.round(Number(entry.score))
    }));

    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error('[Leaderboard] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not load the leaderboard.' });
  }
});

// ================================================================
// GET /api/leaderboard/me  (Requires JWT)
// Fetches the current player's personal rank
// ================================================================
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const redisClient = req.app.get('redisClient');
    const { userId } = req.user;

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ success: false, error: 'Redis is not connected.' });
    }

    const rank = await redisClient.zRevRank('global_leaderboard', userId);
    const score = await redisClient.zScore('global_leaderboard', userId);

    if (rank === null) {
      return res.json({ success: true, rank: null, score: 0, message: 'No score on the leaderboard yet.' });
    }

    res.json({ success: true, rank: rank + 1, score: Math.round(Number(score)) });
  } catch (error) {
    console.error('[Leaderboard/Me] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

module.exports = router;
