'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEmails } from '@/hooks/useEmails'
import { useAuth } from '@/context/AuthContext'
import { generateNodalSignature } from '@/lib/signature'
import { Loader2, X, Paperclip, Sparkles, Minus, Maximize2, Cpu, Check, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ScanlineLoader } from '@/components/chat/ScanlineLoader'

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

STRUCTURE: TRIGGER (one observable: summer peak, tariff change, expansion) → PAIN (one sentence, in plain English: e.g. summer peaks locking in next year's costs, one winter spike setting demand charges for 12 months, delivery charges buried in the bill) → PROOF (brief peer/similar facility) → One question as CTA.
WORD COUNT: Entire email 40–80 words (first-touch sweet spot for reply rates).
LANGUAGE: Use plain English that ops, finance, and facility managers understand. Do NOT use jargon (4CP, ratchet, TDU, pass-through, demand charge, coincident peak, non-commodity) unless RECIPIENT CONTEXT explicitly indicates the recipient is an energy manager, director of energy, or similar. When in doubt, describe the mechanism in plain language (e.g. "summer peaks that lock in next year's transmission costs", "one winter spike that can set your delivery charges for the next 12 months", "charges from your utility that aren't the energy commodity").
SENDER: ${signerName}
RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Optional. If used, use only "Hi {firstName}," — no "Dear" or long openings. You may jump straight into the diagnostic line (no greeting) for a more architect/internal note tone.
CLOSING: Minimal sign-off: "Best," or "Thanks," followed by the SENDER name from above (first name only for cold, e.g. "Best,\\n[SENDER first name]" or "– [SENDER first name]"). Always use the actual SENDER name from the prompt, not a placeholder. No formal sign-offs.

SUBJECT LINE (when generating): 4–7 words, clear and specific. Do NOT put the recipient's first name in the subject (it looks automated). Use plain-English subject; you may reference company or location when it adds clarity (e.g. "Summer transmission charges in Dallas", "Summer peak risk at your Dallas DC", "Transmission costs on your DFW sites"). Reserve jargon like "4CP exposure" for when the recipient is clearly an energy manager. Match body honestly; no clickbait. Avoid all caps and excessive punctuation.
CTA: Always end with one clear question in plain English. Do not use "4CP exposure", "modeling", "mitigating", or "on your radar" in the closing question unless the recipient is an energy manager. Use natural phrasing instead (e.g. "Is anyone on your team looking at how those summer peaks affect next year's costs?", "Does anyone track those peak intervals against your budget?", "Is that something you're already looking at?"). Do not combine multiple asks in one email.

PERSONALIZATION (use RECIPIENT CONTEXT when provided): You may mention the recipient's title or company **once** in the first sentence, but only if you tie it directly to a concrete responsibility or pain (e.g. "As VP of Operations at [Company], you're the one who feels it when summer peaks lock in next year's transmission charges."). If contextForAi includes recent activity (new warehouse, expansion, cost-focus, locations like DFW), you may reference **one** of those in the first sentence. Do not spend more than one sentence on personalization; move quickly to the cost problem and question.
GUARDRAILS: Do not over-praise (no "esteemed", "renowned"). Do not write long clauses about their job description; use title only to anchor a specific outcome ("you feel it when…", "you're the one who sees…"). If no meaningful personalization data is provided, skip title and start directly with the business problem.

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
  /** Notes + call/transcript summary for AI. Injected into system prompt when present. */
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

  const signatureHtml = profile ? generateNodalSignature(profile, user, true) : ''
  const outgoingSignatureHtml = profile ? generateNodalSignature(profile, user, false) : ''
  const signerName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Lewis Patterson' : 'Lewis Patterson'

  const isRefinementMode = content.trim().length > 0
  const emailTypeConfig = EMAIL_TYPES.find((t) => t.id === emailTypeId) ?? EMAIL_TYPES[0]

  /** Subject suggests a meeting recap; use Professional tone so we don't apply cold outreach refinement. */
  const subjectSuggestsMeetingRecap = (s: string) => /meeting\s+recap/i.test((s || '').trim())

  const buildEmailSystemPrompt = useCallback(() => {
    const effectiveConfig = subjectSuggestsMeetingRecap(subject) ? (EMAIL_TYPES.find((t) => t.id === 'professional') ?? emailTypeConfig) : emailTypeConfig
    let base = effectiveConfig.getSystemPrompt({ signerName, to: to || '', subject: subject || '' })
    if (context && (context.contactName || context.companyName || context.contactTitle || context.accountName || context.contextForAi)) {
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
      if (context.contextForAi?.trim()) {
        lines.push('NOTES / CALL CONTEXT (use to personalize and reference prior touchpoints):')
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

CRITICAL: You are writing draft content only. The app handles To/Sender/recipient. Never say you cannot send, cannot use the email address, or ask to verify the sender. Output ONLY the requested content (subject line + body or body only). No meta-commentary, no apologies, no verification requests.`
    }
    return base
  }, [emailTypeConfig, signerName, to, subject, isRefinementMode, context])

  const generateEmailWithAi = useCallback(async (directive: string) => {
    const refinementFallbackByType: Record<EmailTypeId, string> = {
      cold_first_touch: 'Rewrite to be forensic, direct, 40–80 words. One question CTA. Output only the revised body.',
      cold_followup: 'Sharpen this follow-up. Remove filler. One clear CTA. Up to 120–150 words. Output only the revised body.',
      professional: 'Tighten and clarify this email. Keep the same intent and tone. Remove redundancy. Output only the revised body.',
      followup: 'Make this follow-up clearer and more concise. Keep it polite and professional. Output only the revised body.',
      internal: 'Make this internal email clearer and shorter. Keep the same information. Output only the revised body.',
      support: 'Make this support email clearer and more helpful. Keep empathy and accuracy. Output only the revised body.',
    }
    const effectiveTypeForRecap = subjectSuggestsMeetingRecap(subject) ? 'professional' : emailTypeId
    const effectiveDirective = directive.trim() || (isRefinementMode ? refinementFallbackByType[effectiveTypeForRecap] : '')
    if (!effectiveDirective && !isRefinementMode) return
    if (isRefinementMode && !content.trim()) return
    setAiError(null)
    setContentBeforeAi(content)
    setIsAiLoading(true)
    try {
      const systemPrompt = buildEmailSystemPrompt()
      const userContent = isRefinementMode
        ? `Apply the refinement task. Current email body:\n\n---\n${content}\n---`
        : effectiveDirective
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
  }, [buildEmailSystemPrompt, content, isRefinementMode, selectedModel, profile?.firstName, subject, emailTypeId])

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

  const handleSend = () => {
    if (!to || !subject || !content) {
      toast.error('Please fill in all fields')
      return
    }

    const isColdType = emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup'
    const isColdPlaintext =
      isColdType &&
      (context?.deliverabilityMode === 'cold_plaintext' || sendAsPlainText)

    const fullHtml = isColdPlaintext
      ? undefined
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

    sendEmail(
      {
        to,
        subject,
        content: coldPlaintextBody ?? content,
        html: fullHtml ?? (coldPlaintextBody ?? content),
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

          <div className="flex flex-col relative">
            <div className="relative">
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
            {(emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup') && (
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-none px-6 py-4 border-t border-white/5 nodal-recessed flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button className="icon-button-forensic h-8 w-8 flex items-center justify-center">
              <Paperclip className="w-4 h-4" />
            </button>
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
