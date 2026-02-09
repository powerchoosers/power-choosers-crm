# Nodal ComposeModal Review and High-Converting Email Guidelines

## 1. Issues and Risks in Current ComposeModal Setup

### 1.1 Technical / UX Issues in the Component

- **Partial / truncated implementation**
  - The snippet shows ellipses (`...`) and JSX fragments missing in key places (e.g., EMAIL_TYPES internal config, render tree, buttons, icons, etc.). Ensure the actual file in your codebase is syntactically complete.
- **Type-safety gaps**
  - `const refinementFallbackByType: Record = { ... }` is missing generics. In TS this should be something like `Record<EmailTypeId, string>` to avoid silent key/typo bugs.
- **Subject parsing is brittle**
  - You rely on the model outputting `SUBJECT:` on the first line and then `\n` followed by the body. Any deviation (extra text before `SUBJECT:`, different casing, extra blank lines) will break parsing.
  - You slice from `raw.indexOf('\n')` which assumes there *is* a newline and that `SUBJECT:` is on the first line.
- **Meta‑commentary filter may be too narrow**
  - Regex `noSend` only blocks some phrases like `I am sorry`, `cannot`, `Could you please`, `Please verify`. LLMs often use other formulations ("as an AI", "I am unable to", "I don't have access"), so some bad outputs may still slip through.
- **Refinement mode guardrails**
  - In refinement mode you prepend: `Apply the refinement task. Current email body: --- ... ---`. Some models might try to re-state instructions or include meta-commentary. You partially guard this, but not fully.
- **Pending AI content UX**
  - You track `pendingAiContent` and `contentBeforeAi`, but from the snippet it looks like you directly set `content` to the AI output and *also* track `pendingAiContent`.
  - That means the user sees the AI version immediately and then has to "Accept" or "Discard", where Discard copies back `contentBeforeAi`. This is okay, but it conflates "preview" and "applied" state. A cleaner pattern is: keep original in `content`, show AI suggestion in a side panel / diff until user clicks Accept.

### 1.2 Deliverability / Spam‑Risk Issues in Generated Emails

From `build.md` and your `cold` config:

- **Emails are long and explanatory instead of sharp and diagnostic**
  - Example: `4CP_Risk` copy is multiple sentences of explanation; Hunter.io data suggests 20–39 word emails have highest reply rates (~4.5% vs 3.7%+ for 200+ words)[cite:9].
- **Subject lines are descriptive but soft**
  - e.g., `Subject Line: Warehouse Demand Charges & 4CP Exposure` is informational but low‑curiosity and looks like a newsletter vs. a 1:1 note.
- **Too much "energy education" and not enough triggered context**
  - High‑reply cold emails start with a specific trigger: hiring announcement, expansion, new facility, rate spike, etc.[cite:15]
  - Your prompts talk about 4CP, ratchets, and pass-throughs in the abstract rather than tying them to a visible trigger for that account.
- **Potential spam markers**
  - The copy is not egregious, but long, technical, and benefit-heavy phrases can hurt deliverability when combined with new domains.
  - Industry research highlights that over‑promotional language ("save", "discount", "free", heavy % and $) and urgency language ("act now", "limited time") are common spam triggers, especially in subject lines[cite:10][cite:13][cite:19].
- **HTML + image signatures in cold emails**
  - Your `fullHtml` includes a rich HTML signature via `generateNodalSignature`. For *warm* conversations that is fine; for *cold* outreach sending from a fresh/sensitive domain, fully HTML‑ized emails with multiple links and images can hurt deliverability.[cite:17]
  - Some cold‑email deliverability experts explicitly recommend removing all HTML and links from first‑touch cold emails and using plain text only.[cite:17]

### 1.3 Strategic Gaps vs. Best Practices for High Reply / Low Spam

- **No explicit support for hyper‑personalized opening line**
  - Best-performing cold emails: trigger → pain → proof → soft CTA.[cite:15][cite:12]
  - Your prompts mostly talk about category-level issues, not prospect-specific triggers.
- **Single CTA style**
  - Your current cold prompt instructs: "Question-based CTAs work best" – this is good, but you always aim for a diagnostic CTA. You may want a library of CTA variants tuned for different funnel stages (micro‑commitment, info‑sharing, yes/no, calendar link, etc.).[cite:12]
- **Not modeling optimal length explicitly**
  - Research: 20–39 words tends to get the highest reply rates in aggregate datasets[cite:9]. Your system prompts mention "2–4 sentences" and "80–120 words" (in refinement). This may still be longer than ideal, especially for first touch.
- **No deliverability‑aware mode**
  - There's no toggle/flag for "high‑risk domain" where you:
    - Force plain text
    - Forbid links
    - Enforce very tight word counts
    - Avoid specific spam‑trigger categories.

---

## 2. Research Summary: High-Converting, Low-Spam Cold Email Practices

### 2.1 Reply-Rate Drivers

Across multiple sources (Hunter.io via ColdIQ, Mixmax, agency case studies, and recent guides):

- **Short, skimmable emails win**
  - Hunter’s analysis of 34M emails: 20–39 word emails had the highest *average* reply rate (~4.5%).[cite:9]
  - Long blocks of text reduce engagement and reply rate.[cite:9]
- **Hyper‑personalization based on real triggers**
  - High performers reference a *specific* observable event: hiring spree, new facility, funding, new tariff, public announcement, or content piece.[cite:15][cite:18]
- **Immediate relevance and pain**
  - Winning patterns: "Saw you’re [trigger] → Usually that means [pain] → We helped [peer] go from [before] to [after] → Soft CTA".[cite:15]
- **Single, clear CTA**
  - A single, low-friction CTA (often a question) outperforms multiple asks.[cite:9][cite:12]
- **Make it about them, not you**
  - Replace self-focused language with prospect-focused outcomes.[cite:12]

### 2.2 Deliverability / Spam Avoidance

- **Content is only one piece, but it’s the part you’re auto‑generating**
  - Modern filters primarily look at: domain reputation, engagement (opens, replies, marks as spam), SPF/DKIM/DMARC, and content patterns.[cite:10][cite:11]
- **Avoid classic spam trigger patterns**
  - Over‑promotional and urgency language: "act now", "limited time offer", "urgent", "discount", "save big", "money-back guarantee".[cite:10][cite:13][cite:19]
  - Heavy money/finance superlatives: "earn money fast", "financial freedom", "million dollars" etc.[cite:19]
  - Overuse of caps, exclamation marks, dollar signs, and % symbols in subject lines.[cite:10][cite:11][cite:13]
- **Plain text and minimal links for cold**
  - Several cold-email deliverability guides recommend:
    - Avoiding links in the first touch altogether.[cite:17]
    - Removing rich HTML (including signatures) for cold emails from new domains.[cite:17]
- **Set honest expectations in subject and preview**
  - Clear, honest subject lines that preview the content help with trust and engagement.[cite:11]

---

## 3. Concrete Changes to Improve Your Generated Emails

### 3.1 Adjust Cold Email System Prompt

Current (core ideas): forensic, direct, minimal, 2–4 sentences, question CTA.

Recommended adjustments:

- Add an explicit **word-count target** for the *entire email* (not just sentences), e.g. "25–60 words" for first touch.
- Explicitly require: `TRIGGER → PAIN → PROOF → QUESTION CTA` structure.
- Forbid spammy language categories and links in first-touch cold emails.

Example replacement snippet for `cold.getSystemPrompt` (conceptual):

- Require:
  - One short subject line (4–7 words, lowercase, curiosity + relevance)
  - Body of 25–60 words
  - No links, no images, no bullets, no attachments, no HTML. Plain text only.
  - No urgency phrasing ("act now", "limited time", etc.).
  - One question at the end as the CTA.

### 3.2 Split "Cold" into First-Touch vs. Follow-Up Variants

- **cold_first_touch**
  - Plain text only
  - No links or signature
  - Max 60 words
  - Nodal persona present but softer on jargon.
- **cold_followup**
  - Allows slightly longer copy (up to ~120 words)
  - Can optionally include a link or calendar URL once domain reputation is stronger.

This can be modeled either as two `EmailTypeId`s or as an internal `mode` flag passed into the system prompt.

### 3.3 Add Spam-Guardrails in the Prompt

Inside the system prompt for *all* types, add a small section:

- "DELIVERABILITY RULES: 
  - Avoid classic promotional spam language ("free", "act now", "discount", "save big", "limited time offer", etc.).
  - Avoid overuse of dollar signs, percentages, and all caps.
  - Do not include more than one link. For cold outreach from new domains: do not include any links."

You can make this conditional based on an `isColdOutreach` flag that you pass into the API.

### 3.4 Rework Your Current 4CP / Ratchet / Pass-Through Copy

#### 4CP_RISK

Current: explanatory, long, no trigger.

Revise directive to something like:

> "Write a 30–50 word first‑touch cold email to a warehouse/logistics operator.
> 
>  - Trigger: summer peak demand in ERCOT.
>  - Pain: Q2–Q3 demand spikes locking in high 4CP charges.
>  - Proof: brief reference to a similar facility that reduced peak kW.
>  - CTA: one question asking if 4CP exposure is on their radar this quarter.
>  - No links, no greeting, no sign-off, plain text only."

#### INTRO_AUDIT

Make this a **warm follow-up** pattern instead of a generic intro, with:

- Quick reminder of prior interaction
- One key finding
- Soft CTA: "Want to see the numbers?"

#### RATCHET_WARNING / PASS_THROUGH

Shift from explanation to:

- Trigger: their tariff/contract structure, plant expansion, or recent TDU rate change.
- Pain: specific financial risk in one sentence.
- Social proof/precedent: "We saw X at a peer facility".
- Soft CTA question.

---

## 4. Recommended Improvements to the Component Itself

### 4.1 Make the AI Safer and More Predictable

- **Tighten types**
  - `const refinementFallbackByType: Record<EmailTypeId, string> = { ... }`
- **Harden subject/body parsing**
  - Support both `SUBJECT: ...` + body and body‑only outputs more robustly.
  - Use a more tolerant parser:
    - Find the first line starting with `SUBJECT:` (case-insensitive), then treat all following non-empty lines as the body.
- **Expand meta‑commentary filter**
  - Add checks for: `"as an AI"`, `"I am an AI"`, `"I do not have access"`, `"I don't have access"`, `"I can't browse"`, etc.

### 4.2 Add a Deliverability Mode Flag

- Extend `ComposeContext` or add a new prop, e.g. `deliverabilityMode?: 'cold_plaintext' | 'normal'`.
- In `handleSend`:
  - If `cold_plaintext` and `emailTypeId === 'cold'`, send `content` as plain text only and omit `outgoingSignatureHtml`.
- In `buildEmailSystemPrompt`:
  - If `cold_plaintext`, inject stronger deliverability instructions (no links, no HTML, shorter length).

### 4.3 Separate Preview vs. Commit for AI Output

- Keep user input in `content`.
- Put AI output only into `pendingAiContent`.
- Show a diff/preview panel (e.g. side-by-side, or overlay with "Accept"/"Replace" buttons).
- Only write to `content` on Accept.

---

## 5. Framework for Ongoing Optimization

### 5.1 Data to Track

For each template / chip:

- Open rate
- Reply rate
- Positive vs. negative replies
- Spam / bounce rate
- Domain warmup stage

### 5.2 A/B Testing Loop

- Always test:
  - Subject line variants (length, trigger reference, levels of curiosity)
  - Opening line personalization depth
  - CTA style (yes/no vs. "open to", calendar vs. email reply)
- Feed the winning patterns back into `generationChips` and the core system prompt, pruning what underperforms.

### 5.3 Library of Proven Patterns

Build and continuously refine a library of:

- **Trigger banks**: tariff changes, 4CP forecast spikes, facility expansions, seasonality.
- **Pain statements**: demand charges, pass-through bloat, ratchet clauses, contract mismatch.
- **Proof snippets**: anonymized case metrics.
- **Micro‑CTAs**: "Worth a look?", "Want to see the math?", "Is this on your radar this quarter?"[cite:12][cite:15]

Keep these as structured data so the AI can assemble them reliably rather than hallucinating.

---

## 6. How to Use This Doc

- Update your `ComposeModal.tsx` prompts and types using sections 3 and 4.
- Use sections 2 and 5 as the conceptual backbone for future prompt engineering.
- As you gather live campaign data, annotate this doc with which chips / structures outperform, and evolve toward a small set of highly opinionated, battle-tested patterns for ERCOT / C&I energy outreach.
