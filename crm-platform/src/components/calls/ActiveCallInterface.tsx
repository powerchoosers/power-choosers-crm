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
  ArrowRight
} from 'lucide-react'
import { useAI } from '@/hooks/useAI'
import { useCallStore } from '@/store/callStore'
import { cn } from '@/lib/utils'

interface ActiveCallInterfaceProps {
  contact?: any
  account?: any
}

export function ActiveCallInterface({ contact, account }: ActiveCallInterfaceProps) {
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [loadingVector, setLoadingVector] = useState<string | null>(null)
  const [liveInput, setLiveInput] = useState('')
  const { generateScript } = useAI()
  const { metadata, status } = useCallStore()
  
  const scrollRef = useRef<HTMLDivElement>(null)

  // Use store metadata if props are missing (e.g., during dialing)
  const displayContact = contact || {
    name: metadata?.name || 'Unknown Node',
    title: metadata?.title || 'Operational Lead',
    company: metadata?.account || 'Unknown Asset'
  }

  const handleVectorClick = async (vector: string) => {
    setLoadingVector(vector)
    setAiResponse(null)
    
    const payload = {
      vector_type: vector,
      contact_context: {
        title: displayContact.title,
        industry: account?.industry || 'Unknown',
        load_zone: account?.loadZone || 'LZ_NORTH',
        contract_end: account?.contractEndDate || 'UNKNOWN',
        additional_context: vector === 'LIVE_PIVOT' ? liveInput : undefined
      }
    }

    const response = await generateScript(payload)
    if (response) {
      setAiResponse(response)
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
    <div className="flex flex-col h-full bg-zinc-950/50 backdrop-blur-xl border-l border-white/5 overflow-hidden">
      {/* 1. LEVERAGE CARD (Forensic Identity) */}
      <div className="p-6 border-b border-white/10 bg-white/5 shrink-0">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center font-mono text-white shadow-[0_0_15px_rgba(0,0,0,0.5)] overflow-hidden shrink-0">
            {metadata?.logoUrl ? (
              <img src={metadata.logoUrl} alt={displayContact.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold">{displayContact.name?.charAt(0) || 'N'}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white truncate text-sm">{displayContact.name}</div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate">
              {displayContact.company}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-xl text-center">
            <div className="text-[9px] text-red-400 uppercase font-mono tracking-tighter mb-0.5">Expiration</div>
            <div className="text-xs font-bold text-white font-mono tabular-nums">
              {account?.daysRemaining ? `${account.daysRemaining}D` : 'VOID'}
            </div>
          </div>
          <div className="bg-[#002FA7]/10 border border-[#002FA7]/20 p-2 rounded-xl text-center">
            <div className="text-[9px] text-[#002FA7] uppercase font-mono tracking-tighter mb-0.5">Load Zone</div>
            <div className="text-xs font-bold text-white font-mono uppercase">
              {account?.loadZone || 'LZ_NORTH'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. NEURAL STREAM (AI Suggestions) */}
      <div 
        ref={scrollRef}
        className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4"
      >
        <AnimatePresence mode="wait">
          {aiResponse ? (
            <motion.div 
              initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              className="bg-zinc-900/50 border border-[#002FA7]/30 p-4 rounded-2xl relative group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#002FA7]/50 to-transparent" />
              <div className="flex items-center gap-2 mb-2 text-[#002FA7]">
                <Zap size={12} className="animate-pulse" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold">Neural_Suggestion</span>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed font-sans italic">
                "{aiResponse}"
              </p>
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-full border border-white/5 bg-white/5 flex items-center justify-center mb-4 text-zinc-700">
                <Activity size={24} className="animate-pulse" />
              </div>
              <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">
                Awaiting Vector Trigger...
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. TACTICAL DECK (Controls) */}
      <div className="p-4 bg-zinc-900/80 backdrop-blur-md border-t border-white/10 shrink-0">
        {/* Rapid Context Input */}
        <div className="relative mb-3">
          <input 
            value={liveInput}
            onChange={(e) => setLiveInput(e.target.value)}
            onKeyDown={handleLiveContext}
            placeholder="INJECT LIVE CONTEXT..."
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-mono text-white placeholder:text-zinc-700 focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/20 outline-none pr-10 transition-all"
          />
          <button 
            onClick={() => handleVectorClick('LIVE_PIVOT')}
            disabled={!liveInput.trim() || !!loadingVector}
            className="absolute right-2 top-1.5 p-1.5 text-zinc-600 hover:text-white transition-colors disabled:opacity-30"
          >
            <Send size={14} />
          </button>
        </div>

        {/* Vector Deck */}
        <div className="grid grid-cols-2 gap-2">
          <VectorButton 
            label="Generate Opener" 
            icon={Zap} 
            color="text-[#002FA7]"
            loading={loadingVector === 'OPENER'}
            onClick={() => handleVectorClick('OPENER')}
          />
          <VectorButton 
            label="Price Defense" 
            icon={ShieldAlert} 
            color="text-red-500"
            loading={loadingVector === 'OBJECTION_PRICE'}
            onClick={() => handleVectorClick('OBJECTION_PRICE')}
          />
          <VectorButton 
            label="Send Info Pivot" 
            icon={Mail} 
            color="text-amber-500"
            loading={loadingVector === 'OBJECTION_EMAIL'}
            onClick={() => handleVectorClick('OBJECTION_EMAIL')}
          />
          <VectorButton 
            label="Market Pulse" 
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
      className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex flex-col items-center gap-2 transition-all group active:scale-95 disabled:opacity-50"
    >
      <Icon size={16} className={cn("transition-colors", loading ? "animate-pulse" : "text-white group-hover:" + color)} />
      <span className="text-[9px] font-mono uppercase text-zinc-500 group-hover:text-zinc-300 tracking-tighter">
        {loading ? 'Processing...' : label}
      </span>
    </button>
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
