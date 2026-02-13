'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEmails } from '@/hooks/useEmails'
import { useAuth } from '@/context/AuthContext'
import { generateNodalSignature } from '@/lib/signature'
import { Loader2, X, Paperclip, Sparkles, Minus, Maximize2, Cpu, Check, RotateCcw, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ScanlineLoader } from '@/components/chat/ScanlineLoader'
import { INDUSTRY_VECTORS } from '@/lib/industry-mapping'
import { generateStaticHtml, substituteVariables, contactToVariableMap } from '@/lib/foundry'
import { useQuery } from '@tanstack/react-query'

const EMAIL_AI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'GEMINI-2.5-FLASH' },
  { value: 'gemini-2.5-flash-lite', label: 'GEMINI-2.5-FLASH-LITE' },
  { value: 'gemini-3-flash-preview', label: 'GEMINI-3.0-FLASH-PREVIEW' },
  { value: 'gemini-2.0-flash', label: 'GEMINI-2.0-FLASH' },
  { value: 'sonar-pro', label: 'SONAR-PRO' },
  { value: 'sonar', label: 'SONAR-STANDARD' },
  { value: 'openai/gpt-oss-120b:free', label: 'GPT-OSS-120B' },
  { value: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'NEMOTRON-30B' },
] as const

export type EmailTypeId = 'cold_first_touch' | 'cold_followup' | 'professional' | 'followup' | 'internal' | 'support'

const DELIVERABILITY_RULES = `
DELIVERABILITY RULES:
- Avoid promotional spam language ("free", "act now", "discount", "save big", "limited time offer", "urgent", "money-back guarantee").
- Avoid overuse of dollar signs, percentages, and ALL CAPS in subject/body.
- For cold first-touch: do not include any links. Plain text only.`

/** Maps industry to vertical-specific pain points and angles. Used to automatically inject context into prompts. */
function getIndustryAngle(industry: string | undefined): string | null {
  if (!industry || typeof industry !== 'string') return null
  const normalized = industry.trim().toLowerCase()
  if (!normalized) return null

  // Check for specific verticals
  if (normalized.includes('restaurant') || normalized.includes('food & beverage') || normalized.includes('food and beverage') || normalized.includes('hospitality')) {
    return `VERTICAL: Restaurants/Food Service
PAINS: Tight margins; power costs hit food cost and labor. Evening peaks (kitchen + HVAC + lights). Risk of spoilage during outages.
ANGLES: "Dinner rush can quietly set demand charges that crush margins." "How many minutes of outage before you start losing inventory?" Focus on operational peaks (rush hours) and margin impact, not generic summer peaks.`
  }
  if (normalized.includes('hotel') || normalized.includes('accommodation')) {
    return `VERTICAL: Hotels/Hospitality
PAINS: Guest comfort (AC), occupancy-driven peaks. Common-area loads (lobby, conference, pool). Seasonality and weekend spikes.
ANGLES: "A few hot weekends can lock in demand charges for the off-season." "Have you ever seen a spike where guest comfort and your bill go in opposite directions?" Focus on occupancy patterns and guest experience vs cost tradeoffs.`
  }
  if (normalized.includes('nonprofit') || normalized.includes('non-profit') || normalized.includes('non profit') || normalized.includes('clinic') || normalized.includes('shelter') || normalized.includes('community center')) {
    return `VERTICAL: Nonprofits/Clinics
PAINS: Fixed or donor-driven budgets. Mission-critical services; outages are reputational risk. Need predictability more than rock-bottom price.
ANGLES: "When the power bill jumps 15%, what program loses funding?" "You can't shut the doors when the grid gets tight; how are you insulating your budget from that volatility?" Focus on budget predictability and mission-critical reliability, not generic cost savings.`
  }
  if (normalized.includes('school') || normalized.includes('isd') || normalized.includes('education') || normalized.includes('district')) {
    return `VERTICAL: Schools/ISDs
PAINS: Large campuses with HVAC-driven peaks. Bond-funded projects need predictable OPEX. High summer usage when buildings are "empty".
ANGLES: "Empty buildings in August still set 12 months of charges." "What does a summer peak do to next year's budget per student?" Focus on summer HVAC when buildings are empty and budget per student impact.`
  }
  if (normalized.includes('warehouse') || normalized.includes('logistics') || normalized.includes('distribution') || normalized.includes('3pl') || normalized.includes('freight')) {
    return `VERTICAL: Warehouses/Logistics
PAINS: Demand peaks during loading/unloading. Multi-site footprint with inconsistent usage. Refrigerated/conditioned space driving high kW. Contracts not matched to actual load profile.
ANGLES: "One busy loading window can set 12 months of charges." "We mapped your facilities and saw a huge spread in kW that isn't showing up in base rates." Focus on operational peaks (loading/unloading windows) and multi-site inconsistencies.`
  }
  if (normalized.includes('manufacturing') || normalized.includes('production') || normalized.includes('factory')) {
    return `VERTICAL: Manufacturing
PAINS: Production line peaks, shift changes, HVAC for conditioned spaces. Contracts often don't match actual load shape. High kW during production runs.
ANGLES: "One production run can set demand charges for months." "When all the lines are running, that peak can lock in next year's delivery costs." Focus on production-driven peaks and load shape mismatches.`
  }
  if (normalized.includes('healthcare') || normalized.includes('hospital') || normalized.includes('medical') || normalized.includes('clinic')) {
    return `VERTICAL: Healthcare
PAINS: 24/7 operations, critical equipment loads, HVAC for patient comfort. Outages are life-safety risks. Budget predictability matters more than lowest price.
ANGLES: "When the power bill jumps, what service gets cut?" "You can't shut down when the grid gets tight; how are you insulating your budget from volatility?" Focus on reliability and budget predictability, not generic cost savings.`
  }
  if (normalized.includes('retail') || normalized.includes('store') || normalized.includes('supermarket')) {
    return `VERTICAL: Retail
PAINS: Customer-facing operations; peaks during business hours. Lighting, HVAC, and equipment loads. Tight margins; power costs hit profitability.
ANGLES: "Peak shopping hours can quietly set demand charges that eat into margins." "When all the lights and AC are maxed during busy hours, that peak locks in charges for months." Focus on customer-facing operational peaks and margin impact.`
  }
  if (normalized.includes('real estate') || normalized.includes('property') || normalized.includes('commercial real estate')) {
    return `VERTICAL: Real Estate/Property Management
PAINS: Multi-tenant buildings with inconsistent usage. Common-area loads (hallways, elevators, parking). Tenant comfort vs cost tradeoffs.
ANGLES: "Common-area loads can set demand charges across the whole building." "When tenants crank AC during hot days, that peak locks in charges for all tenants." Focus on multi-tenant dynamics and common-area loads.`
  }

  // Check INDUSTRY_VECTORS for broader matches
  for (const [vector, values] of Object.entries(INDUSTRY_VECTORS)) {
    const match = values.some(v => normalized.includes(v.toLowerCase()) || v.toLowerCase().includes(normalized))
    if (match) {
      // Map vector to angle if we have a specific one
      if (vector === 'Food & Beverage') {
        return `VERTICAL: Food & Beverage
PAINS: Tight margins; power costs hit food cost and labor. Evening peaks (kitchen + HVAC + lights). Risk of spoilage during outages.
ANGLES: "Dinner rush can quietly set demand charges that crush margins." Focus on operational peaks and margin impact.`
      }
      if (vector === 'Logistics & Warehouse') {
        return `VERTICAL: Logistics/Warehouse
PAINS: Demand peaks during loading/unloading. Multi-site footprint with inconsistent usage. Refrigerated/conditioned space driving high kW.
ANGLES: "One busy loading window can set 12 months of charges." Focus on operational peaks and multi-site inconsistencies.`
      }
      if (vector === 'Education') {
        return `VERTICAL: Education
PAINS: Large campuses with HVAC-driven peaks. Bond-funded projects need predictable OPEX. High summer usage when buildings are "empty".
ANGLES: "Empty buildings in August still set 12 months of charges." Focus on summer HVAC when buildings are empty.`
      }
      if (vector === 'Healthcare') {
        return `VERTICAL: Healthcare
PAINS: 24/7 operations, critical equipment loads, HVAC for patient comfort. Outages are life-safety risks. Budget predictability matters.
ANGLES: "When the power bill jumps, what service gets cut?" Focus on reliability and budget predictability.`
      }
      if (vector === 'Manufacturing') {
        return `VERTICAL: Manufacturing
PAINS: Production line peaks, shift changes, HVAC for conditioned spaces. Contracts often don't match actual load shape.
ANGLES: "One production run can set demand charges for months." Focus on production-driven peaks.`
      }
    }
  }

  return null
}

interface EmailTypeConfig {
  id: EmailTypeId
  label: string
  /** Base system prompt (identity + rules). Receives { signerName, to, subject }. */
  getSystemPrompt: (ctx: { signerName: string; to: string; subject: string }) => string
  /** Refinement-mode instruction appended when user has existing content. */
  getRefinementInstruction: () => string
  /** Chips shown when body is empty (generation mode). */
  generationChips: { label: string; directive: string }[]
  /** Chips shown when body has content (refinement mode). */
  refinementChips: { label: string; directive: string }[]
}

const EMAIL_TYPES: EmailTypeConfig[] = [
  {
    id: 'cold_first_touch',
    label: 'Cold (first touch)',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are the Director of Energy Architecture at Nodal Point. You write FIRST-TOUCH COLD emails that are short, trigger-led, and plain text only.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user's directive is unclear, interpret it and generate email content anyway. Default to the standard email structure below.

STRUCTURE: TRIGGER (one observable: operational peak, tariff change, expansion, or vertical-specific trigger) → PAIN (one sentence, in plain English, using vertical-specific angle if provided: e.g. for restaurants "dinner rush can set demand charges that crush margins", for warehouses "one busy loading window can set 12 months of charges", for schools "empty buildings in August still set 12 months of charges", generic fallback "summer peaks locking in next year's costs") → PROOF (brief peer/similar facility) → One question as CTA.
ANGLES: If VERTICAL-SPECIFIC ANGLE is provided above, use that angle automatically. Otherwise, vary between: summer peaks & transmission charges, winter ratchet effect, pass-through/non-commodity charges, budget volatility, operational peaks. Do not repeat the same angle in every email.
WORD COUNT: Entire email 40–80 words (first-touch sweet spot for reply rates).
LANGUAGE: Use plain English that ops, finance, and facility managers understand. Do NOT use jargon (4CP, ratchet, TDU, pass-through, demand charge, coincident peak, non-commodity) unless RECIPIENT CONTEXT explicitly indicates the recipient is an energy manager, director of energy, or similar. When in doubt, describe the mechanism in plain language (e.g. "summer peaks that lock in next year's transmission costs", "one winter spike that can set your delivery charges for the next 12 months", "charges from your utility that aren't the energy commodity").
SENDER: ${signerName}
RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Optional. Vary your openings — randomly choose one of these patterns:
(a) Plain statement of the problem (no greeting): "When summer peaks hit, a few 15-minute intervals can lock in next year's transmission charges."
(b) Question about visibility: "Does anyone on your team track how summer peaks affect next year's budget?"
(c) Brief observation about their footprint: "With three warehouses in DFW, a few summer peaks can lock in charges across the whole footprint."
(d) Short greeting + problem: "Hi {firstName}, summer peaks can quietly set next year's delivery costs."
Do NOT use: "I hope this email finds you well", "I'd love to connect", "circle back", "touch base", "you're likely aware", "you're likely seeing", "you're probably aware". These sound templated and AI-written.
CLOSING: Minimal sign-off: "Best," or "Thanks," followed by the SENDER name from above (first name only for cold, e.g. "Best,\\n[SENDER first name]" or "– [SENDER first name]"). Always use the actual SENDER name from the prompt, not a placeholder. No formal sign-offs.

SUBJECT LINE (when generating): 4–7 words, clear and specific. Do NOT put the recipient's first name in the subject (it looks automated). Use plain-English subject; you may reference company or location when it adds clarity (e.g. "Summer transmission charges in Dallas", "Summer peak risk at your Dallas DC", "Transmission costs on your DFW sites"). Reserve jargon like "4CP exposure" for when the recipient is clearly an energy manager. Match body honestly; no clickbait. Avoid all caps and excessive punctuation.
CTA: Always end with one clear question in plain English. Vary your CTA style randomly — choose one of:
- Yes/no question: "Is anyone tracking how those peaks affect next year's budget?"
- Open question: "What happens to your budget when those peaks hit?"
- Soft suggestion: "Worth a quick look on your side?"
Do not use "4CP exposure", "modeling", "mitigating", or "on your radar" in the closing question unless the recipient is an energy manager. Do not combine multiple asks in one email. Avoid repeating the same CTA wording across emails.

PERSONALIZATION (use RECIPIENT CONTEXT when provided): You may mention the recipient's title or company **once** in the first sentence, but only if you tie it directly to a concrete responsibility or pain (e.g. "As VP of Operations at [Company], you're the one who feels it when summer peaks lock in next year's transmission charges."). If contextForAi includes recent activity (new warehouse, expansion, cost-focus, locations like DFW, company news), you may reference **one** of those naturally in the first sentence — make it feel like you know their world, not like you're restating their website. If VERTICAL-SPECIFIC ANGLE is provided, use that angle automatically (e.g. for restaurants: dinner rush/margins; for warehouses: loading windows; for schools: empty buildings in August). Do not spend more than one sentence on personalization; move quickly to the cost problem and question.
GUARDRAILS: Do not over-praise (no "esteemed", "renowned"). Do not write long clauses about their job description; use title only to anchor a specific outcome ("you feel it when…", "you're the one who sees…", "you're the person who gets the call when…"). If no meaningful personalization data is provided, skip title and start directly with the business problem. Use natural, slightly uneven sentences — it should feel like one person writing a quick note, not a marketing email.

${DELIVERABILITY_RULES}
- No links, no images, no bullets, no HTML. Plain text only.
- Output ONLY the email body (or SUBJECT: + body when generating). No meta-commentary.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Sharpen to 40–80 words. Remove hedging. Active voice. One question CTA. Output only the refined body.',
    generationChips: [
      { label: '4CP_RISK', directive: 'Write a 40–70 word first-touch cold email to a warehouse/logistics operator in ERCOT. Avoid jargon in the first sentence; describe the business problem in plain language (e.g. summer peaks locking in next year\'s transmission charges). You may mention "4CP" once in the body if needed, but only after the problem is clear. End with one plain-English question only — e.g. "Is anyone on your team looking at how those summer peaks affect next year\'s costs?", "Does anyone track those peak intervals against your budget?", or "Is that something you\'re already looking at?" Do NOT end with "modeling or mitigating 4CP exposure" or "4CP exposure on your radar." No links, plain text, minimal sign-off using the SENDER name from the system prompt. (Use RECIPIENT CONTEXT / Audience above: plain English for general, precise terms only if Audience says energy manager.)' },
      { label: 'TITLE_INTRO', directive: 'Use RECIPIENT CONTEXT: open with one sentence that ties their title and/or company to the cost pain (e.g. "As [title] at [company], you\'re the one who feels it when summer peaks lock in next year\'s transmission charges."). Then one sentence proof, one question. No flattery. 40–70 words. Plain text.' },
      { label: 'INTRO_AUDIT', directive: 'Warm follow-up: quick reminder of prior interaction, one key finding, soft CTA "Want to see the numbers?" 40–60 words. Plain text.' },
      { label: 'RATCHET_WARNING', directive: 'Write a 40–70 word first-touch cold email. Describe in plain English: one winter peak can set a large part of next year\'s delivery charges for 12 months (do not say "ratchet" unless RECIPIENT CONTEXT / Audience says energy manager). One sentence proof (similar facility). End with one plain-English question (e.g. "Is anyone on your team looking at how that winter peak affects next year\'s costs?" or "Is that something you\'re already tracking?"). No links, plain text, minimal sign-off. (Use Audience above: plain English for general, "ratchet"/TDU only if energy manager.)' },
      { label: 'PASS_THROUGH', directive: 'Write a 40–70 word first-touch cold email. Describe in plain English: charges from the utility that aren\'t the energy commodity (delivery/utility fees on the bill). Do not say "TDU" or "pass-through" unless RECIPIENT CONTEXT / Audience says energy manager. One question about what share of their bill is those delivery/utility charges. No links, plain text. (Use Audience above: plain English for general, TDU/pass-through only if energy manager.)' },
    ],
    refinementChips: [
      { label: 'FORENSIC_OPTIMIZE', directive: 'Rewrite to 40–80 words. Concise, direct. One question CTA. Output only the refined body.' },
      { label: 'EXPAND_TECHNICAL', directive: 'Add one plain-English detail about how the local market or utility rules affect their costs; keep under 80 words. No jargon unless recipient is an energy manager. Output only the refined body.' },
    ],
  },
  {
    id: 'cold_followup',
    label: 'Cold (follow-up)',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are the Director of Energy Architecture at Nodal Point. You write COLD FOLLOW-UP emails (second+ touch). Slightly longer allowed; still forensic and direct.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user's directive is unclear, interpret it and generate email content anyway. Default to the standard email structure below.

STRUCTURE: Brief reminder of prior touch → one concrete finding or proof → soft CTA (question or "want to see the math?"). Up to ~120–150 words. One link or calendar URL allowed only if the directive asks.
LANGUAGE: Use plain English. Do NOT use jargon (4CP, ratchet, TDU, pass-through, demand charge, non-commodity) unless RECIPIENT CONTEXT indicates the recipient is an energy manager, director of energy, or similar. Describe mechanisms in plain language.
SENDER: ${signerName}
RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Use a short greeting with the recipient's first name: "Hi Sarah," or "Hello Sarah," so it feels like normal 1:1 business communication.
CLOSING: Use a standard sign-off: "Best," or "Thanks," followed by the SENDER's full name from the prompt above. Always use the actual SENDER name, not a placeholder.
SUBJECT: Do NOT put the recipient's first name in the subject. You MAY include company/facility name when relevant (e.g. "Summer peak risk at your Dallas DC", "Transmission costs on your DFW sites"). 4–7 words, honest and specific.
CTA: One clear question or ask. Do not combine multiple asks in one email.
PERSONALIZATION: If RECIPIENT CONTEXT gives title/company/contextForAi, you may use it once in the first sentence tied to a concrete pain. No flattery; no long job-description clauses. If no personalization data, start with the business problem.
${DELIVERABILITY_RULES}
- Plain text preferred. No hype. Output ONLY the email body (or SUBJECT: + body when generating).`,
    getRefinementInstruction: () =>
      'REFINEMENT: Sharpen. Remove filler. One clear CTA. Up to 120–150 words. Output only the refined body.',
    generationChips: [
      { label: 'No-reply follow-up', directive: 'Gentle second touch after no reply. One sentence on prior email, one finding or question. Soft CTA. 50–80 words.' },
      { label: 'Audit follow-up', directive: 'Follow-up after sending audit: one key number or finding, "Want to see the math?" 40–60 words.' },
      { label: 'RATCHET_WARNING', directive: 'Follow-up in plain English: one winter peak setting next year\'s delivery charges for 12 months (use "ratchet" only if recipient is energy manager). One finding, one question. 40–60 words.' },
      { label: 'PASS_THROUGH', directive: 'Follow-up in plain English: utility/delivery charges that aren\'t the commodity (use "pass-through" only if recipient is energy manager). One finding, one question. 40–60 words.' },
    ],
    refinementChips: [
      { label: 'FORENSIC_OPTIMIZE', directive: 'Tighten. One CTA. Output only the refined body.' },
      { label: 'Softer', directive: 'Soften tone; keep ask clear. Output only the refined body.' },
    ],
  },
  {
    id: 'professional',
    label: 'Professional',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are a professional writing on behalf of ${signerName}. You write clear, polite, and appropriate business emails for any context.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user's directive is unclear, interpret it and generate email content anyway.

TONE: Professional, clear, respectful. Adapt to the recipient and subject. Use active voice. Be concise but complete. No slang or casual filler. No hype or overselling.

RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Use a short greeting with the recipient's first name when drafting a full email (e.g. "Hi Sarah," or "Hello Sarah,").
CLOSING: Use a standard business sign-off: "Best," or "Thanks," or "Regards," followed by the SENDER's full name from the prompt above.

Output ONLY the email body. Plain text, no markdown.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Tighten and clarify this email. Keep the same intent and tone. Remove redundancy. Improve flow. Output only the revised body.',
    generationChips: [
      { label: 'Meeting recap', directive: 'Draft a brief meeting recap with key points and next steps.' },
      { label: 'Introduce', directive: 'Draft a short professional introduction of myself / our team to the recipient.' },
      { label: 'Request', directive: 'Draft a polite request (e.g. information, action, or response). Be specific and clear.' },
      { label: 'Thank you', directive: 'Draft a concise thank-you email. Sincere and professional.' },
    ],
    refinementChips: [
      { label: 'Tighten', directive: 'Tighten and clarify. Remove redundancy. Same intent.' },
      { label: 'Formalize', directive: 'Make the tone slightly more formal and polished.' },
      { label: 'Shorten', directive: 'Shorten this email while keeping the main message.' },
    ],
  },
  {
    id: 'followup',
    label: 'Follow-up',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are writing a follow-up email on behalf of ${signerName}. Tone is helpful and persistent without being pushy.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user's directive is unclear, interpret it and generate email content anyway.

TONE: Polite, brief, clear. Acknowledge they may be busy. Restate the ask or context in one line if needed. One clear CTA. No guilt or pressure.

RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Use a short greeting with the recipient's first name (e.g. "Hi Sarah," or "Hello Sarah,").
CLOSING: Use a standard sign-off: "Best," or "Thanks," followed by the SENDER's full name from the prompt above.

Output ONLY the email body. Plain text, no markdown.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Make this follow-up clearer and more concise. Keep it polite and professional. Output only the revised body.',
    generationChips: [
      { label: 'Polite reminder', directive: 'Draft a polite reminder about a previous email or request. Brief and respectful.' },
      { label: 'Re-attach context', directive: 'Draft a short follow-up that re-attaches context (e.g. "As discussed..." or "Following up on...") with one clear ask.' },
      { label: 'Meeting follow-up', directive: 'Draft a follow-up after a meeting: thank them, recap one or two action items, and suggest next step.' },
      { label: 'No-reply follow-up', directive: 'Draft a gentle second touch after no reply. Acknowledge they are busy; offer one clear next step or question.' },
    ],
    refinementChips: [
      { label: 'Softer', directive: 'Soften the tone; make it less pushy.' },
      { label: 'Clearer CTA', directive: 'Make the call-to-action or ask clearer and more specific.' },
    ],
  },
  {
    id: 'internal',
    label: 'Internal',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are writing an internal email (team, colleague, or internal stakeholder) on behalf of ${signerName}.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user's directive is unclear, interpret it and generate email content anyway.

TONE: Clear, concise, collegial. Can be slightly casual. Get to the point. Bullet points or short paragraphs are fine. No formal marketing language.

RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Optional. Use when it fits the relationship.
CLOSING: Flexible; often just the SENDER's name from the prompt on the last line, or "Thanks," + SENDER name.

Output ONLY the email body. Plain text.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Make this internal email clearer and shorter. Keep the same information. Output only the revised body.',
    generationChips: [
      { label: 'Quick update', directive: 'Draft a quick internal update (status, blocker, or decision). Brief.' },
      { label: 'Question', directive: 'Draft a short internal question or ask for input.' },
      { label: 'Action needed', directive: 'Draft a brief internal email stating what action is needed and from whom.' },
      { label: 'FYI', directive: 'Draft a short FYI or heads-up for the team.' },
    ],
    refinementChips: [
      { label: 'Shorter', directive: 'Shorten this internal message; keep key info.' },
      { label: 'Bulletize', directive: 'Turn the main points into clear bullet points.' },
    ],
  },
  {
    id: 'support',
    label: 'Support / Customer',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are writing a customer- or support-style email on behalf of ${signerName}. Tone is helpful, empathetic, and solution-focused.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user's directive is unclear, interpret it and generate email content anyway.

TONE: Professional, warm, clear. Acknowledge the recipient's situation or question. Provide a clear answer or next step. Avoid jargon. Be concise.

RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Use a short greeting with the recipient's first name (e.g. "Hi Sarah,").
CLOSING: Use a standard sign-off: "Best," or "Thanks," followed by the SENDER's full name from the prompt above.

Output ONLY the email body. Plain text, no markdown.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Make this support email clearer and more helpful. Keep empathy and accuracy. Output only the revised body.',
    generationChips: [
      { label: 'Acknowledge issue', directive: 'Draft a response that acknowledges an issue or concern and sets expectation for next steps.' },
      { label: 'Resolution summary', directive: 'Draft a short summary of a resolution or answer to a question.' },
      { label: 'Next steps', directive: 'Draft a clear explanation of next steps (what we will do, what they need to do, timeline if relevant).' },
      { label: 'Thank you + close', directive: 'Draft a brief thank-you and closing for a resolved ticket or conversation.' },
    ],
    refinementChips: [
      { label: 'Clearer', directive: 'Make the explanation clearer and easier to follow.' },
      { label: 'Warmer', directive: 'Slightly warmer and more empathetic tone while staying professional.' },
    ],
  },
]

/** Optional context passed when opening from a contact/account dossier. Shown in UI and injected into AI prompt. */
export interface ComposeContext {
  contactName?: string
  contactTitle?: string
  companyName?: string
  accountName?: string
  /** Industry/vertical (e.g. "Restaurants", "Logistics & Warehouse", "Education") for vertical-specific angles. */
  industry?: string
  /** Account/company description (filtered to avoid generic "what they do" language). Used for contextual details. */
  accountDescription?: string
  /** Notes + call/transcript summary + news for AI. Injected into system prompt when present. */
  contextForAi?: string
  /** When 'cold_plaintext', send first-touch cold as plain text only (no HTML/signature) for deliverability. */
  deliverabilityMode?: 'cold_plaintext' | 'normal'
}

interface ComposeModalProps {
  isOpen: boolean
  onClose: () => void
  to?: string
  subject?: string
  /** Optional contact/account context (e.g. from Contact Dossier). Used for display and AI. */
  context?: ComposeContext | null
}

function ComposePanel({
  initialTo,
  initialSubject,
  initialContext,
  onClose,
}: {
  initialTo: string
  initialSubject: string
  initialContext: ComposeContext | null
  onClose: () => void
}) {
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState(initialSubject)
  const context = initialContext
  const [content, setContent] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const { user, profile } = useAuth()
  const { sendEmail, isSending } = useEmails()

  // Foundry template state
  const [selectedFoundryId, setSelectedFoundryId] = useState<string | null>(null)
  const foundrySelectValue = selectedFoundryId || 'none'
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)

  // AI Command Rail state
  const [aiRailOpen, setAiRailOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [emailTypeId, setEmailTypeId] = useState<EmailTypeId>('cold_first_touch')
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash-lite')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [pendingAiContent, setPendingAiContent] = useState<string | null>(null)
  const [pendingSubjectFromAi, setPendingSubjectFromAi] = useState<string | null>(null)
  const [contentBeforeAi, setContentBeforeAi] = useState('')
  const [subjectAnimationKey, setSubjectAnimationKey] = useState(0)
  /** In-modal toggle: when true and type is cold, send as plain text with minimal signature (Option B). */
  const [sendAsPlainText, setSendAsPlainText] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  // Suppress signature when using foundry template
  const shouldShowSignature = !selectedFoundryId
  const signatureHtml = (profile && shouldShowSignature) ? generateNodalSignature(profile, user, true) : ''
  const outgoingSignatureHtml = (profile && shouldShowSignature) ? generateNodalSignature(profile, user, false) : ''
  const signerName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Lewis Patterson' : 'Lewis Patterson'

  const isRefinementMode = content.trim().length > 0
  const emailTypeConfig = EMAIL_TYPES.find((t) => t.id === emailTypeId) ?? EMAIL_TYPES[0]

  /** Subject suggests a meeting recap; use Professional tone so we don't apply cold outreach refinement. */
  const subjectSuggestsMeetingRecap = (s: string) => /meeting\s+recap/i.test((s || '').trim())

  const buildEmailSystemPrompt = useCallback(() => {
    const effectiveConfig = subjectSuggestsMeetingRecap(subject) ? (EMAIL_TYPES.find((t) => t.id === 'professional') ?? emailTypeConfig) : emailTypeConfig
    let base = effectiveConfig.getSystemPrompt({ signerName, to: to || '', subject: subject || '' })
    if (context && (context.contactName || context.companyName || context.contactTitle || context.accountName || context.contextForAi || context.industry || context.accountDescription)) {
      const lines: string[] = []
      if (context.contactName || context.contactTitle || context.companyName || context.accountName) {
        lines.push('RECIPIENT CONTEXT (use for personalization):')
        if (context.contactName) lines.push(`- Name: ${context.contactName}`)
        if (context.contactTitle) lines.push(`- Title: ${context.contactTitle}`)
        if (context.companyName) lines.push(`- Company: ${context.companyName}`)
        if (context.accountName && context.accountName !== context.companyName) lines.push(`- Account: ${context.accountName}`)
        const title = (context.contactTitle || '').toLowerCase()
        const isEnergyManager = /energy\s*manager|director\s*of\s*energy|energy\s*director|sustainability\s*manager|facility\s*energy|utility\s*manager/.test(title)
        if (isEnergyManager) lines.push('- Audience: energy manager / energy-focused role — you may use precise terms (4CP, ratchet, TDU, pass-through) when helpful.')
        else lines.push('- Audience: general (ops, finance, facility) — use plain English only; avoid industry jargon.')
      }
      // Industry-specific angle (automatic, invisible to user)
      const industryAngle = getIndustryAngle(context.industry)
      if (industryAngle) {
        lines.push('VERTICAL-SPECIFIC ANGLE (use this automatically; do not mention "vertical" or "angle" in the email):')
        lines.push(industryAngle)
      }
      // Account description (filtered to avoid generic "what they do" language)
      if (context.accountDescription?.trim()) {
        const desc = context.accountDescription.trim()
        // Filter out generic company description language
        const genericPatterns = /^(we|they|the company|our company|this company|we are|they are|we provide|they provide|we offer|they offer|specializing in|specializes in|founded in|established in|headquartered in|based in|located in)/i
        const isGeneric = genericPatterns.test(desc) || desc.length < 30 || desc.split(' ').length < 8
        if (!isGeneric) {
          lines.push('COMPANY CONTEXT (use creatively for personalization; do not just restate what they do):')
          lines.push(`- ${desc.slice(0, 200)}${desc.length > 200 ? '…' : ''}`)
        }
      }
      if (context.contextForAi?.trim()) {
        lines.push('NOTES / CALL CONTEXT / RESEARCH (use to personalize and reference prior touchpoints or recent activity):')
        lines.push(context.contextForAi.trim())
      }
      if (lines.length) base += '\n\n' + lines.join('\n')
    }
    if (isRefinementMode) {
      base += '\n\n' + effectiveConfig.getRefinementInstruction()
    } else {
      base += `

OUTPUT FORMAT (generation only):
- When generating a new email, output on the first line: SUBJECT: <one-line subject>
- Then a blank line, then the email body.
- If the directive is body-only (e.g. "just the intro paragraph"), output only the body with no SUBJECT line.

CRITICAL OUTPUT RULES:
- You MUST output actual email content (subject + body or body only). NEVER output questions, meta-commentary, or prompt instructions.
- NEVER ask clarifying questions like "What should I write about?" or "Could you clarify?" or "What angle should I use?"
- NEVER output instructions or suggestions like "Here's what you could write:" or "Consider mentioning..."
- NEVER generate a question instead of email content, even if the user's directive is unclear or seems like a question.
- If the directive is unclear, interpret it as best you can and generate email content anyway. Default to the email type's standard structure.
- The app handles To/Sender/recipient. Never say you cannot send, cannot use the email address, or ask to verify the sender.
- Output ONLY the requested content (subject line + body or body only). No meta-commentary, no apologies, no verification requests, no questions, no instructions.`
    }
    return base
  }, [emailTypeConfig, signerName, to, subject, isRefinementMode, context])

  const generateEmailWithAi = useCallback(async (directive: string) => {
    // Auto-select angle based on industry if no directive provided and industry is present
    let effectiveDirective = directive.trim()
    if (!effectiveDirective && context?.industry && (emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup')) {
      const industryAngle = getIndustryAngle(context.industry)
      if (industryAngle) {
        // Extract angle guidance from the industry angle block
        const angleMatch = industryAngle.match(/ANGLES:\s*([\s\S]+?)(?:\n|$)/)
        if (angleMatch) {
          effectiveDirective = `Write a 40–70 word first-touch cold email using the VERTICAL-SPECIFIC ANGLE provided above. ${angleMatch[1].trim()} Focus on the operational pain specific to this vertical. Plain text, minimal sign-off.`
        } else {
          effectiveDirective = `Write a 40–70 word first-touch cold email using the VERTICAL-SPECIFIC ANGLE provided above. Focus on the operational pain specific to this vertical. Plain text, minimal sign-off.`
        }
      }
    }
    const refinementFallbackByType: Record<EmailTypeId, string> = {
      cold_first_touch: 'Rewrite to be forensic, direct, 40–80 words. One question CTA. Output only the revised body.',
      cold_followup: 'Sharpen this follow-up. Remove filler. One clear CTA. Up to 120–150 words. Output only the revised body.',
      professional: 'Tighten and clarify this email. Keep the same intent and tone. Remove redundancy. Output only the revised body.',
      followup: 'Make this follow-up clearer and more concise. Keep it polite and professional. Output only the revised body.',
      internal: 'Make this internal email clearer and shorter. Keep the same information. Output only the revised body.',
      support: 'Make this support email clearer and more helpful. Keep empathy and accuracy. Output only the revised body.',
    }
    const effectiveTypeForRecap = subjectSuggestsMeetingRecap(subject) ? 'professional' : emailTypeId
    const finalDirective = effectiveDirective || (isRefinementMode ? refinementFallbackByType[effectiveTypeForRecap] : '')
    if (!finalDirective && !isRefinementMode) return
    if (isRefinementMode && !content.trim()) return
    setAiError(null)
    setContentBeforeAi(content)
    setIsAiLoading(true)
    try {
      const systemPrompt = buildEmailSystemPrompt()
      const userContent = isRefinementMode
        ? `Apply the refinement task. Current email body:\n\n---\n${content}\n---`
        : finalDirective
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          model: selectedModel,
          userProfile: { firstName: profile?.firstName || 'Trey' },
        }),
      })
      const data = await response.json()
      if (data.error) throw new Error(data.message || data.error)
      let raw = typeof data.content === 'string' ? data.content.trim() : ''
      const metaCommentary = /^(I (?:am |')?(?:sorry|cannot|can't|won't|unable to)|Could you please|Please verify|as an AI|I am an AI|I do not have access|I don't have access|I can't browse|I cannot (?:send|access|use)|I'm unable to)/im
      if (metaCommentary.test(raw)) {
        toast.error('AI returned a verification message instead of draft content. Try again or pick a different model.')
        setAiError('Model declined to generate; try another model or rephrase.')
        return
      }
      let newBody = raw
      let parsedSubject: string | null = null
      const lines = raw.split(/\r?\n/)
      const subjectLineIndex = lines.findIndex((line: string) => /^\s*SUBJECT:\s*.+/.test(line))
      if (subjectLineIndex >= 0) {
        const subjectLine = lines[subjectLineIndex]
        const subMatch = subjectLine.match(/^\s*SUBJECT:\s*(.+)$/i)
        if (subMatch) parsedSubject = subMatch[1].trim()
        newBody = lines
          .slice(subjectLineIndex + 1)
          .join('\n')
          .replace(/^\s*\n+/, '')
          .trim()
      }
      setPendingSubjectFromAi(parsedSubject)
      setPendingAiContent(newBody)
      setAiPrompt('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI generation failed'
      setAiError(msg)
      toast.error(msg)
    } finally {
      setIsAiLoading(false)
    }
  }, [buildEmailSystemPrompt, content, isRefinementMode, selectedModel, profile?.firstName, subject, emailTypeId, context])

  // Fetch available foundry templates
  const { data: foundryAssets } = useQuery<any[]>({
    queryKey: ['transmission_assets'],
    queryFn: async () => {
      const idToken = await (user as any)?.getIdToken?.().catch(() => null)
      const res = await fetch('/api/foundry/list', {
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      })
      if (!res.ok) {
        // Silently fail if endpoint doesn't exist yet
        return []
      }
      const data = await res.json()
      return data.assets || []
    },
    enabled: !!user,
  })

  // Load and compile foundry template when selected
  useEffect(() => {
    if (!selectedFoundryId) return

    const loadTemplate = async () => {
      setIsLoadingTemplate(true)
      try {
        const idToken = await (user as any)?.getIdToken?.().catch(() => null)
        const res = await fetch(`/api/foundry/assets?id=${encodeURIComponent(selectedFoundryId)}`, {
          headers: {
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load template')

        const asset = json?.asset
        if (!asset) throw new Error('Template not found')

        // Generate HTML from blocks
        const blocks = asset.content_json?.blocks || []
        let html = generateStaticHtml(blocks, { skipFooter: true })

        // Build variable map from contact context (use empty values if no context)
        const contactData = {
          firstName: context?.contactName?.split(' ')[0] || '',
          lastName: context?.contactName?.split(' ').slice(1).join(' ') || '',
          name: context?.contactName || '',
          companyName: context?.companyName || context?.accountName || '',
          company: context?.companyName || context?.accountName || '',
          industry: context?.industry || '',
          accountDescription: context?.accountDescription || '',
        }

        const variableMap = contactToVariableMap(contactData)

        // Substitute variables
        html = substituteVariables(html, variableMap)

        // Auto-generate AI blocks if needed (only if context is available)
        const aiBlocksToGenerate = context ? blocks.filter((block: any) => {
          if (block.type !== 'TEXT_MODULE') return false
          const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
          return contentObj.useAi === true && contentObj.aiPrompt?.trim() && !contentObj.text?.trim()
        }) : []

        if (aiBlocksToGenerate.length > 0) {
          // Generate AI content for each block
          for (const block of aiBlocksToGenerate) {
            const contentObj = typeof block.content === 'object' ? block.content : { text: '', useAi: false, aiPrompt: '' }
            const userPrompt = contentObj.aiPrompt?.trim() || ''

            const contactInfo = context
              ? `\n\nContact: ${context.contactName || '—'}, Company: ${context.companyName || '—'}`
              : ''

            const prompt = `You are writing content for an energy intelligence email. ${userPrompt}${contactInfo}\n\nReturn a JSON object with "text" (string) and "bullets" (array of strings).`

            const aiRes = await fetch('/api/foundry/generate-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt,
                context: '',
                blockType: 'narrative',
              }),
            })

            const aiData = await aiRes.json()
            if (aiRes.ok && aiData.text) {
              // Replace placeholder in HTML
              const placeholder = '[ AI_GENERATION_IN_PROGRESS ]'
              html = html.replace(placeholder, aiData.text)
            }
          }
        }

        setContent(html)

        // Set subject from template name
        if (asset.name) {
          setSubject(asset.name)
        }

        toast.success('Foundry template loaded')
      } catch (err: any) {
        toast.error(err?.message || 'Failed to load template')
        setSelectedFoundryId(null)
      } finally {
        setIsLoadingTemplate(false)
      }
    }

    loadTemplate()
  }, [selectedFoundryId, context, user])

  const acceptAiContent = useCallback(() => {
    const body = pendingAiContent ?? ''
    const subj = pendingSubjectFromAi
    setContent(body)
    if (subj != null && subj.trim() !== '') {
      setSubject(subj.trim())
      setSubjectAnimationKey((k) => k + 1)
    }
    setPendingAiContent(null)
    setPendingSubjectFromAi(null)
  }, [pendingAiContent, pendingSubjectFromAi])

  const discardAiContent = useCallback(() => {
    setPendingAiContent(null)
    setPendingSubjectFromAi(null)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setAttachments(prev => [...prev, ...files])
    // Reset input so the same file can be selected again if removed
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    if (!to || !subject || !content) {
      toast.error('Please fill in all fields')
      return
    }

    const isColdType = emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup'
    const isColdPlaintext =
      isColdType &&
      (context?.deliverabilityMode === 'cold_plaintext' || sendAsPlainText)

    // When using foundry template, content is already HTML with no signature
    const fullHtml = isColdPlaintext
      ? undefined
      : selectedFoundryId
        ? content // Foundry template is already complete HTML
        : `
      <div style="font-family: sans-serif; white-space: pre-wrap; margin-bottom: 24px; color: #18181b;">${content}</div>
      ${outgoingSignatureHtml}
    `

    const titleLine = profile?.jobTitle
      ? `${profile.jobTitle}, Nodal Point`
      : 'Director of Energy Architecture, Nodal Point'
    const COLD_PLAINTEXT_BRAND_LINE = 'You have seen the math. Now see your data.'
    const coldPlaintextBody = isColdPlaintext
      ? `${content.trim()}\n\nBest,\n${signerName}\n${titleLine}\nhttps://nodalpoint.io\n\n${COLD_PLAINTEXT_BRAND_LINE}`
      : null

    // Convert attachments to base64
    const attachmentsData = await Promise.all(
      attachments.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64Data = result.split(',')[1] || result
            resolve(base64Data)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        return {
          filename: file.name,
          content: base64,
          type: file.type,
          size: file.size
        }
      })
    )

    sendEmail(
      {
        to,
        subject,
        content: coldPlaintextBody ?? content,
        html: fullHtml ?? (coldPlaintextBody ?? content),
        attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
      },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  return (
    <motion.div
      key="compose-panel"
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={cn(
        "fixed bottom-0 right-4 sm:right-10 z-[100] w-full sm:w-[500px] bg-zinc-950 nodal-monolith-edge rounded-t-xl shadow-2xl flex flex-col overflow-hidden",
        isMinimized ? "h-[60px]" : "h-[500px]"
      )}
    >
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-white/5 nodal-recessed cursor-pointer hover:bg-black/30 transition-colors"
        onClick={() => isMinimized && setIsMinimized(false)}
      >
        <h3 className="text-lg font-semibold text-white">New Message</h3>
        <div className="flex items-center gap-2">
          <button
            className="icon-button-forensic h-8 w-8 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation()
              setIsMinimized(!isMinimized)
            }}
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
          </button>
          <button
            className="icon-button-forensic h-8 w-8 flex items-center justify-center hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col h-[calc(100%-60px)] bg-zinc-950 transition-all duration-300",
          isMinimized ? "opacity-0 invisible" : "opacity-100 visible"
        )}
      >
        <div className="flex-1 overflow-y-auto np-scroll px-6 py-4 space-y-4">
          {pendingAiContent !== null && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="rounded-lg border border-[#002FA7]/30 bg-[#002FA7]/5 overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-wider">AI suggestion — preview</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={acceptAiContent} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1">
                    <Check className="w-3 h-3" /> Replace with this
                  </Button>
                  <Button variant="ghost" size="sm" onClick={discardAiContent} className="h-7 text-[10px] text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1">
                    <RotateCcw className="w-3 h-3" /> Discard
                  </Button>
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto np-scroll">
                {pendingSubjectFromAi != null && pendingSubjectFromAi.trim() !== '' && (
                  <div>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Subject</span>
                    <p className="text-sm font-medium text-zinc-200 mt-0.5">{pendingSubjectFromAi}</p>
                  </div>
                )}
                <div>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Body</span>
                  <pre className="mt-0.5 text-sm text-zinc-300 font-sans whitespace-pre-wrap break-words leading-relaxed">
                    {pendingAiContent}
                  </pre>
                </div>
              </div>
            </motion.div>
          )}
          <div className="space-y-2">
            <Input
              placeholder="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-transparent border-0 border-b border-white/10 rounded-none px-0 focus-visible:ring-0 focus-visible:border-white/20"
            />
          </div>

          <div className="space-y-2">
            <motion.div
              key={subjectAnimationKey}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <Input
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="bg-transparent border-0 border-b border-white/10 rounded-none px-0 focus-visible:ring-0 focus-visible:border-white/20 font-medium"
              />
            </motion.div>
          </div>

          {/* Foundry Template Indicator */}
          {selectedFoundryId && foundryAssets && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#002FA7]/30 bg-[#002FA7]/5"
            >
              <Zap className="w-3.5 h-3.5 text-[#002FA7]" />
              <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-wider">
                Foundry Template: {foundryAssets.find((a: any) => a.id === selectedFoundryId)?.name || 'Loading...'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedFoundryId(null)}
                className="ml-auto text-zinc-400 hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}

          <div className="flex flex-col relative">
            <div className="relative">
              {selectedFoundryId ? (
                // Show HTML preview for Foundry templates
                <div
                  className="w-full min-h-[150px] max-h-[400px] overflow-y-auto np-scroll bg-white/5 rounded-lg p-4 border border-white/10"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              ) : (
                // Show textarea for regular emails
                <textarea
                  placeholder="Write your message..."
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value)
                    if (pendingAiContent) {
                      setPendingAiContent(null)
                      setPendingSubjectFromAi(null)
                    }
                  }}
                  className="w-full min-h-[150px] bg-transparent border-0 resize-none focus:outline-none text-zinc-300 placeholder:text-zinc-600 font-sans leading-relaxed"
                />
              )}
              {isAiLoading && (
                <div className="absolute inset-0 min-h-[120px] bg-zinc-950/80 rounded-lg border border-[#002FA7]/20">
                  <ScanlineLoader />
                </div>
              )}
            </div>
            {aiError && (
              <p className="mt-1 text-[10px] font-mono text-red-400">{aiError}</p>
            )}
            {signatureHtml && (
              <div className="mt-4 pt-4 border-t border-white/5 opacity-90">
                <div
                  className="rounded-lg overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: signatureHtml }}
                />
              </div>
            )}
            {(emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup') && !selectedFoundryId && (
              <label className="mt-4 flex items-center gap-2 cursor-pointer select-none text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
                <input
                  type="checkbox"
                  checked={sendAsPlainText}
                  onChange={(e) => setSendAsPlainText(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-[#002FA7] focus:ring-[#002FA7]/50"
                />
                Send as plain text (cold deliverability)
              </label>
            )}
            {attachments.length > 0 && (
              <div className="mt-4 space-y-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Attachments</span>
                {attachments.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded border border-white/10 bg-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                      <span className="text-xs text-zinc-300 truncate">{file.name}</span>
                      <span className="text-[10px] text-zinc-500 flex-shrink-0">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="icon-button-forensic h-6 w-6 flex items-center justify-center hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI Command Rail — slides up above footer */}
        <AnimatePresence>
          {aiRailOpen && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute left-4 right-4 bottom-[calc(4rem+8px)] z-50 h-auto min-h-12 backdrop-blur-xl bg-zinc-950/90 border border-white/10 rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={emailTypeId} onValueChange={(v) => setEmailTypeId(v as EmailTypeId)}>
                    <SelectTrigger className="h-8 w-auto min-w-[120px] bg-white/5 border-white/10 text-[10px] font-sans text-zinc-400 tracking-wider rounded-lg">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 nodal-monolith-edge z-[200]">
                      {EMAIL_TYPES.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-[10px] font-sans focus:bg-[#002FA7]/20">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="h-8 w-auto min-w-[140px] bg-white/5 border-white/10 text-[10px] font-mono text-zinc-400 uppercase tracking-wider rounded-lg">
                      <Cpu className="w-3.5 h-3.5 text-[#002FA7]" />
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 nodal-monolith-edge z-[200]">
                      {EMAIL_AI_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={isRefinementMode ? 'Refine: concise / technical' : '> ENTER_DIRECTIVE...'}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        generateEmailWithAi(aiPrompt)
                      }
                    }}
                    className="flex-1 min-w-[160px] h-8 bg-transparent border-white/10 rounded-lg text-[11px] font-mono placeholder:text-zinc-500"
                  />
                  <Button
                    size="sm"
                    onClick={() => generateEmailWithAi(aiPrompt)}
                    disabled={isAiLoading || (!aiPrompt.trim() && !isRefinementMode) || (isRefinementMode && !content.trim())}
                    className="h-8 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white text-[10px] font-mono uppercase"
                  >
                    {isAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Generate'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setAiRailOpen(false)}
                    className="icon-button-forensic h-8 w-8 flex items-center justify-center ml-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Hide chips when industry is present (angle auto-selected) for cold emails */}
                {!(context?.industry && (emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup')) && (
                  <div className="flex flex-wrap gap-1.5">
                    {isRefinementMode
                      ? emailTypeConfig.refinementChips.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => generateEmailWithAi(chip.directive)}
                          disabled={isAiLoading}
                          className="text-[10px] font-mono px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                        >
                          {chip.label}
                        </button>
                      ))
                      : emailTypeConfig.generationChips.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => generateEmailWithAi(chip.directive)}
                          disabled={isAiLoading}
                          className="text-[10px] font-mono px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                        >
                          {chip.label}
                        </button>
                      ))}
                  </div>
                )}
                {context?.industry && (emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup') && (
                  <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider px-1">
                    Angle auto-selected from industry: {context.industry}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-none px-6 py-4 border-t border-white/5 nodal-recessed flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="email-attachment-input"
            />
            <label
              htmlFor="email-attachment-input"
              className="icon-button-forensic h-8 w-8 flex items-center justify-center cursor-pointer"
            >
              <Paperclip className="w-4 h-4" />
            </label>
            <button
              type="button"
              onClick={() => setAiRailOpen((open) => !open)}
              className={cn(
                'icon-button-forensic h-8 w-8 flex items-center justify-center',
                aiRailOpen ? 'text-[#002FA7] ring-1 ring-[#002FA7]/30' : 'text-purple-400'
              )}
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* Foundry Template Selector */}
            <div className="h-6 w-px bg-white/10" />
            <Select value={foundrySelectValue} onValueChange={(v) => setSelectedFoundryId(v === 'none' ? null : v)}>
              <SelectTrigger className="h-8 w-auto min-w-[140px] bg-white/5 border-white/10 text-[10px] font-mono text-zinc-400 uppercase tracking-wider rounded-lg">
                <Zap className="w-3.5 h-3.5 text-[#002FA7]" />
                <SelectValue placeholder="Foundry Template" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 nodal-monolith-edge z-[200]">
                <SelectItem value="none" className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                  None (Standard Email)
                </SelectItem>
                {foundryAssets?.map((asset: any) => (
                  <SelectItem key={asset.id} value={asset.id} className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingTemplate && <Loader2 className="w-4 h-4 animate-spin text-[#002FA7]" />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white hover:bg-white/5">
              Discard
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="bg-white text-zinc-950 hover:bg-zinc-200 min-w-[100px]"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function ComposeModal({ isOpen, onClose, to: initialTo = '', subject: initialSubject = '', context: initialContext = null }: ComposeModalProps) {

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <ComposePanel initialTo={initialTo} initialSubject={initialSubject} initialContext={initialContext ?? null} onClose={onClose} />
      )}
    </AnimatePresence>,
    document.body
  )
}
