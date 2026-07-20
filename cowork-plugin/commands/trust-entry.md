---
description: Record a trust account deposit or withdrawal with safety checks
argument-hint: "<client name> <deposit|withdrawal> <amount>"
---

# /legal-billing:trust-entry — Trust Account Entry

Record a trust deposit or withdrawal with compliance checks built in.

## Invocation

```
/legal-billing:trust-entry $ARGUMENTS
```

Parse client name, direction (deposit or withdrawal), and amount from `$ARGUMENTS`. Ask for anything missing.

## Workflow

**Step 1 — Identify the entry type** from `$ARGUMENTS` or ask:
- **Deposit** keywords: retainer, received, deposit, paid in, upfront, advance
- **Withdrawal** keywords: filing fee, disbursement, paid out, refund, cost advance, settlement payout

If unclear: "Is this a deposit into trust (money coming in) or a withdrawal (money going out)?"

**Step 2 — Collect required fields:**
1. **Client name** — confirm spelling
2. **Amount** — never $0 or negative
3. **Description** — brief (e.g., "Retainer received", "Filing fee — Circuit Court")
4. **Date** — default to today
5. **Matter name** — ask if the client has multiple matters

**Step 3 — Safety checks:**
- If withdrawal > $10,000: "This is a $[X] withdrawal from trust. Please confirm you want to proceed."
- Double-check: for a deposit, `deposit` = amount and `withdrawal` = 0. For a withdrawal, `withdrawal` = amount and `deposit` = 0. Never swap these.

**Step 4 — Confirm before calling:**
"Recording a $[X] [deposit/withdrawal] for [client] — [description] on [date]. Confirm?"

Wait for explicit confirmation.

**Step 5 — Call `add_trust_entry`**, then report:
- Deposit: "✅ Trust deposit recorded — $[X] for [client] ([description])."
- Withdrawal: "✅ Trust withdrawal recorded — $[X] for [client] ([description])."

Always end with:
"⚠️ Not legal advice — review against your state bar's trust-accounting rules before relying on this."
