// ============================================================
// PredictionService — simplified match-outcome prediction
// (feedback item A7: "so sánh cầu thủ phải dựa vào tổng điểm dự đoán theo
// từng vòng dựa trên tiên đoán kết quả trận đấu").
//
// Same spirit as tacticalFitService's Algorithm 3 (Tactical Fit): a
// baseline + a weighted modifier from each club's Team tactical stats, NOT a
// full statistical model trained on historical results. It exists so the
// Fixture list (A2) and the Player Comparison tool (A7) have *some*
// deterministic, explainable prediction to project points from, while the
// real clubs are in their off-season break and no live fixture/odds
// provider is wired up (see prisma/schema.prisma's Fixture model comment).
//
// Pipeline:
//   1. attackRating(teamStats)   -> a single 0-100ish attacking strength
//      number, weighted from possession/attacking-passing/counter-attack.
//   2. expectedGoals(attacker, defender, homeAdvantage) -> a Poisson-style
//      lambda for that side, scaled around a league-average of 1.4
//      goals/match and clamped to a realistic 0.3–3.2 range.
//   3. matchOutcomeProbabilities(homeXG, awayXG) -> win/draw/win
//      probabilities from a logistic curve over the expected-goal
//      difference, with the draw slice widening as the two sides get closer.
// ============================================================
const { PrismaClient } = require('@prisma/client');
const { LEAGUE_AVERAGE_TEAM_STATS } = require('./tacticalFitService');

const prisma = new PrismaClient();

const HOME_ADVANTAGE = 6; // flat attack-rating bonus for the home side
const LEAGUE_AVG_GOALS = 1.4; // baseline goals/match at league-average attack & defense
const MIN_EXPECTED_GOALS = 0.3;
const MAX_EXPECTED_GOALS = 3.2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function round1(value) {
  return Math.round(value * 10) / 10;
}
function round2(value) {
  return Math.round(value * 100) / 100;
}

// Fetches a club's tactical stats by Player.teamId, falling back to the
// league average — identical fallback pattern to tacticalFitService (most
// of the real API-Football-seeded clubs have no curated Team row; only the
// original 10 curated clubs do).
async function getTeamStats(teamId) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return LEAGUE_AVERAGE_TEAM_STATS;
  return {
    possessionRate: Number(team.possessionRate),
    defensiveBlock: Number(team.defensiveBlock),
    attackingPassing: Number(team.attackingPassing),
    counterAttack: Number(team.counterAttack),
  };
}

function attackRating(stats) {
  return stats.attackingPassing * 0.5 + stats.counterAttack * 0.3 + stats.possessionRate * 0.2;
}

// defenseFactor is centered on 1.0 at league-average defensiveBlock (50):
// a very strong defense (100) roughly halves the attacker's expected
// goals (factor 0.5), a very weak one (0) boosts it by 50% (factor 1.5).
function defenseFactor(stats) {
  return 1 - (stats.defensiveBlock - 50) / 100;
}

function expectedGoals(attackerStats, defenderStats, homeAdvantage = 0) {
  const attack = attackRating(attackerStats) + homeAdvantage;
  const raw = LEAGUE_AVG_GOALS * (attack / 50) * defenseFactor(defenderStats);
  return clamp(raw, MIN_EXPECTED_GOALS, MAX_EXPECTED_GOALS);
}

// Win/draw/win probabilities from the expected-goal difference: a logistic
// curve assigns win probability to the stronger side, with a "draw slice"
// (widest when the two sides are evenly matched) carved out of both ends
// before normalizing all three to sum to 1.
function matchOutcomeProbabilities(homeXG, awayXG) {
  const diff = homeXG - awayXG;
  const homeWinRaw = 1 / (1 + Math.exp(-diff * 1.3));
  const awayWinRaw = 1 / (1 + Math.exp(diff * 1.3));
  const drawWeight = clamp(0.35 - Math.abs(diff) * 0.08, 0.15, 0.35);

  const home = homeWinRaw * (1 - drawWeight);
  const away = awayWinRaw * (1 - drawWeight);
  const draw = Math.max(0, 1 - home - away);
  const total = home + away + draw || 1;

  return {
    homeWinProb: round2(home / total),
    drawProb: round2(draw / total),
    awayWinProb: round2(away / total),
  };
}

function predictFixture(homeStats, awayStats) {
  const homeExpectedGoals = expectedGoals(homeStats, awayStats, HOME_ADVANTAGE);
  const awayExpectedGoals = expectedGoals(awayStats, homeStats, 0);
  const probs = matchOutcomeProbabilities(homeExpectedGoals, awayExpectedGoals);

  return {
    homeExpectedGoals: round1(homeExpectedGoals),
    awayExpectedGoals: round1(awayExpectedGoals),
    ...probs,
  };
}

async function predictMatchup(homeTeamId, awayTeamId) {
  const [homeStats, awayStats] = await Promise.all([
    getTeamStats(homeTeamId),
    getTeamStats(awayTeamId),
  ]);
  return predictFixture(homeStats, awayStats);
}

// Opponent clean-sheet probability seen from ONE side's perspective, used by
// projectPlayerPoints() below: P(opponent scores 0) under a Poisson(lambda =
// opponent's own expected goals) approximation.
function cleanSheetProbability(opponentExpectedGoals) {
  return Math.exp(-opponentExpectedGoals);
}

// ============================================================
// Projected fantasy points for ONE player in ONE upcoming fixture — powers
// the Player Comparison tool's "projected points per gameweek" (A7).
// Deliberately an estimate, not a guarantee: scales the player's own
// historical per-90 output (xG/xA from Player.stats, when available) by how
// strong an attacking fixture this is for their club, and adds an
// opponent-clean-sheet-probability-weighted defensive bonus. Players
// without curated stats (most of the real API-Football dataset — see
// Player.stats comment in schema.prisma) fall back to a position-only
// baseline so the feature still returns *something* explainable rather than
// silently zero.
// ============================================================
const GOALS_WEIGHT_BY_POSITION = { GK: 6, DEF: 6, MID: 5, FWD: 4 };
const POSITION_BASELINE = { GK: 3.0, DEF: 2.5, MID: 2.5, FWD: 2.2 }; // no curated stats -> flat estimate

function projectPlayerPoints({ player, teamExpectedGoals, opponentExpectedGoals }) {
  const position = player.position;
  const stats = player.stats;

  if (!stats || stats.xG == null) {
    // No curated attacking stats for this player — return a flat
    // position-based baseline, nudged slightly by clean-sheet odds for
    // defensive positions so the fixture still has SOME influence.
    const baseline = POSITION_BASELINE[position] ?? 2.0;
    const csBonus = (position === 'GK' || position === 'DEF')
      ? cleanSheetProbability(opponentExpectedGoals) * 2
      : 0;
    return round1(baseline + csBonus);
  }

  const xG = Number(stats.xG) || 0;
  const xA = Number(stats.xA) || 0;
  const attackMultiplier = teamExpectedGoals / LEAGUE_AVG_GOALS;
  const goalWeight = GOALS_WEIGHT_BY_POSITION[position] ?? 4;

  let points = 1.8; // expected appearance points, assuming a nailed-on starter
  points += xG * attackMultiplier * goalWeight;
  points += xA * attackMultiplier * 3;

  const csProb = cleanSheetProbability(opponentExpectedGoals);
  if (position === 'GK' || position === 'DEF') points += csProb * 4;
  else if (position === 'MID') points += csProb * 1;

  return round1(Math.max(0, points));
}

module.exports = {
  predictFixture,
  predictMatchup,
  getTeamStats,
  cleanSheetProbability,
  projectPlayerPoints,
  HOME_ADVANTAGE,
  LEAGUE_AVG_GOALS,
  MIN_EXPECTED_GOALS,
  MAX_EXPECTED_GOALS,
};
