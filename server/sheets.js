import { google } from 'googleapis';

// Tab names — must match the template sheet exactly.
const TIME_TRACKER    = 'Time Tracker';
const TRUST_ACCOUNT   = 'Trust Account';
const DASHBOARD       = 'Dashboard';
const INVOICE         = 'Invoice';
const YEAR_END        = 'Year-End Summary';
const RATE_MY_MATTERS = 'Rate My Matters';

// Time Tracker columns (1-indexed): A=Date B=ClientName C=MatterName D=MatterType
// E=Description F=Hours G=Rate H=TotalFee(formula) I=Status J=InvoiceDate
//
// Trust Account columns: A=Date B=ClientName C=MatterName D=Description
// E=Deposit F=Withdrawal G=RunningBalance(formula)

function sheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

export async function logTime(auth, spreadsheetId, entry) {
  const { date, clientName, matterName, matterType, description, hours, rate } = entry;
  const total = hours * rate;

  await sheetsClient(auth).spreadsheets.values.append({
    spreadsheetId,
    range: `'${TIME_TRACKER}'!A:J`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        date, clientName, matterName ?? '', matterType ?? '', description ?? '',
        hours, rate, `=${hours}*${rate}`, 'Unbilled', ''
      ]]
    }
  });

  return {
    success: true,
    message: `Logged: ${hours} hrs for ${clientName}${matterName ? ` (${matterName})` : ''} at $${rate}/hr — $${total} total. Status: Unbilled.`
  };
}

export async function markBilled(auth, spreadsheetId, clientName) {
  const s = sheetsClient(auth);
  const res = await s.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TIME_TRACKER}'!A:J`
  });

  const rows = res.data.values ?? [];
  const today = new Date().toISOString().split('T')[0];
  const clientLower = clientName.toLowerCase();
  const updates = [];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1]?.toLowerCase() === clientLower && rows[i][8] === 'Unbilled') {
      updates.push({ range: `'${TIME_TRACKER}'!I${i + 1}:J${i + 1}`, values: [['Billed', today]] });
    }
  }

  if (updates.length === 0) {
    return { success: false, message: `No unbilled entries found for: ${clientName}` };
  }

  await s.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { data: updates, valueInputOption: 'USER_ENTERED' }
  });

  const n = updates.length;
  return {
    success: true,
    message: `Invoice generated for ${clientName} — ${n} entr${n === 1 ? 'y' : 'ies'} marked Billed. Invoice date: ${today}.`
  };
}

export async function markPaid(auth, spreadsheetId, clientName) {
  const s = sheetsClient(auth);
  const res = await s.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TIME_TRACKER}'!A:J`
  });

  const rows = res.data.values ?? [];
  const clientLower = clientName.toLowerCase();
  const updates = [];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1]?.toLowerCase() === clientLower && rows[i][8] === 'Billed') {
      updates.push({ range: `'${TIME_TRACKER}'!I${i + 1}`, values: [['Paid']] });
    }
  }

  if (updates.length === 0) {
    return { success: false, message: `No billed entries found for: ${clientName}` };
  }

  await s.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { data: updates, valueInputOption: 'USER_ENTERED' }
  });

  const n = updates.length;
  return {
    success: true,
    message: `Payment recorded — ${n} entr${n === 1 ? 'y' : 'ies'} for ${clientName} marked Paid.`
  };
}

export async function addTrustEntry(auth, spreadsheetId, entry) {
  const { date, clientName, matterName, description, deposit, withdrawal } = entry;

  await sheetsClient(auth).spreadsheets.values.append({
    spreadsheetId,
    range: `'${TRUST_ACCOUNT}'!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        date, clientName, matterName ?? '', description ?? '',
        deposit ?? 0, withdrawal ?? 0, ''
      ]]
    }
  });

  const isDeposit = (deposit ?? 0) > 0;
  const amount = isDeposit ? deposit : withdrawal;
  return {
    success: true,
    message: `Trust ${isDeposit ? 'deposit' : 'withdrawal'} recorded — $${amount} for ${clientName}${matterName ? ` (${matterName})` : ''}.`
  };
}

export async function getDashboard(auth, spreadsheetId) {
  const res = await sheetsClient(auth).spreadsheets.values.get({
    spreadsheetId,
    range: `'${DASHBOARD}'!A:B`
  });

  const rows = (res.data.values ?? []).filter(r => r[0] && r[1]);
  return {
    success: true,
    rows
  };
}

export async function listClients(auth, spreadsheetId) {
  const res = await sheetsClient(auth).spreadsheets.values.get({
    spreadsheetId,
    range: `'${TIME_TRACKER}'!B:B`,
  });
  const rows = res.data.values ?? [];
  const clients = [...new Set(rows.slice(1).map(r => r[0]).filter(Boolean))].sort();
  return clients;
}

export async function getClientSummary(auth, spreadsheetId, clientName) {
  const res = await sheetsClient(auth).spreadsheets.values.get({
    spreadsheetId,
    range: `'${TIME_TRACKER}'!A:J`,
  });
  const rows = res.data.values ?? [];
  const clientLower = clientName.toLowerCase();
  const entries = rows.slice(1).filter(r => r[1]?.toLowerCase() === clientLower);

  const unbilled = entries.filter(r => r[8] === 'Unbilled');
  const billed   = entries.filter(r => r[8] === 'Billed');
  const paid     = entries.filter(r => r[8] === 'Paid');
  const fees = (arr) => Math.round(arr.reduce((s, r) => s + (parseFloat(r[5]) || 0) * (parseFloat(r[6]) || 0), 0) * 100) / 100;

  return {
    clientName,
    totalEntries: entries.length,
    totalHours: Math.round(entries.reduce((s, r) => s + (parseFloat(r[5]) || 0), 0) * 100) / 100,
    unbilledFees: fees(unbilled),
    billedFees:   fees(billed),
    paidFees:     fees(paid),
    recentEntries: entries.slice(-5).map(r => ({
      date: r[0], matter: r[2] || '', type: r[3] || '',
      description: r[4] || '', hours: r[5], rate: r[6], status: r[8],
    })),
  };
}

export async function getTimeEntries(auth, spreadsheetId, { clientName, status, limit } = {}) {
  const res = await sheetsClient(auth).spreadsheets.values.get({
    spreadsheetId,
    range: `'${TIME_TRACKER}'!A:J`,
  });
  const rows = res.data.values ?? [];
  const clientLower = clientName?.toLowerCase();

  let entries = rows.slice(1)
    .map((r, i) => ({
      row: i + 2, date: r[0], clientName: r[1], matterName: r[2] || '',
      matterType: r[3] || '', description: r[4] || '',
      hours: parseFloat(r[5]) || 0, rate: parseFloat(r[6]) || 0,
      totalFee: (parseFloat(r[5]) || 0) * (parseFloat(r[6]) || 0),
      status: r[8] || '', invoiceDate: r[9] || '',
    }))
    .filter(e => e.clientName);

  if (clientLower) entries = entries.filter(e => e.clientName.toLowerCase().includes(clientLower));
  if (status && status !== 'All') entries = entries.filter(e => e.status === status);

  entries = entries.reverse().slice(0, limit ?? 50);
  return { success: true, count: entries.length, entries };
}

export async function getTrustEntries(auth, spreadsheetId, { clientName, limit } = {}) {
  const res = await sheetsClient(auth).spreadsheets.values.get({
    spreadsheetId,
    range: `'${TRUST_ACCOUNT}'!A:G`,
  });
  const rows = res.data.values ?? [];
  const clientLower = clientName?.toLowerCase();

  let entries = rows.slice(1)
    .map((r, i) => ({
      row: i + 2, date: r[0], clientName: r[1], matterName: r[2] || '',
      description: r[3] || '', deposit: parseFloat(r[4]) || 0,
      withdrawal: parseFloat(r[5]) || 0, balance: r[6] || '',
    }))
    .filter(e => e.clientName);

  if (clientLower) entries = entries.filter(e => e.clientName.toLowerCase().includes(clientLower));

  entries = entries.reverse().slice(0, limit ?? 50);
  return { success: true, count: entries.length, entries };
}

export async function getYearEndSummary(auth, spreadsheetId) {
  const res = await sheetsClient(auth).spreadsheets.values.get({
    spreadsheetId,
    range: `'${YEAR_END}'!A:B`,
  });
  const rows = (res.data.values ?? []).filter(r => r[0] && r[1]);
  return { success: true, rows };
}

export async function getMatterProfitability(auth, spreadsheetId) {
  const res = await sheetsClient(auth).spreadsheets.values.get({
    spreadsheetId,
    range: `'${RATE_MY_MATTERS}'!A:Z`,
  });
  const rows = res.data.values ?? [];
  const headers = rows[0] ?? [];
  const matters = rows.slice(1)
    .filter(r => r[0])
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { success: true, count: matters.length, matters };
}

export async function getInvoice(auth, spreadsheetId) {
  const res = await sheetsClient(auth).spreadsheets.values.get({
    spreadsheetId,
    range: `'${INVOICE}'!A:Z`,
  });
  const rows = (res.data.values ?? []).filter(r => r.some(Boolean));
  return { success: true, rows };
}
