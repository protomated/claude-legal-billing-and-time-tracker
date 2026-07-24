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
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initDb, getUser, saveUser, disconnectUser, deleteUser } from './db.js';
import { getAuthUrl, getAuthClient, handleOAuthCallback, REDIRECT_URI } from './auth.js';
import { logTime, markBilled, markPaid, addTrustEntry, getDashboard, getTimeEntries, listClients, getClientSummary, getTrustEntries, getYearEndSummary, getMatterProfitability, getInvoice } from './sheets.js';
import { provisionAttorneySheet } from './drive.js';

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
    name: 'create_billing_sheet',
    description:
      'Create a new Google Sheet for the attorney from the Legal Billing template and connect it. ' +
      'IMPORTANT: Only call this after the attorney has explicitly confirmed they want a new sheet created ' +
      '(e.g. you asked "I don\'t see a billing sheet on file — want me to create one from the template now, ' +
      'or do you already have one to connect?" and they chose to create a new one). ' +
      'If they already have a sheet, ask for its URL and call set_spreadsheet_url instead. ' +
      'Do not call this tool speculatively or without asking first.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'disconnect_google',
    description:
      'Disconnect the attorney\'s Google account: revokes the OAuth token and clears the saved ' +
      'spreadsheet reference from Protomated\'s server. The attorney will need to reconnect Google ' +
      'and reconnect (or recreate) a billing sheet before using other tools again. ' +
      'Does not delete or modify the Google Sheet itself — only Protomated\'s stored reference to it. ' +
      'IMPORTANT: State what will happen and wait for explicit confirmation before calling.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_account',
    description:
      'Permanently delete the attorney\'s account record from Protomated\'s database — tokens, email, ' +
      'and spreadsheet reference. Does not delete or modify the Google Sheet itself, only Protomated\'s ' +
      'stored reference to it. IMPORTANT: State exactly what will be deleted and wait for explicit ' +
      'confirmation before calling. This cannot be undone.',
    inputSchema: { type: 'object', properties: {} },
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

// ── Prompt definitions (slash commands) ──────────────────────────────────────

const PROMPTS = [
  {
    name: 'log-time',
    description: 'Log billable time — guides you through client, matter, hours, and rate, then writes the entry.',
    arguments: [{ name: 'entry', description: 'Optional shorthand, e.g. "2.5h drafting motion for Smith"', required: false }],
  },
  {
    name: 'billing-review',
    description: 'Weekly billing health check — who has unbilled hours, who hasn\'t paid, what to do next.',
    arguments: [{ name: 'client', description: 'Optional: focus on a single client', required: false }],
  },
  {
    name: 'invoice-client',
    description: 'Generate an invoice — shows unbilled entries, confirms, marks as Billed, previews the invoice.',
    arguments: [{ name: 'client', description: 'Client name to invoice', required: false }],
  },
  {
    name: 'trust-entry',
    description: 'Record a trust account deposit or withdrawal with a safety check before writing.',
    arguments: [{ name: 'entry', description: 'Optional shorthand, e.g. "Smith deposit 5000" or "Garcia filing fee 350"', required: false }],
  },
];

// Prepended to every slash-command prompt: don't collect any details until
// connection + sheet setup is confirmed, so an attorney never fills in a
// form's worth of fields before hitting a "connect Google" wall at the end.
const SETUP_CHECK =
  `Before doing anything else: call connect_google with check_only: true. ` +
  `If not connected, stop and tell the attorney to say "connect Google" to get a sign-in link — do not collect any details yet. ` +
  `If connected but the first tool call below returns "No Google Sheet configured yet", stop and ask: ` +
  `"I don't see a billing sheet on file — want me to create one from the Legal Billing template now, or do you already have one to connect?" ` +
  `Then call create_billing_sheet (only after they confirm a new sheet) or set_spreadsheet_url (if they give you an existing sheet's URL). ` +
  `If you call create_billing_sheet, always paste the full sheet URL from its result into your reply — don't just say "sheet created," the attorney needs the clickable link. ` +
  `Once both are confirmed, proceed with the task below.\n\n`;

function getPromptMessages(name, args = {}) {
  const msg = (text) => ({ role: 'user', content: { type: 'text', text: SETUP_CHECK + text } });
  switch (name) {
    case 'log-time': {
      const hint = args.entry ? `\n\nThe attorney provided this shorthand: "${args.entry}" — extract what you can from it.` : '';
      return [msg(
        `Log a billable time entry to the Time Tracker.${hint}\n\n` +
        `Collect these fields, asking only for what's missing:\n` +
        `- Client name (required)\n` +
        `- Hours (required; decimal OK; never zero or negative)\n` +
        `- Hourly rate (required; ask "What's your rate for this client?" if missing)\n` +
        `- Date (required; default to today)\n` +
        `- Description of work (recommended)\n` +
        `- Matter name (optional)\n` +
        `- Matter type (optional; if needed use exactly one of: Litigation, Family Law, Estate, Criminal, Corporate, Immigration, Real Estate, Small Business)\n\n` +
        `Before calling log_time, confirm in one line: "Logging X hrs for [Client] on [date] at $Y/hr = $Z. Description: [desc]. Correct?" and wait.\n\n` +
        `After success report: "✅ Logged: X hrs for [Client] at $Y/hr — $Z total. Status: Unbilled."\n` +
        `⚠️ Not legal advice — review before sending to client.`
      )];
    }
    case 'billing-review': {
      const hint = args.client ? `\n\nFocus on client: "${args.client}". Also call get_client_summary for them.` : '';
      return [msg(
        `Run a billing health check. This is read-only — no changes.${hint}\n\n` +
        `Call these in parallel:\n` +
        `- get_dashboard (overall totals)\n` +
        `- get_time_entries with status "Unbilled" (who needs invoicing)\n` +
        `- get_time_entries with status "Billed" (outstanding invoices)\n\n` +
        `Present the results as:\n` +
        `**Billing Snapshot — [today's date]**\n` +
        `Overall: total hours, fees billed, collected, outstanding.\n` +
        `🔴 Unbilled — list each client with unbilled hours and estimated fees.\n` +
        `🟡 Billed — list each client with outstanding invoice amount and date.\n` +
        `💡 Actions — who to bill now; who to follow up with (invoices older than 30 days).\n\n` +
        `End with: "Want me to generate an invoice for any of these clients?"\n` +
        `⚠️ Not legal advice — review before sending to client.`
      )];
    }
    case 'invoice-client': {
      const clientHint = args.client ? `Client: "${args.client}".` : 'Ask which client to invoice if not already clear from context.';
      return [msg(
        `Generate an invoice for a client. ${clientHint}\n\n` +
        `1. Call get_time_entries filtered by the client and status "Unbilled".\n` +
        `   If none found: "No unbilled entries for [Client]." Stop.\n\n` +
        `2. Show the entries as a table (Date | Matter | Description | Hours | Rate | Amount) with a Total row.\n\n` +
        `3. Confirm: "I will mark [N] entries for [Client] as Billed and set today as the invoice date. Total: $X. Shall I proceed?"\n` +
        `   Wait for explicit confirmation before calling mark_billed.\n\n` +
        `4. Call mark_billed. Report: "✅ Invoice generated — [N] entries marked Billed. Invoice date: [today]."\n\n` +
        `5. Call get_invoice and present the invoice data for review.\n\n` +
        `6. Offer: "Would you like to record a payment once the client pays?"\n` +
        `⚠️ Not legal advice — review before sending to client.`
      )];
    }
    case 'trust-entry': {
      const hint = args.entry ? `\n\nThe attorney provided: "${args.entry}" — extract what you can.` : '';
      return [msg(
        `Record a trust account transaction.${hint}\n\n` +
        `Safety rules (enforce every time):\n` +
        `- Never put a withdrawal in the deposit field or vice versa. Never use negative numbers.\n` +
        `- No $0 amounts — if the amount is zero or unclear, stop and ask.\n` +
        `- Withdrawal over $10,000: state the full details and ask for explicit confirmation before recording.\n\n` +
        `Step 1 — Classify: deposit (retainer, advance, funds in) or withdrawal (filing fee, disbursement, refund, funds out).\n` +
        `Step 2 — Collect: client name, amount (positive), type, date (default today), description, matter name (optional).\n` +
        `Step 3 — For withdrawals over $10,000: "⚠️ This records a $X withdrawal from trust for [Client] — [desc]. Confirm?" Wait.\n` +
        `Step 4 — Confirm: "Recording a $X [deposit/withdrawal] for [Client] on [date]. Description: [desc]. Correct?" Wait.\n` +
        `Step 5 — Call add_trust_entry. Set deposit OR withdrawal to the amount; the other is 0.\n` +
        `Report: "✅ Trust [deposit/withdrawal] recorded — $X for [Client]."\n` +
        `⚠️ Not legal advice — review against your state bar's trust-accounting rules.`
      )];
    }
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

// ── MCP server factory ───────────────────────────────────────────────────────

function createMCPServer(sessionIdRef) {
  const server = new Server(
    { name: 'legal-billing', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  const text = (t) => ({ content: [{ type: 'text', text: String(t) }] });
  const err  = (t) => ({ content: [{ type: 'text', text: String(t) }], isError: true });

  async function getSessionSub() {
    const sid = sessionIdRef.current;
    return sessions.has(sid) ? sessions.get(sid) : null;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const sub  = await getSessionSub();
    const user = sub ? await getUser(sub) : null;

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
        await saveUser(sub, { spreadsheetUrl: url, spreadsheetId: m[1] });
        return text('✅ Sheet saved. Your Legal Billing tools are ready — try "Get my billing dashboard".');
      }

      // ── create_billing_sheet ─────────────────────────────────────────────
      if (name === 'create_billing_sheet') {
        if (!sub || !user?.tokens) return notConnectedResponse(sessionIdRef.current);
        if (user.spreadsheetId) return text('You already have a billing sheet connected.');

        const attorneyAuth = await getAuthClient(sub);
        if (!attorneyAuth) return notConnectedResponse(sessionIdRef.current);

        const { spreadsheetId, spreadsheetUrl } = await provisionAttorneySheet(attorneyAuth, user.email);
        await saveUser(sub, { spreadsheetUrl, spreadsheetId });
        return text(
          `✅ Created your billing sheet: ${spreadsheetUrl}\n` +
          'Bookmark it — that\'s where your data lives, fully owned by you. ' +
          'Your Legal Billing tools are ready — try "Get my billing dashboard".'
        );
      }

      // ── disconnect_google ────────────────────────────────────────────────
      if (name === 'disconnect_google') {
        if (!sub || !user) return text('You\'re not currently connected — nothing to disconnect.');
        if (user.tokens) {
          try {
            const revokeAuth = await getAuthClient(sub);
            if (revokeAuth) await revokeAuth.revokeCredentials();
          } catch (e) { /* token may already be invalid — proceed with local cleanup regardless */ }
        }
        await disconnectUser(sub);
        sessions.delete(sessionIdRef.current);
        return text(
          '✅ Disconnected. Your Google account and saved sheet reference have been cleared from Protomated. ' +
          'Say "connect Google" any time to reconnect.'
        );
      }

      // ── delete_account ───────────────────────────────────────────────────
      if (name === 'delete_account') {
        if (!sub || !user) return text('There\'s no account on file to delete.');
        if (user.tokens) {
          try {
            const revokeAuth = await getAuthClient(sub);
            if (revokeAuth) await revokeAuth.revokeCredentials();
          } catch (e) { /* token may already be invalid — proceed with deletion regardless */ }
        }
        await deleteUser(sub);
        sessions.delete(sessionIdRef.current);
        return text(
          '✅ Your account has been permanently deleted from Protomated\'s database. ' +
          'Your Google Sheet itself was not touched — it remains in your Google Drive.'
        );
      }

      // ── All other tools require auth + sheet ────────────────────────────
      if (!sub || !user?.tokens) {
        return notConnectedResponse(sessionIdRef.current);
      }

      if (!user.spreadsheetId) {
        return err(
          'No Google Sheet configured yet. Ask the attorney: "I don\'t see a billing sheet on file — ' +
          'want me to create one from the Legal Billing template now, or do you already have one to connect?" ' +
          'If they want a new one, call create_billing_sheet. If they have an existing sheet, ask for its URL ' +
          'and call set_spreadsheet_url.'
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

  // ── Prompts (slash commands) ───────────────────────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const prompt = PROMPTS.find(p => p.name === name);
    if (!prompt) throw new Error(`Unknown prompt: ${name}`);
    return { description: prompt.description, messages: getPromptMessages(name, args) };
  });

  // ── Resources ─────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const sub  = await getSessionSub();
    const user = sub ? await getUser(sub) : null;
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
    const sub    = await getSessionSub();
    const user   = sub ? await getUser(sub) : null;
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
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

const transports = new Map(); // sessionId → transport

app.get('/',        (_req, res) => res.render('home'));
app.get('/privacy', (_req, res) => res.render('privacy'));
app.get('/terms',   (_req, res) => res.render('terms'));

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
  res.render('connect', { authUrl });
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

await initDb();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Legal Billing MCP server  →  ${SERVER_URL}/mcp`);
  console.log(`OAuth redirect URI        →  ${REDIRECT_URI}`);
});
