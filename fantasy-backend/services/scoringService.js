// ============================================================
// ScoringService — Algorithm 2 (CalculatePlayerMatchPoints)
// Direct port from the project's pseudocode specification (Section 5.x):
//
//   ALGORITHM CalculatePlayerMatchPoints(playerStats, position, isCaptain)
//   INPUT:  playerStats (minutesPlayed, goals, assists, yellowCards,
//           redCards, cleanSheet, saves), position ('GK'|'DEF'|'MID'|'FWD'),
//           isCaptain (Boolean)
//   OUTPUT: Integer (Total Fantasy Points)
//
// Contains no DB-query logic — a pure function, easy to unit test in
// isolation from matchdayService.js.
// ============================================================

const GOALS_WEIGHT_BY_POSITION = {
  GK: 6,
  DEF: 6,
  MID: 5,
  FWD: 4,
};

/**
 * @param {{minutesPlayed:number, goals:number, assists:number, yellowCards:number, redCards:number, cleanSheet:boolean, saves:number}} playerStats
 * @param {'GK'|'DEF'|'MID'|'FWD'} position
 * @param {boolean} isCaptain
 * @returns {number} The player's total fantasy points for this match/gameweek
 */
function calculatePlayerMatchPoints(playerStats, position, isCaptain) {
  const stats = {
    minutesPlayed: Number(playerStats?.minutesPlayed) || 0,
    goals: Number(playerStats?.goals) || 0,
    assists: Number(playerStats?.assists) || 0,
    yellowCards: Number(playerStats?.yellowCards) || 0,
    redCards: Number(playerStats?.redCards) || 0,
    cleanSheet: Boolean(playerStats?.cleanSheet),
    saves: Number(playerStats?.saves) || 0,
  };

  let totalPoints = 0;

  // 1. Appearance Points
  if (stats.minutesPlayed > 0) totalPoints += 1;
  if (stats.minutesPlayed >= 60) totalPoints += 1;

  // 2. Attacking Points (weighted by position)
  totalPoints += stats.assists * 3; // Assist +3 for every position

  const goalWeight = GOALS_WEIGHT_BY_POSITION[position];
  if (goalWeight !== undefined) {
    totalPoints += stats.goals * goalWeight;
  }

  // 3. Defensive Points (Clean sheet) — only counts if >= 60 minutes played
  if (stats.cleanSheet && stats.minutesPlayed >= 60) {
    if (position === 'GK' || position === 'DEF') {
      totalPoints += 4;
    } else if (position === 'MID') {
      totalPoints += 1;
    }
    // FWD does not get clean sheet points
  }

  // Goalkeeper bonus: +1 point for every 3 saves
  if (position === 'GK') {
    totalPoints += Math.floor(stats.saves / 3);
  }

  // 4. Disciplinary Deductions
  totalPoints -= stats.yellowCards * 1;
  totalPoints -= stats.redCards * 3;

  // 5. Captaincy Multiplier
  if (isCaptain) {
    totalPoints *= 2;
  }

  return totalPoints;
}

module.exports = { calculatePlayerMatchPoints, GOALS_WEIGHT_BY_POSITION };
