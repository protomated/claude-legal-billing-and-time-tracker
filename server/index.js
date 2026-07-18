import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getUser, createUser } from './db.js';
import { getAuthUrl, getAuthClient, handleOAuthCallback, REDIRECT_URI } from './auth.js';
import { logTime, markBilled, markPaid, addTrustEntry, getDashboard, listClients, getClientSummary } from '../plugin/server/sheets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const setupHtml  = readFileSync(join(__dirname, 'setup.html'),  'utf8');

const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'connect_google',
    description:
      'Get the Google sign-in link, or check connection status. ' +
      'Call with check_only: true to verify; call without arguments to get the sign-in URL. ' +
      'Only call this when the user asks to connect Google or when another tool returns an auth error.',
    inputSchema: {
      type: 'object',
      properties: {
        check_only: { type: 'boolean', description: 'If true, return connection status without a sign-in link.' },
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

// ── MCP server factory (one instance per session) ────────────────────────────

function createMCPServer(apiKey) {
  const server = new Server(
    { name: 'legal-billing', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  const text = (t) => ({ content: [{ type: 'text', text: String(t) }] });
  const err  = (t) => ({ content: [{ type: 'text', text: String(t) }], isError: true });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const user = getUser(apiKey);
    if (!user) return err('Invalid API key.');

    try {
      if (name === 'connect_google') {
        if (args.check_only) return text(user.tokens ? 'connected' : 'not_connected');
        const authUrl = getAuthUrl(apiKey);
        return text(`Open this URL to connect your Google account:\n\n${authUrl}\n\nReturn here after signing in.`);
      }

      if (!user.spreadsheetId) {
        return err('No Google Sheet configured. Visit your setup page to add a sheet URL.');
      }

      const auth = await getAuthClient(apiKey);
      if (!auth) {
        return err('Google not connected. Ask me to "connect Google" to get the sign-in link.');
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
        return err('Google authentication expired. Ask me to "connect Google" to reconnect.');
      }
      return err(`Error: ${e.message}`);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const staticResources = [
      { uri: 'billing://dashboard', name: 'Billing Dashboard', description: 'Total hours, fees billed, collected, and outstanding', mimeType: 'application/json' },
      { uri: 'billing://clients',   name: 'Client List',       description: 'All clients with billable time entries',                mimeType: 'application/json' },
    ];
    const user = getUser(apiKey);
    if (!user?.spreadsheetId || !user?.tokens) return { resources: staticResources };
    try {
      const auth = await getAuthClient(apiKey);
      if (!auth) return { resources: staticResources };
      const clients = await listClients(auth, user.spreadsheetId);
      return {
        resources: [
          ...staticResources,
          ...clients.map(name => ({
            uri: `billing://client/${encodeURIComponent(name)}`,
            name,
            description: `Billing history and balance for ${name}`,
            mimeType: 'application/json',
          })),
        ],
      };
    } catch { return { resources: staticResources }; }
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
    const user = getUser(apiKey);

    const noData = (msg) => ({
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ error: msg }) }],
    });

    if (!user?.spreadsheetId) return noData('No spreadsheet configured.');
    const auth = await getAuthClient(apiKey);
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

function extractApiKey(req) {
  return req.query.key || req.headers['x-api-key'] || null;
}

// MCP endpoint — handles all three HTTP methods required by Streamable HTTP spec
app.all('/mcp', async (req, res) => {
  const apiKey = extractApiKey(req);
  if (!apiKey || !getUser(apiKey)) {
    res.status(401).json({ error: 'Invalid or missing API key. Visit /setup to get yours.' });
    return;
  }

  const sessionId = req.headers['mcp-session-id'];

  // Route to existing session
  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId).handleRequest(req, res, req.body);
    return;
  }

  // New session — only POST allowed for initialization
  if (req.method !== 'POST') { res.status(404).end(); return; }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => transports.set(sid, transport),
  });
  transport.onclose = () => { if (transport.sessionId) transports.delete(transport.sessionId); };

  const server = createMCPServer(apiKey);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Google OAuth callback
app.get('/oauth/callback', async (req, res) => {
  const { code, state: apiKey, error } = req.query;
  if (error || !code || !apiKey) {
    res.send('<html><body><h2>Access denied. Close this tab and try again.</h2></body></html>');
    return;
  }
  try {
    await handleOAuthCallback(code, apiKey);
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4">
<div style="text-align:center">
  <div style="font-size:48px">✅</div>
  <h2 style="color:#166534">Google connected!</h2>
  <p style="color:#15803d">You can close this tab and return to Claude.</p>
</div></body></html>`);
  } catch (e) {
    res.send(`<html><body><h2>Error: ${e.message}</h2></body></html>`);
  }
});

// Attorney onboarding — get an API key and MCP URL
app.get('/setup', (_req, res) => res.send(setupHtml));

app.post('/setup', express.urlencoded({ extended: false }), (req, res) => {
  const { spreadsheet_url } = req.body;
  if (!spreadsheet_url?.includes('docs.google.com/spreadsheets')) {
    res.status(400).send('<html><body><h2>Invalid sheet URL. Go back and try again.</h2></body></html>');
    return;
  }
  const apiKey = randomUUID().replace(/-/g, '');
  createUser(apiKey, spreadsheet_url);
  const mcpUrl   = `${SERVER_URL}/mcp?key=${apiKey}`;
  const googleUrl = getAuthUrl(apiKey);
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Legal Billing — Setup Complete</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:60px auto;padding:0 20px;color:#111}
code{background:#f4f4f5;padding:2px 6px;border-radius:4px;font-size:13px;word-break:break-all}
.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin:20px 0}
.step{margin:24px 0}.num{display:inline-block;width:24px;height:24px;background:#6366f1;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:13px;font-weight:700;margin-right:8px}
a.btn{display:inline-block;padding:10px 18px;background:#fff;border:1px solid #dadce0;border-radius:8px;text-decoration:none;color:#3c4043;font-weight:500;margin-top:8px}
a.btn:hover{background:#f8f9fa}</style></head>
<body>
<h1>✅ Setup complete</h1>

<div class="step">
  <p><span class="num">1</span><strong>Connect your Google account</strong></p>
  <a class="btn" href="${googleUrl}">
    <svg width="16" height="16" viewBox="0 0 18 18" style="vertical-align:middle;margin-right:8px" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
    Sign in with Google
  </a>
</div>

<div class="step">
  <p><span class="num">2</span><strong>Add this MCP URL to Claude</strong></p>
  <div class="box">
    <p style="margin:0 0 8px;font-size:13px;color:#64748b">Your personal MCP URL — keep this private:</p>
    <code>${mcpUrl}</code>
  </div>
  <p style="font-size:13px;color:#555"><strong>In Claude Desktop:</strong> Settings → Developer → Add MCP Server → paste the URL above.<br>
  <strong>In Claude Cowork:</strong> + → Connectors → Add connector → Custom URL → paste the URL above.</p>
</div>

<div class="step">
  <p><span class="num">3</span><strong>Start billing</strong> — say "Get my legal billing dashboard" in Claude.</p>
</div>

<p style="font-size:12px;color:#94a3b8;margin-top:40px">Your sheet URL: <code>${spreadsheet_url}</code></p>
</body></html>`);
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Legal Billing MCP server listening on port ${PORT}`);
  console.log(`Setup:        ${SERVER_URL}/setup`);
  console.log(`MCP endpoint: ${SERVER_URL}/mcp?key={apiKey}`);
  console.log(`OAuth redir:  ${REDIRECT_URI}`);
});
