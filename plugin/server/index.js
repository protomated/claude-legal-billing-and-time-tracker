import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getAuthClient, authenticate } from './auth.js';
import { loadTokens } from './config.js';
import { logTime, markBilled, markPaid, addTrustEntry, getDashboard, getTimeEntries, listClients, getClientSummary, getTrustEntries, getYearEndSummary, getMatterProfitability, getInvoice } from './sheets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const connectGoogleHtml = readFileSync(join(__dirname, 'ui', 'connect-google.html'), 'utf8');

const CONNECT_GOOGLE_URI = 'ui://legal-billing/connect-google';

function extractSpreadsheetId(url) {
  const m = (url ?? '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

const spreadsheetId = extractSpreadsheetId(process.env.SPREADSHEET_URL);

const TOOLS = [
  {
    name: 'connect_google',
    description:
      'Show the Google connection UI, or re-authenticate when other tools return an auth error. ' +
      'First-time auth is handled automatically on first billing tool use — only call this explicitly ' +
      'to show the connection panel or fix a broken connection.',
    inputSchema: {
      type: 'object',
      properties: {
        check_only: {
          type: 'boolean',
          description: 'If true, return connection status without opening a browser.',
        },
      },
    },
    _meta: {
      ui: { resourceUri: CONNECT_GOOGLE_URI },
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
        clientName: { type: 'string' },
        matterName: { type: 'string' },
        matterType: {
          type: 'string',
          enum: ['Litigation', 'Family Law', 'Estate', 'Criminal', 'Corporate', 'Immigration', 'Real Estate', 'Small Business'],
        },
        description: { type: 'string' },
        hours: { type: 'number', description: 'Decimal hours. Never zero or negative.' },
        rate: { type: 'number', description: 'Dollars per hour. No $ sign.' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
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
        clientName: { type: 'string' },
        matterName: { type: 'string' },
        description: { type: 'string' },
        deposit: { type: 'number', description: 'Amount received into trust. Use 0 for withdrawals.' },
        withdrawal: { type: 'number', description: 'Amount paid out of trust. Use 0 for deposits.' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
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

const server = new Server(
  { name: 'legal-billing', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// ── Tools ────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  const text = (t) => ({ content: [{ type: 'text', text: String(t) }] });
  const err  = (t) => ({ content: [{ type: 'text', text: String(t) }], isError: true });

  try {
    if (name === 'connect_google') {
      if (args.check_only) {
        return text(loadTokens() ? 'connected' : 'not_connected');
      }
      await authenticate();
      return text('connected');
    }

    if (!spreadsheetId) {
      return err(
        'No Google Sheet URL configured. ' +
        'Open Claude Desktop → Extensions → Legal Billing → Settings and paste your sheet URL.'
      );
    }

    let auth = await getAuthClient();
    if (!auth) {
      // First use — trigger OAuth inline.
      try {
        auth = await authenticate();
      } catch (authErr) {
        return err(`Google sign-in failed or timed out: ${authErr.message}`);
      }
    }

    switch (name) {
      case 'log_time':               return text(JSON.stringify(await logTime(auth, spreadsheetId, args)));
      case 'mark_billed':            return text(JSON.stringify(await markBilled(auth, spreadsheetId, args.clientName)));
      case 'mark_paid':              return text(JSON.stringify(await markPaid(auth, spreadsheetId, args.clientName)));
      case 'add_trust_entry':        return text(JSON.stringify(await addTrustEntry(auth, spreadsheetId, args)));
      case 'get_dashboard':          return text(JSON.stringify(await getDashboard(auth, spreadsheetId)));
      case 'get_time_entries':       return text(JSON.stringify(await getTimeEntries(auth, spreadsheetId, args)));
      case 'get_trust_entries':      return text(JSON.stringify(await getTrustEntries(auth, spreadsheetId, args)));
      case 'get_year_end_summary':   return text(JSON.stringify(await getYearEndSummary(auth, spreadsheetId)));
      case 'get_matter_profitability': return text(JSON.stringify(await getMatterProfitability(auth, spreadsheetId)));
      case 'get_invoice':            return text(JSON.stringify(await getInvoice(auth, spreadsheetId)));
      default:                       return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    if (e.message?.includes('invalid_grant') || e.message?.includes('Token has been expired')) {
      return err('Google authentication expired. Ask me to "connect Google" to reconnect.');
    }
    return err(`Error: ${e.message}`);
  }
});

// ── Resources ────────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const staticResources = [
    {
      uri: CONNECT_GOOGLE_URI,
      name: 'Connect Google',
      description: 'Google account connection panel',
      mimeType: 'text/html;profile=mcp-app',
    },
    {
      uri: 'billing://dashboard',
      name: 'Billing Dashboard',
      description: 'Total hours, fees billed, collected, and outstanding',
      mimeType: 'application/json',
    },
    {
      uri: 'billing://clients',
      name: 'Client List',
      description: 'All clients with billable time entries',
      mimeType: 'application/json',
    },
  ];

  if (!spreadsheetId) return { resources: staticResources };

  try {
    const auth = await getAuthClient();
    if (!auth) return { resources: staticResources };

    const clients = await listClients(auth, spreadsheetId);
    const clientResources = clients.map(name => ({
      uri: `billing://client/${encodeURIComponent(name)}`,
      name,
      description: `Billing history and outstanding balance for ${name}`,
      mimeType: 'application/json',
    }));
    return { resources: [...staticResources, ...clientResources] };
  } catch {
    return { resources: staticResources };
  }
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [
    {
      uriTemplate: 'billing://client/{clientName}',
      name: 'Client billing summary',
      description: 'Hours logged, fees unbilled/billed/paid for a specific client',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === CONNECT_GOOGLE_URI) {
    return {
      contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: connectGoogleHtml }],
    };
  }

  if (uri === 'billing://dashboard' || uri === 'billing://clients' || uri.startsWith('billing://client/')) {
    if (!spreadsheetId) {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ error: 'No spreadsheet configured.' }) }] };
    }
    const auth = await getAuthClient();
    if (!auth) {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ error: 'Not authenticated. Ask me to connect Google.' }) }] };
    }

    if (uri === 'billing://dashboard') {
      const data = await getDashboard(auth, spreadsheetId);
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] };
    }

    if (uri === 'billing://clients') {
      const clients = await listClients(auth, spreadsheetId);
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ clients }) }] };
    }

    const clientName = decodeURIComponent(uri.replace('billing://client/', ''));
    const data = await getClientSummary(auth, spreadsheetId, clientName);
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] };
  }

  throw new Error(`Resource not found: ${uri}`);
});

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
