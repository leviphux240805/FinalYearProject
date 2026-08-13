// ============================================================
// SUPER LEAGUE FANTASY - Enterprise Backend Server
// Stack: Express + Prisma (PostgreSQL) + Redis + Socket.io + Cron
// ============================================================
require('dotenv').config();

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const cron         = require('node-cron');
const redis        = require('redis');
const axios        = require('axios');
const rateLimit    = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

// --- Routes ---
const authRoutes        = require('./routes/auth');
const oauthRoutes       = require('./routes/oauth');
const leaderboardRoutes = require('./routes/leaderboard');
const transferRoutes    = require('./routes/transfers');
const matchdayRoutes    = require('./routes/matchday');
const squadRoutes       = require('./routes/squad');
const fixturesRoutes    = require('./routes/fixtures');

// --- Services ---
const tacticalFitService = require('./services/tacticalFitService');
const predictionService  = require('./services/predictionService');
const { calculatePlayerMatchPoints } = require('./services/scoringService');

// ============================================================
// APPLICATION SETUP
// ============================================================
const app    = express();
const prisma = new PrismaClient();

// Render (and most PaaS hosts) terminate TLS at a reverse proxy in front of
// this process, so the connection Node actually sees is plain HTTP — without
// this, req.protocol always reports "http" even in production, which would
// silently give routes/oauth.js's callback-URL auto-detection the wrong
// scheme. `1` = trust exactly one hop of proxy (the platform's own edge),
// not an arbitrary chain of forwarded-for headers from the public internet.
app.set('trust proxy', 1);

const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';
const SPORTMONKS_PLAYER_INCLUDE = process.env.SPORTMONKS_PLAYER_INCLUDE ||
  'trophies.league;trophies.season;trophies.trophy;trophies.team;teams.team;statistics.details.type;statistics.team;statistics.season.league;latest.fixture.participants;latest.fixture.league;latest.fixture.scores;latest.details.type;nationality;detailedPosition;metadata.type';

// ============================================================
// SECURITY HTTP HEADERS
// Implemented by hand (equivalent to the "helmet" package's defaults) since
// this sandbox has no registry access to install it — swap in `helmet()` if
// you `npm install helmet` locally, the effect is the same.
// ============================================================
app.disable('x-powered-by'); // don't advertise "Express" to attackers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');       // stop MIME-sniffing away from declared Content-Type
  res.setHeader('X-Frame-Options', 'DENY');                  // block this API's JSON being framed (clickjacking)
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains'); // no-op over plain HTTP in dev, matters once behind HTTPS
  next();
});

// ============================================================
// CORS - restricted to known frontend origin(s), not left wide open.
// FRONTEND_ORIGIN can be a comma-separated list (e.g. dev + prod URLs).
//
// PREVIEW-DEPLOY FIX: Vercel issues a NEW preview URL with a random hash
// (https://<project>-<hash>-<team-slug>.vercel.app) on every single push —
// unlike the stable production URL, it's never the same twice. Originally
// FRONTEND_ORIGIN only listed one specific preview URL, so it silently broke
// again the next time Vercel generated a different hash (exactly the CORS
// bug documented in the defense deck — it recurred during prep because a new
// preview deployment was made after that fix). Rather than having to hand-
// update the Render env var after every single Vercel push, any preview URL
// matching THIS project's own Vercel slug is now allowed via regex, while
// still rejecting every other origin on the internet.
// ============================================================
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Matches https://final-year-project-<any-hash>-leviphux240805s-projects.vercel.app
// — i.e. any preview deployment of this specific Vercel project, not just
// the one exact URL that happened to be current when FRONTEND_ORIGIN was
// last set. Does NOT match other Vercel projects/users' preview URLs.
const VERCEL_PREVIEW_ORIGIN_REGEX = /^https:\/\/final-year-project-[a-z0-9]+-leviphux240805s-projects\.vercel\.app$/;

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin/non-browser requests (no Origin header, e.g. curl, mobile) through.
    if (!origin || allowedOrigins.includes(origin) || VERCEL_PREVIEW_ORIGIN_REGEX.test(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked request from unlisted origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true // required for the browser to send/receive the httpOnly refreshToken cookie cross-origin
}));
app.use(express.json({ limit: '10kb' })); // small JSON bodies expected; caps request-body DoS
app.use(cookieParser());

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: allowedOrigins } });

// ============================================================
// REDIS CONNECTION (Leaderboard - O(log N))
// ============================================================
const redisClient = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

// Only log the Redis error once, to avoid spamming the console — BUT still
// print the real underlying cause (err.code/err.message) instead of just a
// generic sentence, so it's still debuggable (ECONNREFUSED = nothing
// listening on that port, quite different from an auth error or wrong host).
let redisErrorLogged = false;
redisClient.on('error', (err) => {
  if (!redisErrorLogged) {
    console.warn(`⚠️  Redis not connected - Leaderboard temporarily disabled. Reason: [${err.code || err.name}] ${err.message}`);
    redisErrorLogged = true;
  }
});

redisClient.connect()
  .then(() => {
    redisErrorLogged = false;
    console.log('🔌 Redis Cluster connected successfully!');
    app.set('redisClient', redisClient);
  })
  .catch((err) => {
    console.warn(`⚠️  Redis offline - Server still running normally, only the Leaderboard feature is disabled. Reason: [${err.code || err.name}] ${err.message}`);
  });

// ============================================================
// HEALTH CHECK - used by Render (and by us) to confirm the process is alive
// and can actually reach Postgres, not just that Node started.
// ============================================================
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', redis: redisClient.isReady ? 'connected' : 'unavailable' });
  } catch (error) {
    res.status(503).json({ status: 'degraded', db: 'unreachable', error: error.message });
  }
});

// ============================================================
// MOUNT ROUTES
// ============================================================
app.use('/api/auth',        authRoutes);
app.use('/api/auth',        oauthRoutes); // mounted AFTER authRoutes: its /:provider catch-all must not shadow /login, /register, /me, /refresh, /logout
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/transfers',   transferRoutes);
app.use('/api/matchday',    matchdayRoutes);
app.use('/api/squad',       squadRoutes);
app.use('/api/fixtures',    fixturesRoutes);

// ============================================================
// API: Get player list
// ONLY served from PostgreSQL (real players loaded via scripts/seedTop5Free.js).
// The 65 hand-curated players (data/backupPlayers.js) have been fully
// removed from every data-serving path — see scripts/removeCuratedPlayers.js.
// ============================================================
app.get('/api/players', async (req, res) => {
  try {
    const dbPlayers = await prisma.player.findMany({ orderBy: { id: 'asc' } });
    return res.json(dbPlayers.map(p => ({
      ...p,
      price: Number(p.currentPrice),
      team_id: p.teamId
    })));
  } catch (error) {
    console.error('[Players] Database query error:', error.message);
    return res.status(503).json({
      success: false,
      error: 'Could not read the player list from the database. Please run scripts/seedTop5Free.js.'
    });
  }
});

// ============================================================
// API: Real clubs currently in the game, grouped by league
// Powers the "Leagues & Clubs" tab — always matches the real player data
// currently in the database (not a static hard-coded list).
// ============================================================
app.get('/api/teams', async (req, res) => {
  try {
    const teams = await prisma.player.groupBy({
      by: ['teamId', 'teamName', 'leagueName'],
      _count: { id: true }
    });

    const result = teams
      .filter(t => t.teamName)
      .map(t => ({
        teamId: t.teamId,
        teamName: t.teamName,
        leagueName: t.leagueName,
        playerCount: t._count.id
      }))
      .sort((a, b) => (a.leagueName || '').localeCompare(b.leagueName || '') || a.teamName.localeCompare(b.teamName));

    return res.json(result);
  } catch (error) {
    console.error('[Teams] Database query error:', error.message);
    return res.status(503).json({ success: false, error: 'Could not read the club list from the database.' });
  }
});

// ============================================================
// DYNAMIC MARKET PRICING ENGINE - Runs at 00:00 every night
// Automatically raises/lowers player prices based on 24h transaction demand
// ============================================================
cron.schedule('0 0 * * *', async () => {
  console.log('📉 Triggering the automatic market pricing engine...');
  try {
    const players = await prisma.player.findMany();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const player of players) {
      const [buyCount, sellCount] = await Promise.all([
        prisma.transaction.count({ where: { type: 'BUY',  playerId: player.id, createdAt: { gte: since24h } } }),
        prisma.transaction.count({ where: { type: 'SELL', playerId: player.id, createdAt: { gte: since24h } } })
      ]);

      const netDemand = buyCount - sellCount;
      // Each unit of supply/demand imbalance shifts the price by $0.1M
      let priceChange = netDemand * 0.1;
      // Capped at ±$0.3M/day to prevent a financial bubble
      priceChange = Math.max(-0.3, Math.min(0.3, priceChange));

      if (priceChange !== 0) {
        const newPrice = Math.max(1.0, Number(player.currentPrice) + priceChange);
        await prisma.player.update({
          where: { id: player.id },
          data: { currentPrice: parseFloat(newPrice.toFixed(1)) }
        });
        console.log(`  → ${player.name}: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)} → $${newPrice.toFixed(1)}M`);
      }
    }
    console.log('✅ Finished updating the new price board for the whole market!');
  } catch (error) {
    console.error('❌ Error updating market prices:', error.message);
  }
});

// ============================================================
// REAL-TIME SCORE UPDATE PIPELINE INTO THE REDIS LEADERBOARD
// ============================================================
async function updateUserLiveScore(userId, pointsAdded) {
  if (!redisClient.isReady) return null;
  const newScore = await redisClient.zIncrBy('global_leaderboard', pointsAdded, userId);
  const rank = await redisClient.zRevRank('global_leaderboard', userId);
  return { newScore: Math.round(newScore), rank: rank + 1 };
}

// ============================================================
// API: GACHA CARD PACK OPENING SYSTEM
// ============================================================

const getRarity = (price) => {
  if (price >= 11.0) return { tier: 'LEGENDARY', weight: 5,  color: '#f1c40f' }; // ~5%
  if (price >= 8.5)  return { tier: 'EPIC',      weight: 15, color: '#9b59b6' }; // ~15%
  if (price >= 6.0)  return { tier: 'RARE',      weight: 30, color: '#3498db' }; // ~30%
  return                    { tier: 'COMMON',     weight: 50, color: '#bdc3c7' }; // ~50%
};

app.post('/api/gacha/open', async (req, res) => {
  const { userId } = req.body;

  try {
    // The gacha pool is pulled straight from PostgreSQL (real players
    // loaded via seedTop5Free.js) — the curated BACKUP_PLAYERS is no longer used.
    const dbPlayers = await prisma.player.findMany();
    if (dbPlayers.length === 0) {
      return res.status(503).json({ success: false, error: 'No players in the database yet. Please run scripts/seedTop5Free.js first.' });
    }

    const pool = dbPlayers.map(p => ({
      ...p,
      price: Number(p.currentPrice),
      team_id: p.teamId,
      rarity: getRarity(Number(p.currentPrice)),
    }));

    // Weighted Random algorithm
    const totalWeight = pool.reduce((sum, p) => sum + p.rarity.weight, 0);
    let roll = Math.random() * totalWeight;

    let pulledPlayer = pool[pool.length - 1]; // fallback
    for (const player of pool) {
      if (roll < player.rarity.weight) { pulledPlayer = player; break; }
      roll -= player.rarity.weight;
    }

    console.log(`[GACHA] User ${userId || 'anonymous'} just pulled: ${pulledPlayer.name} (${pulledPlayer.rarity.tier})`);

    res.json({
      success: true,
      player: pulledPlayer,
      message: `Congratulations! You received a ${pulledPlayer.rarity.tier} card`
    });
  } catch (error) {
    console.error('[GACHA] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not open the pack.' });
  }
});

// ============================================================
// API: Get detailed player profile from Sportmonks
// Example: /api/players/32695/profile (32695 is the Sportmonks player id)
// ============================================================
app.get('/api/players/:id/profile', async (req, res) => {
  const { id } = req.params;
  const apiToken = req.headers['x-sportmonks-token'] || req.query.api_token || process.env.SPORTMONKS_API_TOKEN;
  const include = req.query.include || SPORTMONKS_PLAYER_INCLUDE;
  const select = req.query.select;
  const filters = req.query.filters;
  const locale = req.query.locale;

  const includeDepthValid = String(include)
    .split(';')
    .filter(Boolean)
    .every(path => path.split('.').length <= 3);

  if (!apiToken) {
    return res.status(503).json({
      success: false,
      error: 'Missing SPORTMONKS_API_TOKEN in .env'
    });
  }

  if (!includeDepthValid) {
    return res.status(400).json({
      success: false,
      error: 'Include depth exceeds 3 levels (per the Player endpoint limit).'
    });
  }

  try {
    const params = {
      api_token: apiToken,
      include
    };
    if (select) params.select = select;
    if (filters) params.filters = filters;
    if (locale) params.locale = locale;

    const response = await axios.get(`${SPORTMONKS_BASE_URL}/players/${id}`, {
      params,
      timeout: 12000
    });

    const player = response?.data?.data;
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found on Sportmonks' });
    }

    const profile = {
      id: player.id,
      commonName: player.common_name || player.name,
      displayName: player.display_name || player.common_name || player.name,
      fullName: player.name,
      imagePath: player.image_path || null,
      dateOfBirth: player.date_of_birth || null,
      height: player.height || null,
      weight: player.weight || null,
      nationality: player.nationality || null,
      detailedPosition: player.detailedPosition || null,
      metadata: player.metadata || [],
      teams: player.teams || [],
      statistics: player.statistics || [],
      latest: player.latest || [],
      trophies: player.trophies || []
    };

    return res.json({ success: true, profile });
  } catch (error) {
    const status = error?.response?.status || 500;
    const detail = error?.response?.data || error.message;
    return res.status(status).json({
      success: false,
      error: 'Could not fetch profile from Sportmonks',
      detail
    });
  }
});

// ============================================================
// API: Tactical Fit Analyzer (Algorithm 3, Section 5.4)
// A 0-100 score based on playing position + club tactical style
// ============================================================
app.get('/api/players/:id/tactical-fit', async (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isFinite(playerId)) {
    return res.status(400).json({ success: false, error: 'Invalid player ID.' });
  }

  try {
    const dbPlayer = await prisma.player.findUnique({ where: { id: playerId } });
    if (!dbPlayer) {
      return res.status(404).json({ success: false, error: 'Player not found.' });
    }
    const position = dbPlayer.position;
    const teamId = dbPlayer.teamId;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    const teamStats = team ? {
      possessionRate: Number(team.possessionRate),
      defensiveBlock: Number(team.defensiveBlock),
      attackingPassing: Number(team.attackingPassing),
      counterAttack: Number(team.counterAttack)
    } : null;

    const score = tacticalFitService.calculateTacticalFit({ playerStats: null, teamStats, position });

    res.json({ success: true, score, position, teamName: team?.name || null });
  } catch (error) {
    console.error('[TacticalFit] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not compute Tactical Fit.' });
  }
});

// ============================================================
// API: Projected Fantasy Points per upcoming gameweek (feedback item A7)
// Example: /api/players/32695/projected-points?gameweeks=2,3,4
// Looks up the player's club fixture in each requested gameweek and scales
// their historical xG/xA (when available) by predictionService's estimate
// of that fixture — see predictionService.js for the full explanation of
// why this is a heuristic estimate, not a guarantee.
// ============================================================
app.get('/api/players/:id/projected-points', async (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isFinite(playerId)) {
    return res.status(400).json({ success: false, error: 'Invalid player ID.' });
  }

  const gameweeks = String(req.query.gameweeks || '')
    .split(',')
    .map(g => Number(g.trim()))
    .filter(g => Number.isFinite(g) && g > 0);

  if (gameweeks.length === 0) {
    return res.status(400).json({ success: false, error: 'Provide at least one gameweek, e.g. ?gameweeks=2,3,4' });
  }

  try {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found.' });
    }

    const fixtures = await prisma.fixture.findMany({
      where: {
        gameweek: { in: gameweeks },
        OR: [{ homeTeamId: player.teamId }, { awayTeamId: player.teamId }],
      },
    });
    const fixtureByGameweek = new Map(fixtures.map(f => [f.gameweek, f]));

    const breakdown = gameweeks.map((gameweek) => {
      const fixture = fixtureByGameweek.get(gameweek);
      if (!fixture) {
        return { gameweek, hasFixture: false, opponent: null, projectedPoints: 0 };
      }

      const isHome = fixture.homeTeamId === player.teamId;
      const teamExpectedGoals = isHome ? fixture.homeExpectedGoals : fixture.awayExpectedGoals;
      const opponentExpectedGoals = isHome ? fixture.awayExpectedGoals : fixture.homeExpectedGoals;
      const opponent = isHome ? fixture.awayTeamName : fixture.homeTeamName;

      const projectedPoints = projectionForFixture(player, teamExpectedGoals, opponentExpectedGoals);
      return { gameweek, hasFixture: true, opponent, isHome, projectedPoints };
    });

    const totalProjectedPoints = Math.round(breakdown.reduce((sum, b) => sum + b.projectedPoints, 0) * 10) / 10;

    res.json({ success: true, playerId, position: player.position, breakdown, totalProjectedPoints });
  } catch (error) {
    console.error('[ProjectedPoints] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not compute projected points.' });
  }
});

function projectionForFixture(player, teamExpectedGoals, opponentExpectedGoals) {
  return predictionService.projectPlayerPoints({ player, teamExpectedGoals, opponentExpectedGoals });
}

// ============================================================
// API: Per-gameweek match history for ONE player (feedback item A1 —
// "chọn cầu thủ phải có bảng chi tiết: điểm số từng vòng, số trận thi đấu,
// số phút thi đấu"). Reads directly from PlayerGameweekStat, so it
// naturally covers however many gameweeks have real data seeded (currently
// GW1 only, for the subset of players matched by
// scripts/removeCuratedPlayers.js — see that file's comment) and reports an
// honest empty list for the rest, rather than fabricating history.
// ============================================================
app.get('/api/players/:id/history', async (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isFinite(playerId)) {
    return res.status(400).json({ success: false, error: 'Invalid player ID.' });
  }

  try {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found.' });
    }

    const statRows = await prisma.playerGameweekStat.findMany({
      where: { playerId },
      orderBy: { gameweek: 'asc' },
    });

    const history = statRows.map((s) => ({
      gameweek: s.gameweek,
      minutesPlayed: s.minutesPlayed,
      goals: s.goals,
      assists: s.assists,
      yellowCards: s.yellowCards,
      redCards: s.redCards,
      cleanSheet: s.cleanSheet,
      saves: s.saves,
      points: calculatePlayerMatchPoints(s, player.position, false),
    }));

    const matchesPlayed = history.filter((h) => h.minutesPlayed > 0).length;
    const totalPoints = history.reduce((sum, h) => sum + h.points, 0);

    res.json({
      success: true,
      playerId,
      name: player.name,
      position: player.position,
      matchesPlayed,
      totalPoints,
      history,
    });
  } catch (error) {
    console.error('[PlayerHistory] Error:', error.message);
    res.status(500).json({ success: false, error: 'Could not load this player\'s match history.' });
  }
});

// ============================================================
// IDEMPOTENCY CACHE - Prevents duplicate processing of a webhook eventId
// TTL-based, matching the description in the report (TC-038): an eventId
// is remembered for a window of time, then automatically cleaned up once
// it expires.
// ============================================================
const EVENT_DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const processedEvents = new Map(); // eventId -> timestamp

function isDuplicateEvent(eventId) {
  if (!eventId) return false;

  const now = Date.now();
  for (const [id, ts] of processedEvents) {
    if (now - ts > EVENT_DEDUP_TTL_MS) processedEvents.delete(id);
  }

  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, now);
  return false;
}

// ============================================================
// WEBHOOK API: Simulates Sportmonks firing a live event
// ============================================================
// 100 requests per minute per IP — a real provider's webhook fan-out can
// legitimately burst, so this caps abuse without throttling normal traffic.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many webhook requests. Please slow down.' }
});

app.post('/api/webhook/simulate', webhookLimiter, async (req, res) => {
  const { playerId, action, points, userId, eventId, gameweek } = req.body;

  if (isDuplicateEvent(eventId)) {
    console.log(`[Webhook] Skipping duplicate event: eventId=${eventId}`);
    return res.json({ success: true, message: 'Duplicate event was skipped.', duplicate: true });
  }

  console.log(`[Webhook] Player ${playerId} -> ${action} (+${points} pts)`);

  // Only broadcasts to clients currently viewing this exact gameweek
  // (room-based fan-out), instead of a global io.emit, so broadcast cost
  // scales with the number of interested clients rather than the total
  // connection count.
  const room = `gameweek_${gameweek || 1}`;
  io.to(room).emit('LIVE_SCORE_UPDATE', {
    playerId,
    message: `${action}! (+${points} points)`,
    pointsAdded: points
  });

  // Update the Redis leaderboard if a userId was provided
  if (userId) {
    const rankData = await updateUserLiveScore(userId, points);
    if (rankData) {
      io.emit('LEADERBOARD_UPDATE', { userId, ...rankData });
    }
  }

  res.json({ success: true, message: 'Event broadcast over WebSockets!' });
});

// ============================================================
// SOCKET.IO - Real-time connections
// ============================================================
io.on('connection', (socket) => {
  console.log('🟢 Client connected:', socket.id);

  socket.on('join_gameweek', (gameweek) => {
    const room = `gameweek_${gameweek || 1}`;
    socket.join(room);
    console.log(`   ↳ ${socket.id} joined room ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected:', socket.id);
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║      🏆 SUPER LEAGUE PRO - Enterprise Backend    ║');
    console.log(`║      🚀 Server: http://localhost:${PORT}           ║`);
    console.log('║      🗄️  DB: PostgreSQL + Prisma ORM             ║');
    console.log('║      ⚡ Cache: Redis Sorted Sets (O(log N))      ║');
    console.log('║      📅 Cron: Dynamic Market Pricing @ 00:00     ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });
}

module.exports = { app, server, prisma, io };
