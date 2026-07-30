// ============================================================
// Fully removes the 65 "curated" (hand-entered, data/backupPlayers.js)
// players from the system — from now on ONLY real players loaded via
// API-Football (scripts/seedTop5Free.js) are used. Per the request: "only
// use players sourced from the API".
//
// Problem to handle before deleting outright: scripts/seedGameweekStats.js
// already loaded REAL GW1 data (carefully researched — Haaland's and
// Salah's goals, David Raya's save count... match the actual Premier
// League Matchweek 1 results for the 2025-2026 season) but attached to the
// curated dataset's playerIds. If deleted outright, the "Run Matchday"
// feature (already verified live in a previous dry run) would lose all of
// its scoring data.
//
// -> Before deleting, this script:
//   1. Matches the name of every curated player that has real GW1 data to
//      the corresponding REAL player in the ~300-player API-Football
//      dataset (the same real-life Haaland, Salah... just with a different
//      playerId), using full-name / substring / surname+position matching,
//      in decreasing order of confidence.
//   2. Rewrites the PlayerGameweekStat (GW1) rows to the matched REAL
//      playerId.
//   3. Prints the matched/unmatched list for manual double-checking
//      (especially Haaland and Salah — the 2 players used as the final
//      worked examples in the report).
// Only then does it clean up: deletes Transaction/SquadPick/
// PlayerGameweekStat/UserSquad rows tied to the curated playerIds, resets
// every user's wallet to the default (because EVERY user's squad will be
// wiped — there's no way to keep an old squad valid once some of the
// players in it disappear), and only then deletes the 65 curated Player rows.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const BACKUP_PLAYERS = require('../data/backupPlayers');
const { REAL_GW1_STATS, GAMEWEEK } = require('./seedGameweekStats');

const prisma = new PrismaClient();

const CURATED_IDS = BACKUP_PLAYERS.map(p => p.id);

// Normalizes names for matching: strips diacritics, lowercases, collapses
// whitespace. NFD normalization can't decompose Ø/ø (not a combining
// character), so that's handled manually first.
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

function lastWord(normalized) {
  const parts = normalized.split(' ').filter(Boolean);
  return parts[parts.length - 1] || '';
}

// Finds a real player (already loaded in the DB, not in CURATED_IDS) that
// matches a given curated player, using 3 tiers of decreasing confidence.
function matchRealPlayer(curatedName, curatedPosition, realPlayers) {
  const normCurated = normalizeName(curatedName);

  // Tier 1: exact match after normalization.
  let hit = realPlayers.find(r => normalizeName(r.name) === normCurated);
  if (hit) return { player: hit, tier: 'exact' };

  // Tier 2: substring containment (catches abbreviated names like
  // "M. ter Stegen" vs "Marc-Andre ter Stegen", or "E. Martinez" vs
  // "Emiliano Martinez").
  hit = realPlayers.find(r => {
    const nr = normalizeName(r.name);
    return nr.includes(normCurated) || normCurated.includes(nr);
  });
  if (hit) return { player: hit, tier: 'substring' };

  // Tier 3: same surname (last word) + same playing position — reduces the
  // risk of common-surname collisions by requiring the position to match too.
  const surname = lastWord(normCurated);
  if (surname.length >= 3) {
    hit = realPlayers.find(r => r.position === curatedPosition && lastWord(normalizeName(r.name)) === surname);
    if (hit) return { player: hit, tier: 'surname+position' };
  }

  return null;
}

async function main() {
  console.log('🔍 Checking PostgreSQL connection...');
  await prisma.$queryRaw`SELECT 1`;
  console.log('✅ PostgreSQL ready.\n');

  const realPlayers = await prisma.player.findMany({
    where: { id: { notIn: CURATED_IDS } },
  });
  console.log(`📦 There are ${realPlayers.length} real players (API-Football) in the DB to match against.\n`);

  // ---- STEP 1: transfer the real GW1 data to the real playerIds ----
  console.log(`⏳ Matching names to transfer PlayerGameweekStat (GW${GAMEWEEK}) to the real players...`);
  const matched = [];
  const unmatched = [];

  for (const [idStr, statValues] of Object.entries(REAL_GW1_STATS)) {
    const curatedId = Number(idStr);
    const curated = BACKUP_PLAYERS.find(p => p.id === curatedId);
    if (!curated) continue;

    const result = matchRealPlayer(curated.name, curated.position, realPlayers);
    if (result) {
      matched.push({ curatedName: curated.name, realName: result.player.name, realId: result.player.id, tier: result.tier });
      await prisma.playerGameweekStat.upsert({
        where: { playerId_gameweek: { playerId: result.player.id, gameweek: GAMEWEEK } },
        update: statValues,
        create: { playerId: result.player.id, gameweek: GAMEWEEK, ...statValues },
      });
    } else {
      unmatched.push(curated.name);
    }
  }

  console.log(`\n✅ Matched ${matched.length}/${Object.keys(REAL_GW1_STATS).length} players with real GW1 data:`);
  for (const m of matched) {
    console.log(`   [${m.tier.padEnd(16)}] ${m.curatedName}  →  ${m.realName} (id ${m.realId})`);
  }
  if (unmatched.length > 0) {
    console.log(`\n⚠️  Could NOT match ${unmatched.length} players (their real GW1 data will be lost) — check manually if needed:`);
    unmatched.forEach(n => console.log(`   - ${n}`));
  }

  // ---- STEP 2: clean up all curated data ----
  console.log('\n🧹 Deleting all data related to the 65 curated players...');

  const delTx = await prisma.transaction.deleteMany({ where: { playerId: { in: CURATED_IDS } } });
  const delStats = await prisma.playerGameweekStat.deleteMany({ where: { playerId: { in: CURATED_IDS } } });

  // EVERY user's squad gets wiped — there's no way to keep a valid squad
  // once some of the players in it no longer exist. Delete ALL SquadPick
  // rows first (including picks pointing to real players, since the
  // UserSquad rows underneath are also all being deleted — SquadPick.squadId
  // is RESTRICT, so every pick in a squad must be cleared before that squad
  // can be deleted, not just the curated picks). Users will need to rebuild
  // their squad with real players after running this script.
  const delPicks = await prisma.squadPick.deleteMany({});
  const delSquads = await prisma.userSquad.deleteMany({});
  const resetUsers = await prisma.user.updateMany({ data: { virtualBalance: 100.0, penaltyPoints: 0 } });

  const delPlayers = await prisma.player.deleteMany({ where: { id: { in: CURATED_IDS } } });

  console.log(`   - Deleted ${delTx.count} Transaction rows (curated), ${delStats.count} PlayerGameweekStat rows (curated)`);
  console.log(`   - Deleted ${delPicks.count} SquadPick + ${delSquads.count} UserSquad rows (reset every user's squad)`);
  console.log(`   - Reset the wallet + penalty points for ${resetUsers.count} users to the default`);
  console.log(`   - Deleted ${delPlayers.count} curated players from the Player table`);

  console.log('\n✅ Done. The system now only has real players from API-Football.');
  console.log('   → Every user needs to go to "Transfers" to rebuild their squad before demoing.');
}

main()
  .catch((err) => {
    console.error('❌ Removing curated players failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
