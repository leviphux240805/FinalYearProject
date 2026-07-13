// ============================================================
// TacticalFitService — Algorithm 3 (Tactical Fit Analyzer)
// Implemented verbatim from the report's pseudocode: baseScore 50,
// a position-weighted modifier computed only from teamStats (the
// pseudocode accepts playerStats but never reads it), clamped 0-100.
// ============================================================
const BASE_SCORE = 50;

// Used when a player's teamId has no curated Team row (e.g. real
// Sportmonks-seeded players outside the 10-club curated dataset).
const LEAGUE_AVERAGE_TEAM_STATS = {
  possessionRate: 50,
  defensiveBlock: 50,
  attackingPassing: 50,
  counterAttack: 50
};

function calculateTacticalFit({ playerStats, teamStats, position }) {
  const stats = teamStats || LEAGUE_AVERAGE_TEAM_STATS;
  let modifier = 0;

  switch (position) {
    case 'MID':
      modifier = (stats.possessionRate * 0.4) + (stats.attackingPassing * 0.1);
      break;
    case 'FWD':
      modifier = (stats.counterAttack * 0.3) + (stats.attackingPassing * 0.2);
      break;
    case 'DEF':
      modifier = (stats.defensiveBlock * 0.5);
      break;
    default:
      modifier = 0;
  }

  const rawScore = BASE_SCORE + modifier;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

module.exports = { calculateTacticalFit, LEAGUE_AVERAGE_TEAM_STATS };
