'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Zap, 
  ShieldAlert, 
  Mail, 
  BarChart3, 
  Send, 
  Phone, 
  User,
  Clock,
  ArrowRight,
  Activity as ActivityIcon,
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
  const [liveInput, setLiveInput] = useState('')
  const { generateScript, isLoading } = useAI()
  const { metadata: storeMetadata, status, isActive } = useCallStore()
  const { metadata: voiceMetadata } = useVoice()
  const { profile } = useAuth()
  
  const metadata = isActive ? (voiceMetadata || storeMetadata) : storeMetadata
  
  const scrollRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [aiResponse])

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
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
          <div className="px-2.5 py-1.5 rounded-xl bg-[#002FA7]/10 border border-[#002FA7]/20 text-[10px] font-mono text-[#002FA7]">
            {account?.loadZone || 'LZ_NORTH'}
          </div>
        </div>
      </div>

      {/* 2. NEURAL STREAM (Expanded) */}
      <ScrollArea className="flex-1">
        <div className="p-6 flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {loadingVector ? (
              <NeuralScan key="loading" />
            ) : aiResponse ? (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className="flex flex-col gap-4"
              >
                {aiResponse.gatekeeperVariants && aiResponse.gatekeeperVariants.length > 0 && selectedVariantIndex === 0 && (
                  <>
                    <ScriptStep 
                      label="Gatekeeper (company line)" 
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
                      <ScriptStep label="The Opener" content={script.opener ?? ''} delay={0.1} />
                      <ScriptStep label="The Hook" content={script.hook ?? ''} delay={0.2} />
                      <ScriptStep label="The Disturb" content={script.disturb ?? ''} delay={0.3} accent />
                      <ScriptStep label="The Close" content={script.close ?? ''} delay={0.4} />
                    </>
                  )
                })()}
                {aiResponse.variants && aiResponse.variants.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest w-full">Variants</span>
                    <button
                      type="button"
                      onClick={() => setSelectedVariantIndex(0)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-colors',
                        selectedVariantIndex === 0
                          ? 'bg-[#002FA7]/30 border border-[#002FA7]/50 text-[#002FA7]'
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
                            ? 'bg-[#002FA7]/30 border border-[#002FA7]/50 text-[#002FA7]'
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
              <div key="empty" className="py-20 flex flex-col items-center justify-center text-center opacity-40">
                <ActivityIcon size={32} className="text-zinc-700 animate-pulse mb-4" />
                <div className="text-xs font-mono text-zinc-600 uppercase tracking-[0.3em]">
                  Awaiting Vector Trigger...
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* 3. TACTICAL DECK (Condensed) */}
      <div className="p-6 bg-zinc-950/20 border-t border-white/5 space-y-6">
        {/* Rapid Context Input */}
        <div className="relative">
          <input 
            value={liveInput}
            onChange={(e) => setLiveInput(e.target.value)}
            onKeyDown={handleLiveContext}
            placeholder="INJECT LIVE CONTEXT..."
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs font-mono text-white placeholder:text-zinc-700 focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/20 outline-none pr-14 transition-all shadow-inner"
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
        <div className="grid grid-cols-4 gap-3">
          <VectorButton 
            label="Open" 
            icon={Zap} 
            color="text-[#002FA7]"
            loading={loadingVector === 'OPENER'}
            onClick={() => handleVectorClick('OPENER')}
          />
          <VectorButton 
            label="Price" 
            icon={ShieldAlert} 
            color="text-red-500"
            loading={loadingVector === 'OBJECTION_PRICE'}
            onClick={() => handleVectorClick('OBJECTION_PRICE')}
          />
          <VectorButton 
            label="Email" 
            icon={Mail} 
            color="text-amber-500"
            loading={loadingVector === 'OBJECTION_EMAIL'}
            onClick={() => handleVectorClick('OBJECTION_EMAIL')}
          />
          <VectorButton 
            label="Pulse" 
            icon={BarChart3} 
            color="text-emerald-500"
            loading={loadingVector === 'MARKET_DATA'}
            onClick={() => handleVectorClick('MARKET_DATA')}
          />
        </div>
      </div>
    </div>
  )
}

function VectorButton({ label, icon: Icon, color, loading, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={loading}
      className="py-4 px-2 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 flex flex-col items-center gap-3 transition-all group active:scale-95 disabled:opacity-50 min-w-0"
    >
      <Icon size={20} className={cn("transition-colors", loading ? "animate-pulse" : "text-white group-hover:" + color)} />
      <span className="text-[10px] font-mono uppercase text-zinc-500 group-hover:text-zinc-300 tracking-tighter truncate w-full text-center">
        {loading ? '...' : label}
      </span>
    </button>
  )
}

function NeuralScan() {
  const [step, setStep] = useState(0)
  const steps = [
    "> ACCESSING_GRID_TELEMETRY...",
    "> CALCULATING_VARIANCE...",
    "> SYNTHESIZING_PROTOCOL..."
  ]

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s + 1) % steps.length)
    }, 800)
    return () => clearInterval(timer)
  }, [])

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
          className="absolute inset-0 bg-[#002FA7]/20 blur-2xl rounded-full"
        />
        <Sparkles size={48} className="text-[#002FA7] relative z-10 animate-pulse" />
      </div>
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[10px] font-mono text-[#002FA7] uppercase tracking-[0.3em]"
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
        "bg-zinc-900/40 border p-4 rounded-xl relative overflow-hidden",
        accent ? "border-[#002FA7]/40 bg-[#002FA7]/5" : "border-white/5"
      )}
    >
      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
        {label}
      </div>
      <p className="text-sm text-zinc-100 leading-relaxed font-sans italic">
        "{content}"
      </p>
    </motion.div>
  )
}

function Activity({ className, size }: { className?: string, size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}
