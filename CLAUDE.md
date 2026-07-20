# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this branch is

**PAC-80 — HTTP MCP Server** (`feature/http-mcp-server`). This branch is the remote/cloud deployment of the Legal Billing and Time Tracker MCP server. It exposes the same billing tools over HTTP (StreamableHTTPServerTransport) so attorneys can use it via Claude.ai Cowork connectors without installing a local extension.

The `.mcpb` desktop extension lives on the `main` branch. This branch contains only the HTTP server and its infrastructure.

Landing page: `protomated.com/templates/legal-billing-time-tracker/` (WordPress — managed outside this repo).

## Repo layout

```
server/
  index.js          HTTP MCP server — Express + StreamableHTTPServerTransport
  auth.js           Google OAuth2 flow (web application flow, redirect to SERVER_URL)
  db.js             Postgres access — users table, token storage
  connect-google.html  OAuth callback landing page

docker-compose.yml  Postgres service (port 54333)
Dockerfile          Server image for deployment
docs/
  NTC-A-1.md, PAC-A-3.md   Engineer onboarding reference docs
```

## Commands

```bash
# Start Postgres
docker compose up -d postgres

# Start the HTTP MCP server
npm start
# or: node server/index.js
```

Server runs at `http://localhost:3000/mcp`.

## Architecture: HTTP MCP server + Postgres

```
Attorney adds connector URL in Claude.ai → OAuth via SERVER_URL/connect
         ↓
Claude.ai calls MCP tools over HTTP (StreamableHTTPServerTransport)
         ↓
server/index.js → Google Sheets API → attorney's Google Sheet
         ↓
Postgres (users table) — stores tokens + spreadsheet config per user
```

**Session flow:** Each MCP connection gets a session ID. On first tool call, the server checks Postgres for an existing user (single-user mode: `findSingleUser()`). After OAuth the session is bound to the user's `sub`.

**OAuth:** Web application flow. `connect_google` returns a plain URL (`SERVER_URL/connect?s=sessionId`). Attorney clicks it, signs in, callback at `SERVER_URL/oauth/callback` exchanges the code for tokens and saves them to Postgres.

**Spreadsheet ID:** Set via `set_spreadsheet_url` tool on first use, stored in Postgres per user.

## MCP tools

| Tool | Action |
|---|---|
| `connect_google` | Return sign-in URL; initiate OAuth |
| `set_spreadsheet_url` | Save the attorney's Google Sheet URL to their profile |
| `log_time` | Append row to Time Tracker tab |
| `mark_billed` | Update Unbilled → Billed for a client |
| `mark_paid` | Update Billed → Paid (requires explicit confirmation before call) |
| `add_trust_entry` | Append deposit or withdrawal to Trust Account tab |
| `get_dashboard` | Read Dashboard tab summary rows |
| `get_time_entries` | Read Time Tracker rows; filter by client/status |
| `get_trust_entries` | Read Trust Account rows; filter by client |
| `get_year_end_summary` | Read Year-End Summary tab (annual revenue totals) |
| `get_matter_profitability` | Read Rate My Matters tab (matter profitability analysis) |
| `get_invoice` | Read Invoice tab (current invoice preview) |

## MCP prompts (slash commands)

Exposed via `prompts/list` / `prompts/get`. Appear in Claude.ai as `/legal-billing:prompt-name`.

| Prompt | What it does |
|---|---|
| `log-time` | Guided time entry workflow |
| `billing-review` | Weekly billing health check (read-only) |
| `invoice-client` | End-to-end invoice flow |
| `trust-entry` | Trust deposit/withdrawal with safety checks |

## Environment variables

Copy `.env.example` to `.env`:

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID (Web application type) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `SERVER_URL` | Public URL of this server (ngrok URL for local testing) |
| `DATABASE_URL` | Postgres connection string (default: `postgresql://user:pass@localhost:54333/legal_billing`) |
| `PORT` | HTTP port (default: 3000) |

## Sheet column layout

**Time Tracker** (A–K): Date | Client Name | Matter Name | Matter Type | Description of Work | Hours Worked | Hourly Rate ($) | Total Fee (formula) | Invoice Status | Date Invoiced | Date Paid

**Trust Account** (A–I): Date | Client Name | Matter Name | Description | Deposits (+) | Withdrawals (-) | Running Balance (formula) | Bank Statement Balance | Difference

**Rate My Matters** (A–G): Matter Name | Matter Type | Flat Fee Charged ($) | Total Hours Spent | Effective Hourly Rate | Standard Hourly Rate | Verdict

**Year-End Summary** (A–B): Label | Value (Total Revenue Billed, Collected, Uncollected)

**Invoice** (A–H): Template invoice — firm header, client info, line items, totals (read-only via `get_invoice`)

**Dashboard** (A–B): Label | Value (read-only; auto-calculated formulas)

## Before deploying

1. **Google OAuth credentials** — create a Web application OAuth client in Google Cloud Console
   - Authorized redirect URI: `{SERVER_URL}/oauth/callback`
   - Submit for Google OAuth verification (Sheets scope is sensitive)
2. **Set env vars** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SERVER_URL`, `DATABASE_URL`
3. **Postgres** — run `docker compose up -d postgres` or point `DATABASE_URL` at a managed instance

## Compliance constraints — non-negotiable

Enforced in `server/index.js` tool descriptions. Do not weaken:

1. **Trust disclaimer**: Every trust account output must carry "⚠️ Not legal advice — review against your state bar's trust-accounting rules."
2. **Billing disclaimer**: Every invoice and payment output must carry "⚠️ Not legal advice — review before sending to client."
3. **No legal advice**: Decline any request outside billing and time tracking.
4. **markPaid confirmation gate**: State what will change, wait for explicit confirmation, then call `mark_paid`.
5. **No undo**: Direct attorney to correct the row in their Google Sheet.

## Commit style

Do not include `Co-Authored-By` attribution lines in commit messages.
