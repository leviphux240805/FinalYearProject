// ============================================================
// Seeds PlayerGameweekStat for Gameweek 1 — the input data for the
// "Run Matchday" button (POST /api/matchday/run) for the 65 curated
// players (data/backupPlayers.js).
//
// DATA SOURCE:
//  - The 6 Premier League clubs in the curated set (Arsenal=2, Man City=4,
//    Liverpool=5, Aston Villa=8, Newcastle=9, Chelsea=10) use REAL data
//    from Premier League Matchweek 1 of the 2025-2026 season (15-18 Aug
//    2025): scorelines, goalscorers/assisters, and clean sheets are all
//    real events (see the accompanying report in this conversation). A few
//    goalkeepers' save counts are estimates (marked "estimated" in the
//    comment) since no public per-player box score was available.
//  - Alexander Isak (id 57, Newcastle) did NOT actually play in this match
//    in real life (a transfer saga) -> minutesPlayed = 0, this is a good
//    test case for "a player who didn't play = 0 points".
//  - The other 4 clubs (PSG=1, Barcelona=3, Real Madrid=6, Bayern=7) don't
//    play in the Premier League, so there's no real data for the same
//    time window within the scope of this research -> a neutral
//    placeholder is used (90 minutes, 0 events, cleanSheet=false). TODO:
//    replace with real La Liga/Bundesliga/Ligue 1 GW1 data or integrate
//    Sportmonks once an API key is available.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const BACKUP_PLAYERS = require('../data/backupPlayers');
const prisma = new PrismaClient();

const GAMEWEEK = 1;

const stat = (minutesPlayed, goals, assists, yellowCards, redCards, cleanSheet, saves) => ({
  minutesPlayed, goals, assists, yellowCards, redCards, cleanSheet, saves,
});

// playerId -> real/estimated stats for GW1. Players not listed here get the
// default placeholder at the bottom of the file (see DEFAULT_STAT).
const REAL_GW1_STATS = {
  // --- Arsenal (won 1-0 at Old Trafford, clean sheet) ---
  2:  stat(90, 0, 0, 0, 0, true, 7),   // David Raya — 7 saves (real)
  12: stat(90, 0, 0, 0, 0, true, 0),   // William Saliba
  17: stat(90, 0, 0, 0, 0, true, 0),   // Gabriel Magalhães
  19: stat(90, 0, 0, 0, 0, true, 0),   // Ben White
  38: stat(90, 0, 0, 0, 0, true, 0),   // Martin Ødegaard
  33: stat(90, 0, 0, 0, 0, true, 0),   // Bukayo Saka
  41: stat(90, 0, 1, 0, 0, true, 0),   // Declan Rice — 1 assist (real, from a corner)
  61: stat(90, 0, 0, 0, 0, true, 0),   // Kai Havertz

  // --- Man City (won 4-0 vs Wolves, clean sheet) ---
  3:  stat(90, 0, 0, 0, 0, true, 1),   // Ederson — estimated saves
  13: stat(90, 0, 0, 0, 0, true, 0),   // Ruben Dias
  23: stat(90, 0, 0, 0, 0, true, 0),   // Josko Gvardiol
  32: stat(90, 0, 0, 0, 0, true, 0),   // Kevin De Bruyne
  39: stat(90, 0, 0, 0, 0, true, 0),   // Rodri
  43: stat(90, 0, 0, 0, 0, true, 0),   // Bernardo Silva
  35: stat(90, 0, 0, 0, 0, true, 0),   // Phil Foden
  51: stat(90, 2, 0, 0, 0, true, 0),   // Erling Haaland — 2 goals (real)
  65: stat(90, 0, 0, 0, 0, true, 0),   // Julián Álvarez

  // --- Liverpool (won 4-2 vs Bournemouth, NOT a clean sheet) ---
  1:  stat(90, 0, 0, 0, 0, false, 2),  // Alisson — estimated saves
  11: stat(90, 0, 0, 0, 0, false, 0),  // Virgil van Dijk
  14: stat(90, 0, 0, 0, 0, false, 0),  // Trent Alexander-Arnold
  27: stat(90, 0, 0, 0, 0, false, 0),  // Andrew Robertson
  31: stat(90, 1, 0, 0, 0, false, 0),  // Mohamed Salah — 1 goal (real, 90+4')
  46: stat(90, 0, 0, 0, 0, false, 0),  // Alexis Mac Allister
  59: stat(90, 0, 0, 0, 0, false, 0),  // Darwin Núñez

  // --- Aston Villa (drew 0-0 vs Newcastle, clean sheet) ---
  8:  stat(90, 0, 0, 0, 0, true, 3),   // E. Martínez — 3 saves (real, the actual starting goalkeeper that day)
  54: stat(90, 0, 0, 0, 0, true, 0),   // Ollie Watkins

  // --- Newcastle (drew 0-0 vs Aston Villa, clean sheet) ---
  9:  stat(90, 0, 0, 0, 0, true, 3),   // Nick Pope — 3 saves (real)
  26: stat(90, 0, 0, 0, 0, true, 0),   // Kieran Trippier
  47: stat(90, 0, 0, 0, 0, true, 0),   // Anthony Gordon
  57: stat(0,  0, 0, 0, 0, false, 0),  // Alexander Isak — did NOT play in this match (real, summer 2025 transfer saga)

  // --- Chelsea (drew 0-0 vs Crystal Palace, clean sheet) ---
  10: stat(90, 0, 0, 0, 0, true, 1),   // Robert Sánchez — estimated saves
  25: stat(90, 0, 0, 0, 0, true, 0),   // Reece James
  36: stat(90, 0, 0, 0, 0, true, 0),   // Cole Palmer
  63: stat(90, 0, 0, 0, 0, true, 0),   // Nicolas Jackson
};

// Neutral placeholder for PSG / Barcelona / Real Madrid / Bayern
// (no real data available within the scope of this research — see the
// note at the top of the file).
const DEFAULT_STAT = stat(90, 0, 0, 0, 0, false, 0);

module.exports = { REAL_GW1_STATS, DEFAULT_STAT, GAMEWEEK };

async function seedGameweekStats() {
  console.log(`⏳ Loading PlayerGameweekStat for Gameweek ${GAMEWEEK}...`);

  let realCount = 0;
  let placeholderCount = 0;

  for (const p of BACKUP_PLAYERS) {
    const isReal = Object.prototype.hasOwnProperty.call(REAL_GW1_STATS, p.id);
    const s = isReal ? REAL_GW1_STATS[p.id] : DEFAULT_STAT;
    isReal ? realCount++ : placeholderCount++;

    await prisma.playerGameweekStat.upsert({
      where: { playerId_gameweek: { playerId: p.id, gameweek: GAMEWEEK } },
      update: s,
      create: { playerId: p.id, gameweek: GAMEWEEK, ...s },
    });
  }

  console.log(`✅ Finished loading GW${GAMEWEEK}: ${realCount} players with real data, ${placeholderCount} players with placeholder data.`);
}

// Only auto-runs when called directly (`node seedGameweekStats.js`) — when
// this file is require()'d from another script (e.g. removeCuratedPlayers.js
// reusing REAL_GW1_STATS), it does NOT auto-seed against the curated
// playerIds anymore.
if (require.main === module) {
  seedGameweekStats()
    .catch((err) => {
      console.error('❌ Seed PlayerGameweekStat failed:', err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
