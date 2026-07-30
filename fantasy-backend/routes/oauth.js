// ============================================================
// "Continue with Google / Facebook / X" — a generic OAuth 2.0 Authorization
// Code (+ PKCE) flow shared by all three providers (services/oauthProviders.js
// holds what differs between them). Mounted at /api/auth alongside
// routes/auth.js, so the final routes are:
//   GET /api/auth/:provider           (start — redirects to the provider)
//   GET /api/auth/:provider/callback  (provider redirects back here)
//
// This is NOT an XHR/fetch flow — both routes are real browser navigations,
// because OAuth requires the user's actual browser to visit the provider
// and log in there. The callback hands off to the exact same session
// mechanism as password login (services/tokenService.js) so the rest of
// the app can't tell an OAuth session from a password one.
//
// OAuth-only accounts require PostgreSQL (unlike routes/auth.js's
// username/password flow, there is no in-memory demo fallback here) —
// there's no password to reconstruct identity from, so persistence is a
// hard requirement, not a nice-to-have.
// ============================================================
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const tokenService = require('../services/tokenService');
const { PROVIDERS, PROVIDER_ID_FIELD } = require('../services/oauthProviders');

const prisma = new PrismaClient();

const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')[0]
  .trim();

// 20 attempts per IP per 15 minutes — an OAuth login involves 2 round trips
// through this server per attempt, so this is looser than the password
// loginLimiter but still caps abuse of the provider-redirect endpoints.
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// ============================================================
// PENDING OAUTH STATE — short-lived, single-use, in-memory (same TTL-map
// idiom as server.js's webhook idempotency cache / auth.js's login-lockout
// fallback). Ties the CSRF `state` value to the PKCE `codeVerifier` between
// the /:provider redirect-out and the /:provider/callback redirect-in,
// without needing server-side session middleware.
// ============================================================
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // plenty for a login, short enough to bound memory
const pendingOAuthStates = new Map(); // state -> { provider, codeVerifier, createdAt }

function sweepExpiredStates() {
  const now = Date.now();
  for (const [state, entry] of pendingOAuthStates) {
    if (now - entry.createdAt > OAUTH_STATE_TTL_MS) pendingOAuthStates.delete(state);
  }
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function callbackUrlFor(req, provider) {
  const base = process.env.OAUTH_CALLBACK_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/auth/${provider}/callback`;
}

// Turns an OAuth display name/handle into a valid, unique app username
// (matches the same charset/length rules routes/auth.js enforces at
// registration: 3-30 chars, letters/numbers/underscore only).
async function generateUniqueUsername(seed) {
  let base = String(seed || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 20);
  if (base.length < 3) base = `${base}player`.slice(0, 20);

  let candidate = base;
  let suffix = 0;
  // eslint-disable-next-line no-await-in-loop -- sequential by design: each
  // check depends on the previous candidate having been found taken.
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 30);
  }
  return candidate;
}

// ================================================================
// GET /api/auth/:provider — redirects to the provider's consent screen.
// ================================================================
router.get('/:provider', oauthLimiter, (req, res) => {
  const providerName = req.params.provider;
  const provider = PROVIDERS[providerName];
  if (!provider) {
    return res.status(404).json({ success: false, error: 'Unknown login provider.' });
  }

  const clientId = process.env[provider.clientIdEnv];
  if (!clientId) {
    return res.status(503).json({ success: false, error: `${provider.label} login is not configured on this server yet.` });
  }

  sweepExpiredStates();
  const state = crypto.randomBytes(24).toString('hex');
  const codeVerifier = base64url(crypto.randomBytes(32));
  pendingOAuthStates.set(state, { provider: providerName, codeVerifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrlFor(req, providerName),
    response_type: 'code',
    scope: provider.scope,
    state
  });

  if (provider.usesPkce) {
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  res.redirect(`${provider.authorizeUrl}?${params.toString()}`);
});

// ================================================================
// GET /api/auth/:provider/callback — the provider redirects the browser
// back here with ?code&state. On success, redirects to the frontend with a
// short-lived access token in the URL; the frontend exchanges it for the
// full user profile via GET /api/auth/me (store.js's OAuth-callback
// handling) rather than trusting anything else carried in the URL itself.
// ================================================================
router.get('/:provider/callback', oauthLimiter, async (req, res) => {
  const providerName = req.params.provider;
  const provider = PROVIDERS[providerName];
  if (!provider) return res.status(404).send('Unknown login provider.');

  const failRedirect = (message) =>
    res.redirect(`${FRONTEND_ORIGIN}/?oauth_error=${encodeURIComponent(message)}`);

  const { code, state, error: providerError } = req.query;
  if (providerError) return failRedirect(`${provider.label} login was cancelled.`);
  if (!code || !state) return failRedirect('Login failed. Please try again.');

  const pending = pendingOAuthStates.get(state);
  if (!pending || pending.provider !== providerName) {
    return failRedirect('Login session expired or invalid. Please try again.');
  }
  pendingOAuthStates.delete(state); // single-use, whether or not the rest succeeds

  try {
    const clientId = process.env[provider.clientIdEnv];
    const clientSecret = process.env[provider.clientSecretEnv];

    const tokenParams = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrlFor(req, providerName),
      code_verifier: pending.codeVerifier
    };

    const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (provider.tokenAuthStyle === 'basic') {
      tokenHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
      tokenParams.client_id = clientId;
      tokenParams.client_secret = clientSecret;
    }

    const tokenRes = await axios.post(provider.tokenUrl, new URLSearchParams(tokenParams).toString(), { headers: tokenHeaders });
    const providerAccessToken = tokenRes.data.access_token;
    const profile = await provider.fetchProfile(providerAccessToken);

    const idField = PROVIDER_ID_FIELD[providerName];
    let user = await prisma.user.findUnique({ where: { [idField]: profile.providerId } });

    if (!user) {
      const username = await generateUniqueUsername(profile.displayName);
      user = await prisma.user.create({
        data: {
          username,
          passwordHash: null,
          authProvider: providerName,
          [idField]: profile.providerId,
          avatarUrl: profile.avatarUrl
        }
      });
      console.log(`[OAuth] New account (${providerName}): "${user.username}"`);
    } else {
      console.log(`[OAuth] Login (${providerName}): "${user.username}"`);
    }

    const accessToken = tokenService.signAccessToken(user.id, user.username);
    await tokenService.issueRefreshToken(prisma, res, { dbAvailable: true, userId: user.id });

    res.redirect(`${FRONTEND_ORIGIN}/?oauth_token=${encodeURIComponent(accessToken)}`);
  } catch (error) {
    console.error(`[OAuth/${providerName}] Error:`, error.response?.data || error.message);
    failRedirect('Login failed. Please try again.');
  }
});

module.exports = router;
