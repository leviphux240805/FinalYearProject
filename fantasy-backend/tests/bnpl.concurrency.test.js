// ============================================================
// Validates NFR-02 / Algorithm 1 / Report Section 6.4.2-6.4.3:
// row-level locking (SELECT ... FOR UPDATE) inside the Prisma
// $transaction must serialise concurrent BNPL transfers for the
// same user. Each test seeds its own fixture players/users in a
// high, disjoint ID range (9xxxxx) so it never collides with the
// app's real player catalogue.
// ============================================================
require('dotenv').config();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { app } = require('../server');
const transferService = require('../services/transferService');

// DATABASE_URL points at the hosted Render Postgres (Oregon), not localhost —
// each query here is a real round trip over the public internet, not an
// in-memory or local-loopback call. Jest's default 5000ms per-test timeout
// is tuned for local databases and is too tight for that latency, especially
// test 3's 10 sequential-over-the-wire HTTP requests. This is a timeout
// budget issue, not a correctness issue — Algorithm 1 itself still completes
// correctly, just not within 5s end-to-end from this machine.
jest.setTimeout(30000);

const prisma = new PrismaClient();

async function makeUser(prefix, balance) {
  const username = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: 'not-used-in-tests', virtualBalance: balance, penaltyPoints: 0 }
  });
  const token = jwt.sign({ userId: user.id, username }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token };
}

async function upsertPlayer(p) {
  return prisma.player.upsert({ where: { id: p.id }, update: p, create: p });
}

beforeAll(async () => {
  await upsertPlayer({ id: 900001, name: 'Test Striker A', position: 'FWD', currentPrice: 4.0, teamId: 900001, form: ['W', 'W', 'W'] });
  await upsertPlayer({ id: 900002, name: 'Test Striker B', position: 'FWD', currentPrice: 4.0, teamId: 900002, form: ['W', 'W', 'W'] });
});

afterAll(async () => {
  // /api/players prefers the DB over BACKUP_PLAYERS the moment the Player
  // table is non-empty, so leftover fixture rows would otherwise replace
  // the curated dataset in the running app. Clean up everything this
  // suite created (FK-safe order: Transaction/SquadPick -> UserSquad ->
  // User -> Player).
  const testUsers = await prisma.user.findMany({ where: { username: { startsWith: 'race_' } }, select: { id: true } });
  const userIds = testUsers.map(u => u.id);
  const testPlayerIds = [900001, 900002, ...Array.from({ length: 10 }, (_, i) => 940000 + i)];

  if (userIds.length) {
    await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
    const squads = await prisma.userSquad.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const squadIds = squads.map(s => s.id);
    if (squadIds.length) await prisma.squadPick.deleteMany({ where: { squadId: { in: squadIds } } });
    await prisma.userSquad.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.player.deleteMany({ where: { id: { in: testPlayerIds } } });

  await prisma.$disconnect();
});

describe('BNPL concurrency (Algorithm 1 row locking)', () => {
  test('WITHOUT the FOR UPDATE lock, concurrent buys double-spend (lost update)', async () => {
    const { user } = await makeUser('race_unsafe', 5.0);

    const results = await Promise.allSettled([
      transferService.__unsafeExecuteForTesting({ userId: user.id, playerIdToBuy: 900001 }),
      transferService.__unsafeExecuteForTesting({ userId: user.id, playerIdToBuy: 900002 })
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    const final = await prisma.user.findUnique({ where: { id: user.id } });

    // Both transactions can read balance=5.0 before either commits, so both
    // pass the shortfall check independently — this is the exact race the
    // report's Section 2.2.2 describes, reproduced as a documented failing
    // baseline (Section 6.4.2).
    expect(succeeded.length).toBe(2);
    expect(Number(final.virtualBalance)).toBe(1.0); // only one $4.0M deduction survives
  });

  test('WITH the FOR UPDATE lock, only one of two concurrent buys succeeds', async () => {
    const { user } = await makeUser('race_safe', 5.0);

    const results = await Promise.allSettled([
      transferService.executeBnplTransfer({ userId: user.id, playerIdToBuy: 900001 }),
      transferService.executeBnplTransfer({ userId: user.id, playerIdToBuy: 900002 })
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');
    const final = await prisma.user.findUnique({ where: { id: user.id } });

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].reason.message).toMatch(/Insufficient balance/);
    expect(Number(final.virtualBalance)).toBe(1.0);
    expect(Number(final.virtualBalance)).toBeGreaterThanOrEqual(0);
  });

  test('10 simultaneous BNPL requests for the same user, only 1 affordable (TC-029)', async () => {
    const { user, token } = await makeUser('race_ten', 9.0);

    const players = [];
    for (let i = 0; i < 10; i++) {
      const p = { id: 940000 + i, name: `Race Target ${i}`, position: 'DEF', currentPrice: 10.0, teamId: 950000 + i, form: ['D', 'D', 'D'] };
      await upsertPlayer(p);
      players.push(p);
    }

    const responses = await Promise.all(
      players.map(p => request(app)
        .post('/api/transfers/process')
        .set('Authorization', `Bearer ${token}`)
        .send({ playerIdToBuy: p.id }))
    );

    const succeeded = responses.filter(r => r.body.success);
    const final = await prisma.user.findUnique({ where: { id: user.id } });

    expect(succeeded.length).toBe(1);
    expect(Number(final.virtualBalance)).toBe(0);
    expect(final.penaltyPoints).toBe(4);
  });
});
