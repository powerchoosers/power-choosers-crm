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
  Activity as ActivityIcon
} from 'lucide-react'
import { useAI } from '@/hooks/useAI'
import { useCallStore } from '@/store/callStore'
import { useVoice } from '@/context/VoiceContext'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ActiveCallInterfaceProps {
  contact?: any
  account?: any
}

export function ActiveCallInterface({ contact, account }: ActiveCallInterfaceProps) {
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [loadingVector, setLoadingVector] = useState<string | null>(null)
  const [liveInput, setLiveInput] = useState('')
  const { generateScript } = useAI()
  const { metadata: storeMetadata, status, isActive } = useCallStore()
  const { metadata: voiceMetadata } = useVoice()
  
  const metadata = isActive ? (voiceMetadata || storeMetadata) : storeMetadata
  
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
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      {/* 1. COMPACT LEVERAGE HUD */}
      <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center font-mono text-white shadow-[0_0_15px_rgba(0,0,0,0.5)] overflow-hidden shrink-0">
            {metadata?.logoUrl ? (
              <img src={metadata.logoUrl} alt={displayContact.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold">{displayContact.name?.charAt(0) || 'N'}</span>
            )}
          </div>
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
            {aiResponse ? (
              <motion.div 
                initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className="bg-zinc-900/40 border border-[#002FA7]/30 p-6 rounded-2xl relative group overflow-hidden shadow-2xl"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#002FA7]/50 to-transparent" />
                <div className="flex items-center gap-2 mb-4 text-[#002FA7]">
                  <Zap size={14} className="animate-pulse" />
                  <span className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold">Neural_Suggestion</span>
                </div>
                <p className="text-base text-zinc-100 leading-relaxed font-sans italic">
                  "{aiResponse}"
                </p>
              </motion.div>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-center opacity-40">
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
