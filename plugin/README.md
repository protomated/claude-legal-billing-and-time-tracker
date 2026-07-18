# Legal Billing and Time Tracker

Log billable hours, generate invoices, manage trust accounts, and monitor
revenue — all by chatting naturally in Claude Desktop. Your data lives in
your own Google Sheet. No monthly subscription, no relay, no shared
credentials.

**Distributed by [Protomated](https://protomated.com) as a free download.**

---

## ⚠️ Required: Read Before Installing

### 1. Use a qualifying Claude plan
Do not use this extension on a consumer Claude plan for client-related
billing entries. Use:
- **Claude for Work** (formerly Claude.ai Teams)
- **Claude Team or Enterprise**
- **Claude API** with a signed DPA from Anthropic

### 2. This is a billing tool — not a legal advice tool
The extension handles time tracking, invoicing, and trust account
bookkeeping only. It does not draft legal documents, interpret ethics
rules, or provide legal advice. Trust/IOLTA entries follow standard
three-way reconciliation structure — review them against your state
bar's trust-accounting guidance before relying on them.

### 3. There is no undo
If you log an entry incorrectly, correct that row directly in your
Google Sheet. The extension has no delete or reverse operation.

---

## Installation (~3 minutes)

### Step 1 — Copy the Template Sheet
1. Open the template: [[TEMPLATE_SHEET_URL]]
2. Click **File → Make a copy** → save to your Google Drive
3. Copy your sheet's URL from the browser

### Step 2 — Install the Extension
1. Open **Claude Desktop → Extensions → Add**
2. Install `legal-billing.mcpb`
3. When prompted, paste your sheet URL from Step 1

### Step 3 — Connect Google
In a new chat, say: **"connect Google"**

A browser tab opens. Sign in and grant access to Google Spreadsheets.
This happens once — tokens are saved locally.

### Step 4 — Start Using
Say anything like: "Log 2 hours for John Smith at $350."

---

## What You Can Do

- "Log 2 hours for John Smith on Smith v. Jones at $350 for drafting"
- "Invoice John Smith for all unbilled work"
- "John Smith paid his invoice"
- "Add a $5,000 retainer deposit for Mary Lee on the Lee Estate matter"
- "Withdraw $500 from Sarah's trust for a filing fee"
- "Show me my billing dashboard"
- "What's still unpaid?"

**Sheet tabs written by this extension:**
- Time Tracker — every time entry
- Trust Account — deposits and withdrawals
- Dashboard — live revenue summary (read-only; auto-calculated)
- Rate My Matters — effective hourly rate on flat-fee matters
- Year-End Summary — annual totals for your accountant

---

## Privacy

Your billing data stays in your own Google Sheet on your own Google
Drive. The extension writes directly from your machine to your sheet
using your own Google account — no data passes through Protomated's
servers.

---

## Want a Custom Billing Build?

This tool handles ~20 active matters cleanly. For automated time capture
from calendar events, QuickBooks sync, LawPay integration, and a full
client portal:

[Book a call at protomated.com →](https://protomated.com/call)

Build range: $5,000–$15,000 | Delivery: 2–3 weeks

---

## License

MIT. See [LICENSE](LICENSE).

## Feedback and Issues

[GitHub Issues](https://github.com/protomated/claude-legal-billing-and-time-tracker/issues) | [hello@protomated.com](mailto:hello@protomated.com)
