// ============================================================
// Shared access-token (JWT) + refresh-token-cookie logic. Used by BOTH
// routes/auth.js (username/password) and routes/oauth.js (Google/Facebook/X)
// so every login path — regardless of how the user authenticated — ends up
// issuing an identical session, and a security fix here only has to be made
// once.
// ============================================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const KNOWN_WEAK_SECRETS = new Set([
  'super_league_fantasy_jwt_secret_key_change_this_in_prod_2026',
  'REPLACE_ME_WITH_A_GENERATED_RANDOM_SECRET',
  'REPLACE_ME_WITH_A_DIFFERENT_GENERATED_RANDOM_SECRET',
  'secret', 'changeme', ''
]);

// Refuse to run auth with a missing/weak/default secret — see routes/auth.js's
// original comment: a placeholder checked into .env.example AND left
// unchanged in a real .env lets anyone who reads the public repo forge
// valid tokens for any user. Fail loudly instead, once, at module load.
function assertStrongSecret(envVarName) {
  const value = process.env[envVarName];
  if (!value || value.length < 32 || KNOWN_WEAK_SECRETS.has(value)) {
    throw new Error(
      `[Auth] ${envVarName} is missing, too short, or a known placeholder. ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))" ' +
      'and set it in .env before starting the server.'
    );
  }
}

assertStrongSecret('JWT_SECRET');
assertStrongSecret('JWT_REFRESH_SECRET');
if (process.env.JWT_REFRESH_SECRET === process.env.JWT_SECRET) {
  throw new Error('[Auth] JWT_REFRESH_SECRET must be different from JWT_SECRET (separate signing keys per token type).');
}

// The JWT only serves as an "absolute safety ceiling" for the token — the
// real UX rule (log in again every time the site is opened, EXCEPT when
// reopened within 30 minutes of closing it) is enforced on the client side
// (super-league-fantasy/src/store.js, the SESSION EXPIRY block).
const JWT_EXPIRES_IN = '1d';

// Refresh token: rotated on every use (routes/auth.js's /refresh) — a
// stolen-but-unused refresh token becomes worthless the next time the
// legitimate client refreshes, since reuse of an already-rotated token is
// rejected outright rather than silently accepted.
const REFRESH_TOKEN_EXPIRES_IN = '30d';
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function refreshCookieOptions() {
  // In production the frontend (Vercel) and backend (Render) live on two
  // different origins, so this is a genuinely cross-site request from the
  // browser's point of view. SameSite=Strict (and even Lax) is NEVER sent on
  // a cross-site fetch/XHR, which would silently break login persistence and
  // /auth/refresh the moment this API is deployed off localhost — SameSite=
  // None is required for a cross-origin cookie, and browsers reject None
  // without Secure, which is why the two are set together here rather than
  // independently.
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    path: '/api/auth' // only sent back to auth endpoints, not the whole API
  };
}

function signAccessToken(userId, username) {
  return jwt.sign({ userId, username }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Signs a fresh refresh token, persists only its hash (DB row or in-memory
// user object — whichever store is active), and sets the cookie on `res`.
// `prisma` is passed in rather than imported here so this module has no
// opinion on which PrismaClient instance (or in-memory fallback) is active.
async function issueRefreshToken(prisma, res, { dbAvailable, userId, memUser }) {
  const jti = crypto.randomBytes(32).toString('hex');
  const refreshToken = jwt.sign({ userId, jti }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
  const refreshTokenHash = hashToken(jti);
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);

  if (dbAvailable) {
    await prisma.user.update({ where: { id: userId }, data: { refreshTokenHash, refreshTokenExpiresAt } });
  } else if (memUser) {
    memUser.refreshTokenHash = refreshTokenHash;
    memUser.refreshTokenExpiresAt = refreshTokenExpiresAt;
  }

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
}

module.exports = {
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_MAX_AGE_MS,
  hashToken,
  refreshCookieOptions,
  signAccessToken,
  issueRefreshToken
};
