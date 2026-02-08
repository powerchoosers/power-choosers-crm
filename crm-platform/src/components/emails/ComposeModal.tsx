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

export type EmailTypeId = 'cold' | 'professional' | 'followup' | 'internal' | 'support'

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
    id: 'cold',
    label: 'Cold / Outreach',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are the Director of Energy Architecture at Nodal Point. You write COLD OUTREACH emails that are forensic, direct, and minimal.

VOICE: Forensic, direct, minimal. Expert auditor tone, not salesperson.
RULES: Reject sales fluff. Use active voice. Focus on financial liability and structural cost. No corporate jargon. 2-4 sentences for cold. Question-based CTAs work best. No urgency tricks, no "We" language. One idea per email.

SENDER: ${signerName}
RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

Output ONLY the email body. Plain text, no markdown. No "Hi X," unless the user asks.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Make this email SHARPER. Remove hedging ("might", "could"). Remove soft openings. Tighten 20%+ words. Active voice. Highlight financial impact. One specific CTA question. 80-120 words max for cold. Output only the refined body.',
    generationChips: [
      { label: '4CP_RISK', directive: 'Draft cold email about Q2-Q3 demand charges and 4CP exposure for warehouse/logistics. Lead with a diagnostic question. 3-4 sentences.' },
      { label: 'INTRO_AUDIT', directive: 'Draft short intro for audit follow-up. Warm, low-pressure. Lead with finding, not pitch. "Happy to share the math."' },
      { label: 'RATCHET_WARNING', directive: 'Draft brief warning about ratchet clause exposure (winter peak locking summer bills). 2-3 sentences. Diagnostic question as CTA.' },
      { label: 'PASS_THROUGH', directive: 'Draft cold email about hidden pass-through / non-commodity charges. Reference TDU. Question about % non-commodity on their bill.' },
    ],
    refinementChips: [
      { label: 'FORENSIC_OPTIMIZE', directive: 'FORENSIC_OPTIMIZE: Rewrite to be concise and direct. Remove filler. Expose financial impact.' },
      { label: 'EXPAND_TECHNICAL', directive: 'EXPAND_TECHNICAL: Add regulatory/ERCOT context where helpful; keep tone direct. Under 150 words.' },
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

Output ONLY the email body. Plain text, no markdown. Use appropriate greeting and sign-off if the directive implies a full email.`,
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

Output ONLY the email body. Plain text. No need for formal greeting/sign-off unless the directive asks for it.`,
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

interface ComposeModalProps {
  isOpen: boolean
  onClose: () => void
  to?: string
  subject?: string
}

function ComposePanel({
  initialTo,
  initialSubject,
  onClose,
}: {
  initialTo: string
  initialSubject: string
  onClose: () => void
}) {
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState(initialSubject)
  const [content, setContent] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const { user, profile } = useAuth()
  const { sendEmail, isSending } = useEmails()

  // AI Command Rail state
  const [aiRailOpen, setAiRailOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [emailTypeId, setEmailTypeId] = useState<EmailTypeId>('cold')
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash-lite')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [pendingAiContent, setPendingAiContent] = useState<string | null>(null)
  const [contentBeforeAi, setContentBeforeAi] = useState('')

  const signatureHtml = profile ? generateNodalSignature(profile, user, true) : ''
  const outgoingSignatureHtml = profile ? generateNodalSignature(profile, user, false) : ''
  const signerName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Lewis Patterson' : 'Lewis Patterson'

  const isRefinementMode = content.trim().length > 0
  const emailTypeConfig = EMAIL_TYPES.find((t) => t.id === emailTypeId) ?? EMAIL_TYPES[0]

  const buildEmailSystemPrompt = useCallback(() => {
    const base = emailTypeConfig.getSystemPrompt({ signerName, to: to || '', subject: subject || '' })
    if (isRefinementMode) {
      return `${base}\n\n${emailTypeConfig.getRefinementInstruction()}`
    }
    return base
  }, [emailTypeConfig, signerName, to, subject, isRefinementMode])

  const generateEmailWithAi = useCallback(async (directive: string) => {
    const effectiveDirective = directive.trim() || (isRefinementMode ? 'Rewrite to be forensic, direct, and minimalist. Remove corporate jargon.' : '')
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
      const newBody = typeof data.content === 'string' ? data.content.trim() : ''
      setContent(newBody)
      setPendingAiContent(newBody)
      setAiPrompt('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI generation failed'
      setAiError(msg)
      toast.error(msg)
    } finally {
      setIsAiLoading(false)
    }
  }, [buildEmailSystemPrompt, content, isRefinementMode, selectedModel, profile?.firstName])

  const acceptAiContent = useCallback(() => {
    setPendingAiContent(null)
  }, [])

  const discardAiContent = useCallback(() => {
    setContent(contentBeforeAi)
    setPendingAiContent(null)
  }, [contentBeforeAi])

  const handleSend = () => {
    if (!to || !subject || !content) {
      toast.error('Please fill in all fields')
      return
    }

    // Combine content with signature for the HTML version
    // Use the outgoing (light-mode) signature for the actual email
    const fullHtml = `
      <div style="font-family: sans-serif; white-space: pre-wrap; margin-bottom: 24px; color: #18181b;">${content}</div>
      ${outgoingSignatureHtml}
    `

    sendEmail(
      { to, subject, content, html: fullHtml },
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
        "fixed bottom-0 right-4 sm:right-10 z-[100] w-full sm:w-[500px] bg-zinc-950 border border-white/10 rounded-t-xl shadow-2xl flex flex-col overflow-hidden",
        isMinimized ? "h-[60px]" : "h-[500px]"
      )}
    >
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/95 backdrop-blur-sm cursor-pointer hover:bg-zinc-900 transition-colors"
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
          <div className="space-y-2">
            <Input
              placeholder="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-transparent border-0 border-b border-white/10 rounded-none px-0 focus-visible:ring-0 focus-visible:border-white/20"
            />
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-transparent border-0 border-b border-white/10 rounded-none px-0 focus-visible:ring-0 focus-visible:border-white/20 font-medium"
            />
          </div>

          <div className="flex flex-col relative">
            <div className="relative">
              <textarea
                placeholder="Write your message..."
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  if (pendingAiContent) setPendingAiContent(null)
                }}
                className="w-full min-h-[150px] bg-transparent border-0 resize-none focus:outline-none text-zinc-300 placeholder:text-zinc-600 font-sans leading-relaxed"
              />
              {isAiLoading && (
                <div className="absolute inset-0 min-h-[120px] bg-zinc-950/80 rounded-lg border border-[#002FA7]/20">
                  <ScanlineLoader />
                </div>
              )}
            </div>
            {pendingAiContent !== null && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-wider">AI generated</span>
                <Button variant="ghost" size="sm" onClick={acceptAiContent} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1">
                  <Check className="w-3 h-3" /> Accept
                </Button>
                <Button variant="ghost" size="sm" onClick={discardAiContent} className="h-7 text-[10px] text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1">
                  <RotateCcw className="w-3 h-3" /> Discard
                </Button>
              </div>
            )}
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
                    <SelectContent className="bg-zinc-950 border-white/10">
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
                    <SelectContent className="bg-zinc-950 border-white/10">
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

        <div className="flex-none px-6 py-4 border-t border-white/5 bg-zinc-900/50 flex items-center justify-between">
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

export function ComposeModal({ isOpen, onClose, to: initialTo = '', subject: initialSubject = '' }: ComposeModalProps) {

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <ComposePanel initialTo={initialTo} initialSubject={initialSubject} onClose={onClose} />
      )}
    </AnimatePresence>,
    document.body
  )
}
