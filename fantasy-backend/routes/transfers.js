const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const transferService = require('../services/transferService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ================================================================
// POST /api/transfers/process  (Yêu cầu JWT)
// Động cơ chuyển nhượng an toàn với ACID Transaction + row lock
// Chống gian lận: toàn bộ logic tài chính chạy hoàn toàn ở Backend
// ================================================================
router.post('/process', authenticateToken, async (req, res) => {
  const { playerIdToBuy, playerIdToSell } = req.body;
  const userId = req.user.userId;

  if (!playerIdToBuy) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin cầu thủ cần mua.' });
  }

  if (playerIdToBuy === playerIdToSell) {
    return res.status(400).json({ success: false, error: 'Không thể mua và bán cùng một cầu thủ.' });
  }

  try {
    const result = await transferService.executeBnplTransfer({
      userId,
      playerIdToBuy,
      playerIdToSell: playerIdToSell || null
    });

    console.log(`[Transfer] User ${userId}: Mua P${playerIdToBuy}${playerIdToSell ? ` (bán P${playerIdToSell})` : ''}. Số dư mới: $${result.virtualBalance}M`);

    res.json({
      success: true,
      message: 'Giao dịch và đối soát tài chính hoàn tất!',
      newBalance: result.virtualBalance,
      penaltyPoints: result.penaltyPoints
    });
  } catch (error) {
    console.error('[Transfer] Giao dịch thất bại:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ================================================================
// POST /api/transfers/sell  (Yêu cầu JWT)
// Bán một cầu thủ trong đội hình, hoàn 90% giá trị vào số dư
// ================================================================
router.post('/sell', authenticateToken, async (req, res) => {
  const { playerId } = req.body;
  const userId = req.user.userId;

  if (!playerId) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin cầu thủ cần bán.' });
  }

  try {
    const result = await transferService.executeSell({ userId, playerId });

    console.log(`[Transfer/Sell] User ${userId}: Bán P${playerId} +$${result.sellPrice}M. Số dư mới: $${result.virtualBalance}M`);

    res.json({
      success: true,
      message: `Đã bán cầu thủ với giá $${result.sellPrice.toFixed(1)}M`,
      newBalance: result.virtualBalance,
      penaltyPoints: result.penaltyPoints,
      sellPrice: result.sellPrice
    });
  } catch (error) {
    console.error('[Transfer/Sell] Giao dịch thất bại:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ================================================================
// GET /api/transfers/history  (Yêu cầu JWT)
// Lịch sử giao dịch của người chơi
// ================================================================
router.get('/history', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      include: { player: { select: { name: true, position: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json({ success: true, transactions });
  } catch (error) {
    console.error('[Transfer/History] Lỗi:', error.message);
    res.status(500).json({ success: false, error: 'Không thể tải lịch sử giao dịch.' });
  }
});

module.exports = router;
