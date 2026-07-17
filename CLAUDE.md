# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**PAC-64 (CP3)** — AI Use Policy & Client-Disclosure Generator. A Claude Desktop plugin for solo and small-firm attorneys. One skill (`/ai-use-policy`) conducts a guided interview and produces three compliance documents: an internal AI-use policy, a client-facing AI-disclosure clause for engagement letters, and a one-page safe AI checklist. There is no runtime code, no MCP server, and no backend. The product is entirely content: a markdown skill file, JSON manifests, and a reference doc.

Landing page: `protomated.com/templates/ai-use-policy-generator/` (WordPress — managed outside this repo).

## Repo layout

```
plugin/           The installable plugin (packaged into .zip bundle)
  .claude-plugin/plugin.json   Manifest validated by scripts/validate-plugin.mjs
  .mcp.json                    Declares filesystem connector requirement (only)
  manifest.json                Plugin display metadata
  prompts/system-prompt.md     Master system prompt — ethical guardrails live here
  skills/ai-use-policy/SKILL.md  The single skill; YAML frontmatter + markdown body
scripts/
  validate-plugin.mjs          Validates plugin/ structure before packing
docs/
  AI Use Policy Generator - Technical.md   Technical specification
  NTC-A-1.md, PAC-A-3.md                  Engineer onboarding reference docs
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

The bundle format is `.zip`. It uses the **plugin variant** (not standalone) — no bundled MCP server. Plugin name: `ai-use-policy-generator`, current version: `1.0.0`.

Two manifests serve different purposes:
- `plugin/.claude-plugin/plugin.json` — the identity manifest the validator and Claude Desktop read (`name` must be kebab-case)
- `plugin/manifest.json` — display metadata only (no `server` block — this is a plugin variant, not standalone)

The validator (`scripts/validate-plugin.mjs`) checks:
- `.claude-plugin/plugin.json` is valid JSON with a kebab-case `name`
- Each `skills/*/` subdirectory contains a `SKILL.md`
- `agents/`, `commands/`, `hooks/` (if present) contain files with the expected extension

## Skill: /ai-use-policy

The single skill conducts a 6-section guided interview, then produces:
1. **Internal AI-Use Policy** — firm-level governance document (§1–10 structure)
2. **Client-Facing AI-Disclosure Clause** — engagement-letter paragraph with optional opt-out
3. **Safe AI Checklist** — one-page, four-checkpoint operational reference

It also flags consumer-grade AI tools touching client data and suggests enterprise-tier alternatives.

The skill works **entirely from the attorney's answers** — it does not read email, calendar, or existing files. The Filesystem connector is used only to save the three generated documents, with explicit attorney confirmation required before any write.

Each `SKILL.md` has YAML frontmatter:
```yaml
---
name: skill-name
description: shown to attorney in /skills list
argument-hint: "[hint shown in Claude Desktop]"
---
```

## Compliance constraints — non-negotiable

These rules are enforced in `prompts/system-prompt.md` and `SKILL.md`. Do not weaken them:

1. **Confirmation gating**: Claude must show the attorney exactly what it will do and get explicit in-conversation confirmation before writing any file.
2. **Required output wrapper**: Every skill output must begin and end with the prescribed attorney-review header/footer (see `prompts/system-prompt.md` for exact text).
3. **Plan-tier warning**: The system prompt must warn that consumer-tier Claude (claude.ai Personal / Pro) must not be used to enter confidential firm information.
4. **Starting-draft caveat**: All three generated documents must carry language that they are starting drafts requiring attorney review and formal firm adoption before use. This is not optional.

## Notes

- `plugin/manifest.json` has no `server` block — the plugin variant does not require one. Do not add one.
- `plugin/README.md` and `plugin/CONNECTORS.md` are end-user documentation included in the ZIP bundle; they are not internal developer docs.
- The root `.mcp.json` is gitignored — it holds workspace-level Claude Code MCP credentials and is not part of the plugin artifact.
- `npm run release` passes `--notes-file RELEASE.md` to `gh release create` — create/update `RELEASE.md` at repo root before running it.
- There is no `site/` directory in this repo — the landing page is on WordPress.
