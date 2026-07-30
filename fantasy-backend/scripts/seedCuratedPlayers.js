// ============================================================
// ⚠️ DEPRECATED: the project has fully switched to using only real players
// loaded via scripts/seedTop5Free.js. DO NOT run this script anymore — it
// would reload the 65 curated players that scripts/removeCuratedPlayers.js
// deliberately deleted (server.js no longer has any path serving curated
// data, but running this script again would still write straight into the
// Player table).
// Kept only for historical/report reference — no longer part of the
// standard setup process.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const BACKUP_PLAYERS = require('../data/backupPlayers');
const prisma = new PrismaClient();

async function seedCuratedPlayers() {
  console.log(`⏳ Loading ${BACKUP_PLAYERS.length} curated players into PostgreSQL...`);
  for (const p of BACKUP_PLAYERS) {
    const record = { id: p.id, name: p.name, position: p.position, currentPrice: p.price, teamId: p.team_id, form: p.form, stats: p.stats || null };
    await prisma.player.upsert({ where: { id: p.id }, update: record, create: record });
  }
  console.log(`✅ Finished loading ${BACKUP_PLAYERS.length} players.`);
}

seedCuratedPlayers()
  .catch((err) => {
    console.error('❌ Seed curated players failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
