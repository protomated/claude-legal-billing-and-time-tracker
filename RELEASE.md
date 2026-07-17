# AI Use Policy Generator v1.0.0

Initial release.

## What's included

### `/ai-use-policy` — AI Use Policy & Client-Disclosure Generator

A guided interview that produces three compliance documents tailored to your firm's tools, practice areas, and jurisdiction:

1. **Internal AI-Use Policy** — governance document covering approved tools and tier requirements, data classification rules, required disclosures, supervision and review requirements, staff training, prohibited uses, incident reporting, and a state ethics compliance placeholder.
2. **Client-Facing AI-Disclosure Clause** — a ready-to-paste paragraph for engagement letters, with an optional client opt-out provision.
3. **Safe AI Checklist** — a one-page operational reference with four checkpoints: before using AI on a matter, when entering content, when reviewing output, and before sending any AI-assisted document.

Also flags any consumer-grade AI tools (ChatGPT Plus/Pro, personal Claude, personal Copilot/Gemini/Perplexity, etc.) currently in use with client data, with specific risk notices and enterprise-tier alternatives.

## Setup

Install time: under 10 minutes. Connect the Filesystem connector once in Claude Desktop → Settings → Connectors → Filesystem, then point it at your firm policies folder. See `plugin/CONNECTORS.md` for step-by-step instructions.

## Compliance

Requires Claude for Work, Claude Team, or Claude Enterprise. Do not use a consumer Claude plan (Claude Pro or Personal) with confidential firm information. Every output carries an *AI-ASSISTED DRAFT — ATTORNEY REVIEW REQUIRED* header. All three generated documents are starting drafts that require attorney review and formal firm adoption before use. The plugin never writes files without your explicit in-conversation confirmation.
