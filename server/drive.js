import { google } from 'googleapis';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_XLSX_PATH = join(__dirname, 'assets/legal-billing-template.xlsx');

// Uploads the bundled template file as a brand-new Google Sheet using the
// attorney's own Drive credentials, so they own it outright from creation —
// no copy-then-transfer step, and no cross-domain ownership restriction to
// hit (Google flatly refuses to transfer file ownership between accounts in
// different organizations, which the copy-based approach ran into).
export async function provisionAttorneySheet(attorneyAuth, attorneyEmail) {
  const drive = google.drive({ version: 'v3', auth: attorneyAuth });

  const { data } = await drive.files.create({
    requestBody: {
      name: `Legal Billing – ${attorneyEmail}`,
      mimeType: 'application/vnd.google-apps.spreadsheet',
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: fs.createReadStream(TEMPLATE_XLSX_PATH),
    },
    fields: 'id',
  });

  return {
    spreadsheetId: data.id,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${data.id}/edit`,
  };
}
