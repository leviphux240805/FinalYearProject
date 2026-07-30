// ============================================================
// Club kit colors (feedback item A3 — "phải hiện được màu áo đúng của
// từng cầu thủ"). Curated primary shirt color for well-known clubs across
// the Top 5 leagues (seedTop5Free.js's real dataset); any club not in this
// map falls back to a DETERMINISTIC color hashed from its name (same club
// always gets the same color across reloads/sessions — no color map entry
// needed for every single one of the ~100 real clubs to still look
// consistent), rather than every unlisted club sharing one generic gray.
// ============================================================
const CLUB_COLORS = {
  // --- Premier League ---
  'Arsenal': '#EF0107',
  'Manchester City': '#6CABDD',
  'Manchester United': '#DA291C',
  'Liverpool': '#C8102E',
  'Chelsea': '#034694',
  'Tottenham Hotspur': '#132257',
  'Tottenham': '#132257',
  'Newcastle United': '#241F20',
  'Aston Villa': '#95BFE5',
  'West Ham United': '#7A263A',
  'Brighton & Hove Albion': '#0057B8',
  'Brighton': '#0057B8',
  'Wolverhampton Wanderers': '#FDB913',
  'Wolves': '#FDB913',
  'Everton': '#003399',
  'Crystal Palace': '#1B458F',
  'Fulham': '#000000',
  'Brentford': '#E30613',
  'Nottingham Forest': '#DD0000',
  'Bournemouth': '#DA291C',
  'AFC Bournemouth': '#DA291C',
  'Leicester City': '#003090',
  'Southampton': '#D71920',
  'Ipswich Town': '#0044A9',

  // --- La Liga ---
  'Real Madrid': '#FEBE10',
  'Barcelona': '#A50044',
  'FC Barcelona': '#A50044',
  'Atletico Madrid': '#CB3524',
  'Atlético Madrid': '#CB3524',
  'Sevilla': '#D00027',
  'Real Sociedad': '#0067B1',
  'Real Betis': '#00954C',
  'Villarreal': '#FFE667',
  'Athletic Bilbao': '#EE2523',
  'Valencia': '#EE8C00',
  'Girona': '#CD2534',
  'Celta Vigo': '#8AC3EE',

  // --- Serie A ---
  'Juventus': '#000000',
  'Inter': '#010E80',
  'Inter Milan': '#010E80',
  'AC Milan': '#FB090B',
  'Napoli': '#12A0D7',
  'AS Roma': '#8E1F2F',
  'Roma': '#8E1F2F',
  'Lazio': '#87D8F7',
  'Atalanta': '#1E71B8',
  'Fiorentina': '#7A263A',
  'Bologna': '#8C1B31',
  'Torino': '#7A263A',

  // --- Bundesliga ---
  'Bayern Munich': '#DC052D',
  'Bayern München': '#DC052D',
  'Borussia Dortmund': '#FDE100',
  'RB Leipzig': '#DD0741',
  'Bayer Leverkusen': '#E32221',
  'Eintracht Frankfurt': '#E1000F',
  'VfB Stuttgart': '#E32219',
  'Borussia Monchengladbach': '#000000',
  "Borussia M'gladbach": '#000000',
  'Wolfsburg': '#65B32E',
  'Union Berlin': '#EB1923',

  // --- Ligue 1 ---
  'Paris Saint Germain': '#004170',
  'Paris Saint-Germain': '#004170',
  'PSG': '#004170',
  'Marseille': '#2FAEE0',
  'Olympique Marseille': '#2FAEE0',
  'Lyon': '#DA291C',
  'Olympique Lyonnais': '#DA291C',
  'Monaco': '#E51A25',
  'AS Monaco': '#E51A25',
  'Lille': '#DA291C',
  'Lens': '#FFD100',
  'Rennes': '#E60009',
  'Nice': '#CC0000',
};

// FNV-1a-style string hash — small, dependency-free, deterministic.
function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

// Fallback for any club not in CLUB_COLORS: a fixed saturation/lightness so
// every generated color reads clearly as a "kit color" against the dark UI,
// only the hue varies per club.
function fallbackColor(teamName) {
  const hue = hashString(teamName || 'Unknown') % 360;
  return `hsl(${hue}, 62%, 45%)`;
}

export function getClubColor(teamName) {
  if (!teamName) return '#636e72'; // unknown club -> neutral gray, same as before
  return CLUB_COLORS[teamName] || fallbackColor(teamName);
}

// Real club crest image. Player.teamId (see seedTop5Free.js) is the club's
// actual API-Football team id, and api-sports.io serves crests at this exact
// predictable CDN path keyed by that same id — no extra API call or new DB
// column needed. Curated/legacy players without a real API-Football teamId
// will just 404 on this URL; callers should hide the <img> on @error (see
// TransferMarket.vue's onClubBadgeError), the same pattern already used for
// player photos.
export function getClubBadgeUrl(teamId) {
  return teamId ? `https://media.api-sports.io/football/teams/${teamId}.png` : null;
}

// Rough perceived-brightness check so text/border drawn ON a club color
// picks black or white for contrast, instead of assuming white always works
// (e.g. Dortmund's yellow, Barcelona's gold trim).
export function isLightColor(hexOrHsl) {
  if (hexOrHsl.startsWith('hsl')) {
    const lightness = Number(hexOrHsl.match(/,\s*(\d+)%\)/)?.[1] ?? 45);
    return lightness > 60;
  }
  const hex = hexOrHsl.replace('#', '');
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150;
}
