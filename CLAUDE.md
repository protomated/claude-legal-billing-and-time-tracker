# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **Claude Desktop plugin** for solo attorneys — one skill (`/ai-use-policy`) that conducts a guided interview and drafts three compliance documents: an internal AI-use policy, a client-facing AI-disclosure clause for engagement letters, and a one-page safe AI checklist. There is no runtime code, no MCP server, and no backend. The product is entirely content: a markdown skill file, JSON manifests, and a reference doc.

## Repo layout

```
plugin/           The installable plugin (packaged into .zip bundle)
  .claude-plugin/plugin.json   Manifest validated by scripts/validate-plugin.mjs
  .mcp.json                    Declares filesystem connector requirement
  manifest.json                Plugin metadata (manifest_version, server entry)
  prompts/system-prompt.md     Master system prompt — ethical guardrails live here
  skills/ai-use-policy/SKILL.md  The single skill; YAML frontmatter + markdown body
scripts/
  validate-plugin.mjs          Validates plugin/ structure before packing
docs/                          Technical spec and reference docs
```

## Commands

All commands run from the repo root.

```bash
# Validate plugin structure (manifest, skill dirs, SKILL.md presence)
npm run validate

# Full build: validate → pack → SHA-256 → artifact
npm run build

# Pack only (skips validate)
npm run pack

# Cut a GitHub release (runs build first; requires RELEASE.md at repo root)
npm run release

# Remove build artifacts
npm run clean

# List plugin files (excludes node_modules)
npm run tree
```

## Plugin format

The bundle format is `.zip`. It uses the **plugin variant** (not standalone) — no bundled MCP server.

Two manifests serve different purposes:
- `plugin/.claude-plugin/plugin.json` — the identity manifest the validator and Claude Desktop read (`name` must be kebab-case)
- `plugin/manifest.json` — display metadata and server entry point declaration

The validator (`scripts/validate-plugin.mjs`) checks:
- `.claude-plugin/plugin.json` is valid JSON with a kebab-case `name`
- Each `skills/*/` subdirectory contains a `SKILL.md`
- `agents/`, `commands/`, `hooks/` (if present) contain files with the expected extension

## Skill files

Each `SKILL.md` has YAML frontmatter:
```yaml
---
name: skill-name
description: shown to attorney in /skills list
argument-hint: "[hint shown in Claude Desktop]"
---
```

The body instructs Claude what to do (via the built-in Filesystem connector), what output format to produce, and what confirmation to request before any state-changing action.

## Compliance constraints — non-negotiable

These rules are enforced in `prompts/system-prompt.md` and repeated in `SKILL.md`. Do not weaken them:

1. **Confirmation gating**: Claude must show the attorney exactly what it will do and get explicit in-conversation confirmation before writing any file.
2. **Required output wrapper**: Every skill output must begin and end with the prescribed attorney-review header/footer (see `prompts/system-prompt.md` for exact text).
3. **Plan-tier warning**: The system prompt must warn that consumer-tier Claude (claude.ai Personal / Pro) must not be used to enter confidential firm information.

## Notes

- `plugin/manifest.json` declares `server/entry_point: "server/index.js"` but `plugin/server/index.js` does not exist — the plugin variant does not require a bundled server, so this field is inert.
- `plugin/README.md` and `plugin/CONNECTORS.md` are end-user documentation included in the ZIP bundle; they are not internal developer docs.
- `npm run release` passes `--notes-file RELEASE.md` to `gh release create` — create `RELEASE.md` at repo root before running it.
