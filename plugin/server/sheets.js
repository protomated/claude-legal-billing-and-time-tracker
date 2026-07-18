import { google } from 'googleapis';

// Tab names — must match the template sheet exactly.
const TIME_TRACKER = 'Time Tracker';
const TRUST_ACCOUNT = 'Trust Account';
const DASHBOARD = 'Dashboard';

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

  const sum = (arr, col) => arr.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0);
  const unbilled = entries.filter(r => r[8] === 'Unbilled');
  const billed   = entries.filter(r => r[8] === 'Billed');
  const paid     = entries.filter(r => r[8] === 'Paid');

  return {
    clientName,
    totalEntries: entries.length,
    totalHours: Math.round(sum(entries, 5) * 100) / 100,
    unbilledFees: Math.round(unbilled.reduce((s, r) => s + (parseFloat(r[5]) || 0) * (parseFloat(r[6]) || 0), 0) * 100) / 100,
    billedFees:   Math.round(billed.reduce((s, r)   => s + (parseFloat(r[5]) || 0) * (parseFloat(r[6]) || 0), 0) * 100) / 100,
    paidFees:     Math.round(paid.reduce((s, r)     => s + (parseFloat(r[5]) || 0) * (parseFloat(r[6]) || 0), 0) * 100) / 100,
    recentEntries: entries.slice(-5).map(r => ({
      date: r[0], matter: r[2] || '', type: r[3] || '',
      description: r[4] || '', hours: r[5], rate: r[6], status: r[8],
    })),
  };
}
