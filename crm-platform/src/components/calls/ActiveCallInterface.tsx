'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  ShieldAlert,
  Mail,
  BarChart3,
  Send,
  Sparkles
} from 'lucide-react'

import { useAI, type ScriptResult, type ScriptVariant } from '@/hooks/useAI'
import { useCallStore } from '@/store/callStore'
import { useVoice } from '@/context/VoiceContext'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CompanyIcon } from '@/components/ui/CompanyIcon'

interface ActiveCallInterfaceProps {
  contact?: any
  account?: any
}

export function ActiveCallInterface({ contact, account }: ActiveCallInterfaceProps) {
  const [aiResponse, setAiResponse] = useState<ScriptResult | null>(null)
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0) // 0 = primary, 1+ = variants[n-1]
  const [selectedGatekeeperIndex, setSelectedGatekeeperIndex] = useState(0)
  const [loadingVector, setLoadingVector] = useState<string | null>(null)
  const [activeVector, setActiveVector] = useState<string | null>(null)
  const [liveInput, setLiveInput] = useState('')
  const { generateScript } = useAI()
  const { metadata: storeMetadata, isActive } = useCallStore()
  const { metadata: voiceMetadata } = useVoice()
  const { profile } = useAuth()

  const metadata = isActive ? (voiceMetadata || storeMetadata) : storeMetadata

  // Use store metadata if props are missing (e.g., during dialing)
  const displayContact = contact || {
    name: metadata?.name || 'Unknown Node',
    title: metadata?.title || 'Operational Lead',
    company: metadata?.account || 'Unknown Asset',
    industry: metadata?.industry,
    description: metadata?.description,
    linkedinUrl: metadata?.linkedinUrl,
    annualUsage: metadata?.annualUsage,
    supplier: metadata?.supplier,
    currentRate: metadata?.currentRate,
    contractEnd: metadata?.contractEnd,
    location: metadata?.location
  }

  const handleVectorClick = async (vector: string) => {
    setActiveVector(vector)
    setLoadingVector(vector)
    setAiResponse(null)

    const payload = {
      vector_type: vector,
      contact_context: {
        // Agent Info
        agent_name: profile?.firstName || 'Trey',
        agent_title: profile?.jobTitle || 'Energy Consultant',

        // Context Type
        is_account_only: metadata?.isAccountOnly || false,

        // Contact/Account Context
        name: displayContact.name,
        title: displayContact.title,
        company: displayContact.company,
        industry: displayContact.industry || account?.industry || 'Unknown',
        description: displayContact.description || account?.description,
        linkedin_url: displayContact.linkedinUrl || account?.linkedinUrl,
        location: displayContact.location || account?.location,

        // Energy Specifics
        annual_usage: displayContact.annualUsage || account?.annualUsage,
        supplier: displayContact.supplier || account?.electricitySupplier,
        current_rate: displayContact.currentRate || account?.currentRate,
        contract_end: displayContact.contractEnd || account?.contractEndDate || 'UNKNOWN',

        additional_context: vector === 'LIVE_PIVOT' ? liveInput : undefined
      }
    }

    const response = await generateScript(payload)
    if (response) {
      setAiResponse(response)
      setSelectedVariantIndex(0)
      setSelectedGatekeeperIndex(0)
    }
    setLoadingVector(null)
    if (vector === 'LIVE_PIVOT') setLiveInput('')
  }

  const handleLiveContext = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && liveInput.trim()) {
      handleVectorClick('LIVE_PIVOT')
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950/40 backdrop-blur-sm overflow-hidden">
      {/* 1. COMPACT LEVERAGE HUD */}
      <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <CompanyIcon
            logoUrl={metadata?.logoUrl}
            domain={metadata?.domain}
            name={displayContact.company || displayContact.name || 'Caller'}
            size={48}
            roundedClassName="rounded-[14px]"
            className="shrink-0"
          />
          <div className="min-w-0">
            <div className="font-bold text-white truncate text-base leading-tight">{displayContact.name}</div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate mt-0.5">
              {displayContact.company}
            </div>
            <div className="text-[10px] font-mono text-zinc-600 truncate">
              {displayContact.title}
            </div>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <div className="px-2.5 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-mono text-red-400 tabular-nums">
            {account?.daysRemaining ? `${account.daysRemaining}D` : 'VOID'}
          </div>
          <div className="px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/20 text-[10px] font-mono text-white">
            {account?.loadZone || 'LZ_NORTH'}
          </div>
        </div>
      </div>

      {/* 2. Script Output */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {loadingVector ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-6 sm:p-8">
                <NeuralScan key="loading" />
              </div>
            ) : aiResponse ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/45 p-4 sm:p-5"
              >
                {aiResponse.gatekeeperVariants && aiResponse.gatekeeperVariants.length > 0 && selectedVariantIndex === 0 && (
                  <>
                    <ScriptStep
                      label="Gatekeeper opener"
                      content={aiResponse.gatekeeperVariants[selectedGatekeeperIndex] ?? aiResponse.gatekeeperVariants[0]}
                      delay={0}
                      accent
                    />
                    {aiResponse.gatekeeperVariants.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Gate</span>
                        {aiResponse.gatekeeperVariants.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedGatekeeperIndex(i)}
                            className={cn(
                              'px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-colors',
                              selectedGatekeeperIndex === i
                                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                                : 'bg-white/5 border border-white/10 text-zinc-500 hover:text-zinc-300'
                            )}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {(() => {
                  const script: ScriptVariant = selectedVariantIndex === 0
                    ? { opener: aiResponse.opener, hook: aiResponse.hook, disturb: aiResponse.disturb, close: aiResponse.close }
                    : (aiResponse.variants?.[selectedVariantIndex - 1] ?? { opener: aiResponse.opener, hook: aiResponse.hook, disturb: aiResponse.disturb, close: aiResponse.close })
                  return (
                    <>
                      <ScriptStep label="Opener" content={script.opener ?? ''} delay={0.1} />
                      <ScriptStep label="Hook question" content={script.hook ?? ''} delay={0.2} />
                      <ScriptStep label="Problem question" content={script.disturb ?? ''} delay={0.3} accent />
                      <ScriptStep label="Next-step ask" content={script.close ?? ''} delay={0.4} />
                    </>
                  )
                })()}
                {aiResponse.variants && aiResponse.variants.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest w-full">Alternate versions</span>
                    <button
                      type="button"
                      onClick={() => setSelectedVariantIndex(0)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-colors',
                        selectedVariantIndex === 0
                          ? 'bg-white/20 border border-white/40 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]'
                          : 'bg-white/5 border border-white/10 text-zinc-500 hover:text-zinc-300'
                      )}
                    >
                      Primary
                    </button>
                    {aiResponse.variants.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedVariantIndex(i + 1)}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-colors',
                          selectedVariantIndex === i + 1
                            ? 'bg-white/20 border border-white/40 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]'
                            : 'bg-white/5 border border-white/10 text-zinc-500 hover:text-zinc-300'
                        )}
                      >
                        Variant {i + 2}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <div key="empty" className="rounded-2xl border border-white/10 bg-black/45 py-16 sm:py-20 flex flex-col items-center justify-center text-center opacity-70">
                <Sparkles size={32} className="text-zinc-700 animate-pulse mb-4" />
                <div className="text-xs font-mono text-zinc-600 uppercase tracking-[0.3em]">
                  Pick a script type to start
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* 3. Action Deck */}
      <div className="p-4 sm:p-6 bg-zinc-950/30 border-t border-white/5 space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] font-mono text-zinc-400">
          Objective: book meeting -&gt; bill review -&gt; permission to send note
        </div>

        {/* Rapid Context Input */}
        <div className="relative">
          <input
            value={liveInput}
            onChange={(e) => setLiveInput(e.target.value)}
            onKeyDown={handleLiveContext}
            placeholder="Type what they just said, then press Enter..."
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs font-mono text-white placeholder:text-zinc-700 focus:border-white/40 focus:ring-1 focus:ring-white/20 outline-none pr-14 transition-all shadow-inner"
          />
          <button
            onClick={() => handleVectorClick('LIVE_PIVOT')}
            disabled={!liveInput.trim() || !!loadingVector}
            className="absolute right-4 top-4 p-1 text-zinc-600 hover:text-white transition-colors disabled:opacity-30"
          >
            <Send size={18} />
          </button>
        </div>

        {/* Vector Deck */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <VectorButton
            label="Cold Open"
            hint="book meeting first"
            icon={Zap}
            tone="blue"
            active={activeVector === 'OPENER'}
            loading={loadingVector === 'OPENER'}
            onClick={() => handleVectorClick('OPENER')}
          />
          <VectorButton
            label="Price Objection"
            hint="validate, then clarify"
            icon={ShieldAlert}
            tone="red"
            active={activeVector === 'OBJECTION_PRICE'}
            loading={loadingVector === 'OBJECTION_PRICE'}
            onClick={() => handleVectorClick('OBJECTION_PRICE')}
          />
          <VectorButton
            label="Send Follow-up"
            hint="ask one clarifier first"
            icon={Mail}
            tone="amber"
            active={activeVector === 'OBJECTION_EMAIL'}
            loading={loadingVector === 'OBJECTION_EMAIL'}
            onClick={() => handleVectorClick('OBJECTION_EMAIL')}
          />
          <VectorButton
            label="Market Proof"
            hint="tie data to business impact"
            icon={BarChart3}
            tone="emerald"
            active={activeVector === 'MARKET_DATA'}
            loading={loadingVector === 'MARKET_DATA'}
            onClick={() => handleVectorClick('MARKET_DATA')}
          />
        </div>
      </div>
    </div>
  )
}

function VectorButton({
  label,
  hint,
  icon: Icon,
  tone,
  loading,
  active,
  onClick
}: {
  label: string
  hint: string
  icon: any
  tone: 'blue' | 'red' | 'amber' | 'emerald'
  loading: boolean
  active: boolean
  onClick: () => void
}) {
  const isEngaged = loading || active
  const toneStyles: Record<'blue' | 'red' | 'amber' | 'emerald', string> = {
    blue: 'border-[color:var(--color-pc-blue)]/50 bg-[color:var(--color-pc-blue)]/15 shadow-[0_0_20px_rgba(0,47,167,0.3)]',
    red: 'border-red-500/40 bg-red-500/10 shadow-[0_0_18px_rgba(239,68,68,0.2)]',
    amber: 'border-amber-500/40 bg-amber-500/10 shadow-[0_0_18px_rgba(245,158,11,0.2)]',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_18px_rgba(16,185,129,0.2)]'
  }

  const toneIconStyles: Record<'blue' | 'red' | 'amber' | 'emerald', string> = {
    blue: 'text-[color:var(--color-pc-blue)]',
    red: 'text-red-300',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300'
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'min-w-0 rounded-2xl border px-3 py-3.5 text-left transition-all active:scale-[0.98] disabled:opacity-50',
        'flex flex-col items-start gap-2.5 bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20',
        isEngaged && toneStyles[tone]
      )}
    >
      <Icon
        size={18}
        className={cn(
          'transition-colors text-zinc-300',
          loading && 'animate-pulse',
          isEngaged && toneIconStyles[tone],
          !isEngaged && tone === 'blue' && 'hover:text-[color:var(--color-pc-blue)]'
        )}
      />
      <div className="min-w-0 w-full">
        <div className={cn('text-[11px] font-mono uppercase tracking-wide text-zinc-200 leading-tight', isEngaged && 'text-white')}>
          {loading ? 'Running...' : label}
        </div>
        <div className="mt-1 text-[10px] font-sans text-zinc-500 leading-tight">
          {hint}
        </div>
      </div>
    </button>
  )
}

function NeuralScan() {
  const [step, setStep] = useState(0)
  const steps = [
    "> REVIEWING ACCOUNT CONTEXT...",
    "> BUILDING LOW-PRESSURE TALK TRACK...",
    "> DRAFTING NEXT-STEP ASK..."
  ]

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s + 1) % steps.length)
    }, 800)
    return () => clearInterval(timer)
  }, [steps.length])

  return (
    <div className="py-20 flex flex-col items-center justify-center text-center">
      <div className="relative mb-8">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 bg-white/10 blur-2xl rounded-full"
        />
        <Sparkles size={48} className="text-zinc-100 relative z-10 animate-pulse" />
      </div>
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]"
      >
        {steps[step]}
      </motion.div>
    </div>
  )
}

function ScriptStep({ label, content, delay, accent = false }: { label: string, content: string, delay: number, accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className={cn(
        "border p-4 rounded-xl relative overflow-hidden",
        accent
          ? "border-white/20 bg-white/[0.06] shadow-[0_0_15px_rgba(255,255,255,0.05)]"
          : "border-white/10 bg-black/35"
      )}
    >
      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
        {label}
      </div>
      <p className="text-sm text-zinc-100 leading-relaxed font-sans">
        &quot;{content}&quot;
      </p>
    </motion.div>
  )
}
