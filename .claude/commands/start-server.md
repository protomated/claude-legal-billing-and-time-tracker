---
description: Start the HTTP MCP server locally for development and testing
---

Start the Legal Billing HTTP MCP server:

```bash
# Start Postgres first (if not already running)
docker compose up -d postgres

# Start the server
npm start
```

Server runs at `http://localhost:3000/mcp`.

Add it as a connector in Claude.ai → Settings → Connectors → Add custom connector with that URL.

To expose publicly for Cowork testing:
```bash
ngrok http 3000
```

Then update `SERVER_URL` in `.env` to the ngrok HTTPS URL and restart.

**Required environment variables** (copy `.env.example` to `.env`):
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — Web application OAuth client from Google Cloud Console
- `SERVER_URL` — public URL (ngrok URL when testing externally; must match the OAuth redirect URI)
- `DATABASE_URL` — defaults to `postgresql://user:pass@localhost:54333/legal_billing`
