// ============================================================
// TransferService — Algorithm 1 (BNPL Execution)
// Locks the User row for the duration of the transaction so
// concurrent transfers for the same user serialise instead of
// racing on a stale balance read.
// ============================================================
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MAX_BNPL_OVERDRAFT = 2.0;
const MAX_PLAYERS_PER_CLUB = 3;
const DEFAULT_GAMEWEEK = 1;
const SELL_RESALE_RATE = 0.9;
// Matches canAddPlayer() on the frontend (store.js) — previously this was
// ONLY enforced on the client, so anyone calling POST /api/transfers/process
// directly (Postman, a script...) could bypass it entirely. Now enforced
// here too, as the single source of truth.
const POSITION_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_SQUAD_SIZE = Object.values(POSITION_LIMITS).reduce((a, b) => a + b, 0); // 15

class NotFoundError extends Error {}
class InsufficientFundsError extends Error {}
class ClubLimitError extends Error {}
class SquadLockedError extends Error {}
class PositionLimitError extends Error {}
class SquadSizeError extends Error {}

async function getOrCreateActiveSquad(tx, userId) {
  return tx.userSquad.upsert({
    where: { userId_gameweek: { userId, gameweek: DEFAULT_GAMEWEEK } },
    update: {},
    create: { userId, gameweek: DEFAULT_GAMEWEEK }
  });
}

function decideIsStarting(existingPicks, position) {
  const starters = existingPicks.filter(p => p.isStarting);
  const hasStartingGK = starters.some(p => p.player.position === 'GK');
  return starters.length < 11 && (position !== 'GK' || !hasStartingGK);
}

async function _runTransfer(tx, { userId, playerIdToBuy, playerIdToSell, useLock, raceDelayMs = 0 }) {
  // Pessimistic row lock: serialises every concurrent transfer for this
  // user at the database itself, independent of app process count.
  if (useLock) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  }

  const [user, playerBuy, playerSell] = await Promise.all([
    tx.user.findUnique({ where: { id: userId } }),
    tx.player.findUnique({ where: { id: playerIdToBuy } }),
    playerIdToSell ? tx.player.findUnique({ where: { id: playerIdToSell } }) : Promise.resolve(null)
  ]);

  if (!user) throw new NotFoundError('User account not found.');
  if (!playerBuy) throw new NotFoundError(`Player to buy not found (ID: ${playerIdToBuy}).`);
  if (playerIdToSell && !playerSell) throw new NotFoundError(`Player to sell not found (ID: ${playerIdToSell}).`);

  // Test-only: widens the window between read and write so two concurrent
  // unlocked transactions actually overlap instead of running back-to-back
  // (local Postgres round-trips are fast enough that they otherwise
  // serialise "by accident" even without a lock). Never used with useLock.
  if (raceDelayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, raceDelayMs));
  }

  // Fetch the most recent squad WITHOUT pre-filtering by isLocked, so we can
  // distinguish "no squad yet" (squad === null, allowed to create a new one)
  // from "squad already locked after running Matchday" (must be blocked,
  // must not silently create a new SquadPick on top of an already-scored squad).
  const squad = await tx.userSquad.findFirst({
    where: { userId },
    orderBy: { gameweek: 'desc' },
    include: { picks: { include: { player: true } } }
  });
  if (squad && squad.isLocked) {
    throw new SquadLockedError('This squad is locked after Matchday was run for this gameweek. Cannot buy/sell players.');
  }
  const existingPicks = squad ? squad.picks : [];

  const sameClubCount = existingPicks.filter(
    p => p.playerId !== playerIdToSell && p.player.teamId === playerBuy.teamId
  ).length;
  if (sameClubCount >= MAX_PLAYERS_PER_CLUB) {
    throw new ClubLimitError(`You already own the maximum of ${MAX_PLAYERS_PER_CLUB} players from this club.`);
  }

  const otherPicks = existingPicks.filter(p => p.playerId !== playerIdToSell);

  const samePositionCount = otherPicks.filter(p => p.player.position === playerBuy.position).length;
  const positionLimit = POSITION_LIMITS[playerBuy.position];
  if (positionLimit !== undefined && samePositionCount >= positionLimit) {
    throw new PositionLimitError(`You already have the maximum of ${positionLimit} players in the ${playerBuy.position} position.`);
  }

  if (otherPicks.length + 1 > MAX_SQUAD_SIZE) {
    throw new SquadSizeError(`The squad is capped at ${MAX_SQUAD_SIZE} players (already full).`);
  }

  const currentBalance = Number(user.virtualBalance);
  const sellPrice = playerSell ? Number(playerSell.currentPrice) : 0;
  const buyPrice = Number(playerBuy.currentPrice);
  const netBudget = currentBalance + sellPrice;
  const shortfall = buyPrice - netBudget;

  if (shortfall > 0) {
    if (shortfall > MAX_BNPL_OVERDRAFT) {
      throw new InsufficientFundsError(
        `Insufficient balance! You're short $${shortfall.toFixed(1)}M. The maximum overdraft limit is $${MAX_BNPL_OVERDRAFT.toFixed(1)}M.`
      );
    }
    await tx.user.update({
      where: { id: userId },
      data: { virtualBalance: 0, penaltyPoints: { increment: 4 } }
    });
    await tx.transaction.create({
      data: { userId, playerId: playerBuy.id, type: 'BNPL_LOAN', amount: shortfall }
    });
  } else {
    await tx.user.update({
      where: { id: userId },
      data: { virtualBalance: parseFloat((netBudget - buyPrice).toFixed(1)) }
    });
  }

  const ledgerWrites = [
    tx.transaction.create({ data: { userId, playerId: playerBuy.id, type: 'BUY', amount: buyPrice } })
  ];
  if (playerSell) {
    ledgerWrites.push(
      tx.transaction.create({ data: { userId, playerId: playerSell.id, type: 'SELL', amount: sellPrice } })
    );
  }
  await Promise.all(ledgerWrites);

  const activeSquad = squad || await getOrCreateActiveSquad(tx, userId);
  const oldPick = playerIdToSell
    ? existingPicks.find(p => p.playerId === playerIdToSell)
    : null;

  if (oldPick) {
    await tx.squadPick.update({ where: { id: oldPick.id }, data: { playerId: playerBuy.id } });
  } else {
    await tx.squadPick.create({
      data: {
        squadId: activeSquad.id,
        playerId: playerBuy.id,
        isStarting: decideIsStarting(existingPicks, playerBuy.position)
      }
    });
  }

  const updated = await tx.user.findUnique({
    where: { id: userId },
    select: { virtualBalance: true, penaltyPoints: true }
  });
  return { virtualBalance: Number(updated.virtualBalance), penaltyPoints: updated.penaltyPoints };
}

// maxWait/timeout are widened from Prisma's defaults (2000ms / 5000ms) —
// this transaction does several sequential round trips (row lock, 3 reads,
// club/position/size checks, 1-2 writes, ledger inserts, squad upsert, a
// final read), and DATABASE_URL points at a hosted Postgres instance, not
// localhost, so real network latency counts against this budget too. Without
// this, the transaction can be force-closed by Prisma itself mid-way
// (independent of any Jest test timeout) under real-world latency.
const TX_OPTS = { maxWait: 10000, timeout: 20000 };

async function executeBnplTransfer({ userId, playerIdToBuy, playerIdToSell = null }) {
  return prisma.$transaction(tx => _runTransfer(tx, { userId, playerIdToBuy, playerIdToSell, useLock: true }), TX_OPTS);
}

// Test-only: reproduces the race condition Algorithm 1 is designed to
// prevent, by skipping the FOR UPDATE lock. Never call from route handlers.
async function __unsafeExecuteForTesting({ userId, playerIdToBuy, playerIdToSell = null, raceDelayMs = 50 }) {
  return prisma.$transaction(tx => _runTransfer(tx, { userId, playerIdToBuy, playerIdToSell, useLock: false, raceDelayMs }), TX_OPTS);
}

async function executeSell({ userId, playerId }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

    const [user, player] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.player.findUnique({ where: { id: playerId } })
    ]);
    if (!user) throw new NotFoundError('User account not found.');
    if (!player) throw new NotFoundError(`Player not found (ID: ${playerId}).`);

    const squad = await tx.userSquad.findFirst({ where: { userId }, orderBy: { gameweek: 'desc' } });
    if (squad && squad.isLocked) {
      throw new SquadLockedError('This squad is locked after Matchday was run for this gameweek. Cannot sell players.');
    }
    const pick = squad ? await tx.squadPick.findFirst({ where: { squadId: squad.id, playerId } }) : null;
    if (!pick) throw new NotFoundError('This player is not in your squad.');

    const sellPrice = parseFloat((Number(player.currentPrice) * SELL_RESALE_RATE).toFixed(1));
    const newBalance = parseFloat((Number(user.virtualBalance) + sellPrice).toFixed(1));

    await tx.user.update({ where: { id: userId }, data: { virtualBalance: newBalance } });
    await tx.transaction.create({ data: { userId, playerId, type: 'SELL', amount: sellPrice } });
    await tx.squadPick.delete({ where: { id: pick.id } });

    const updated = await tx.user.findUnique({
      where: { id: userId },
      select: { virtualBalance: true, penaltyPoints: true }
    });
    return { virtualBalance: Number(updated.virtualBalance), penaltyPoints: updated.penaltyPoints, sellPrice };
  }, TX_OPTS);
}

module.exports = {
  executeBnplTransfer,
  executeSell,
  __unsafeExecuteForTesting,
  NotFoundError,
  InsufficientFundsError,
  ClubLimitError,
  SquadLockedError,
  PositionLimitError,
  SquadSizeError,
  MAX_BNPL_OVERDRAFT,
  MAX_PLAYERS_PER_CLUB,
  POSITION_LIMITS,
  MAX_SQUAD_SIZE
};
