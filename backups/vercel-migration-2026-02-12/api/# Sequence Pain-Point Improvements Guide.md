# Sequence Pain-Point Improvements Guide
## Bringing Real Energy Stress Into Your Emails (Without Fake Fear)

**Date:** November 18, 2025 [attached_file:172]  
**Scope:** `perplexity-email.js` + `sequence-builder.js` prompts for intro + follow‑ups [attached_file:172][attached_file:173]  

---

## 1. Goals

- Inject **real, grounded pain** (bill shocks, bad contracts, service issues) into the sequence so prospects feel a clear reason to reply. [attached_file:172][attached_file:173]  
- Stay aligned with **NEPQ** and your style: no fake fear, no exaggerated catastrophe, just honest situations other companies are already facing. [attached_file:172]  
- Use pain **strategically across the sequence** (intro vs follow‑ups) instead of blasting all pain in email 1. [attached_file:173]  

---

## 2. Where Pain Already Exists In The System

### 2.1 Industry & Role Pain Maps (Underused)

- `perplexity-email.js` includes `getIndustrySpecificContent()` and `getRoleSpecificLanguage()` which define pain points like rising energy costs, operational complexity, and budget pressure. [attached_file:172]  
- These functions feed into the system prompt as `industryContent.painPoints` and role‐specific context, but the **intro prompt** often focuses only on timing and a single savings insight. [attached_file:172][attached_file:173]  

### 2.2 Opening Styles With Pain Hooks

- `getOpeningStyle(recipient)` already defines styles such as `problem_aware`, `budget_pressure`, `timing_urgency`, `operational_efficiency`, and `compliance_risk`. [attached_file:172]  
- Each style includes an example like: “Rising electricity costs are putting pressure on operational budgets across [industry].” but the intro sequence prompt is not explicitly requesting these styles. [attached_file:172][attached_file:173]  

**Conclusion:** the engine can talk about pain; your **sequence prompts are just under‑asking for it**, especially for the first cold email. [attached_file:172][attached_file:173]  

---

## 3. Pain Themes To Encode Explicitly

Use only **real** scenarios you are already seeing:

- **Bill shock:** contract renewal taking a client from \$800k/year to \$1.6M/year.  
- **Wrong contract type:** e.g. fixed vs index causing **high delivery charges** or bad pass‑through fees.  
- **Confusing line items:** riders/adders on bills that can be removed or renegotiated.  
- **Supplier service pain:** hard to reach reps, poor communication, long ticket times.  
- **Fragmented contracts:** multiple facilities renewing at different times creating chaos and missed savings.  

These all map directly to the pain styles already in `getOpeningStyle` and can be phrased as **observations**, not threats. [attached_file:172]  

---

## 4. Where To Add Pain In The Sequence

### 4.1 Intro Email (First Email)

**Goal:** Light problem awareness + timing + one specific insight, **not** full-on fear. [attached_file:173]  

**Adjustments:**

1. In `buildFirstEmailIntroPrompt(true, role)` in `sequence-builder.js`, add a short “pain lane” to the spec: [attached_file:173]  

   - Under “ONE INSIGHT (SPECIFIC, NOT GENERIC)”, insert:  
     - “Use ONE real scenario such as bills doubling on renewal, confusing line items, or wrong contract type causing high delivery charges.” [attached_file:173]  

2. Tell the model to **tie pain to timing** instead of timing in isolation:  

   - Example spec line:  
     - “Explain how locking in 6 months early can prevent bill shocks like a customer going from \$800k to \$1.6M on renewal.” [attached_file:172][attached_file:173]  

3. Keep the CTA the same (your binary timing question) to maintain low friction. [attached_file:173]  

**Output behavior you want:**  
- One sentence that hints at real pain (e.g. doubled bills, confusing riders) + one sentence that shows timing is how smart teams avoid that outcome. [attached_file:172][attached_file:173]  

---

### 4.2 Follow‑Up 1 (Value/Insight Email)

**Goal:** **Lean into one concrete pain** with a real example, still calm but more vivid. [attached_file:173]  

**Prompt changes in `buildFollowUpValuePrompt(true, role)`**: [attached_file:173]  

- Add a “Pain Example” block to the instructions:

  > “Include ONE specific example of what happens when energy contracts are handled on autopilot, such as:  
  > – a company’s electricity spend jumping from \$800k to \$1.6M on renewal,  
  > – bills with hard‑to‑explain riders and fees that can be removed,  
  > – being stuck on the wrong contract type causing high delivery charges.” [attached_file:172][attached_file:173]  

- Follow that with a **soft contrast**:  

  > “Then contrast this with what happens when teams review 6–12 months ahead: fewer surprises, cleaner bills, and lower total cost.” [attached_file:172][attached_file:173]  

- Keep CTA as a **status question** (e.g., “When was the last time you had your contract and bill structure reviewed line by line?”). [attached_file:172]  

---

### 4.3 Follow‑Up 2 (Curiosity/Objection Email)

**Goal:** Address “we’re all set / we re‑shop” by surfacing **hidden pains** they may not have considered. [attached_file:173]  

In `buildFollowUpCuriosityPrompt(true, role)` add: [attached_file:173]  

- A section like:

  > “Address the common belief ‘we already re‑shop our contracts’ by pointing out one or two issues that still slip through:  
  > – wrong structure driving high delivery charges even with a good rate,  
  > – riders and fees that never get reviewed,  
  > – being on the right rate but wrong term length.” [attached_file:172]  

- Then ask a **disarming question**:

  > “Curious—when you say you re‑shop, does that include the delivery structure and riders, or just headline rates?” [attached_file:172]  

This makes the pain feel like **an invisible blind spot**, not an accusation. [attached_file:172]  

---

## 5. Implementation Plan (Code-Level)

### 5.1 Extend Industry Pain Maps

In `perplexity-email.js`, inside `getIndustrySpecificContent(industry)`, add your real pains: [attached_file:172]  

function getIndustrySpecificContent(industry) {
const base = { painPoints: [], outcomes: [], context: [] };

if (/manufacturing|industrial/i.test(industry || '')) {
base.painPoints.push(
'energy spend doubling on renewal for large facilities',
'confusing riders and line items on bills that hide negotiable costs',
'being on the wrong contract structure leading to high delivery charges'
);
// existing painPoints/outcomes stay
}

if (/healthcare|hospital/i.test(industry || '')) {
base.painPoints.push(
'unpredictable utility bills impacting care budgets',
'multiple meters and contracts renewing at different times causing chaos'
);
}

// Similar additions for retail, hospitality, logistics, etc.
return base;
}

text

These pain points will now appear in `industryContent.painPoints` and can be referenced in the system prompt. [attached_file:172]  

---

### 5.2 Bias Opening Style Toward Pain For Non‑Intro Steps

In `perplexity-email.js`, your `getOpeningStyle(recipient)` already returns pain‑oriented styles like `budget_pressure` and `problem_aware`. [attached_file:172]  

For **follow‑up templates**, when you call `buildSystemPrompt`, you can hint which opening style you prefer by adjusting the prompt text:

- For Follow‑up 1: mention “use a budget_pressure or problem_aware opening style.” [attached_file:172][attached_file:173]  
- For Follow‑up 2: mention “use operational_efficiency or timing_urgency style and highlight a hidden pain.” [attached_file:172][attached_file:173]  

Even if you don’t wire this as a parameter, adding that language to the follow‑up prompts nudges the model to pick those styles. [attached_file:172]  

---

### 5.3 Add One “Pain Example” Slot Per Email Type

For each sequence prompt builder (`buildFirstEmailIntroPrompt`, `buildFollowUpValuePrompt`, `buildFollowUpCuriosityPrompt`) define a **single slot** where ONE pain example lives. [attached_file:173]  

Example for Follow‑up Value prompt spec:

> “Use exactly ONE of these examples (don’t list all):  
> – bill going from \$800k/year to \$1.6M,  
> – wrong contract causing high delivery charges,  
> – confusing riders/fees on bills that could be removed.” [attached_file:173]  

This keeps every email focused and avoids “laundry list of terrible things” energy. [attached_file:172][attached_file:173]  

---

## 6. Guardrails To Avoid Fake Fear

Use these **in the prompt** as explicit rules:

- “Only mention scenarios that are **typical and believable** for companies like [company]. No exaggerated worst‑case fear.” [attached_file:172]  
- “Describe pains as things you’re **seeing in the market right now**, not predictions or threats.” [attached_file:172]  
- “No language like ‘you’ll get crushed’ or ‘you’re in trouble’; use calm, factual language about stress, budget pressure, and surprises on bills.” [attached_file:172]  

Examples you can paste into your system prompt:

- “GOOD: ‘I’m seeing a lot of contracts renewing 2x higher than the last term, and teams are scrambling to figure out why.’” [attached_file:172]  
- “BAD: ‘If you don’t fix this now, you’ll get crushed by your energy bills.’” [attached_file:172]  

---

## 7. Summary Of Changes

- **Intro email:** Keep timing CTA and structure, but add **one real pain scenario** tied to timing. [attached_file:173]  
- **Follow‑up 1:** Make it the **primary pain email** with one vivid example (rate doubling, wrong contract, confusing fees). [attached_file:173]  
- **Follow‑up 2:** Use pain to **challenge the “we’re all set / we re‑shop” belief** with hidden issues (delivery structure, riders, term). [attached_file:173]  
- **Code:** Extend industry pain maps, tweak follow‑up prompt text, and let existing `getOpeningStyle` + pain logic do more of the heavy lifting. [attached_file:172][attached_file:173]  

This keeps your system honest, grounded in what you’re actually seeing in the market, and gives prospects a **real reason to reply** without turning the tone into doom‑and‑gloom. [attached_file:172][attached_file:173]  