import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

function userPath(apiKey) {
  return join(DATA_DIR, `${apiKey}.json`);
}

export function getUser(apiKey) {
  if (!apiKey) return null;
  const p = userPath(apiKey);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function createUser(apiKey, spreadsheetUrl) {
  const m = (spreadsheetUrl ?? '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  writeFileSync(userPath(apiKey), JSON.stringify({
    apiKey,
    spreadsheetUrl: spreadsheetUrl ?? '',
    spreadsheetId: m ? m[1] : null,
    tokens: null,
    createdAt: new Date().toISOString(),
  }, null, 2));
}

export function updateUser(apiKey, patch) {
  const user = getUser(apiKey);
  if (!user) return;
  writeFileSync(userPath(apiKey), JSON.stringify({ ...user, ...patch }, null, 2));
}
