---
name: trust-entry
description: Record a trust account deposit or withdrawal with guided prompts and a safety check. Use when a client sends a retainer, you pay a filing fee from trust, or you disburse client funds.
argument-hint: "[optional: \"Smith deposit 5000\" or \"Garcia filing fee 350\"]"
---

# /trust-entry — Record Trust Account Transaction

> ⚠️ Trust account rules vary by state bar. Always review entries against your jurisdiction's IOLTA/trust accounting rules before relying on them.

Record a deposit into or withdrawal from your trust account.

## Safety rules (enforced before every entry)

1. **Never mix deposit and withdrawal** — a deposit goes in the Deposits column only; a withdrawal goes in the Withdrawals column only. Never use negative numbers.
2. **No $0 amounts** — if the amount is zero or unclear, stop and ask.
3. **Withdrawals over $10,000** — state the full details and ask for explicit confirmation before recording.
4. **Retainer received = Deposit. Filing fee paid = Withdrawal. Funds disbursed to client = Withdrawal.**

## Workflow

### Step 1 — Classify the transaction

Determine from the argument or by asking whether this is a **deposit** or **withdrawal**:

| Deposit keywords | Withdrawal keywords |
|---|---|
| retainer, received, advance, funds in, paid in, earned | filing fee, disbursement, paid out, refund, funds out, court cost |

If unclear, ask: "Is this money coming **into** trust (deposit) or going **out** of trust (withdrawal)?"

### Step 2 — Collect missing fields

| Field | Required | Notes |
|---|---|---|
| Client name | ✅ | |
| Amount | ✅ | Must be positive. Never zero. |
| Type | ✅ | Deposit or Withdrawal |
| Date | ✅ | Default to today |
| Description | ✅ | Brief — e.g. "Initial retainer", "Filing fee — Smith v. Jones" |
| Matter name | Optional | |

### Step 3 — Safety check for large withdrawals

If the amount is a withdrawal over $10,000:
> "⚠️ This records a **$[X] withdrawal** from trust for [Client] — [description]. Trust withdrawals of this size typically require documentation. Please confirm you want to record this withdrawal now."

Wait for explicit confirmation before proceeding.

### Step 4 — Confirm before writing

Summarize in one line:
> "Recording a **$5,000 deposit** into trust for Maria Garcia (Probate Matter) on [today]. Description: 'Initial retainer'. Correct?"

Wait for confirmation.

### Step 5 — Call add_trust_entry and report

Set deposit OR withdrawal — never both — to the amount. The other field is 0.

Report the result:
> "✅ Trust deposit recorded — $5,000 for Maria Garcia."
> ⚠️ Not legal advice — review against your state bar's trust-accounting rules.

---

## Examples

```
/trust-entry
/trust-entry Smith deposit 5000
/trust-entry "Garcia — filing fee withdrawal 350"
/trust-entry Johnson refund 1200
```
