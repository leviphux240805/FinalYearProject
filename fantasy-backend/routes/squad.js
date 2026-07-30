const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { PrismaClient } = require('@prisma/client');
const { DEFAULT_GAMEWEEK } = require('../services/matchdayService');

const prisma = new PrismaClient();

// ================================================================
// GET /api/squad  (Requires JWT)
// Returns the user's REAL squad from Postgres (UserSquad + SquadPick), so
// the frontend can resync its state on every page load — instead of only
// trusting localStorage (a source that can easily drift from the backend:
// switching devices/browsers, multiple tabs, or any client-side sync bug).
// This is also exactly the data /api/matchday/run uses to compute points,
// so the displayed squad and the scored squad always match.
// ================================================================
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const gameweekParam = Number(req.query.gameweek);
  const gameweek = Number.isFinite(gameweekParam) ? gameweekParam : DEFAULT_GAMEWEEK;

  try {
    const squad = await prisma.userSquad.findUnique({
      where: { userId_gameweek: { userId, gameweek } },
      include: { picks: { include: { player: true } } },
    });

    if (!squad) {
      return res.json({ success: true, squad: null });
    }

    res.json({
      success: true,
      squad: {
        gameweek: squad.gameweek,
        captainId: squad.captainId,
        viceCaptainId: squad.viceCaptainId,
        isLocked: squad.isLocked,
        totalPoints: squad.totalPoints,
        picks: squad.picks.map((p) => ({
          playerId: p.playerId,
          name: p.player.name,
          position: p.player.position,
          price: Number(p.player.currentPrice),
          team_id: p.player.teamId,
          teamName: p.player.teamName,
          form: p.player.form,
          isStarting: p.isStarting,
          benchOrder: p.benchOrder,
          points: p.points,
        })),
      },
    });
  } catch (error) {
    console.error('[Squad/Get] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not load the squad.' });
  }
});

// ================================================================
// POST /api/squad/reset  (Requires JWT)
// Deletes all SquadPick rows for the current gameweek + refunds each
// player's current price back into virtualBalance (not the 90% sell price
// used by executeSell — "reset" means starting over, not a sell
// transaction). Blocked if the squad is already locked (Matchday has
// already been run for this gameweek).
//
// PREVIOUSLY: the "Reset Squad" button on the frontend (store.resetSquad())
// only cleared in-memory/localStorage state and never called the backend
// at all — so the real balance & SquadPick rows in Postgres never changed.
// After adding refreshSquad() (resyncing the real squad from the DB on
// every page load), this bug became obvious: click Reset, reload the page,
// and the "old" squad would reappear unchanged. This endpoint is the
// missing piece that makes the Reset button actually work.
// ================================================================
router.post('/reset', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const gameweekParam = Number(req.body?.gameweek);
  const gameweek = Number.isFinite(gameweekParam) ? gameweekParam : DEFAULT_GAMEWEEK;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const squad = await tx.userSquad.findUnique({
        where: { userId_gameweek: { userId, gameweek } },
        include: { picks: { include: { player: true } } },
      });

      if (!squad || squad.picks.length === 0) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { virtualBalance: true, penaltyPoints: true },
        });
        return {
          virtualBalance: Number(user.virtualBalance),
          penaltyPoints: user.penaltyPoints,
        };
      }

      if (squad.isLocked) {
        const err = new Error('The squad is locked (Matchday has already been run for this gameweek) and cannot be reset.');
        err.code = 'SQUAD_LOCKED';
        throw err;
      }

      const refund = squad.picks.reduce((sum, p) => sum + Number(p.player.currentPrice), 0);
      const user = await tx.user.findUnique({ where: { id: userId } });
      const newBalance = parseFloat((Number(user.virtualBalance) + refund).toFixed(1));

      await tx.squadPick.deleteMany({ where: { squadId: squad.id } });
      await tx.userSquad.update({ where: { id: squad.id }, data: { captainId: null } });
      await tx.user.update({ where: { id: userId }, data: { virtualBalance: newBalance } });

      return { virtualBalance: newBalance, penaltyPoints: user.penaltyPoints };
    });

    console.log(`[Squad/Reset] User ${userId}: reset GW${gameweek}, refunded to $${result.virtualBalance}M`);
    res.json({ success: true, newBalance: result.virtualBalance, penaltyPoints: result.penaltyPoints });
  } catch (error) {
    if (error.code === 'SQUAD_LOCKED') {
      return res.status(409).json({ success: false, error: error.message });
    }
    console.error('[Squad/Reset] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not reset the squad.' });
  }
});

// ================================================================
// POST /api/squad/captain  (Requires JWT)
// Saves the Captain choice to the real UserSquad.captainId in Postgres.
//
// PREVIOUSLY: the frontend's store.setCaptain() only changed in-memory
// state (this.captainId) and showed a "Captain armband given to..." toast
// — it never called any API at all. Because /api/matchday/run computes
// points based on squad.captainId read from the DB (matchdayService.js
// lines 67-68), that column was always null regardless of which Captain
// the user had picked in the UI, so "Run Matchday" always reported
// "You haven't picked a Captain for this squad" even after picking one.
// This endpoint is the missing piece that makes the Captain feature
// actually work.
// ================================================================
router.post('/captain', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { playerId } = req.body || {};
  const gameweekParam = Number(req.body?.gameweek);
  const gameweek = Number.isFinite(gameweekParam) ? gameweekParam : DEFAULT_GAMEWEEK;

  if (!playerId) {
    return res.status(400).json({ success: false, error: 'Missing playerId.' });
  }

  try {
    const squad = await prisma.userSquad.findUnique({
      where: { userId_gameweek: { userId, gameweek } },
      include: { picks: true },
    });

    if (!squad) {
      return res.status(404).json({ success: false, error: 'No squad exists for this gameweek yet.' });
    }
    if (squad.isLocked) {
      return res.status(409).json({ success: false, error: 'The squad is locked; the Captain cannot be changed.' });
    }

    const pick = squad.picks.find((p) => p.playerId === playerId);
    if (!pick || !pick.isStarting) {
      return res.status(400).json({ success: false, error: 'Captain can only be picked from the starting XI.' });
    }

    await prisma.userSquad.update({ where: { id: squad.id }, data: { captainId: playerId } });
    res.json({ success: true, captainId: playerId });
  } catch (error) {
    console.error('[Squad/Captain] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not save the Captain.' });
  }
});

// ================================================================
// POST /api/squad/vice-captain  (Requires JWT)
// Saves the Vice-Captain choice to UserSquad.viceCaptainId — the missing
// server-side half of feedback item A6. Previously store.setViceCaptain()
// only changed client state (this.viceCaptainId) with no backend call at
// all, so matchdayService's Captain-didn't-play fallback (Section: see
// matchdayService.js) had no viceCaptainId to read and could never actually
// promote the Vice-Captain.
// ================================================================
router.post('/vice-captain', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { playerId } = req.body || {};
  const gameweekParam = Number(req.body?.gameweek);
  const gameweek = Number.isFinite(gameweekParam) ? gameweekParam : DEFAULT_GAMEWEEK;

  if (!playerId) {
    return res.status(400).json({ success: false, error: 'Missing playerId.' });
  }

  try {
    const squad = await prisma.userSquad.findUnique({
      where: { userId_gameweek: { userId, gameweek } },
      include: { picks: true },
    });

    if (!squad) {
      return res.status(404).json({ success: false, error: 'No squad exists for this gameweek yet.' });
    }
    if (squad.isLocked) {
      return res.status(409).json({ success: false, error: 'The squad is locked; the Vice-Captain cannot be changed.' });
    }
    if (playerId === squad.captainId) {
      return res.status(400).json({ success: false, error: 'The Captain cannot also be Vice-Captain.' });
    }

    const pick = squad.picks.find((p) => p.playerId === playerId);
    if (!pick || !pick.isStarting) {
      return res.status(400).json({ success: false, error: 'Vice-Captain can only be picked from the starting XI.' });
    }

    await prisma.userSquad.update({ where: { id: squad.id }, data: { viceCaptainId: playerId } });
    res.json({ success: true, viceCaptainId: playerId });
  } catch (error) {
    console.error('[Squad/ViceCaptain] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not save the Vice-Captain.' });
  }
});

// ================================================================
// POST /api/squad/bench-order  (Requires JWT)
// Saves the substitute priority order for the CURRENT bench (feedback item
// A4 — "phần ưu tiên thay đổi cầu thủ"). Body: { order: [playerId, ...] }
// in priority order (index 0 = first substitute). Any bench player not
// included keeps benchOrder = null (last priority, effectively unordered).
// ================================================================
router.post('/bench-order', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { order } = req.body || {};
  const gameweekParam = Number(req.body?.gameweek);
  const gameweek = Number.isFinite(gameweekParam) ? gameweekParam : DEFAULT_GAMEWEEK;

  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing order (array of playerId).' });
  }

  try {
    const squad = await prisma.userSquad.findUnique({
      where: { userId_gameweek: { userId, gameweek } },
      include: { picks: true },
    });

    if (!squad) {
      return res.status(404).json({ success: false, error: 'No squad exists for this gameweek yet.' });
    }
    if (squad.isLocked) {
      return res.status(409).json({ success: false, error: 'The squad is locked; the bench order cannot be changed.' });
    }

    const benchPickIds = new Set(squad.picks.filter((p) => !p.isStarting).map((p) => p.playerId));
    const invalid = order.find((playerId) => !benchPickIds.has(playerId));
    if (invalid !== undefined) {
      return res.status(400).json({ success: false, error: `Player ${invalid} is not on the bench.` });
    }

    await prisma.$transaction(
      order.map((playerId, index) =>
        prisma.squadPick.updateMany({
          where: { squadId: squad.id, playerId },
          data: { benchOrder: index + 1 },
        })
      )
    );

    res.json({ success: true, order });
  } catch (error) {
    console.error('[Squad/BenchOrder] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not save the bench order.' });
  }
});

module.exports = router;
