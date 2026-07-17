# Connectors

This plugin uses one connector that ships with Claude Desktop. It is managed by Anthropic — you do not need to set up credentials or install anything beyond Claude Desktop.

## Connector for this plugin

| Connector | What it does | Setup |
|---|---|---|
| **Filesystem** | Saves generated policy documents (AI-use policy, disclosure clause, safe AI checklist) to the folder you select. The plugin only writes files when you explicitly confirm. | Connect once via Claude Desktop → Settings → Connectors → Filesystem → "Connect" then select your firm policies folder |

## How to connect

1. Open Claude Desktop.
2. Go to **Settings → Connectors**.
3. Find **Filesystem** — click **Connect**.
4. You'll be prompted to choose a folder. Select the folder where you want your generated policy documents saved. Example: `~/Documents/Firm-Policies`.
5. Only files inside the folder you select are accessible to the plugin.
6. Restart Claude Desktop if prompted.

## What the connector can access

| Connector | Can access | Cannot access |
|---|---|---|
| Filesystem | Files and folders inside the path you selected during setup | Any folder outside your configured allow-list |

## Privacy note

The plugin conducts its interview entirely within your Claude Desktop conversation. No interview answers or generated documents are transmitted to Protomated or any third party. All data is processed under your Claude plan's data handling terms. The Filesystem connector only writes files when you explicitly confirm, and only inside the folder you selected.

## Troubleshooting

**Filesystem shows "Not connected":**
Go to Settings → Connectors → Filesystem and click Connect. Make sure you select a folder you have read/write access to.

**"Permission denied" when saving a file:**
The target folder may be outside your configured allow-list. Go to Settings → Connectors → Filesystem and verify or update the path. The plugin cannot write to folders outside the path you selected.

**Plugin can't find the Filesystem connector:**
Make sure you are on a qualifying Claude plan (Claude for Work, Team, or Enterprise). The Filesystem connector is not available on consumer plans. See README.md for plan requirements.
