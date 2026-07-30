const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/authMiddleware');
const tokenService = require('../services/tokenService');

const SALT_ROUNDS = 12;

// 5 attempts per IP per 15 minutes — slows down credential-stuffing/brute-force
// attempts against /login without affecting normal usage.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// 10 accounts per IP per hour — /register has no reason to be hit more often
// than that by a real user, so this caps automated account-creation spam and
// username-enumeration sweeps without ever touching normal signup traffic.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many accounts created from this network. Please try again later.' }
});

// ============================================================
// PER-ACCOUNT LOGIN LOCKOUT (defense-in-depth alongside the per-IP limiter
// above). The IP limiter alone doesn't stop an attacker who rotates IPs or
// spreads attempts across a botnet targeting one specific username — this
// locks *that username* after repeated failures regardless of source IP.
// Uses Redis when available (shared across server instances / restarts);
// falls back to an in-memory Map in the same style as the demo user store.
// Trade-off: an attacker who only knows a valid username can use this to
// lock that user out for LOCKOUT_MINUTES — an accepted, time-boxed cost of
// account lockout, matched to the same 15-minute window as the IP limiter.
// ============================================================
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const LOCKOUT_SECONDS = LOCKOUT_MINUTES * 60;

const inMemoryFailedLogins = new Map(); // usernameKey -> { count, lockedUntil }

function failedLoginKey(username) {
  return `authfail:${String(username).toLowerCase()}`;
}

async function getAccountLockState(req, username) {
  const key = failedLoginKey(username);
  const redisClient = req.app.get('redisClient');

  if (redisClient && redisClient.isReady) {
    const count = parseInt(await redisClient.get(key), 10) || 0;
    return { count, locked: count >= MAX_FAILED_LOGINS };
  }

  const entry = inMemoryFailedLogins.get(key);
  if (!entry) return { count: 0, locked: false };
  if (Date.now() > entry.lockedUntil && entry.count >= MAX_FAILED_LOGINS) {
    inMemoryFailedLogins.delete(key); // lockout window elapsed -> reset
    return { count: 0, locked: false };
  }
  return { count: entry.count, locked: entry.count >= MAX_FAILED_LOGINS };
}

async function recordFailedLogin(req, username) {
  const key = failedLoginKey(username);
  const redisClient = req.app.get('redisClient');

  if (redisClient && redisClient.isReady) {
    const count = await redisClient.incr(key);
    await redisClient.expire(key, LOCKOUT_SECONDS); // renews TTL each failure -> sliding lockout
    return count;
  }

  const entry = inMemoryFailedLogins.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  entry.lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
  inMemoryFailedLogins.set(key, entry);
  return entry.count;
}

async function clearFailedLogins(req, username) {
  const key = failedLoginKey(username);
  const redisClient = req.app.get('redisClient');
  if (redisClient && redisClient.isReady) {
    await redisClient.del(key);
  } else {
    inMemoryFailedLogins.delete(key);
  }
}

// ============================================================
// PASSWORD POLICY
// ============================================================
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', 'qwertyui',
  'qwerty123', '11111111', 'abc12345', 'letmein1', 'iloveyou'
]);

function passwordPolicyError(password) {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  // bcrypt silently ignores bytes beyond 72 — longer inputs give a false
  // sense of extra strength while actually only using the first 72 bytes.
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be 72 characters or fewer.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) return 'This password is too common. Please choose a stronger one.';
  return null;
}

// ============================================================
// Prisma connection (PostgreSQL). If the DB isn't available, fall back to
// an in-memory store so the auth flow can be demoed without a DB installed.
// ============================================================
let prisma = null;
let useInMemory = false;

// In-memory store (only used when the DB isn't ready)
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
    console.warn('[Auth] PostgreSQL not connected → Using the In-Memory Store (demo only).');
    return false;
  }
}

// ================================================================
// POST /api/auth/register
// ================================================================
router.post('/register', registerLimiter, async (req, res) => {
  let { username, password } = req.body;
  username = typeof username === 'string' ? username.trim() : username;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Please enter both a username and a password.' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ success: false, error: 'Username must be between 3 and 30 characters.' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ success: false, error: 'Username can only contain letters, numbers, and underscores.' });
  }
  const pwdError = passwordPolicyError(password);
  if (pwdError) {
    return res.status(400).json({ success: false, error: pwdError });
  }

  try {
    const dbAvailable = await checkDbAvailable();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    if (dbAvailable) {
      // --- PostgreSQL path ---
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        return res.status(409).json({ success: false, error: 'This username is already taken. Please choose another.' });
      }
      const user = await prisma.user.create({
        data: { username, passwordHash },
        select: { id: true, username: true, virtualBalance: true, penaltyPoints: true }
      });
      const token = tokenService.signAccessToken(user.id, user.username);
      await tokenService.issueRefreshToken(prisma, res, { dbAvailable: true, userId: user.id });
      console.log(`[Auth] New account (DB): "${user.username}"`);
      return res.status(201).json({
        success: true,
        message: `Welcome ${user.username} to Super League Fantasy!`,
        token,
        user: { id: user.id, username: user.username, virtualBalance: Number(user.virtualBalance), penaltyPoints: user.penaltyPoints }
      });
    }

    // --- In-Memory path (Demo mode) ---
    if (inMemoryUsers.has(username)) {
      return res.status(409).json({ success: false, error: 'This username is already taken. Please choose another.' });
    }
    const userId = `mem_${Date.now()}`;
    // 100.0 matches the real scale of Player.currentPrice (see migration
    // 20260724140000_fix_virtual_balance_scale) — do NOT use 10.0 anymore.
    inMemoryUsers.set(username, { id: userId, username, passwordHash, virtualBalance: 100.0, penaltyPoints: 0 });
    const token = tokenService.signAccessToken(userId, username);
    await tokenService.issueRefreshToken(prisma, res, { dbAvailable: false, userId, memUser: inMemoryUsers.get(username) });
    console.log(`[Auth] New account (In-Memory): "${username}"`);
    res.status(201).json({
      success: true,
      message: `Welcome ${username} to Super League Fantasy! (Demo Mode - data will be lost on server restart)`,
      token,
      user: { id: userId, username, virtualBalance: 100.0, penaltyPoints: 0 }
    });
  } catch (error) {
    console.error('[Auth/Register] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
  }
});

// ================================================================
// POST /api/auth/login
// ================================================================
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Please enter both a username and a password.' });
  }

  const WRONG_CRED_MSG = 'Incorrect username or password.';
  const LOCKED_MSG = `Too many failed login attempts for this account. Please try again in ${LOCKOUT_MINUTES} minutes.`;

  try {
    // Per-account lockout check (in addition to the per-IP loginLimiter above).
    const lockState = await getAccountLockState(req, username);
    if (lockState.locked) {
      return res.status(429).json({ success: false, error: LOCKED_MSG });
    }

    const dbAvailable = await checkDbAvailable();

    if (dbAvailable) {
      // --- PostgreSQL path ---
      const user = await prisma.user.findUnique({ where: { username } });
      // A null passwordHash means this username belongs to an OAuth-only
      // account (routes/oauth.js) — there's no password to check against.
      // Still runs the dummy bcrypt.compare first so a request against a
      // real OAuth-only username takes the same time as a truly unknown
      // username, rather than returning early and leaking which is which.
      if (!user || !user.passwordHash) {
        await bcrypt.compare(password, '$2b$12$invalidhashtopreventtimingattack12345678');
        await recordFailedLogin(req, username);
        return res.status(401).json({ success: false, error: WRONG_CRED_MSG });
      }
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        await recordFailedLogin(req, username);
        return res.status(401).json({ success: false, error: WRONG_CRED_MSG });
      }
      await clearFailedLogins(req, username);

      const token = tokenService.signAccessToken(user.id, user.username);
      await tokenService.issueRefreshToken(prisma, res, { dbAvailable: true, userId: user.id });
      console.log(`[Auth] Login (DB): "${user.username}"`);
      return res.json({
        success: true,
        message: `Login successful! Welcome back, ${user.username}!`,
        token,
        user: { id: user.id, username: user.username, virtualBalance: Number(user.virtualBalance), penaltyPoints: user.penaltyPoints }
      });
    }

    // --- In-Memory path ---
    const user = inMemoryUsers.get(username);
    if (!user) {
      await bcrypt.compare(password, '$2b$12$invalidhashtopreventtimingattack12345678');
      await recordFailedLogin(req, username);
      return res.status(401).json({ success: false, error: WRONG_CRED_MSG });
    }
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await recordFailedLogin(req, username);
      return res.status(401).json({ success: false, error: WRONG_CRED_MSG });
    }
    await clearFailedLogins(req, username);

    const token = tokenService.signAccessToken(user.id, user.username);
    await tokenService.issueRefreshToken(prisma, res, { dbAvailable: false, userId: user.id, memUser: user });
    console.log(`[Auth] Login (In-Memory): "${user.username}"`);
    res.json({
      success: true,
      message: `Login successful! Welcome back, ${user.username}!`,
      token,
      user: { id: user.id, username: user.username, virtualBalance: user.virtualBalance, penaltyPoints: user.penaltyPoints }
    });
  } catch (error) {
    console.error('[Auth/Login] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
  }
});

// ================================================================
// GET /api/auth/me  (Requires a valid JWT)
// Fetches the current player's profile info from the DB
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
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }

    res.json({
      success: true,
      user: {
        ...user,
        virtualBalance: Number(user.virtualBalance)
      }
    });
  } catch (error) {
    console.error('[Auth/Me] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ================================================================
// POST /api/auth/refresh — reads the httpOnly refreshToken cookie, verifies
// it against the hash stored server-side, and rotates it. Rejects a token
// that fails signature/expiry verification OR whose hash no longer matches
// (i.e. it was already rotated out or revoked by a logout) — the mismatch
// case is what actually makes rotation meaningful rather than cosmetic.
// ================================================================
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ success: false, error: 'No refresh token provided.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    res.clearCookie('refreshToken', { path: '/api/auth' });
    return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
  }

  const incomingHash = tokenService.hashToken(payload.jti);

  try {
    const dbAvailable = await checkDbAvailable();

    if (dbAvailable) {
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      const stillValid = user && user.refreshTokenHash === incomingHash &&
        user.refreshTokenExpiresAt && user.refreshTokenExpiresAt > new Date();
      if (!stillValid) {
        res.clearCookie('refreshToken', { path: '/api/auth' });
        return res.status(401).json({ success: false, error: 'Refresh token is no longer valid. Please log in again.' });
      }

      await tokenService.issueRefreshToken(prisma, res, { dbAvailable: true, userId: user.id });
      const accessToken = tokenService.signAccessToken(user.id, user.username);
      return res.json({ success: true, token: accessToken });
    }

    // --- In-Memory path ---
    const memUser = [...inMemoryUsers.values()].find(u => u.id === payload.userId);
    const stillValid = memUser && memUser.refreshTokenHash === incomingHash &&
      memUser.refreshTokenExpiresAt && memUser.refreshTokenExpiresAt > new Date();
    if (!stillValid) {
      res.clearCookie('refreshToken', { path: '/api/auth' });
      return res.status(401).json({ success: false, error: 'Refresh token is no longer valid. Please log in again.' });
    }

    await tokenService.issueRefreshToken(prisma, res, { dbAvailable: false, userId: memUser.id, memUser });
    const accessToken = tokenService.signAccessToken(memUser.id, memUser.username);
    res.json({ success: true, token: accessToken });
  } catch (error) {
    console.error('[Auth/Refresh] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ================================================================
// POST /api/auth/logout — revokes the refresh token server-side (so it
// can't be used again even if it leaked) and clears the cookie. Always
// clears the cookie and returns success even if the token was already
// invalid/expired, since the end state the caller wants (logged out) is
// reached either way.
// ================================================================
router.post('/logout', async (req, res) => {
  const token = req.cookies?.refreshToken;
  res.clearCookie('refreshToken', { path: '/api/auth' });
  if (!token) return res.json({ success: true });

  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const dbAvailable = await checkDbAvailable();

    if (dbAvailable) {
      await prisma.user.update({
        where: { id: payload.userId },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null }
      }).catch(() => {}); // user may not exist anymore — logout should still succeed
    } else {
      const memUser = [...inMemoryUsers.values()].find(u => u.id === payload.userId);
      if (memUser) {
        memUser.refreshTokenHash = null;
        memUser.refreshTokenExpiresAt = null;
      }
    }
  } catch {
    // Invalid/expired token — nothing to revoke, cookie is already cleared above.
  }

  res.json({ success: true });
});

module.exports = router;
