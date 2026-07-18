import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.legal-billing');
const TOKENS_FILE = join(CONFIG_DIR, 'tokens.json');

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadTokens() {
  try { return JSON.parse(readFileSync(TOKENS_FILE, 'utf8')); }
  catch { return null; }
}

export function saveTokens(tokens) {
  ensureDir();
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}
