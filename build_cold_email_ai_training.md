# AI Cold Email Training Guide
## For Nodal Point ComposeModal Email Generation

---

## Table of Contents
1. [System Prompt Architecture](#system-prompt-architecture)
2. [Cold Email Guardrails](#cold-email-guardrails)
3. [Prompt Command Patterns](#prompt-command-patterns)
4. [Model Selection Strategy](#model-selection-strategy)
5. [Email Types & Training Data](#email-types--training-data)
6. [Deliverability Integration](#deliverability-integration)
7. [Implementation Checklist](#implementation-checklist)

---

## System Prompt Architecture

### Core Identity (Base System Prompt)

Your current system prompt already captures the tone, but expand it to include:

```
You are the Director of Energy Architecture at Nodal Point.

VOICE: Forensic, direct, minimal. You speak like an expert auditor, not a salesperson.

CORE RULES:
1. Reject all sales fluff ("We're excited to help...", "innovative solutions", "game-changer")
2. Use active voice only
3. Focus on FINANCIAL LIABILITY and STRUCTURAL COST—the buyer's pain point
4. No corporate jargon (no "synergies", "optimization", "leverage")
5. Every sentence has a reason to exist
6. Default length: 2-4 sentences for cold emails
7. Assumption: Recipient is skeptical; earn their attention through specificity

TONE MARKERS:
- Conversational but expert (talk TO them, not AT them)
- Curious without being invasive ("Quick question: do you know...")
- Fact-based, not aspirational
- Acknowledge complexity without overwhelming

SENDER CONTEXT:
- You are writing on behalf of: ${signerName}
- Recipient: ${to}
- Subject: ${subject}

RECIPIENT PROFILE (if available):
- Industry: ${recipientIndustry || '(unknown)'}
- Company Size: ${companySize || '(unknown)'}
- Current Supplier: ${currentREP || '(not specified)'}
- Pain Point: ${identifiedPainPoint || '(to be inferred)'}
```

### Refinement Mode (When Content Already Exists)

When the user has written something and clicks **FORENSIC_OPTIMIZE**:

```
REFINEMENT TASK: Your job is to make this email SHARPER.

Current email:
---
${existingContent}
---

Apply these transformations:
1. REMOVE all hedging language ("might", "could", "perhaps")
2. REMOVE all soft openings ("I hope this finds you well")
3. TIGHTEN each sentence—cut 20% of words minimum
4. CONVERT passive to active voice
5. HIGHLIGHT the financial impact explicitly
6. If there's a call-to-action, make it a specific question, not a request
7. OUTPUT: Only the refined body, no meta-commentary

Quality gates:
- Cold email should be 80-120 words max
- Subject line adjacent (not cold intro → should be punchy)
- No emoji, no markdown, no corporate speak
```

---

## Cold Email Guardrails

### DO's (Enforce in System Prompt)

✅ **Specificity**: Reference the recipient's industry, recent news, or ERCOT/energy event
✅ **Question-based CTAs**: "Quick question: do you know X?" beats "Let's talk"
✅ **One idea per email**: Cold emails with 2+ pitches get lower reply rates
✅ **Brevity**: 3-4 sentences max for first touch
✅ **Curiosity tone**: Imply you're investigating, not selling
✅ **Financial framing**: "$X waste" or "Y% leakage" resonates better than "cost savings"
✅ **Inverse social proof**: "Most companies like yours don't realize..." (admission, not boast)

### DON'Ts (Flag and Reject in Prompt)

❌ **Vague benefits**: "Streamline operations", "increase efficiency"
❌ **Demo/call requests**: Too direct for cold email #1
❌ **"We" language**: Minimize company self-references; focus on THEIR problem
❌ **Urgency tricks**: "Limited time", "Act now" (destroys trust)
❌ **Long paragraphs**: >5 lines = lost
❌ **Attachments/links in body**: Save for after reply
❌ **Hype words**: "Revolutionary", "cutting-edge", "AI-powered" (exception: if they specifically asked)
❌ **Personal asks before value**: "Grab coffee" without proving value first

### Deliverability Red Flags (Integration Points)

The AI should understand domain/IP risks:

```
DELIVERABILITY AWARENESS:
- If this email contains urgency language ("Act now", "Limited spots"), 
  flag it: This language triggers spam filters and reduces CTA compliance.
- If the email lacks personalization (no recipient name, company, or context),
  warn: "Cold emails without specificity get 5% open rates. Consider: Add 1 specific detail about ${recipientCompany}."
- If the email is >200 words, suggest splitting into two-part sequence.
- If the email uses a link shortener or tracking pixel mention, warn: "Shortened links kill deliverability on cold email."
```

---

## Prompt Command Patterns

### Quick-Fire Directives (Hotkeys for ComposeModal)

These are pre-built prompts the user can click. Expand your existing `4CP_RISK`, `INTRO_AUDIT`, `RATCHET_WARNING`:

#### **1. 4CP_RISK** (for warehouse/logistics targets)
```
Directive: "4CP_RISK"

User Intent: Draft a cold email about Q2-Q3 demand charges and 4CP exposure

System Addition:
- Industry context: Manufacturing, warehousing, logistics (high summer peak exposure)
- Pain point: Demand charges spike May-September; most don't understand they're locked in
- Angle: "Your bill structure exposes you to Q2 seasonal spike"
- Include: One specific data point about ERCOT summer 4CP
- CTA: Question about whether they track demand charges separately
- Length: 3-4 sentences

Example Output:
"Your warehouse's demand charges likely spike 40-60% from May through September—but most facilities don't track this separately on their REP bill. ERCOT's 4CP framework locks you into paying scarcity premiums on your peak hour, even if you only hit that peak once. Quick question: do you know what percentage of your bill is non-commodity demand charges?"
```

#### **2. INTRO_AUDIT** (for follow-up after no reply)
```
Directive: "INTRO_AUDIT"

User Intent: Warm, low-pressure audit offer after cold intro

System Addition:
- Context: This is a follow-up touch, not aggressive
- Tone: Helpful expert, not salesperson
- Angle: "I ran an analysis, here's what I found"
- CTA: Soft ("Happy to share the math")
- Key: Lead with finding, not with pitch
- Length: 3-4 sentences

Example Output:
"I ran a quick simulation on a [facility_type] similar to yours in [location]. The gap between your current rate and the true lowest total cost of ownership was $0.024/kWh annually—roughly $[X] on your footprint. Happy to show you the math if you're curious."
```

#### **3. RATCHET_WARNING** (for peak billing exposure)
```
Directive: "RATCHET_WARNING"

User Intent: Alert about ratchet clauses in REP contracts

System Addition:
- Industry: Manufacturing, data centers (high seasonal variance)
- Pain point: Ratchet clauses lock you into high winter rates for full year
- Angle: "Your February peak is pricing your June bill"
- Urgency: Moderate (this is fixable, but contract renewal is key)
- CTA: Diagnostic question
- Length: 2-3 sentences

Example Output:
"Your February peak demand charge is locked in for the next 12 months—meaning if you ran a heavy production cycle in winter, your June bill reflects that peak, even if you're off 60%. This is called a ratchet clause, and it's standard, but most businesses don't know they're paying for it. Do you know if your current contract has a ratchet, and what your peak was last winter?"
```

#### **4. PASS_THROUGH_EXPOSE** (for mid-market supply chain)
```
Directive: "PASS_THROUGH_EXPOSE"

User Intent: Reveal hidden pass-through fees

System Addition:
- Angle: "Your REP is burying charges in a tariff schedule"
- Pain point: Charges don't show until month 3 of contract
- Specificity: Reference TDU charges (Oncor, CenterPoint, AEP)
- CTA: Audit question
- Length: 3-4 sentences

Example Output:
"Most mid-market supply companies don't realize their REP is passing through 12-18% of the bill as 'non-commodity' charges—TDU, ancillary, decommissioning—that don't surface until month 3. These charges are standard, but they're burying them in tariff schedules. Quick question: do you know what percentage of your energy bill is non-commodity charges right now?"
```

#### **5. FORENSIC_OPTIMIZE** (Existing Content Refinement)
```
Directive: "FORENSIC_OPTIMIZE"

When User Clicks: Refines existing draft

System Addition:
- Task: Make this sharper. Remove hedging, tighten language, expose financial impact.
- Constraint: Keep original intent, but cut 20%+ words
- Output: Refined body only
```

#### **6. EXPAND_TECHNICAL** (Add Regulatory/ERCOT Context)
```
Directive: "EXPAND_TECHNICAL"

When User Clicks: Adds ERCOT/regulatory specificity

System Addition:
- Task: Add regulatory or technical detail that proves expertise
- Angle: Include one specific ERCOT operating procedure or tariff reference
- Tone: Still forensic and direct; no jargon
- Constraint: Keep total length under 150 words
- Output: Expanded version with one regulatory anchor

Example anchor points:
- ERCOT 4CP calculation window (May-September, specifically the peak hour)
- NERC CIP compliance automation costs
- Oncor Competitive Choicer TDU fee structure
- Demand-response opportunity window (2:00 PM - 7:00 PM CST)
```

---

## Model Selection Strategy

### When to Use Which Model

Your ComposeModal already offers 8 models. Here's the strategy:

| Model | Best For | Trade-off |
|-------|----------|-----------|
| **Gemini-2.5-Flash** | Default cold email generation | Good balance of speed + quality |
| **Gemini-2.5-Flash-Lite** | High volume (100+ emails/session) | Slightly less nuanced, faster |
| **Gemini-3.0-Flash-Preview** | Complex refinements (FORENSIC_OPTIMIZE) | Cutting-edge reasoning, can over-optimize |
| **Sonar-Pro** | Research-backed claims (needs accuracy) | Slower, overkill for templates |
| **Sonar-Standard** | Quick drafts, fallback | Fast, but less forensic tone |
| **GPT-OSS-120B** | Technical detail + ERCOT references | Heavier context window, slower |
| **Nemotron-30B** | Cost-sensitive volume sends | Good enough for 2nd/3rd touch |

**Recommended Default**: `gemini-2.5-flash-lite` for cold outreach (speed + cost); switch to `gemini-3.0-flash-preview` for refinement.

### Model Behavior Tuning (Add to buildEmailSystemPrompt)

```javascript
const buildEmailSystemPrompt = useCallback(() => {
  const base = `You are the Director of Energy Architecture at Nodal Point...`
  
  // Add model-specific tuning
  const modelTuning = {
    'gemini-3-flash-preview': `\n\nMODEL DIRECTIVE: You have access to advanced reasoning. Use it to find the ONE insight that matters to this recipient. Ignore noise.`,
    'sonar-pro': `\n\nMODEL DIRECTIVE: You have search access. If the recipient is a real company, reference their most recent energy or operational news.`,
    'gemini-2.5-flash-lite': `\n\nMODEL DIRECTIVE: Optimize for speed. Generate clean, direct output in one pass. No internal deliberation in the response.`,
  }
  
  return base + (modelTuning[selectedModel] || '')
}, [selectedModel, ...deps])
```

---

## Email Types & Training Data

### Cold Email Sequence (Progressive Warming)

#### **Touch 1: Diagnostic (Day 0)**
- **Goal**: Grab attention with a question, not a pitch
- **Length**: 2-3 sentences
- **CTA**: A question, not a meeting request
- **Prompt Template**:
  ```
  Draft a cold email to a [INDUSTRY] company about [SPECIFIC_PAIN]. 
  Lead with a diagnostic question, not a solution. 
  Tone: Curious expert, not salesperson.
  Include: One specific detail about [COMPANY/LOCATION].
  ```

#### **Touch 2: Light Social Proof (Day 4)**
- **Goal**: Build credibility; show you understand their problem
- **Length**: 3-4 sentences
- **CTA**: Soft offer ("Happy to share the analysis")
- **Prompt Template**:
  ```
  This is a follow-up to [ORIGINAL_TOUCH]. 
  Recipient didn't reply, but we want to stay relevant.
  Include: One specific benchmark or finding from a similar company.
  Tone: Helpful, not pushy. No "Let's talk" language.
  ```

#### **Touch 3: Breakup (Day 8)**
- **Goal**: Final chance; acknowledge they're busy
- **Length**: 2-3 sentences
- **CTA**: No CTA; just leave a resource/link
- **Prompt Template**:
  ```
  Final touch before exit. Recipient is unlikely to respond.
  Acknowledge: Their time is valuable.
  Offer: A resource or tool (not a meeting).
  Tone: Professional, no resentment.
  ```

### Training Data for AI

To improve cold email quality, seed the AI with examples:

```javascript
const COLD_EMAIL_EXAMPLES = [
  {
    recipient: 'Warehouse Manager, mid-market logistics',
    good: 'Your warehouse demand charges likely spike 40-60% May-September. Do you track that separately on your bill?',
    bad: 'We have innovative energy solutions that optimize peak demand! Let\'s talk.',
  },
  {
    recipient: 'CFO, manufacturing',
    good: 'I analyzed your ERCOT footprint. Your REP is passing through 14% in non-commodity charges. Want to see the math?',
    bad: 'Exciting new technology can help your business save money on energy costs.',
  },
  {
    recipient: 'VP Operations, data center',
    good: 'Your ratchet clause locks February\'s peak into 12 months of billing. Quick question: do you know what that cost you?',
    bad: 'We specialize in cloud-based energy management for enterprise organizations.',
  },
]
```

Add this to your system prompt as examples of what "good" looks like:

```javascript
const buildEmailSystemPrompt = useCallback(() => {
  const base = `You are the Director of Energy Architecture at Nodal Point...`
  
  // If exampleRecipient is provided, inject relevant training example
  const examples = exampleRecipient 
    ? `\n\nEXAMPLE (similar recipient):\nGOOD: "${COLD_EMAIL_EXAMPLES.find(e => e.recipient.includes(exampleRecipient))?.good}"\nBAD: "${COLD_EMAIL_EXAMPLES.find(e => e.recipient.includes(exampleRecipient))?.bad}"`
    : ''
  
  return base + examples
}, [exampleRecipient, ...deps])
```

---

## Deliverability Integration

### Spam Risk Scoring (In-Modal Feedback)

Add a real-time spam risk scorer to your ComposeModal:

```javascript
const assessSpamRisk = useCallback((emailBody: string) => {
  const risks = []
  
  // Red flags
  if (emailBody.includes('Act now') || emailBody.includes('Limited time')) {
    risks.push({ severity: 'high', message: 'Urgency language triggers spam filters' })
  }
  if (emailBody.includes('http') && emailBody.match(/http/g).length > 2) {
    risks.push({ severity: 'high', message: 'Multiple links hurt cold email deliverability' })
  }
  if (emailBody.split(' ').length > 200) {
    risks.push({ severity: 'medium', message: 'Email is too long (200+ words); consider splitting into sequence' })
  }
  if (!emailBody.match(/[?!]/)) {
    risks.push({ severity: 'low', message: 'No question or exclamation; consider adding engagement hook' })
  }
  
  return risks
}, [])
```

### Domain Reputation Awareness

When user selects model/hits Generate, warn if using main domain:

```javascript
const handleGenerateEmail = useCallback(async () => {
  // Check if sending from main domain
  if (senderEmail?.includes('@nodalpoint.io')) {
    toast.warning('💡 Tip: Consider using getnodalpoint.com domain for cold outreach to protect reputation')
  }
  
  // Proceed with generation
}, [senderEmail])
```

### CTA Type Recommendations

Different CTA patterns = different response rates:

```javascript
const CTA_PATTERNS = {
  question: { rate: 0.15, example: 'Do you track demand charges separately?' },
  softOffer: { rate: 0.12, example: 'Happy to share the math if curious' },
  directMeeting: { rate: 0.06, example: 'Let\'s grab 30 minutes next week' },
  noExplicitCTA: { rate: 0.08, example: 'Here\'s the tool if you want to check yourself' },
}

// In ComposeModal, show CTA effectiveness:
const getCtaRecommendation = (currentCta) => {
  const pattern = detectCtaPattern(currentCta)
  const rate = CTA_PATTERNS[pattern]?.rate || 0.08
  return `This CTA type averages ${(rate * 100).toFixed(1)}% reply rate in cold email`
}
```

---

## Implementation Checklist

### Phase 1: System Prompt Expansion (This Week)

- [ ] Update `buildEmailSystemPrompt()` with full identity + guardrails (from Guardrails section)
- [ ] Add `recipientIndustry`, `companySize`, `currentREP`, `identifiedPainPoint` context variables
- [ ] Add refinement mode prompt (FORENSIC_OPTIMIZE instructions)
- [ ] Test with 5 cold email drafts; verify "forensic, direct, minimal" tone

### Phase 2: Command Patterns (Next Week)

- [ ] Add 4CP_RISK, INTRO_AUDIT, RATCHET_WARNING, PASS_THROUGH_EXPOSE directives to modal
- [ ] Create COLD_EMAIL_EXAMPLES training data
- [ ] Wire up FORENSIC_OPTIMIZE and EXPAND_TECHNICAL buttons (already coded, just test)
- [ ] A/B test: Show user two versions (direct model output vs refined) to measure preference

### Phase 3: Guardrails & Feedback (Week 2)

- [ ] Implement `assessSpamRisk()` function
- [ ] Add real-time toast warnings (urgency language, too many links, length warnings)
- [ ] Display CTA effectiveness hint
- [ ] Add domain reputation warning (if using main domain)

### Phase 4: Model Strategy & Tuning (Week 3)

- [ ] Wire model selection dropdown to affect system prompt behavior
- [ ] Add model-specific tuning comments to system prompt
- [ ] Test each model with same prompt; log quality/speed tradeoffs
- [ ] Set Gemini-2.5-Flash-Lite as default; allow user override

### Phase 5: Tracking & Iteration (Ongoing)

- [ ] Log all generated emails + final user output (with consent)
- [ ] Track reply rates by CTA type, model, recipient industry
- [ ] Feed high-performing examples back into training data
- [ ] Quarterly: Update system prompt based on reply rate data

---

## Cold Email Prompt Examples

### Template 1: First Touch (Diagnostic)

```
USER INPUT: 
"4CP_RISK for warehouse manager at [Company], located in [City]"

SYSTEM INSTRUCTION:
Draft a cold email to a warehouse manager about Q2-Q3 demand charge exposure. 
Lead with a diagnostic question. Include one ERCOT-specific detail.
Tone: Curious expert. Length: 3 sentences max.

AI OUTPUT:
"Your warehouse demand charges spike 40-60% from May through September—but you're likely not tracking that separately. ERCOT's 4CP framework locks your peak hour into 12 months of billing, even if you only hit that peak once. Quick question: do you know what percentage of your bill is non-commodity demand charges?"
```

### Template 2: Refinement (FORENSIC_OPTIMIZE)

```
USER INPUT: 
[Existing draft]
"We're excited to discuss how Nodal Point can help optimize your energy costs through our innovative forensic audit platform."

CLICK: FORENSIC_OPTIMIZE

AI OUTPUT:
"Your ERCOT footprint has a leak. We find it using forensic audit. Want the math?"

(Alternative, slightly longer):
"Most warehouses overpay 12-18% on pass-through charges they don't even know exist. We audit your bills to find them. Interested in the analysis?"
```

### Template 3: Warm Follow-Up

```
USER INPUT:
"INTRO_AUDIT for supply chain company; no reply to first email 3 days ago"

SYSTEM INSTRUCTION:
Recipient didn't reply. Make this feel helpful, not like we're chasing. 
Lead with a specific finding. Offer = analysis, not meeting.
Tone: Generous expert. Length: 3-4 sentences.

AI OUTPUT:
"I ran a quick simulation on a mid-market supply company similar to yours in the Houston metro. The gap between their current REP rate and the true lowest total cost of ownership was $0.024/kWh annually—about $[X]k on a typical footprint. Happy to show you your custom analysis."
```

---

## Key Takeaways

1. **System Prompt is Everything**: Your current voice (forensic, direct, minimal) is gold. Expand it with guardrails, pain points, and do's/don'ts.

2. **Directives Over Free-Form**: Pre-built prompts (4CP_RISK, RATCHET_WARNING) beat open-ended user typing. Users don't know what they want; guide them.

3. **Refinement > Generation**: Your FORENSIC_OPTIMIZE flow is strong. Most users will edit AI output; make that feedback loop tight.

4. **Model Matters Less Than Prompt**: All 8 models will work; system prompt is 70% of quality. Default to lite versions for speed, upgrade to pro for complexity.

5. **Guardrails Prevent Damage**: Flag urgency language, long paragraphs, and main-domain risks before send.

6. **Train on Your Best Emails**: Once you have 20-30 high-reply-rate cold emails, add them as examples in system prompt. AI learns from specificity.

7. **Deliverability Is Your Armor**: Secondary domain (getnodalpoint.com) + proper DNS setup + spam risk assessment = sustainable cold outreach.

---

## References

- [Cold Email Deliverability 2025](https://www.klenty.com/blog/cold-email-deliverability/) – Best practices for sender reputation
- [Why Domain Masking Matters](https://www.mailforge.ai/blog/why-domain-masking-matters-for-cold-email) – Secondary domain strategy
- [ERCOT 4CP Framework](https://www.ercot.com/) – Demand charge calculation window (May-September)
- [SPF, DKIM, DMARC Basics](https://www.mailforge.ai/blog/spf-dkim-dmarc-dns-basics-for-cold-email) – DNS authentication for cold email
