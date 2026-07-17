# AI Use Policy Generator — Claude Desktop Plugin

A Claude Desktop plugin for solo and small-firm attorneys. One skill (`/ai-use-policy`) conducts a short guided interview and drafts the three compliance documents every law firm using AI tools needs: an internal AI-use policy, a client-facing disclosure clause for engagement letters, and a one-page safe AI checklist — tailored to your specific tools, practice areas, and jurisdiction.

Distributed free by [Protomated](https://protomated.com).

---

## Installing the plugin

Download the latest `.zip` from [Releases](https://github.com/protomated/claude-ai-use-policy-generator/releases) and drag it into Claude Desktop's Extensions panel. See [`plugin/README.md`](plugin/README.md) for full installation and compliance guidance.

---

## Repo layout

```
plugin/           Installable plugin (packaged into .zip)
  .claude-plugin/plugin.json   Identity manifest
  .mcp.json                    Declares Filesystem connector requirement
  manifest.json                Display metadata and server entry declaration
  prompts/system-prompt.md     Master system prompt — ethical guardrails live here
  skills/ai-use-policy/
    SKILL.md                   The single skill (guided interview + three-document generator)

scripts/
  validate-plugin.mjs          Validates plugin/ structure before packing

docs/
  AI Use Policy Generator - Technical.md   Technical specification

.github/workflows/
  validate.yml     Runs on every push/PR — validates plugin structure
  release.yml      Runs on vX.Y.Z tags — builds, checksums, and publishes a GitHub Release
```

---

## Skill

| Skill | What it does |
|---|---|
| `/ai-use-policy` | Guided interview → drafts (1) internal AI-use policy, (2) client-facing AI-disclosure clause, (3) safe AI checklist. Flags consumer-grade tools touching client data with specific risk notices and enterprise-tier alternatives. |

---

## Development

```bash
# Validate plugin structure (manifest, skill dirs, SKILL.md presence)
npm run validate

# Full build: validate → pack → SHA-256 → artifact
npm run build

# Pack only (skips validate)
npm run pack

# Remove build artifacts
npm run clean

# List plugin files
npm run tree
```

---

## Cutting a release

Create `RELEASE.md` at the repo root, then push a semver tag — CI does the rest:

```bash
git tag v1.0.1
git push origin v1.0.1
```

The release workflow validates, builds, checksums, and publishes a GitHub Release with the `.zip` and `.sha256` attached.

---

## Compliance

The plugin enforces three non-negotiable rules, defined in `plugin/prompts/system-prompt.md` and the `SKILL.md`:

1. **Plan-tier warning** — warns attorneys that consumer Claude (Personal/Pro) must not be used to enter confidential firm information.
2. **Confirmation gating** — Claude must show the attorney exactly what it will do and get explicit in-conversation confirmation before writing any file.
3. **Review wrapper** — every skill output begins and ends with an attorney-review header/footer.

Do not weaken these constraints.

---

## Contributing

Open an issue or pull request. All changes to `plugin/prompts/system-prompt.md` and `SKILL.md` require a brief explanation of why the change does not weaken the compliance constraints above.

---

## License

MIT. See [LICENSE](plugin/LICENSE).
