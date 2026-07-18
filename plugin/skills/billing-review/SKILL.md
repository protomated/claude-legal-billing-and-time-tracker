---
name: billing-review
description: Weekly billing health check. Pulls your dashboard, flags clients with unbilled hours, outstanding invoices, and overdue balances. Tells you exactly who to bill and who hasn't paid. Run this every Friday or at month-end.
argument-hint: "[optional: client name to review a single client]"
---

# /billing-review — Weekly Billing Health Check

A fast read of your billing position. No writing, no changes — read only.

## Workflow

### Step 1 — Pull data

Call these tools in parallel:
- `get_dashboard` — overall totals
- `get_time_entries` with `status: "Unbilled"` — who has hours not yet invoiced
- `get_time_entries` with `status: "Billed"` — who has invoices outstanding

If the argument is a client name, also call `get_client_summary` for that client.

### Step 2 — Present the health check

Format the output as a clear billing snapshot:

---

**📊 Billing Snapshot — [Today's date]**

**Overall**
- Total hours logged: [X]
- Fees billed (invoiced): $[X]
- Fees collected (paid): $[X]
- Outstanding (billed, unpaid): $[X]

**🔴 Unbilled — needs invoicing**
List each client with unbilled hours:
- [Client] — [X] hrs, ~$[estimated fees] unbilled since [earliest entry date]

(If none: "All time entries are invoiced. ✅")

**🟡 Billed — awaiting payment**
List each client with outstanding invoices:
- [Client] — $[X] invoiced on [date]

(If none: "No outstanding invoices. ✅")

**💡 Actions**
- Bill now: [list clients ready to invoice — have unbilled entries]
- Follow up: [list clients with invoices older than 30 days]

---

⚠️ Not legal advice — review before sending to client.

### Step 3 — Offer next steps

After the snapshot, offer:

> "Want me to generate an invoice for any of these clients? Just say which one and I'll mark their unbilled entries as Billed."
