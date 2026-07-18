# Legal Billing and Time Tracker — Claude Desktop Extension

Log billable hours, generate invoices, manage trust accounts, and monitor
revenue — all by chatting naturally in Claude Desktop. Your data lives in
your own Google Sheet. No monthly subscription, no relay, no shared
credentials.

Distributed free by [Protomated](https://protomated.com).

---

## Installing the extension

Download the latest `.mcpb` from [Releases](https://github.com/protomated/claude-legal-billing-and-time-tracker/releases) and install it in Claude Desktop → Extensions → Add. See [`plugin/README.md`](plugin/README.md) for full installation and compliance guidance.

---

## Repo layout

```
plugin/           Installable extension (packaged into .mcpb)
  manifest.json                MCPB manifest — server declaration + user_config
  package.json                 Runtime dependencies
  node_modules/                Bundled deps (generated at build time; gitignored)
  server/
    index.js                   MCP server entry — tool definitions + request handler
    auth.js                    Google OAuth2 flow (local callback on port 8085)
    sheets.js                  Google Sheets API operations
    config.js                  Token persistence (~/.legal-billing/tokens.json)
  README.md                    Attorney-facing setup guide

scripts/
  validate-plugin.mjs          Validates MCPB structure before packing

docs/
  NTC-A-1.md, PAC-A-3.md      Engineer onboarding reference docs
```

---

## MCP Tools

| Tool | What it does |
|---|---|
| `connect_google` | Run the one-time Google OAuth flow |
| `log_time` | Append a billable time entry to the Time Tracker tab |
| `mark_billed` | Mark all Unbilled entries for a client as Billed |
| `mark_paid` | Mark all Billed entries for a client as Paid (confirmation required) |
| `add_trust_entry` | Append a trust deposit or withdrawal |
| `get_dashboard` | Read the Dashboard tab and return billing summary |

---

## Development

### 1. Google OAuth credentials (required before running locally or publishing)

The MCP server uses Google OAuth to write to attorneys' Google Sheets. You need a Google Cloud OAuth client configured for a desktop app.

**Create the OAuth client:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Desktop app**
4. Name: `Legal Billing and Time Tracker` (or anything)
5. Click **Create**

**Register the redirect URI:**
In the created client, under "Authorized redirect URIs", add:
```
http://localhost:8085/oauth/callback
```

**Enable the API:**
Go to APIs & Services → Library → search "Google Sheets API" → Enable.

**Add credentials to the server:**
Open `plugin/server/auth.js` and replace the placeholders:
```js
const CLIENT_ID = '[GOOGLE_CLIENT_ID]';      // ← paste your Client ID
const CLIENT_SECRET = '[GOOGLE_CLIENT_SECRET]'; // ← paste your Client Secret
```

> **Publishing note:** The Google Sheets scope (`spreadsheets`) is classified as sensitive. Before releasing to external users (anyone outside your Google Workspace), submit the OAuth app for [Google verification](https://support.google.com/cloud/answer/9110914). Until verified, users see an "unverified app" warning. Internal testing (yourself, your team) works without verification.

### 2. Build and run

```bash
# Validate MCPB structure
npm run validate

# Full build: validate → install server deps → pack → SHA-256
npm run build

# Pack only (runs install:server first)
npm run pack

# Remove build artifacts
npm run clean

# List plugin files (excludes node_modules)
npm run tree
```

---

## Cutting a release

Create or update `RELEASE.md` at the repo root, then push a semver tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

The release workflow validates, builds, checksums, and publishes a GitHub Release with the `.mcpb` and `.mcpb.sha256` attached.

---

## Compliance

Non-negotiable constraints enforced in `plugin/server/index.js` tool descriptions:

1. **Trust disclaimer** — every trust account output carries "Not legal advice — review against your state bar's trust-accounting rules."
2. **Billing disclaimer** — every invoice and payment output carries "Not legal advice — review before sending to client."
3. **No legal advice** — decline anything outside billing and time tracking.
4. **markPaid confirmation gate** — state what will change and get explicit confirmation before calling `mark_paid`.
5. **No undo** — no delete or reverse action; attorney corrects errors directly in the sheet.

Do not weaken these constraints.

---

## Contributing

Open an issue or pull request. All changes to `plugin/server/index.js` tool descriptions that affect compliance behavior require a brief explanation of why the change does not weaken the constraints above.

---

## License

MIT. See [LICENSE](plugin/LICENSE).
