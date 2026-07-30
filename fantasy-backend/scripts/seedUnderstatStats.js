// ============================================================
// Loads REAL analytics stats (real xG/xA, not the goals/assists-derived
// proxy used by buildStatsFromApiFootball in seedTop5Free.js) from
// Understat.com — one of the few free xG sources that needs no API key
// and has no daily request limit.
//
// NOTE: this scrapes public HTML pages (not an official API) — the current
// page structure was checked directly (07/2026) before writing this script,
// NOT based on outdated documentation (Understat used to embed data as
// JSON.parse('...') inside a <script> tag, but that structure no longer
// exists — each club page now (understat.com/team/{Slug}/{season}) renders
// a plain HTML <table> with columns: Player, Pos, Apps, Min, G, A, Sh90,
// KP90, xG, xA, xG90, xA90). Since this scrapes public pages (no login, no
// bypassing of technical barriers), it's appropriate for non-commercial/
// academic use, but the structure could change at any time — if this
// script stops matching any players, it's likely because Understat has
// changed its table structure again.
//
// How it works: for each of the 5 leagues, it gets the list of club slugs
// from the league page itself (<a href="team/Slug/season"> links), then
// visits each club page to read the player-stats table. Matches by NAME
// (normalized, diacritics stripped) against players already in the DB
// (loaded via seedRealSquads.js) — no need to match by club since names
// are compared globally.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');

const prisma = new PrismaClient();

const LEAGUES = ['EPL', 'La_liga', 'Bundesliga', 'Serie_A', 'Ligue_1'];
const SEASON = 2024;
const DELAY_MS = 2000; // Understat doesn't publish an official rate limit — 2s/request is a polite, safe pace.
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

async function getTeamSlugs(league) {
  const { data: html } = await axios.get(`https://understat.com/league/${league}/${SEASON}`, {
    headers: HTTP_HEADERS,
    timeout: 15000,
  });
  const $ = cheerio.load(html);
  const slugs = new Set();
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/^team\/([^/]+)\/\d+$/);
    if (m) slugs.add(m[1]);
  });
  return [...slugs];
}

async function getTeamPlayerStats(slug) {
  const { data: html } = await axios.get(`https://understat.com/team/${slug}/${SEASON}`, {
    headers: HTTP_HEADERS,
    timeout: 15000,
  });
  const $ = cheerio.load(html);
  const results = [];

  $('table').each((_, table) => {
    const headerCells = $(table).find('tr').first().find('th,td').map((_, c) => $(c).text().trim()).get();
    if (headerCells[1] !== 'Player' || !headerCells.includes('xG90')) return; // not the player-stats table

    const idx = {
      name: headerCells.indexOf('Player'),
      min: headerCells.indexOf('Min'),
      g: headerCells.indexOf('G'),
      a: headerCells.indexOf('A'),
      sh90: headerCells.indexOf('Sh90'),
      kp90: headerCells.indexOf('KP90'),
      xg90: headerCells.indexOf('xG90'),
      xa90: headerCells.indexOf('xA90'),
    };

    $(table).find('tbody tr').each((_, row) => {
      const cells = $(row).find('td').map((_, c) => $(c).text().trim()).get();
      if (cells.length < headerCells.length) return;
      const minutes = Number(cells[idx.min]) || 0;
      if (minutes <= 0) return; // hasn't played any minutes -> not enough basis for a per-90 calculation

      results.push({
        name: cells[idx.name],
        minutes,
        goals: Number(cells[idx.g]) || 0,
        assists: Number(cells[idx.a]) || 0,
        sh90: Number(cells[idx.sh90]) || 0,
        kp90: Number(cells[idx.kp90]) || 0,
        xg90: Number(cells[idx.xg90]) || 0,
        xa90: Number(cells[idx.xa90]) || 0,
      });
    });
  });

  return results;
}

async function main() {
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

  for (const league of LEAGUES) {
    console.log(`⏳ ${league}: fetching the club list...`);
    let slugs;
    try {
      slugs = await getTeamSlugs(league);
    } catch (error) {
      console.log(`   ❌ Error fetching club list (${error.message}) — skipping this league.`);
      continue;
    }
    console.log(`   → ${slugs.length} clubs`);
    await sleep(DELAY_MS);

    for (const slug of slugs) {
      let rows;
      try {
        rows = await getTeamPlayerStats(slug);
      } catch (error) {
        console.log(`   ⚠️  Error on club ${slug}: ${error.message}`);
        await sleep(DELAY_MS);
        continue;
      }

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
      console.log(`   ✓ ${slug}: ${rows.length} players with playing minutes (per Understat)`);
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n✅ Updated REAL xG/xA stats (Understat) for ${matched} players.`);
  if (unmatchedSample.length > 0) {
    console.log(`ℹ️  ${unmatchedSample.length} names on Understat didn't match the DB (name-formatting differences, or the player isn't in the loaded dataset) — skipped, doesn't affect the matched players.`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Loading Understat stats failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
