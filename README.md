# Legal Billing and Time Tracker

Log billable hours, generate invoices, manage trust accounts, and monitor revenue — all by chatting naturally in Claude Cowork. Your data lives in your own Google Sheet. No monthly subscription.

Distributed free by [Protomated](https://protomated.com).

---

## Installing

1. Download `legal-billing.zip` from [Releases](https://github.com/protomated/claude-legal-billing-and-time-tracker/releases)
2. In Claude Cowork: sidebar → **Plugins → Add** → upload the ZIP
3. On first use, Claude will walk you through connecting your Google account and pasting your sheet URL (~2 minutes)

See [`cowork-plugin/README.md`](cowork-plugin/README.md) for the full attorney setup guide.

---

## Repo layout

```
cowork-plugin/        Installable plugin (packed into legal-billing.zip)
  .claude-plugin/plugin.json   Plugin manifest
  .mcp.json                    HTTP MCP connector URL
  skills/legal-billing/SKILL.md
  commands/{log-time,billing-review,invoice-client,trust-entry}.md
  CONNECTORS.md, README.md

server/               HTTP MCP server (deployed to Dokploy)
  index.js            Express + MCP SDK
  auth.js             Google OAuth for web context
  db.js               Postgres session/token store
  sheets.js           Google Sheets API (12 operations)
  package.json

Dockerfile
docker-compose.yml
.env.example
```

---

## MCP tools

| Tool | What it does |
|---|---|
| `connect_google` | Return a Google sign-in URL; check connection status |
| `set_spreadsheet_url` | Save the attorney's sheet URL (one-time setup) |
| `log_time` | Append a billable time entry |
| `mark_billed` | Mark all Unbilled entries for a client as Billed |
| `mark_paid` | Mark all Billed entries as Paid (confirmation required) |
| `add_trust_entry` | Append a trust deposit or withdrawal |
| `get_dashboard` | Read Dashboard tab summary |
| `get_time_entries` | Read time entries, filter by client/status |
| `get_trust_entries` | Read trust activity, filter by client |
| `get_year_end_summary` | Read annual revenue totals |
| `get_matter_profitability` | Read Rate My Matters tab |
| `get_invoice` | Read Invoice tab preview |

---

## Development

### Prerequisites

- Node.js 20+
- Docker (for local Postgres)
- A Google Cloud project with OAuth credentials (Web application type)

### Setup

```bash
cp .env.example .env
# Fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SERVER_URL
```

### Run locally

```bash
# Option A — Docker (recommended)
docker-compose up

# Option B — bare Node (requires a running Postgres)
npm run install:server
npm run start
```

Server starts on `http://localhost:3000`. To test with Cowork, expose it via ngrok and update `cowork-plugin/.mcp.json` with the ngrok URL.

### Build the plugin ZIP

```bash
npm run pack    # outputs legal-billing.zip
```

Upload `legal-billing.zip` in Cowork to test end-to-end.

---

## Deployment

Push to Dokploy using the included `Dockerfile`. Required env vars:

| Var | Description |
|---|---|
| `SERVER_URL` | Public HTTPS URL of this server (no trailing slash) |
| `PORT` | Port to listen on (default 3000) |
| `GOOGLE_CLIENT_ID` | Google OAuth Web application client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `DATABASE_URL` | Postgres connection string |
| `DATA_DIR` | Directory for any file-based storage |

After deploying, update `cowork-plugin/.mcp.json` with the production URL and rebuild the ZIP.

---

## Compliance

Non-negotiable constraints enforced in `server/index.js` and `cowork-plugin/skills/legal-billing/SKILL.md`:

1. Every trust account output carries "⚠️ Not legal advice — review against your state bar's trust-accounting rules."
2. Every invoice/payment output carries "⚠️ Not legal advice — review before sending to client."
3. Decline anything outside billing and time tracking.
4. `mark_paid` requires explicit attorney confirmation before the tool is called.
5. No undo — attorney corrects errors directly in the sheet.

Do not weaken these constraints.

---

## License

MIT. See [LICENSE](LICENSE).
