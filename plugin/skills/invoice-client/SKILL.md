---
name: invoice-client
description: End-to-end invoice flow for a client — shows all unbilled entries, asks for confirmation, marks them as Billed, and previews the invoice. Use when you're ready to send an invoice to a client.
argument-hint: "[client name — e.g. /invoice-client Smith]"
---

# /invoice-client — Generate Client Invoice

Walk through the full invoicing flow: review → confirm → bill → preview.

> ⚠️ Not legal advice — review all output before sending to client.

## Workflow

### Step 1 — Identify the client

If a client name was provided as an argument, use it. Otherwise ask:
> "Which client would you like to invoice?"

### Step 2 — Show unbilled entries

Call `get_time_entries` filtered by the client name and `status: "Unbilled"`. 

If no unbilled entries exist:
> "No unbilled entries found for [Client]. Either they've already been invoiced or no time has been logged yet."
Stop here.

Present the entries as a clean table:

| Date | Matter | Description | Hours | Rate | Amount |
|---|---|---|---|---|---|
| [date] | [matter] | [description] | [h] | $[rate] | $[total] |
| … | | | | | |
| **Total** | | | **[total hrs]** | | **$[total fees]** |

### Step 3 — Confirm before marking Billed

State clearly what will change:
> "I will mark [N] entries for [Client] as Billed and set today ([date]) as the invoice date. Total: $[X]. Shall I proceed?"

Wait for explicit confirmation ("yes", "go", "do it", "proceed"). Do not call `mark_billed` until confirmed.

### Step 4 — Mark as Billed

Call `mark_billed` with the client name. Report the result:
> "✅ Invoice generated — [N] entries marked Billed. Invoice date: [today]."

### Step 5 — Preview the invoice

Call `get_invoice` and present the invoice data in a readable format so the attorney can review it before sending.

Then offer:
> "Would you like to record a payment once the client pays? Just say '/invoice-client [name]' again or ask me to 'mark [client] as paid'."

⚠️ Not legal advice — review before sending to client.

---

## Examples

```
/invoice-client
/invoice-client Johnson
/invoice-client "Sarah Garcia"
```
