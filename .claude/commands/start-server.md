---
description: Start the HTTP MCP server locally for development and testing
---

Start the Legal Billing HTTP MCP server:

```bash
# Make sure Postgres is running first
docker compose up -d postgres

# Start the server from the repo root
node server/index.js
```

The server starts at `http://localhost:3000/mcp`.

Add it as a connector in Claude Desktop → Settings → Connectors → Add custom connector with that URL.

To expose it publicly for testing with Claude.ai Cowork, use ngrok:
```bash
ngrok http 3000
```

Then update the connector URL to the ngrok HTTPS URL.

**Required environment variables** (copy `.env.example` to `.env`):
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — from Google Cloud Console (Web application OAuth client)
- `SERVER_URL` — public URL (set to ngrok URL when testing externally)
- `DATABASE_URL` — defaults to `postgresql://user:pass@localhost:54333/legal_billing`
