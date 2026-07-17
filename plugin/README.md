# AI Use Policy Generator for Law Firms — Claude Desktop Plugin

A Claude Desktop plugin that conducts a short guided interview and drafts the three compliance documents every law firm using AI tools needs: an internal AI-use policy, a client-facing AI-disclosure clause for engagement letters, and a one-page safe AI checklist — tailored to your specific tools, practice areas, and jurisdiction.

**Distributed by [Protomated](https://protomated.com) as a free download.**

---

## ⚠️ Required: Read This Before You Install

**This section is not boilerplate. Read it before entering any firm information.**

### 1. You must be on a qualifying Claude plan

Do NOT use this plugin on a consumer Claude plan (claude.ai Personal or Claude Pro) to enter any confidential firm or client information. Consumer plans do not provide a Data Processing Agreement (DPA) covering privileged content.

Use one of the following:

- **Claude for Work** (formerly Claude.ai Teams)
- **Claude Team or Enterprise**
- **Claude API** (with a signed DPA from Anthropic)

Using a consumer plan with confidential firm information creates the same risk this plugin helps you address for your clients. See *Heppner v. Doe* (S.D.N.Y. Feb. 2026) and your state bar's AI ethics guidance.

> **If you're not sure which plan you're on:** Open Claude Desktop → Help → About. If it says "Claude Pro," you are on a consumer plan. Upgrade to Claude for Work before entering any confidential information into this plugin.

### 2. The plugin produces starting drafts, not final documents

Every document this plugin generates must be reviewed by you — a licensed attorney — before your firm adopts or distributes it. The generated policy references your state bar's guidance; it is your responsibility to verify that guidance and ensure the policy reflects it accurately.

### 3. Every output requires your confirmation before saving

The plugin will not write any file to your computer without asking for your explicit in-conversation confirmation first.

---

## Installation (under 10 minutes)

### Step 1 — Download and install

1. Download `ai-use-policy-generator.zip` from the [Releases page](https://github.com/protomated/claude-ai-use-policy-generator/releases).
2. Double-click the `.zip` file, or drag it into Claude Desktop's **Extensions** panel.
3. Claude Desktop will install the plugin and prompt you to connect the required connector.

### Step 2 — Connect Filesystem (your firm policies folder)

1. Go to **Claude Desktop → Settings → Connectors**.
2. Find **Filesystem** and click **Connect**.
3. Select the folder where you want to save generated policy documents. Example: `~/Documents/Firm-Policies` or `~/Dropbox/Admin/Policies`.
4. Only files inside this folder will be accessible to the plugin.

> **Tip:** Create a dedicated `Firm-Policies` folder before connecting. The plugin will save the three generated documents there when you confirm.

### Step 3 — Verify

Open a new Claude Desktop chat. Type `/skills`. You should see `/ai-use-policy` listed. Run `/ai-use-policy` to start the guided interview.

See [CONNECTORS.md](CONNECTORS.md) for troubleshooting.

---

## The Skill

### `/ai-use-policy` — AI Use Policy & Client-Disclosure Generator

Runs a guided interview covering your firm's AI tools, what data goes into them, your client types, and your jurisdiction. Then drafts three documents:

**Document 1 — Internal AI-Use Policy (~2 pages)**
Covers: approved tools and tier requirements, data classification rules (what can and can't go into AI tools), required engagement-letter disclosures, supervision and review requirements, staff training, prohibited uses, incident reporting, policy review schedule, and a state ethics compliance placeholder.

**Document 2 — Client-Facing AI-Disclosure Clause**
A ready-to-paste paragraph for your engagement letter. Discloses your firm's AI tool use, confirms attorney review of all AI output, and includes an optional client opt-out provision.

**Document 3 — Safe AI Checklist (1 page)**
A print-and-post operational reference covering four checkpoints: before using AI on a matter, when entering content, when reviewing output, and before sending any AI-assisted document.

**Consumer-grade tool flagging:** If the interview reveals that consumer-tier AI tools (ChatGPT Plus, personal Claude, free Copilot, etc.) are being used with client data, the plugin flags each one specifically and recommends the enterprise-tier alternative.

```
/ai-use-policy
/ai-use-policy ~/Documents/Firm-Policies
```

**Interview time:** approximately 5–10 minutes.
**Setup and install:** under 10 minutes.

---

## Why Your Firm Needs This

57% of solo attorneys and 55% of small-firm attorneys use AI tools daily. Fewer than one in five has a written AI policy. The gap is a live bar-discipline and malpractice exposure: confidentiality obligations under Model Rule 1.6, competence obligations under Model Rule 1.1, and ABA Formal Opinion 512's informed-consent requirement all apply to AI tool use with client data — and they applied the day you started using the tool.

This plugin closes the paperwork gap in under 10 minutes.

---

## Want a Custom AI Policy Built for Your Firm?

The generated documents are a starting point. Protomated can build a custom AI governance package for your firm: tool-by-tool DPA review, jurisdiction-specific ethics-rule mapping, staff training materials, and a policy maintenance workflow — $3,000–$6,000 depending on scope.

[Book a 30-minute call →](https://protomated.com/call)

---

## License

MIT. See [LICENSE](LICENSE).

## Feedback and Issues

[GitHub Issues](https://github.com/protomated/claude-ai-use-policy-generator/issues) | [hello@protomated.com](mailto:hello@protomated.com)
