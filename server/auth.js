import { OAuth2Client } from 'google-auth-library';
import { getUser, updateUser } from './db.js';

// Web application OAuth credentials — requires a separate OAuth client from the Desktop app
// client used in plugin/server/auth.js. Create one at Google Cloud Console → Credentials →
// OAuth client ID → Web application, then add ${SERVER_URL}/oauth/callback as a redirect URI.
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '[WEB_GOOGLE_CLIENT_ID]';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '[WEB_GOOGLE_CLIENT_SECRET]';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
export const REDIRECT_URI = `${SERVER_URL}/oauth/callback`;

function buildClient() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(apiKey) {
  return buildClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: apiKey,
  });
}

export async function getAuthClient(apiKey) {
  const user = getUser(apiKey);
  if (!user?.tokens) return null;
  const client = buildClient();
  client.setCredentials(user.tokens);
  client.on('tokens', (updated) =>
    updateUser(apiKey, { tokens: { ...user.tokens, ...updated } })
  );
  return client;
}

export async function handleOAuthCallback(code, apiKey) {
  const client = buildClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  updateUser(apiKey, { tokens });
  client.on('tokens', (updated) => {
    const u = getUser(apiKey);
    if (u) updateUser(apiKey, { tokens: { ...u.tokens, ...updated } });
  });
  return client;
}
