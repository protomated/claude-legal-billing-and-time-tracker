import { OAuth2Client } from 'google-auth-library';
import { createServer } from 'http';
import open from 'open';
import { loadTokens, saveTokens } from './config.js';

// Installed-app OAuth credentials — replace before publishing.
const CLIENT_ID = '738755550160-jvo6u3n2jko9l3bmus9gc70926k7jdph.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

// Register http://localhost:8085/oauth/callback in your Google Cloud OAuth client.
const REDIRECT_PORT = 8085;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/callback`;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export function buildClient() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export async function getAuthClient() {
  const tokens = loadTokens();
  if (!tokens) return null;

  const client = buildClient();
  client.setCredentials(tokens);
  client.on('tokens', (updated) => saveTokens({ ...tokens, ...updated }));
  return client;
}

export async function authenticate() {
  const client = buildClient();

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname !== '/oauth/callback') { res.end(); return; }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (error) {
        res.end('<html><body><h2>Access denied. Close this tab and try again.</h2></body></html>');
        server.close();
        reject(new Error(`OAuth denied: ${error}`));
        return;
      }

      res.end('<html><body><h2>Connected! You can close this tab.</h2></body></html>');
      server.close();

      try {
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        saveTokens(tokens);
        client.on('tokens', (updated) => saveTokens({ ...tokens, ...updated }));
        resolve(client);
      } catch (err) {
        reject(err);
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${REDIRECT_PORT} is in use. Close other applications using that port and try again.`));
      } else {
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      open(authUrl).catch(() => {});
    });

    // 5-minute timeout
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out. Please try again.'));
    }, 5 * 60 * 1000);
  });
}
