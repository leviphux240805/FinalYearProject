const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/authMiddleware');

const SALT_ROUNDS = 12;

// ============================================================
// Kết nối Prisma (PostgreSQL). Nếu DB không có, fallback sang
// In-Memory Store để demo Auth flow mà không cần cài DB.
// ============================================================
let prisma = null;
let useInMemory = false;

// In-memory store (chỉ dùng khi DB chưa sẵn sàng)
const inMemoryUsers = new Map(); // username -> { id, username, passwordHash, virtualBalance, penaltyPoints }

try {
  prisma = new PrismaClient();
} catch {
  useInMemory = true;
}

async function checkDbAvailable() {
  if (useInMemory) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    useInMemory = true;
    console.warn('[Auth] PostgreSQL chưa kết nối → Đang dùng In-Memory Store (chỉ dành cho demo).');
    return false;
  }
}

// ================================================================
// POST /api/auth/register
// ================================================================
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ success: false, error: 'Tên đăng nhập phải từ 3 đến 30 ký tự.' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ success: false, error: 'Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Mật khẩu phải có ít nhất 8 ký tự.' });
  }

  try {
    const dbAvailable = await checkDbAvailable();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    if (dbAvailable) {
      // --- Đường dẫn PostgreSQL ---
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        return res.status(409).json({ success: false, error: 'Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.' });
      }
      const user = await prisma.user.create({
        data: { username, passwordHash },
        select: { id: true, username: true, virtualBalance: true, penaltyPoints: true }
      });
      const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
      console.log(`[Auth] Tài khoản mới (DB): "${user.username}"`);
      return res.status(201).json({
        success: true,
        message: `Chào mừng ${user.username} đến với Super League Fantasy!`,
        token,
        user: { id: user.id, username: user.username, virtualBalance: Number(user.virtualBalance), penaltyPoints: user.penaltyPoints }
      });
    }

    // --- Đường dẫn In-Memory (Demo mode) ---
    if (inMemoryUsers.has(username)) {
      return res.status(409).json({ success: false, error: 'Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.' });
    }
    const userId = `mem_${Date.now()}`;
    inMemoryUsers.set(username, { id: userId, username, passwordHash, virtualBalance: 10.0, penaltyPoints: 0 });
    const token = jwt.sign({ userId, username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    console.log(`[Auth] Tài khoản mới (In-Memory): "${username}"`);
    res.status(201).json({
      success: true,
      message: `Chào mừng ${username} đến với Super League Fantasy! (Demo Mode - dữ liệu sẽ mất khi restart server)`,
      token,
      user: { id: userId, username, virtualBalance: 10.0, penaltyPoints: 0 }
    });
  } catch (error) {
    console.error('[Auth/Register] Lỗi:', error.message);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
});

// ================================================================
// POST /api/auth/login
// ================================================================
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' });
  }

  const WRONG_CRED_MSG = 'Tên đăng nhập hoặc mật khẩu không chính xác.';

  try {
    const dbAvailable = await checkDbAvailable();

    if (dbAvailable) {
      // --- Đường dẫn PostgreSQL ---
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        await bcrypt.compare(password, '$2b$12$invalidhashtopreventtimingattack12345678');
        return res.status(401).json({ success: false, error: WRONG_CRED_MSG });
      }
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) return res.status(401).json({ success: false, error: WRONG_CRED_MSG });

      const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
      console.log(`[Auth] Đăng nhập (DB): "${user.username}"`);
      return res.json({
        success: true,
        message: `Đăng nhập thành công! Chào mừng trở lại, ${user.username}!`,
        token,
        user: { id: user.id, username: user.username, virtualBalance: Number(user.virtualBalance), penaltyPoints: user.penaltyPoints }
      });
    }

    // --- Đường dẫn In-Memory ---
    const user = inMemoryUsers.get(username);
    if (!user) {
      await bcrypt.compare(password, '$2b$12$invalidhashtopreventtimingattack12345678');
      return res.status(401).json({ success: false, error: WRONG_CRED_MSG });
    }
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ success: false, error: WRONG_CRED_MSG });

    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    console.log(`[Auth] Đăng nhập (In-Memory): "${user.username}"`);
    res.json({
      success: true,
      message: `Đăng nhập thành công! Chào mừng trở lại, ${user.username}!`,
      token,
      user: { id: user.id, username: user.username, virtualBalance: user.virtualBalance, penaltyPoints: user.penaltyPoints }
    });
  } catch (error) {
    console.error('[Auth/Login] Lỗi:', error.message);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
});

// ================================================================
// GET /api/auth/me  (Yêu cầu JWT hợp lệ)
// Lấy thông tin profile người chơi hiện tại từ DB
// ================================================================
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        virtualBalance: true,
        penaltyPoints: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });
    }

    res.json({
      success: true,
      user: {
        ...user,
        virtualBalance: Number(user.virtualBalance)
      }
    });
  } catch (error) {
    console.error('[Auth/Me] Lỗi:', error.message);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ.' });
  }
});

module.exports = router;
