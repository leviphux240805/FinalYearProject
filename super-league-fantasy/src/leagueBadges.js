// ============================================================
// League/competition badge lookup for the Top-5 European leagues this
// project actually seeds from (scripts/seedTop5Free.js, backfillLeagueNames.js
// -> Player.leagueName). API-Football/api-sports.io serves these crests at a
// stable, predictable CDN path keyed by THEIR OWN numeric league id — the
// same 5 ids already hard-coded in both of those seed scripts — so no extra
// API call or new DB column is needed, only this lookup table to translate
// the leagueName string already stored on every Player row back into the id
// the CDN path needs.
// ============================================================
const LEAGUE_IDS = {
  'Premier League': 39,
  'La Liga': 140,
  'Bundesliga': 78,
  'Serie A': 135,
  'Ligue 1': 61,
};

export function getLeagueBadgeUrl(leagueName) {
  const id = LEAGUE_IDS[leagueName];
  return id ? `https://media.api-sports.io/football/leagues/${id}.png` : null;
}
