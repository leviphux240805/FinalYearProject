// ============================================================
// Reads a JSON file manually scraped from Understat.com (via the browser —
// see scripts/seedUnderstatStats.js for why it CANNOT be scraped with a
// plain axios request: the page is rendered by JavaScript) and writes the
// REAL xG/xA stats into the DB, matching by player name (normalized,
// diacritics stripped).
//
// Usage:
//   1. The file D:\FinalYearProject\fantasy-backend\scripts\data\understatScrape.json
//      should already be in place (downloaded from the browser, see the
//      accompanying instructions).
//   2. node scripts/importUnderstatStats.js
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DATA_FILE = path.join(__dirname, 'data', 'understatScrape.json');

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function normalizeName(name) {
  return String(name || '')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`File ${DATA_FILE} not found. Place the understatScrape.json file in scripts/data/ first.`);
  }
  const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`📄 Read ${rows.length} player rows from the Understat file.\n`);

  console.log('🔍 Checking PostgreSQL connection...');
  await prisma.$queryRaw`SELECT 1`;
  console.log('✅ PostgreSQL ready.\n');

  const dbPlayers = await prisma.player.findMany();
  if (dbPlayers.length === 0) {
    throw new Error('The database has no players yet — run scripts/seedRealSquads.js first.');
  }

  const byNormName = new Map();
  for (const p of dbPlayers) {
    const key = normalizeName(p.name);
    if (!byNormName.has(key)) byNormName.set(key, []);
    byNormName.get(key).push(p);
  }

  let matched = 0;
  const unmatchedSample = [];

  for (const r of rows) {
    const key = normalizeName(r.name);
    const candidates = byNormName.get(key);
    if (!candidates || candidates.length === 0) {
      unmatchedSample.push(r.name);
      continue;
    }
    const dbPlayer = candidates[0];
    const stats = {
      xG: clamp01(r.xg90 / 0.9),
      xA: clamp01(r.xa90 / 0.5),
      shots: clamp01(r.sh90 / 6),
      keyPasses: clamp01(r.kp90 / 4),
      form: dbPlayer.stats?.form ?? 0.6,
    };
    await prisma.player.update({ where: { id: dbPlayer.id }, data: { stats } });
    matched += 1;
  }

  console.log(`✅ Updated REAL xG/xA stats (Understat) for ${matched}/${rows.length} players.`);
  if (unmatchedSample.length > 0) {
    console.log(`ℹ️  ${unmatchedSample.length} names didn't match the current DB — skipped (doesn't affect the matched players). Examples:`);
    unmatchedSample.slice(0, 15).forEach(n => console.log(`   - ${n}`));
  }
}

main()
  .catch((err) => {
    console.error('❌ Importing Understat stats failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
