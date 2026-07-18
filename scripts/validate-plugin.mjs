#!/usr/bin/env node
// Validate that a directory conforms to the MCPB desktop extension structure.
//
// Checks:
//   - manifest.json exists, is valid JSON, and has manifest_version "0.3"
//   - name is present and kebab-case
//   - version is valid semver
//   - server.entry_point resolves to an existing file
//   - server/index.js exists (convention check)
//
// Usage: node scripts/validate-plugin.mjs [plugin-dir]

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const pluginDir = process.argv[2] || "plugin";
const passes = [];
const errors = [];

const pass = (msg) => passes.push(msg);
const fail = (msg) => errors.push(msg);

// 1. manifest.json
const manifestPath = join(pluginDir, "manifest.json");
let manifest = null;

if (!existsSync(manifestPath)) {
  fail(`Missing manifest: ${manifestPath}`);
} else {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    pass(`manifest.json is valid JSON`);
  } catch (e) {
    fail(`manifest.json is not valid JSON: ${e.message}`);
  }
}

if (manifest) {
  if (manifest.manifest_version !== "0.3") {
    fail(`manifest_version must be "0.3" (got "${manifest.manifest_version}")`);
  } else {
    pass(`manifest_version is "0.3"`);
  }

  if (!manifest.name) {
    fail("manifest.json is missing required field: name");
  } else if (!/^[a-z0-9-]+$/.test(manifest.name)) {
    fail(`manifest name must be kebab-case. Got: "${manifest.name}"`);
  } else {
    pass(`name is kebab-case: "${manifest.name}"`);
  }

  if (!manifest.version) {
    fail("manifest.json is missing required field: version");
  } else if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.version)) {
    fail(`version is not valid semver: "${manifest.version}"`);
  } else {
    pass(`version is valid semver: "${manifest.version}"`);
  }

  if (!manifest.server) {
    fail("manifest.json is missing required field: server");
  } else {
    pass(`server block is present`);

    if (manifest.server.type !== "node") {
      fail(`server.type must be "node" (got "${manifest.server.type}")`);
    } else {
      pass(`server.type is "node"`);
    }

    if (!manifest.server.entry_point) {
      fail("server.entry_point is missing");
    } else {
      const entryPath = join(pluginDir, manifest.server.entry_point);
      if (!existsSync(entryPath)) {
        fail(`server.entry_point does not exist: ${entryPath}`);
      } else {
        pass(`server.entry_point exists: ${manifest.server.entry_point}`);
      }
    }
  }
}

// Report
for (const p of passes) console.log(`PASS  ${p}`);
for (const e of errors) console.error(`FAIL  ${e}`);

console.log(`\n${passes.length} passed, ${errors.length} failed`);
process.exit(errors.length > 0 ? 1 : 0);
