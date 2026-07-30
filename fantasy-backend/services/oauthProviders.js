// ============================================================
// Per-provider OAuth 2.0 config for "Continue with Google/Facebook/X".
// routes/oauth.js implements ONE generic Authorization Code (+ PKCE)
// handler parameterized by these configs, rather than three separate
// hand-copied flows — the redirect/state/token-exchange shape is identical
// across providers, only the URLs and profile-response fields differ.
// ============================================================
const axios = require('axios');

const PROVIDERS = {
  google: {
    label: 'Google',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    usesPkce: true,
    tokenAuthStyle: 'body',
    async fetchProfile(accessToken) {
      const { data } = await axios.get('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      return { providerId: data.sub, displayName: data.name || data.email, avatarUrl: data.picture || null };
    }
  },

  facebook: {
    label: 'Facebook',
    clientIdEnv: 'FACEBOOK_APP_ID',
    clientSecretEnv: 'FACEBOOK_APP_SECRET',
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scope: 'public_profile',
    usesPkce: false, // Facebook's OAuth implementation doesn't support PKCE
    tokenAuthStyle: 'body',
    async fetchProfile(accessToken) {
      const { data } = await axios.get('https://graph.facebook.com/me', {
        params: { fields: 'id,name,picture', access_token: accessToken }
      });
      return { providerId: data.id, displayName: data.name, avatarUrl: data.picture?.data?.url || null };
    }
  },

  twitter: {
    label: 'X',
    clientIdEnv: 'TWITTER_CLIENT_ID',
    clientSecretEnv: 'TWITTER_CLIENT_SECRET',
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'tweet.read users.read',
    usesPkce: true, // PKCE is mandatory on X's OAuth 2.0 user-context flow
    tokenAuthStyle: 'basic', // confidential client -> HTTP Basic client_id:client_secret
    async fetchProfile(accessToken) {
      const { data } = await axios.get('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { 'user.fields': 'profile_image_url' }
      });
      return { providerId: data.data.id, displayName: data.data.username, avatarUrl: data.data.profile_image_url || null };
    }
  }
};

// Which User column stores each provider's stable account ID.
const PROVIDER_ID_FIELD = {
  google: 'googleId',
  facebook: 'facebookId',
  twitter: 'twitterId'
};

module.exports = { PROVIDERS, PROVIDER_ID_FIELD };
