# Legal Billing and Time Tracker

**By Protomated | Free Claude Cowork Plugin**

Track billable hours, generate invoices, manage trust accounts, and check revenue — all by chatting naturally. Free replacement for Clio and PracticePanther billing modules for solo attorneys.

---

## What this plugin does

- Log billable hours by client and matter
- Mark time entries as invoiced, then mark them paid
- Record trust account deposits and withdrawals
- Check your billing dashboard and unpaid balances
- Review matter profitability and year-end revenue

---

## Setup (one time, ~3 minutes)

**Step 1 — Copy the Google Sheet**
Open the [Legal Billing and Time Tracker template](https://protomated.com/templates/legal-billing-time-tracker/), click **File → Make a copy**, and save it to your own Google Drive.

**Step 2 — Install this plugin**
In Claude Cowork: open the sidebar → Plugins → Add → upload `legal-billing.plugin`.

**Step 3 — Connect on first use**
Start a conversation and say anything like *"Log 1.5 hours for John Smith at $300"*. Claude will ask you to connect your Google account and paste your sheet URL — takes about 30 seconds. You'll never need to do it again.

---

## Example conversations

- "Log 2 hours for Sarah Johnson on the Johnson divorce at $350 for client consultation"
- "Invoice John Smith for all unbilled work"
- "John Smith paid his invoice"
- "Mary Lee sent a $5,000 retainer for the Lee Estate matter"
- "Withdraw $500 from Sarah Johnson's trust for filing fee"
- "Show my billing dashboard"
- "What's still unpaid?"
- "Rate my matters this quarter"

## Slash commands

| Command | What it does |
|---|---|
| `/legal-billing:log-time` | Guided time entry |
| `/legal-billing:billing-review` | Weekly billing health check |
| `/legal-billing:invoice-client` | Invoice a specific client |
| `/legal-billing:trust-entry` | Trust deposit or withdrawal with safety checks |

---

## Notes

- The trust/IOLTA tab follows standard three-way reconciliation structure (bookkeeping, not legal advice). Review all outputs against your state bar's trust accounting guidance.
- There is no undo — correct errors directly in the Google Sheet.
- This plugin handles up to ~20 active matters cleanly. For automated calendar-based time capture, QuickBooks sync, or LawPay integration, [book a call](https://protomated.com).

---

## Privacy

Your billing data stays in your own Google Sheet. Protomated's server only processes tool calls; it does not store your spreadsheet data.
