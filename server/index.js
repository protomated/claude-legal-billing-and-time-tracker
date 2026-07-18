import 'dotenv/config';
import { randomUUID } from 'crypto';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getUser, saveUser, findSingleUser } from './db.js';
import { getAuthUrl, getAuthClient, handleOAuthCallback, REDIRECT_URI } from './auth.js';
import { logTime, markBilled, markPaid, addTrustEntry, getDashboard, getTimeEntries, listClients, getClientSummary, getTrustEntries, getYearEndSummary, getMatterProfitability, getInvoice } from '../plugin/server/sheets.js';

const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Returns a clickable sign-in link. The panel (text/html;profile=mcp-app) is
// served via ReadResource and triggered by _meta.ui.resourceUri on the tool —
// embedding it inline in a tool response causes Claude to render raw HTML source.
function notConnectedResponse(sessionId) {
  const connectUrl = sessionId ? `${SERVER_URL}/connect?s=${sessionId}` : null;
  const msg = connectUrl
    ? `Google not connected. Sign in here: ${connectUrl}`
    : 'Google not connected. Ask me to "connect Google".';
  return { content: [{ type: 'text', text: msg }], isError: true };
}

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
      'Connect or re-authenticate Google. Returns a sign-in URL the attorney must open in their browser. ' +
      'Call with check_only: true to silently check if already connected. ' +
      'Always call this first if another tool returns an auth error.',
    inputSchema: {
      type: 'object',
      properties: {
        check_only: { type: 'boolean', description: 'If true, return connection status only.' },
      },
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
  {
    name: 'get_time_entries',
    description: 'Read time entries from the Time Tracker tab. Use this when the attorney asks to see, list, or review logged hours. Optionally filter by client or billing status.',
    inputSchema: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Filter by client name (partial match, case-insensitive).' },
        status: {
          type: 'string',
          enum: ['Unbilled', 'Billed', 'Paid', 'All'],
          description: 'Filter by billing status. Defaults to All.',
        },
        limit: { type: 'number', description: 'Max entries to return (default 50, most recent first).' },
      },
    },
  },
  {
    name: 'get_trust_entries',
    description: 'Read trust account activity from the Trust Account tab. Use this when the attorney asks to review trust deposits, withdrawals, or running balance. Optionally filter by client.',
    inputSchema: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Filter by client name (partial match, case-insensitive).' },
        limit: { type: 'number', description: 'Max entries to return (default 50, most recent first).' },
      },
    },
  },
  {
    name: 'get_year_end_summary',
    description: 'Read the Year-End Summary tab and return annual revenue totals: Total Revenue Billed, Total Revenue Collected, Total Uncollected.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_matter_profitability',
    description: 'Read the Rate My Matters tab showing profitability analysis per matter: flat fee charged vs hours spent, effective vs standard hourly rate, and a verdict. Use this when the attorney asks which matters were profitable or how they performed.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_invoice',
    description: 'Read the Invoice tab and return the current invoice data (firm info, client, line items, totals). Use this when the attorney asks to preview or review the invoice before sending.',
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
    const sid = sessionIdRef.current;
    if (sessions.has(sid)) return sessions.get(sid);

    // Session was reset (server restart or MCP reconnect during OAuth).
    // Recover by binding to the single stored user, if there is exactly one.
    const sub = findSingleUser();
    if (sub) { sessions.set(sid, sub); return sub; }

    return null;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const sub  = getSessionSub();
    const user = sub ? getUser(sub) : null;

    try {
      // ── connect_google ──────────────────────────────────────────────────
      if (name === 'connect_google') {
        const sessionId = sessionIdRef.current;
        const connectUrl = sessionId ? `${SERVER_URL}/connect?s=${sessionId}` : null;

        if (args.check_only) {
          if (sub && user?.tokens) return text('connected');
          return text(connectUrl ? `not_connected ${connectUrl}` : 'not_connected');
        }

        if (!sessionId) return err('Session not ready. Try again.');
        return text(connectUrl);
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
        return notConnectedResponse(sessionIdRef.current);
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
        return notConnectedResponse(sessionIdRef.current);
      }

      switch (name) {
        case 'log_time':               return text(JSON.stringify(await logTime(auth, user.spreadsheetId, args)));
        case 'mark_billed':            return text(JSON.stringify(await markBilled(auth, user.spreadsheetId, args.clientName)));
        case 'mark_paid':              return text(JSON.stringify(await markPaid(auth, user.spreadsheetId, args.clientName)));
        case 'add_trust_entry':        return text(JSON.stringify(await addTrustEntry(auth, user.spreadsheetId, args)));
        case 'get_dashboard':          return text(JSON.stringify(await getDashboard(auth, user.spreadsheetId)));
        case 'get_time_entries':       return text(JSON.stringify(await getTimeEntries(auth, user.spreadsheetId, args)));
        case 'get_trust_entries':      return text(JSON.stringify(await getTrustEntries(auth, user.spreadsheetId, args)));
        case 'get_year_end_summary':   return text(JSON.stringify(await getYearEndSummary(auth, user.spreadsheetId)));
        case 'get_matter_profitability': return text(JSON.stringify(await getMatterProfitability(auth, user.spreadsheetId)));
        case 'get_invoice':            return text(JSON.stringify(await getInvoice(auth, user.spreadsheetId)));
        default:                       return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      if (e.message?.includes('invalid_grant') || e.message?.includes('Token has been expired')) {
        return notConnectedResponse(sessionIdRef.current);
      }
      return err(`Error: ${e.message}`);
    }
  });

  // ── Resources ─────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const sub  = getSessionSub();
    const user = sub ? getUser(sub) : null;
    const base = [
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

// Clean sign-in page — short URL returned to Claude instead of the raw OAuth URL.
// Attorney clicks it, sees the branded page, clicks Sign in with Google.
app.get('/connect', (req, res) => {
  const sessionId = req.query.s;
  const authUrl   = getAuthUrl(sessionId || randomUUID());
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Legal Billing — Connect Google</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1e1e2e;color:#e2e2f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:#26263a;border:1px solid #38385a;border-radius:14px;padding:28px;width:100%;max-width:360px}
.header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #38385a}
.icon{width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.title{font-size:14px;font-weight:600}.sub{font-size:12px;color:#7a7a9a;margin-top:1px}
h3{font-size:16px;font-weight:600;margin-bottom:6px}
.desc{font-size:13px;color:#7a7a9a;line-height:1.55;margin-bottom:22px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:10px 16px;background:#fff;color:#3c4043;border:1px solid #dadce0;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;transition:background .15s,box-shadow .15s}
.btn:hover{background:#f8f9fa;box-shadow:0 1px 4px rgba(0,0,0,.25)}
</style></head>
<body><div class="card">
  <div class="header">
    <div class="icon">⚖</div>
    <div><div class="title">Legal Billing</div><div class="sub">by Protomated</div></div>
  </div>
  <h3>Connect Google Sheets</h3>
  <p class="desc">Sign in to allow Legal Billing to read and write your billing sheet. Your data stays in your own Google Drive.</p>
  <a class="btn" href="${authUrl}">
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
    Sign in with Google
  </a>
</div></body></html>`);
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
