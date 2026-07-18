import 'dotenv/config';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const connectGoogleHtml = readFileSync(join(__dirname, 'connect-google.html'), 'utf8');
const CONNECT_GOOGLE_URI = 'ui://legal-billing/connect-google';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getUser, saveUser } from './db.js';
import { getAuthUrl, getAuthClient, handleOAuthCallback, REDIRECT_URI } from './auth.js';
import { logTime, markBilled, markPaid, addTrustEntry, getDashboard, listClients, getClientSummary } from '../plugin/server/sheets.js';

const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;

// ── In-memory session store: sessionId → Google sub ─────────────────────────
// Sessions are intentionally in-memory — attorneys re-auth when they start a
// new Claude conversation, which triggers Google's one-click "Sign in as you"
// flow (no password re-entry if already logged in).
const sessions = new Map(); // sessionId → sub

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'connect_google',
    description:
      'Show the Google connection UI, or re-authenticate when other tools return an auth error. ' +
      'Call with check_only: true to verify status silently; call without arguments to open the sign-in panel. ' +
      'Always call this first if another tool returns an auth error.',
    inputSchema: {
      type: 'object',
      properties: {
        check_only: { type: 'boolean', description: 'If true, return status without opening the sign-in panel.' },
      },
    },
    _meta: {
      ui: { resourceUri: CONNECT_GOOGLE_URI },
    },
  },
  {
    name: 'set_spreadsheet_url',
    description:
      'Save the attorney\'s Google Sheet URL. Call this when the attorney shares a Google Sheets URL ' +
      'during setup. The URL must contain "docs.google.com/spreadsheets".',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'Full Google Sheets URL from the browser address bar.' },
      },
    },
  },
  {
    name: 'log_time',
    description:
      'Append a billable time entry to the Time Tracker tab. ' +
      'After reporting success, always append: "⚠️ Not legal advice — review before sending to client." ' +
      'Ask for rate if not given. Default date to today. Ask for matterType using exactly this list if missing: ' +
      'Litigation, Family Law, Estate, Criminal, Corporate, Immigration, Real Estate, Small Business.',
    inputSchema: {
      type: 'object',
      required: ['clientName', 'hours', 'rate', 'date'],
      properties: {
        clientName:  { type: 'string' },
        matterName:  { type: 'string' },
        matterType:  {
          type: 'string',
          enum: ['Litigation', 'Family Law', 'Estate', 'Criminal', 'Corporate', 'Immigration', 'Real Estate', 'Small Business'],
        },
        description: { type: 'string' },
        hours:       { type: 'number', description: 'Decimal hours. Never zero or negative.' },
        rate:        { type: 'number', description: 'Dollars per hour. No $ sign.' },
        date:        { type: 'string', description: 'YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'mark_billed',
    description:
      'Mark all Unbilled entries for a client as Billed and set today as invoice date. ' +
      'After success, always append: "⚠️ Not legal advice — review before sending to client."',
    inputSchema: {
      type: 'object',
      required: ['clientName'],
      properties: { clientName: { type: 'string' } },
    },
  },
  {
    name: 'mark_paid',
    description:
      'Mark all Billed entries for a client as Paid. ' +
      'IMPORTANT: Before calling this tool, state exactly what will change ' +
      '("I will mark all billed entries for [client] as Paid") and wait for explicit confirmation. ' +
      'Do not call this tool until the attorney confirms.',
    inputSchema: {
      type: 'object',
      required: ['clientName'],
      properties: { clientName: { type: 'string' } },
    },
  },
  {
    name: 'add_trust_entry',
    description:
      'Append a trust account deposit or withdrawal. ' +
      'CRITICAL: Never put a withdrawal amount in the deposit field or vice versa. ' +
      'Deposits: retainer received, funds in, advance. ' +
      'Withdrawals: filing fee, disbursement, funds out, refund. ' +
      'Never submit $0 or negative amounts. ' +
      'For withdrawals over $10,000, confirm before calling. ' +
      'After success, always append: "⚠️ Not legal advice — review against your state bar\'s trust-accounting rules."',
    inputSchema: {
      type: 'object',
      required: ['clientName', 'date'],
      properties: {
        clientName:  { type: 'string' },
        matterName:  { type: 'string' },
        description: { type: 'string' },
        deposit:     { type: 'number', description: 'Amount received into trust. Use 0 for withdrawals.' },
        withdrawal:  { type: 'number', description: 'Amount paid out of trust. Use 0 for deposits.' },
        date:        { type: 'string', description: 'YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'get_dashboard',
    description: 'Read the Dashboard tab and return the billing summary (total hours, fees billed, collected, unpaid).',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── MCP server factory ───────────────────────────────────────────────────────

function createMCPServer(sessionIdRef) {
  const server = new Server(
    { name: 'legal-billing', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  const text = (t) => ({ content: [{ type: 'text', text: String(t) }] });
  const err  = (t) => ({ content: [{ type: 'text', text: String(t) }], isError: true });

  function getSessionSub() {
    return sessions.get(sessionIdRef.current);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const sub  = getSessionSub();
    const user = sub ? getUser(sub) : null;

    try {
      // ── connect_google ──────────────────────────────────────────────────
      if (name === 'connect_google') {
        if (args.check_only) {
          return text(sub && user?.tokens ? 'connected' : 'not_connected');
        }
        const sessionId = sessionIdRef.current;
        if (!sessionId) return err('Session not ready. Try again.');
        const authUrl = getAuthUrl(sessionId);
        return text(
          `Open this link to sign in with Google:\n\n${authUrl}\n\n` +
          `After signing in, return here and I\'ll pick up where we left off.`
        );
      }

      // ── set_spreadsheet_url ─────────────────────────────────────────────
      if (name === 'set_spreadsheet_url') {
        if (!sub) return err('Please connect Google first before setting up your sheet.');
        const url = args.url ?? '';
        const m   = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!m) return err('That doesn\'t look like a Google Sheets URL. Copy the full URL from your browser address bar while the sheet is open.');
        saveUser(sub, { spreadsheetUrl: url, spreadsheetId: m[1] });
        return text('✅ Sheet saved. Your Legal Billing tools are ready — try "Get my billing dashboard".');
      }

      // ── All other tools require auth + sheet ────────────────────────────
      if (!sub || !user?.tokens) {
        const sessionId = sessionIdRef.current;
        const authUrl   = sessionId ? getAuthUrl(sessionId) : null;
        return err(
          'Google not connected.' +
          (authUrl ? ` Sign in here: ${authUrl}` : ' Ask me to "connect Google" to get the sign-in link.')
        );
      }

      if (!user.spreadsheetId) {
        return err(
          'No Google Sheet configured yet. ' +
          'Please share the URL of your billing sheet (copy it from the browser address bar while the sheet is open) ' +
          'and I\'ll save it for you.'
        );
      }

      const auth = await getAuthClient(sub);
      if (!auth) {
        const sessionId = sessionIdRef.current;
        const authUrl   = sessionId ? getAuthUrl(sessionId) : null;
        return err(
          'Google authentication expired.' +
          (authUrl ? ` Re-connect here: ${authUrl}` : ' Ask me to "connect Google" to reconnect.')
        );
      }

      switch (name) {
        case 'log_time':        return text(JSON.stringify(await logTime(auth, user.spreadsheetId, args)));
        case 'mark_billed':     return text(JSON.stringify(await markBilled(auth, user.spreadsheetId, args.clientName)));
        case 'mark_paid':       return text(JSON.stringify(await markPaid(auth, user.spreadsheetId, args.clientName)));
        case 'add_trust_entry': return text(JSON.stringify(await addTrustEntry(auth, user.spreadsheetId, args)));
        case 'get_dashboard':   return text(JSON.stringify(await getDashboard(auth, user.spreadsheetId)));
        default:                return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      if (e.message?.includes('invalid_grant') || e.message?.includes('Token has been expired')) {
        const sessionId = sessionIdRef.current;
        const authUrl   = sessionId ? getAuthUrl(sessionId) : null;
        return err('Google authentication expired.' + (authUrl ? ` Re-connect here: ${authUrl}` : ''));
      }
      return err(`Error: ${e.message}`);
    }
  });

  // ── Resources ─────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const sub  = getSessionSub();
    const user = sub ? getUser(sub) : null;
    const base = [
      { uri: CONNECT_GOOGLE_URI,    name: 'Connect Google',    description: 'Google account connection panel',                      mimeType: 'text/html;profile=mcp-app' },
      { uri: 'billing://dashboard', name: 'Billing Dashboard', description: 'Total hours, fees billed, collected, and outstanding', mimeType: 'application/json' },
      { uri: 'billing://clients',   name: 'Client List',       description: 'All clients with billable time entries',                mimeType: 'application/json' },
    ];
    if (!user?.spreadsheetId || !user?.tokens) return { resources: base };
    try {
      const auth = await getAuthClient(sub);
      if (!auth) return { resources: base };
      const clients = await listClients(auth, user.spreadsheetId);
      return {
        resources: [
          ...base,
          ...clients.map(name => ({
            uri: `billing://client/${encodeURIComponent(name)}`,
            name,
            description: `Billing history and balance for ${name}`,
            mimeType: 'application/json',
          })),
        ],
      };
    } catch { return { resources: base }; }
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [{
      uriTemplate: 'billing://client/{clientName}',
      name: 'Client billing summary',
      description: 'Hours logged, fees unbilled/billed/paid for a specific client',
      mimeType: 'application/json',
    }],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const sub    = getSessionSub();
    const user   = sub ? getUser(sub) : null;
    const noData = (msg) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ error: msg }) }] });

    if (uri === CONNECT_GOOGLE_URI) {
      return { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: connectGoogleHtml }] };
    }

    if (!user?.spreadsheetId) return noData('No spreadsheet configured.');
    const auth = await getAuthClient(sub);
    if (!auth) return noData('Not authenticated. Ask me to connect Google.');

    if (uri === 'billing://dashboard') {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await getDashboard(auth, user.spreadsheetId)) }] };
    }
    if (uri === 'billing://clients') {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ clients: await listClients(auth, user.spreadsheetId) }) }] };
    }
    if (uri.startsWith('billing://client/')) {
      const clientName = decodeURIComponent(uri.replace('billing://client/', ''));
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await getClientSummary(auth, user.spreadsheetId, clientName)) }] };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  return server;
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const transports = new Map(); // sessionId → transport

app.all('/mcp', async (req, res) => {
  const existingSessionId = req.headers['mcp-session-id'];

  // Route to existing session
  if (existingSessionId && transports.has(existingSessionId)) {
    await transports.get(existingSessionId).handleRequest(req, res, req.body);
    return;
  }

  if (req.method !== 'POST') { res.status(404).end(); return; }

  // New session — sessionId is assigned during handleRequest
  const sessionIdRef = { current: null };

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      sessionIdRef.current = sid;
      transports.set(sid, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
      sessions.delete(transport.sessionId);
    }
  };

  const server = createMCPServer(sessionIdRef);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Google OAuth callback — state carries the MCP session ID
app.get('/oauth/callback', async (req, res) => {
  const { code, state: sessionId, error } = req.query;

  if (error || !code) {
    res.send('<html><body><h2>Access denied. Close this tab and try again.</h2></body></html>');
    return;
  }

  try {
    const { sub, email } = await handleOAuthCallback(code);
    if (sessionId) sessions.set(sessionId, sub);

    res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4;text-align:center">
<div>
  <div style="font-size:48px">✅</div>
  <h2 style="color:#166534;margin:12px 0 6px">Connected as ${email}</h2>
  <p style="color:#15803d">Close this tab and return to Claude.</p>
</div>
</body></html>`);
  } catch (e) {
    res.send(`<html><body><h2>Error: ${e.message}</h2></body></html>`);
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Legal Billing MCP server  →  ${SERVER_URL}/mcp`);
  console.log(`OAuth redirect URI        →  ${REDIRECT_URI}`);
});
