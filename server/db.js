import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:54333/legal_billing',
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      sub             TEXT PRIMARY KEY,
      email           TEXT,
      tokens          JSONB,
      spreadsheet_url TEXT,
      spreadsheet_id  TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE users DROP COLUMN IF EXISTS owner_transfer_pending`);
}

export async function getUser(sub) {
  if (!sub) return null;
  const res = await pool.query(
    `SELECT sub, email, tokens,
            spreadsheet_url AS "spreadsheetUrl",
            spreadsheet_id  AS "spreadsheetId"
     FROM users WHERE sub = $1`,
    [sub]
  );
  return res.rows[0] ?? null;
}

export async function disconnectUser(sub) {
  await pool.query(
    `UPDATE users SET tokens = NULL, spreadsheet_url = NULL, spreadsheet_id = NULL,
     updated_at = NOW() WHERE sub = $1`,
    [sub]
  );
}

export async function deleteUser(sub) {
  await pool.query(`DELETE FROM users WHERE sub = $1`, [sub]);
}

export async function saveUser(sub, patch) {
  await pool.query(
    `INSERT INTO users (sub, email, tokens, spreadsheet_url, spreadsheet_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (sub) DO UPDATE SET
       email           = COALESCE($2, users.email),
       tokens          = COALESCE($3, users.tokens),
       spreadsheet_url = COALESCE($4, users.spreadsheet_url),
       spreadsheet_id  = COALESCE($5, users.spreadsheet_id),
       updated_at      = NOW()`,
    [
      sub,
      patch.email          ?? null,
      patch.tokens         ? JSON.stringify(patch.tokens) : null,
      patch.spreadsheetUrl ?? null,
      patch.spreadsheetId  ?? null,
    ]
  );
}
