---
name: log-time
description: Quickly log billable time. Guides you through client, matter, hours, rate, and description — then writes the entry to your Time Tracker. Use when you finish a task and want to record the time before you forget it.
argument-hint: "[optional: \"2.5h drafting motion for Smith\" or just /log-time to be guided]"
---

# /log-time — Log Billable Time

Log a time entry to your Time Tracker tab. If you include details in the command, I'll fill in what I can and only ask for what's missing.

## Workflow

### Step 1 — Gather missing fields

Collect the following, asking only for what wasn't provided in the command argument:

| Field | Required | Notes |
|---|---|---|
| Client name | ✅ | Ask if not known |
| Hours | ✅ | Decimal OK (1.5 = 1h 30m). Never zero or negative. |
| Hourly rate | ✅ | Ask "What's your rate for this client?" if missing |
| Date | ✅ | Default to today unless the attorney specifies another date |
| Description of work | Recommended | Brief summary of what was done |
| Matter name | Optional | Case or project name |
| Matter type | Optional | Ask only if no other entries exist for this client. Use this list exactly: Litigation, Family Law, Estate, Criminal, Corporate, Immigration, Real Estate, Small Business |

Do not ask for all fields at once if most can be inferred. Prefer a single follow-up question over a list.

### Step 2 — Confirm before writing

Summarize the entry in one line before calling `log_time`:

> "Logging 2.5 hrs for Sarah Johnson (Smith v. Jones — Litigation) on [today's date] at $350/hr = $875. Description: Drafted motion to dismiss. Correct?"

Wait for confirmation or a quick correction. If the attorney says "go" / "yes" / "log it" or similar, proceed.

### Step 3 — Call log_time and report

Call `log_time` with all collected fields. Report the result:

> "✅ Logged: 2.5 hrs for Sarah Johnson at $350/hr — $875 total. Status: Unbilled."
> ⚠️ Not legal advice — review before sending to client.

---

## Examples

```
/log-time
/log-time 2h drafting lease review for Garcia
/log-time "Smith — 1.5h court appearance, $400/hr"
```
