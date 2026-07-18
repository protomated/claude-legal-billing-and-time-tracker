import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

function userPath(sub) {
  return join(DATA_DIR, `${sub}.json`);
}

export function getUser(sub) {
  if (!sub) return null;
  const p = userPath(sub);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function saveUser(sub, patch) {
  const existing = getUser(sub) ?? { sub, createdAt: new Date().toISOString() };
  writeFileSync(userPath(sub), JSON.stringify({ ...existing, ...patch }, null, 2));
}

// Returns the sub of the only stored user who has tokens.
// Returns null if there are zero or more than one (can't auto-pick safely).
export function findSingleUser() {
  try {
    const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    if (files.length !== 1) return null;
    const sub = files[0].replace('.json', '');
    const user = getUser(sub);
    return user?.tokens ? sub : null;
  } catch {
    return null;
  }
}
