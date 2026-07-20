# Legal Billing and Time Tracker — HTTP MCP Server

Remote MCP server for the Legal Billing and Time Tracker. Exposes billing tools over HTTP so attorneys can use it as a Claude.ai Cowork connector — no local installation required.

The `.mcpb` Claude Desktop extension is on the `main` branch.

Distributed by [Protomated](https://protomated.com).

---

## What it does

Attorneys connect this server as a custom connector in Claude.ai. They then log billable hours, generate invoices, manage trust accounts, and review revenue by chatting naturally. Data lives in the attorney's own Google Sheet.

---

## Repo layout

```
server/
  index.js              Express + StreamableHTTPServerTransport MCP server
  auth.js               Google OAuth2 (web application flow)
  db.js                 Postgres — users table, token + config storage
  connect-google.html   OAuth callback landing page

docker-compose.yml      Postgres service (port 54333)
Dockerfile              Server image
docs/                   Engineer onboarding reference docs
```

---

## MCP Tools

| Tool | What it does |
|---|---|
| `connect_google` | Return sign-in URL; initiate OAuth |
| `set_spreadsheet_url` | Save the attorney's Google Sheet URL |
| `log_time` | Append a billable time entry |
| `mark_billed` | Mark all Unbilled entries for a client as Billed |
| `mark_paid` | Mark all Billed entries as Paid (confirmation required) |
| `add_trust_entry` | Append a trust deposit or withdrawal |
| `get_dashboard` | Read billing summary from Dashboard tab |
| `get_time_entries` | Read time entries; filter by client or status |
| `get_trust_entries` | Read trust account activity; filter by client |
| `get_year_end_summary` | Annual revenue totals |
| `get_matter_profitability` | Matter profitability analysis (Rate My Matters tab) |
| `get_invoice` | Current invoice preview |

## MCP Prompts (slash commands)

Available in Claude.ai as `/legal-billing:prompt-name`:

| Prompt | What it does |
|---|---|
| `/legal-billing:log-time` | Guided time entry workflow |
| `/legal-billing:billing-review` | Weekly billing health check |
| `/legal-billing:invoice-client` | End-to-end invoice flow |
| `/legal-billing:trust-entry` | Trust deposit/withdrawal with safety checks |

---

## Running locally

### 1. Prerequisites

- Node.js 18+
- Docker (for Postgres)
- A Google Cloud project with the Sheets API enabled

### 2. Google OAuth credentials

Create a **Web application** OAuth client in [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.

Add this authorized redirect URI:
```
http://localhost:3000/oauth/callback
```

### 3. Environment

```bash
cp .env.example .env
```

Fill in:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SERVER_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost:54333/legal_billing
```

### 4. Start

```bash
docker compose up -d postgres
npm start
```

Server runs at `http://localhost:3000/mcp`.

To expose it publicly for Cowork testing:
```bash
ngrok http 3000
```

Then set `SERVER_URL` to the ngrok HTTPS URL and restart.

### 5. Add as a connector

In Claude.ai → Settings → Connectors → Add custom connector → enter your server URL.

---

## Deployment

Set the same environment variables on your hosting platform and point `DATABASE_URL` at a managed Postgres instance. The `Dockerfile` builds a production image.

> **OAuth note:** The Google Sheets scope is classified as sensitive. Before releasing to external users, submit the OAuth app for [Google verification](https://support.google.com/cloud/answer/9110914).

---

## Compliance

Non-negotiable constraints enforced in `server/index.js`:

1. **Trust disclaimer** — every trust account output carries "⚠️ Not legal advice — review against your state bar's trust-accounting rules."
2. **Billing disclaimer** — every invoice and payment output carries "⚠️ Not legal advice — review before sending to client."
3. **No legal advice** — decline anything outside billing and time tracking.
4. **markPaid confirmation gate** — state what will change and get explicit confirmation before calling `mark_paid`.
5. **No undo** — attorney corrects errors directly in the sheet.

---

## License

MIT.
