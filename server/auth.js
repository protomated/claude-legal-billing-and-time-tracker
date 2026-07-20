import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';
import { getUser, saveUser } from './db.js';

// Web application OAuth credentials — requires a separate OAuth client from the Desktop app
// client used in plugin/server/auth.js. Create one at Google Cloud Console → Credentials →
// OAuth client ID → Web application, then add ${SERVER_URL}/oauth/callback as a redirect URI.
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '[WEB_GOOGLE_CLIENT_ID]';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '[WEB_GOOGLE_CLIENT_SECRET]';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'openid',
  'email',
  'profile',
];

const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
export const REDIRECT_URI = `${SERVER_URL}/oauth/callback`;

function buildClient() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(state) {
  return buildClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  });
}

// Exchange code for tokens, return { client, sub, email }.
export async function handleOAuthCallback(code) {
  const client = buildClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const res = await client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
  const { sub, email } = res.data;

  await saveUser(sub, { tokens, email });
  client.on('tokens', async (updated) => {
    const u = await getUser(sub);
    if (u) await saveUser(sub, { tokens: { ...u.tokens, ...updated } });
  });

  return { client, sub, email };
}

// Build an authenticated client for an attorney identified by their Google sub.
export async function getAuthClient(sub) {
  const user = await getUser(sub);
  if (!user?.tokens) return null;
  const client = buildClient();
  client.setCredentials(user.tokens);
  client.on('tokens', async (updated) => {
    const u = await getUser(sub);
    if (u) await saveUser(sub, { tokens: { ...u.tokens, ...updated } });
  });
  return client;
}
