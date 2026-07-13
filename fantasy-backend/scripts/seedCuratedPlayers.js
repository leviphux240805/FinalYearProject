// ============================================================
// Seeds the curated 65-player MVP dataset (data/backupPlayers.js,
// Section 2.4) into PostgreSQL. /api/players prefers the DB over
// this same static array the moment the Player table is non-empty,
// so without this script the app can only ever serve the curated
// catalogue via the in-memory fallback, never from the database.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const BACKUP_PLAYERS = require('../data/backupPlayers');
const prisma = new PrismaClient();

async function seedCuratedPlayers() {
  console.log(`⏳ Đang nạp ${BACKUP_PLAYERS.length} cầu thủ curated vào PostgreSQL...`);
  for (const p of BACKUP_PLAYERS) {
    const record = { id: p.id, name: p.name, position: p.position, currentPrice: p.price, teamId: p.team_id, form: p.form };
    await prisma.player.upsert({ where: { id: p.id }, update: record, create: record });
  }
  console.log(`✅ Đã nạp xong ${BACKUP_PLAYERS.length} cầu thủ.`);
}

seedCuratedPlayers()
  .catch((err) => {
    console.error('❌ Seed curated players thất bại:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
