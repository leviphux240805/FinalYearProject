const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const transferService = require('../services/transferService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ================================================================
// POST /api/transfers/process  (Requires JWT)
// Safe transfer engine with an ACID Transaction + row lock
// Anti-fraud: all financial logic runs entirely on the Backend
// ================================================================
router.post('/process', authenticateToken, async (req, res) => {
  const { playerIdToBuy, playerIdToSell } = req.body;
  const userId = req.user.userId;

  if (!playerIdToBuy) {
    return res.status(400).json({ success: false, error: 'Missing information for the player to buy.' });
  }

  if (playerIdToBuy === playerIdToSell) {
    return res.status(400).json({ success: false, error: 'Cannot buy and sell the same player.' });
  }

  try {
    const result = await transferService.executeBnplTransfer({
      userId,
      playerIdToBuy,
      playerIdToSell: playerIdToSell || null
    });

    console.log(`[Transfer] User ${userId}: Bought P${playerIdToBuy}${playerIdToSell ? ` (sold P${playerIdToSell})` : ''}. New balance: $${result.virtualBalance}M`);

    res.json({
      success: true,
      message: 'Transaction and financial reconciliation complete!',
      newBalance: result.virtualBalance,
      penaltyPoints: result.penaltyPoints
    });
  } catch (error) {
    console.error('[Transfer] Transaction failed:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ================================================================
// POST /api/transfers/sell  (Requires JWT)
// Sells a player from the squad, refunding 90% of their value to the balance
// ================================================================
router.post('/sell', authenticateToken, async (req, res) => {
  const { playerId } = req.body;
  const userId = req.user.userId;

  if (!playerId) {
    return res.status(400).json({ success: false, error: 'Missing information for the player to sell.' });
  }

  try {
    const result = await transferService.executeSell({ userId, playerId });

    console.log(`[Transfer/Sell] User ${userId}: Sold P${playerId} +$${result.sellPrice}M. New balance: $${result.virtualBalance}M`);

    res.json({
      success: true,
      message: `Sold the player for $${result.sellPrice.toFixed(1)}M`,
      newBalance: result.virtualBalance,
      penaltyPoints: result.penaltyPoints,
      sellPrice: result.sellPrice
    });
  } catch (error) {
    console.error('[Transfer/Sell] Transaction failed:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ================================================================
// GET /api/transfers/history  (Requires JWT)
// A player's transaction history
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
    console.error('[Transfer/History] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not load transaction history.' });
  }
});

module.exports = router;
