const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');

// ================================================================
// GET /api/leaderboard
// Lấy Top 50 người chơi từ Redis Sorted Set
// Độ phức tạp: O(log N) - Chạy trong < 1ms dù có 100,000 người chơi
// ================================================================
router.get('/', async (req, res) => {
  try {
    const redisClient = req.app.get('redisClient');

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ success: false, error: 'Redis chưa kết nối. Bảng xếp hạng chưa khả dụng.' });
    }

    const topPlayers = await redisClient.zRangeWithScores('global_leaderboard', 0, 49, { REV: true });

    // Đổi tên key để API response dễ đọc hơn
    const leaderboard = topPlayers.map((entry, index) => ({
      rank: index + 1,
      userId: entry.value,
      score: Math.round(Number(entry.score))
    }));

    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error('[Leaderboard] Lỗi:', error.message);
    res.status(500).json({ success: false, error: 'Không thể tải bảng xếp hạng.' });
  }
});

// ================================================================
// GET /api/leaderboard/me  (Yêu cầu JWT)
// Lấy thứ hạng cá nhân của người chơi hiện tại
// ================================================================
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const redisClient = req.app.get('redisClient');
    const { userId } = req.user;

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ success: false, error: 'Redis chưa kết nối.' });
    }

    const rank = await redisClient.zRevRank('global_leaderboard', userId);
    const score = await redisClient.zScore('global_leaderboard', userId);

    if (rank === null) {
      return res.json({ success: true, rank: null, score: 0, message: 'Chưa có điểm số trên bảng xếp hạng.' });
    }

    res.json({ success: true, rank: rank + 1, score: Math.round(Number(score)) });
  } catch (error) {
    console.error('[Leaderboard/Me] Lỗi:', error.message);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ.' });
  }
});

module.exports = router;
