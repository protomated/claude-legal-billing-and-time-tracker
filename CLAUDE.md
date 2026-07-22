# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**PAC-80** — Legal Billing and Time Tracker. A Claude Cowork plugin for solo and small-firm attorneys. Attorneys log billable hours, generate invoices, manage trust account activity, and check revenue by chatting naturally inside Claude Cowork.

The plugin ships as a `.zip` (uploadable via Cowork → Plugins → Add). It connects to a hosted HTTP MCP server that reads and writes to the attorney's own Google Sheet via OAuth.

Landing page: `protomated.com/templates/legal-billing-time-tracker/` (WordPress — managed outside this repo).

## Repo layout

```
cowork-plugin/        The installable Cowork plugin (packed into legal-billing.zip)
  .claude-plugin/
    plugin.json                Plugin manifest (name, version, description, author)
  .mcp.json                   HTTP MCP connector URL
  skills/
    legal-billing/
      SKILL.md                Auto-activating skill — triggers, tool rules, compliance gates
  commands/
    log-time.md               Guided time entry
    billing-review.md         Weekly billing health check
    invoice-client.md         End-to-end invoice flow
    trust-entry.md            Trust deposit/withdrawal with safety checks
  CONNECTORS.md               Connector docs for attorneys
  README.md                   Attorney-facing setup and usage guide

server/               HTTP MCP server — deployed to Dokploy
  index.js                    Express + MCP SDK (StreamableHTTPServerTransport)
  auth.js                     Google OAuth2 flow for web context (attorney-facing, Sheets + Drive.file scope)
  db.js                       Postgres-backed session and token store
  sheets.js                   Google Sheets API operations (12 functions)
  drive.js                    Provisions an attorney's billing sheet from the bundled template file
  assets/legal-billing-template.xlsx   Master template, uploaded directly into each attorney's own Drive
  connect-google.html         OAuth success/error page served at /connect
  package.json                Server dependencies

Dockerfile            Container build
docker-compose.yml    Local container stack (server + postgres)
.env.example          Required env vars template

docs/
  NTC-A-1.md          Engineer onboarding: n8n template catalog track
  PAC-A-3.md          Engineer onboarding: Claude plugin catalog track
```

## Commands

All commands run from the repo root.

```bash
# Install server production dependencies into server/node_modules/
npm run install:server

# Start the HTTP MCP server locally (requires .env)
npm run start

# Build the Cowork plugin ZIP (output: legal-billing.zip)
npm run pack

# Remove build artifacts
npm run clean
```

### Running locally with Docker

```bash
cp .env.example .env   # fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
docker-compose up
```

The server starts on `http://localhost:3000`. For Cowork testing, expose it via ngrok:

```bash
ngrok http 3000
# then update cowork-plugin/.mcp.json with the ngrok URL
```

## Architecture

```
Attorney installs legal-billing.zip → plugin connects to HTTP MCP server
         ↓
Claude calls MCP tools (log_time, mark_billed, etc.)
         ↓
HTTP MCP server (Dokploy) → Google Sheets API → attorney's Google Sheet
                                                   (auto-created from the template on first use, or connected manually)
```

**OAuth:** `connect_google` returns a sign-in URL. The attorney opens it in their browser, authorizes Sheets + Drive.file access, and is redirected to `/oauth/callback`. Tokens are stored in Postgres keyed by Google `sub` (user ID). Sessions are in-memory — attorneys re-auth at the start of each new Claude conversation, which triggers Google's one-click flow if they are already signed in. There is no fallback that binds a new session to an existing user without real OAuth — that was tried and removed as a cross-tenant auth risk.

**Spreadsheet provisioning:** If an attorney has no sheet on file, the skill asks whether to create one from the template or connect an existing one.
- New sheet: `create_billing_sheet` uploads the bundled `server/assets/legal-billing-template.xlsx` directly into the attorney's own Drive using their own OAuth credentials (`drive.js`), converting it to a native Google Sheet on upload. The attorney owns the file outright from creation — no copy-then-transfer step. (An earlier design copied the template from a Protomated-owned Google Sheet and tried to transfer ownership to the attorney; Google flatly rejects ownership transfer across organizations — `ownershipChangeAcrossDomainNotPermitted` — so that approach never actually worked. Don't reintroduce it.)
- Existing sheet: `set_spreadsheet_url` tool saves whatever URL the attorney provides.
Either way the resulting spreadsheet ID is saved per user.

**Deployment:** `Dockerfile` + `docker-compose.yml` for Dokploy. `SERVER_URL` env var must be set to the public HTTPS URL (used to build the OAuth callback URI and the sign-in link returned to Claude).

## MCP tools

| Tool | Action |
|---|---|
| `connect_google` | Return a sign-in URL for Google OAuth; check connection status |
| `create_billing_sheet` | Create the attorney's sheet from the template and connect it (first-time setup; confirm before calling) |
| `set_spreadsheet_url` | Save the attorney's existing Google Sheet URL (first-time setup) |
| `disconnect_google` | Revoke Google OAuth and clear the saved spreadsheet reference (requires explicit confirmation before call) |
| `delete_account` | Permanently delete the attorney's account record from Protomated's database (requires explicit confirmation before call) |
| `log_time` | Append a time entry to the Time Tracker tab |
| `mark_billed` | Mark all Unbilled entries for a client as Billed |
| `mark_paid` | Mark all Billed entries as Paid (requires explicit confirmation before call) |
| `add_trust_entry` | Append a trust deposit or withdrawal |
| `get_dashboard` | Read Dashboard tab summary |
| `get_time_entries` | Read Time Tracker rows, filter by client/status/limit |
| `get_trust_entries` | Read Trust Account rows, filter by client/limit |
| `get_year_end_summary` | Read Year-End Summary tab |
| `get_matter_profitability` | Read Rate My Matters tab |
| `get_invoice` | Read Invoice tab preview |

## Sheet column layout

**Time Tracker** (A–J): Date | Client Name | Matter Name | Matter Type | Description | Hours | Rate | Total Fee (formula) | Status | Invoice Date

**Trust Account** (A–G): Date | Client Name | Matter Name | Description | Deposit | Withdrawal | Running Balance (formula)

**Dashboard** (A–B): Label | Value (read-only; auto-calculated formulas)

**Invoice**, **Year-End Summary**, **Rate My Matters** — read-only computed tabs; structure defined in the Google Sheet template.

## Before publishing

1. **Google OAuth credentials** in `.env`:
   - Create a Web application OAuth client in Google Cloud Console
   - Register redirect URI: `${SERVER_URL}/oauth/callback`
   - Submit for Google OAuth verification (Sheets scope is sensitive — required for external users)

2. **`SERVER_URL`** in `.env` — the public HTTPS URL of the deployed server (Dokploy domain)

3. **`cowork-plugin/.mcp.json`** — update the URL from the ngrok testing URL to the production Dokploy URL

4. To update the master template, replace `server/assets/legal-billing-template.xlsx` (export the canonical Google Sheet as `.xlsx` via File → Download) — no other config needed.

## Compliance constraints — non-negotiable

Enforced in `server/index.js` tool descriptions and `cowork-plugin/skills/legal-billing/SKILL.md`. Do not weaken:

1. **Trust disclaimer**: Every trust account output must carry "⚠️ Not legal advice — review against your state bar's trust-accounting rules."
2. **Billing disclaimer**: Every invoice and payment output must carry "⚠️ Not legal advice — review before sending to client."
3. **No legal advice**: Decline any request outside billing and time tracking.
4. **markPaid confirmation gate**: State what will change, wait for explicit confirmation, then call `mark_paid`.
5. **No undo**: Direct attorney to correct the row in their Google Sheet.
6. **createBillingSheet confirmation gate**: Never call `create_billing_sheet` without the attorney explicitly choosing to create a new sheet over connecting an existing one.
7. **disconnectGoogle confirmation gate**: State that it clears the Google connection and saved sheet reference, wait for explicit confirmation, then call `disconnect_google`.
8. **deleteAccount confirmation gate**: State exactly what will be deleted and that it's irreversible, wait for explicit confirmation, then call `delete_account`.

## Commit style

Do not include `Co-Authored-By` attribution lines in commit messages.

## Canonical plugin description

> Track billable hours, generate invoices, manage trust accounts, and monitor revenue — all by chatting naturally. Free replacement for Clio and PracticePanther billing modules for solo attorneys.
