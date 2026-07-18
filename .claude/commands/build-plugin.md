---
description: Build and validate the .mcpb desktop extension bundle
---

Build the `.mcpb` Desktop Extension file:

```bash
# Full build: validate → install deps → pack → SHA-256
npm run build

# Or step by step:
npm run validate        # check manifest structure
npm run install:server  # install runtime deps into plugin/node_modules/
npm run pack            # zip into .mcpb
npm run checksum        # generate .sha256
```

Output: `legal-billing-time-tracker-v{version}.mcpb` in the repo root.

**Before building for release:**
1. Fill `[GOOGLE_CLIENT_ID]` and `[GOOGLE_CLIENT_SECRET]` in `plugin/server/auth.js`
2. Fill `[TEMPLATE_SHEET_URL]` in `plugin/README.md`
3. Update `RELEASE.md` with release notes
4. Bump the version in `package.json` and `plugin/manifest.json`

**To cut a GitHub release:**
```bash
npm run release
```
Requires `gh` CLI authenticated and `RELEASE.md` up to date.
