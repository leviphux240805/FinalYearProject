// ============================================================
// SUPER LEAGUE FANTASY - Enterprise Backend Server
// Stack: Express + Prisma (PostgreSQL) + Redis + Socket.io + Cron
// ============================================================
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const cron       = require('node-cron');
const redis      = require('redis');
const axios      = require('axios');
const { PrismaClient } = require('@prisma/client');

// --- Routes ---
const authRoutes        = require('./routes/auth');
const leaderboardRoutes = require('./routes/leaderboard');
const transferRoutes    = require('./routes/transfers');

// --- Services ---
const tacticalFitService = require('./services/tacticalFitService');

// ============================================================
// KHỞI TẠO ỨNG DỤNG
// ============================================================
const app    = express();
const prisma = new PrismaClient();

const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';
const SPORTMONKS_PLAYER_INCLUDE = process.env.SPORTMONKS_PLAYER_INCLUDE ||
  'trophies.league;trophies.season;trophies.trophy;trophies.team;teams.team;statistics.details.type;statistics.team;statistics.season.league;latest.fixture.participants;latest.fixture.league;latest.fixture.scores;latest.details.type;nationality;detailedPosition;metadata.type';

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ============================================================
// KẾT NỐI REDIS (Bảng xếp hạng - O(log N))
// ============================================================
const redisClient = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

// Chỉ log lỗi Redis một lần, tránh spam console
let redisErrorLogged = false;
redisClient.on('error', (err) => {
  if (!redisErrorLogged) {
    console.warn('⚠️  Redis chưa kết nối - Bảng xếp hạng tạm thời không hoạt động.');
    redisErrorLogged = true;
  }
});

redisClient.connect()
  .then(() => {
    redisErrorLogged = false;
    console.log('🔌 Redis Cluster đã kết nối thành công!');
    app.set('redisClient', redisClient);
  })
  .catch(() => {
    console.warn('⚠️  Redis offline - Server vẫn chạy bình thường, chỉ tắt tính năng Leaderboard.');
  });

// ============================================================
// MOUNT ROUTES
// ============================================================
app.use('/api/auth',        authRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/transfers',   transferRoutes);

// ============================================================
// API: Lấy danh sách cầu thủ
// Ưu tiên dữ liệu từ Prisma DB (có dynamic pricing), fallback về backup tĩnh
// ============================================================
const BACKUP_PLAYERS = require('./data/backupPlayers');

app.get('/api/players', async (req, res) => {
  try {
    // Thử lấy từ PostgreSQL (giá có thể đã thay đổi do dynamic pricing)
    const dbPlayers = await prisma.player.findMany({ orderBy: { id: 'asc' } });
    if (dbPlayers.length > 0) {
      return res.json(dbPlayers.map(p => ({
        ...p,
        price: Number(p.currentPrice),
        team_id: p.teamId
      })));
    }
  } catch {
    // DB chưa sẵn sàng - fallback về dữ liệu tĩnh
  }
  // Fallback: giả lập độ trễ mạng 0.5s
  setTimeout(() => res.json(BACKUP_PLAYERS), 500);
});

// ============================================================
// ĐỘNG CƠ BIẾN ĐỘNG GIÁ THỊ TRƯỜNG - Chạy lúc 00:00 mỗi đêm
// Tự động tăng/giảm giá cầu thủ dựa trên cung cầu giao dịch 24h
// ============================================================
cron.schedule('0 0 * * *', async () => {
  console.log('📉 Kích hoạt động cơ điều tiết giá thị trường tự động...');
  try {
    const players = await prisma.player.findMany();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const player of players) {
      const [buyCount, sellCount] = await Promise.all([
        prisma.transaction.count({ where: { type: 'BUY',  playerId: player.id, createdAt: { gte: since24h } } }),
        prisma.transaction.count({ where: { type: 'SELL', playerId: player.id, createdAt: { gte: since24h } } })
      ]);

      const netDemand = buyCount - sellCount;
      // Mỗi đơn vị chênh lệch cung/cầu thay đổi $0.1M
      let priceChange = netDemand * 0.1;
      // Biên độ dao động tối đa $0.3M/ngày để tránh bong bóng tài chính
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
    console.log('✅ Đã cập nhật xong bảng giá mới cho toàn bộ thị trường!');
  } catch (error) {
    console.error('❌ Lỗi cập nhật giá thị trường:', error.message);
  }
});

// ============================================================
// LUỒNG CẬP NHẬT ĐIỂM SỐ THỜI GIAN THỰC VÀO REDIS LEADERBOARD
// ============================================================
async function updateUserLiveScore(userId, pointsAdded) {
  if (!redisClient.isReady) return null;
  const newScore = await redisClient.zIncrBy('global_leaderboard', pointsAdded, userId);
  const rank = await redisClient.zRevRank('global_leaderboard', userId);
  return { newScore: Math.round(newScore), rank: rank + 1 };
}

// ============================================================
// API: HỆ THỐNG MỞ THẺ GACHA (PACK OPENING)
// ============================================================

const getRarity = (price) => {
  if (price >= 11.0) return { tier: 'LEGENDARY', weight: 5,  color: '#f1c40f' }; // ~5%
  if (price >= 8.5)  return { tier: 'EPIC',      weight: 15, color: '#9b59b6' }; // ~15%
  if (price >= 6.0)  return { tier: 'RARE',      weight: 30, color: '#3498db' }; // ~30%
  return                    { tier: 'COMMON',     weight: 50, color: '#bdc3c7' }; // ~50%
};

app.post('/api/gacha/open', (req, res) => {
  const { userId } = req.body;

  // Gắn rarity vào từng cầu thủ
  const pool = BACKUP_PLAYERS.map(p => ({ ...p, rarity: getRarity(p.price) }));

  // Thuật toán Weighted Random
  const totalWeight = pool.reduce((sum, p) => sum + p.rarity.weight, 0);
  let roll = Math.random() * totalWeight;

  let pulledPlayer = pool[pool.length - 1]; // fallback
  for (const player of pool) {
    if (roll < player.rarity.weight) { pulledPlayer = player; break; }
    roll -= player.rarity.weight;
  }

  console.log(`[GACHA] User ${userId || 'anonymous'} vừa quay ra: ${pulledPlayer.name} (${pulledPlayer.rarity.tier})`);

  res.json({
    success: true,
    player: pulledPlayer,
    message: `Chúc mừng! Bạn đã nhận được thẻ ${pulledPlayer.rarity.tier}`
  });
});

// ============================================================
// API: Lấy hồ sơ chi tiết cầu thủ từ Sportmonks
// Ví dụ: /api/players/32695/profile (32695 là Sportmonks player id)
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
      error: 'Thiếu SPORTMONKS_API_TOKEN trong .env'
    });
  }

  if (!includeDepthValid) {
    return res.status(400).json({
      success: false,
      error: 'Include depth vượt quá 3 levels (theo giới hạn endpoint Player).'
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
      return res.status(404).json({ success: false, error: 'Không tìm thấy cầu thủ trên Sportmonks' });
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
      error: 'Không thể lấy profile từ Sportmonks',
      detail
    });
  }
});

// ============================================================
// API: Tactical Fit Analyzer (Algorithm 3, Section 5.4)
// Điểm 0-100 dựa trên vị trí thi đấu + phong cách chiến thuật CLB
// ============================================================
app.get('/api/players/:id/tactical-fit', async (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isFinite(playerId)) {
    return res.status(400).json({ success: false, error: 'ID cầu thủ không hợp lệ.' });
  }

  try {
    let position, teamId;

    const dbPlayer = await prisma.player.findUnique({ where: { id: playerId } });
    if (dbPlayer) {
      position = dbPlayer.position;
      teamId = dbPlayer.teamId;
    } else {
      const fallback = BACKUP_PLAYERS.find(p => p.id === playerId);
      if (!fallback) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy cầu thủ.' });
      }
      position = fallback.position;
      teamId = fallback.team_id;
    }

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
    console.error('[TacticalFit] Lỗi:', error.message);
    res.status(500).json({ success: false, error: 'Không thể tính Tactical Fit.' });
  }
});

// ============================================================
// IDEMPOTENCY CACHE - Chống xử lý trùng eventId từ webhook
// TTL-based, giống mô tả trong tài liệu (TC-038): eventId được
// nhớ trong một khoảng thời gian, quá hạn thì tự động dọn dẹp.
// ============================================================
const EVENT_DEDUP_TTL_MS = 10 * 60 * 1000; // 10 phút
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
// API WEBHOOK: Giả lập Sportmonks bắn sự kiện live
// ============================================================
app.post('/api/webhook/simulate', async (req, res) => {
  const { playerId, action, points, userId, eventId, gameweek } = req.body;

  if (isDuplicateEvent(eventId)) {
    console.log(`[Webhook] Bỏ qua sự kiện trùng lặp: eventId=${eventId}`);
    return res.json({ success: true, message: 'Sự kiện trùng lặp đã bị bỏ qua.', duplicate: true });
  }

  console.log(`[Webhook] Cầu thủ ${playerId} -> ${action} (+${points} pts)`);

  // Chỉ phát tới các client đang xem đúng gameweek này (room-based fan-out),
  // thay vì io.emit toàn cục, để chi phí broadcast tỉ lệ với số client quan
  // tâm chứ không phải tổng số kết nối.
  const room = `gameweek_${gameweek || 1}`;
  io.to(room).emit('LIVE_SCORE_UPDATE', {
    playerId,
    message: `${action}! (+${points} điểm)`,
    pointsAdded: points
  });

  // Cập nhật bảng xếp hạng Redis nếu có userId
  if (userId) {
    const rankData = await updateUserLiveScore(userId, points);
    if (rankData) {
      io.emit('LEADERBOARD_UPDATE', { userId, ...rankData });
    }
  }

  res.json({ success: true, message: 'Đã phát sóng sự kiện qua WebSockets!' });
});

// ============================================================
// SOCKET.IO - Kết nối thời gian thực
// ============================================================
io.on('connection', (socket) => {
  console.log('🟢 Client kết nối:', socket.id);

  socket.on('join_gameweek', (gameweek) => {
    const room = `gameweek_${gameweek || 1}`;
    socket.join(room);
    console.log(`   ↳ ${socket.id} tham gia phòng ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client ngắt kết nối:', socket.id);
  });
});

// ============================================================
// KHỞI ĐỘNG SERVER
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