'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Copy, Send, X, Loader2, User, Bot, Mic, Activity, AlertTriangle, ArrowRight, History, RefreshCw, Phone, Plus, Sparkles, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, AnimatePresence } from 'framer-motion'
import { useGeminiStore } from '@/store/geminiStore'
import { usePathname, useParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

interface Diagnostic {
  model: string
  provider: string
  status: 'attempting' | 'success' | 'failed' | 'retry'
  reason?: string
  error?: string
  tools?: string[]
}

interface ChatSession {
  id: string
  title: string
  context_type: string
  context_id: string | null
  created_at: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  type?: 'text' | 'component'
  componentData?: unknown
}

type NewsTickerItem = {
  title: string
  source?: string
  trend?: 'up' | 'down'
  volatility?: string
}

type MiniProfile = {
  name: string
  company?: string
  title?: string
}

type ContactDossier = {
  name: string
  title: string
  company: string
  initials: string
  energyMaturity?: string
  contractStatus: 'active' | 'expired' | 'negotiating'
  contractExpiration?: string
  id: string
}

type PositionMaturity = {
  expiration: string
  daysRemaining: number
  currentSupplier: string
  strikePrice: string
  annualUsage: string
  estimatedRevenue: string
  margin?: string
  isSimulation?: boolean
}

type ForensicGrid = {
  title: string
  columns: string[]
  rows: Record<string, string | number>[]
  highlights?: string[] // Columns to check for volatility
}

type ForensicDocument = {
  id: string
  name: string
  type: string
  size?: string
  url?: string
  created_at: string
}

type ForensicDocuments = {
  accountName: string
  documents: ForensicDocument[]
}

type DataVoid = {
  field: string
  action: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function Waveform() {
  return (
    <div className="flex items-center gap-[2px] h-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={i}
          animate={{
            height: [4, 12, 4],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
          className="w-[2px] bg-emerald-500/80 rounded-full"
        />
      ))}
    </div>
  )
}

function ImageWithSkeleton({ src, alt, className, isLoading: isExternalLoading }: { src: string | null, alt: string, className?: string, isLoading?: boolean }) {
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const showSkeleton = isExternalLoading || !src || !isImageLoaded

  return (
    <div className={cn("relative overflow-hidden bg-zinc-800", className)}>
      <AnimatePresence>
        {showSkeleton && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center overflow-hidden z-10 bg-zinc-800"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
            <User size={14} className="text-zinc-700" />
          </motion.div>
        )}
      </AnimatePresence>
      {src && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsImageLoaded(true)}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-500",
            isImageLoaded ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </div>
  )
}

function ComponentRenderer({ type, data }: { type: string, data: unknown }) {
  switch (type) {
    case 'contact_dossier': {
      if (!isRecord(data)) return null
      const dossier = data as unknown as ContactDossier
      const hasContractData = !!dossier.contractExpiration

      return (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="flex flex-col gap-3 p-4 rounded-xl bg-white/5 border border-white/10 relative overflow-hidden group w-full"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#002FA7]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center border border-white/10 text-zinc-400 font-bold text-lg shrink-0">
              {dossier.initials || dossier.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm tracking-tight truncate">{dossier.name}</h3>
              <p className="text-zinc-400 text-xs truncate">{dossier.title} • {dossier.company}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse shrink-0", dossier.contractStatus === 'active' ? 'bg-emerald-500' : 'bg-red-500')} />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate">{dossier.contractStatus}</span>
                {dossier.energyMaturity && (
                  <span className="text-[10px] font-mono text-[#002FA7] ml-2 uppercase tracking-tighter">Maturity: {dossier.energyMaturity}</span>
                )}
              </div>
            </div>
            <Button size="sm" className="bg-[#002FA7] hover:bg-blue-600 text-white font-mono text-[10px] uppercase tracking-widest border border-blue-400/30 shadow-[0_0_15px_rgba(0,47,167,0.4)] h-8">
              INITIATE
            </Button>
          </div>

          <div className="pt-3 border-t border-white/5 relative z-10">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Energy Contract</span>
              {hasContractData ? (
                <span className="text-[10px] font-mono text-zinc-300 tabular-nums">{dossier.contractExpiration}</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-red-500 font-bold tracking-tighter">DATA_VOID // REQUIRE_BILL_UPLOAD</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )
    }
    case 'position_maturity': {
      if (!isRecord(data)) return null
      const pos = data as unknown as PositionMaturity
      return (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="rounded-2xl border transition-all duration-500 bg-zinc-900/30 backdrop-blur-xl p-6 relative overflow-hidden shadow-lg space-y-6 border-white/10 w-full"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
          
          {pos.isSimulation && (
            <div className="absolute top-3 right-4">
              <span className="text-[9px] font-mono text-amber-500 border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 rounded uppercase tracking-[0.2em] animate-pulse">
                SIMULATION MODEL
              </span>
            </div>
          )}

          <div>
            <div className="flex justify-between items-end mb-2">
              <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Position Maturity</h4>
              <div className="text-right">
                <span className="text-xs text-zinc-500 mr-2">Expiration:</span>
                <span className="text-white font-mono font-bold tabular-nums">{pos.expiration || 'TBD'}</span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
              <div className="h-full bg-zinc-700 transition-all duration-1000 ease-out relative" style={{ width: `${Math.min(100, (pos.daysRemaining / 365) * 100)}%` }}>
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 shadow-[0_0_10px_white]"></div>
              </div>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-[#002FA7] font-mono tabular-nums ml-auto">{pos.daysRemaining} Days Remaining</span>
            </div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Current Supplier</div>
            <div className="text-xl font-semibold tracking-tighter text-white truncate">{pos.currentSupplier}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Strike Price</div>
              <div className="text-xl font-mono tabular-nums tracking-tighter text-[#002FA7]">{pos.strikePrice}</div>
            </div>
            <div>
              <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Annual Usage</div>
              <div className="text-xl font-mono tabular-nums tracking-tighter text-white">{pos.annualUsage}</div>
            </div>
          </div>
          <div className="pt-4 border-t border-white/5">
            <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Estimated Annual Revenue</div>
            <div className="text-3xl font-mono tabular-nums tracking-tighter text-green-500/80">{pos.estimatedRevenue}</div>
            <div className="text-[9px] font-mono text-zinc-600 mt-1 uppercase tracking-widest">Calculated at {pos.margin || '0.003'} margin base</div>
          </div>
        </motion.div>
      )
    }
    case 'forensic_grid': {
      if (!isRecord(data)) return null
      const grid = data as unknown as ForensicGrid
      
      const isVolatile = (val: string | number) => {
        if (typeof val === 'number') return val > 50
        if (typeof val === 'string') {
          const num = parseFloat(val.replace(/[^0-9.-]/g, ''))
          return !isNaN(num) && num > 50
        }
        return false
      }

      return (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="rounded-xl border border-white/10 bg-zinc-900/40 overflow-hidden w-full"
        >
          <div className="px-4 py-2 border-b border-white/5 bg-white/5 flex justify-between items-center">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-semibold">{grid.title}</span>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[300px]">
              <thead>
                <tr className="border-b border-white/5">
                  {grid.columns.map((col: string, i: number) => (
                    <th key={i} className="px-4 py-2 font-mono text-zinc-500 font-normal uppercase tracking-widest text-[9px] whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row: Record<string, string | number>, i: number) => (
                  <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors font-mono tabular-nums text-zinc-300">
                    {grid.columns.map((col: string, j: number) => {
                      const value = row[col]
                      const highlight = grid.highlights?.includes(col) && isVolatile(value)
                      return (
                        <td key={j} className={cn("px-4 py-2 whitespace-nowrap", highlight ? "text-amber-500 font-bold" : "")}>
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )
    }
    case 'forensic_documents': {
      if (!isRecord(data)) return null
      const docData = data as unknown as ForensicDocuments
      return (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="rounded-xl border border-white/10 bg-zinc-900/40 overflow-hidden w-full"
        >
          <div className="px-4 py-2 border-b border-white/5 bg-white/5 flex justify-between items-center">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-semibold">Data_Locker // {docData.accountName}</span>
            <span className="text-[10px] font-mono text-zinc-500">{docData.documents.length} Files</span>
          </div>
          <div className="p-2 space-y-1">
            {docData.documents.length > 0 ? (
              docData.documents.map((doc, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-500 border border-white/5">
                      <Cpu size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-200 truncate">{doc.name}</div>
                      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-tighter">
                        {doc.type} • {doc.size || 'N/A'} • {new Date(doc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  {doc.url && (
                    <button 
                      className="icon-button-forensic h-8 w-8 flex items-center justify-center text-zinc-500"
                      onClick={() => window.open(doc.url, '_blank')}
                    >
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
                No documents found in locker
              </div>
            )}
          </div>
        </motion.div>
      )
    }
    case 'data_void': {
      if (!isRecord(data)) return null
      const voidData = data as unknown as DataVoid
      return (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/10 flex items-center gap-4 w-full">
          <div className="w-8 h-8 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-red-400 font-mono text-xs uppercase tracking-widest truncate">DATA_VOID // {voidData.field}</h4>
            <p className="text-red-300/60 text-[10px] font-mono mt-1 truncate">{voidData.action}</p>
          </div>
        </div>
      )
    }
    case 'news_ticker':
      {
        const items: NewsTickerItem[] = (() => {
          if (!isRecord(data) || !Array.isArray(data.items)) return []
          return data.items
            .map((item): NewsTickerItem | null => {
              if (!isRecord(item)) return null
              const title = typeof item.title === 'string' ? item.title : ''
              const source = typeof item.source === 'string' ? item.source : undefined
              const trend = item.trend === 'up' || item.trend === 'down' ? item.trend : undefined
              const volatility = typeof item.volatility === 'string' ? item.volatility : undefined
              if (!title) return null
              return { title, source, trend, volatility }
            })
            .filter((v): v is NewsTickerItem => v !== null)
        })()

      return (
        <div className="grid grid-cols-1 min-w-0 w-full max-w-full">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Market_Volatility_Feed</span>
            <Activity size={10} className="text-emerald-500" />
          </div>
          <div className="overflow-x-auto w-full pb-2 no-scrollbar touch-pan-x flex gap-3">
            {items.map((item, i) => (
              <div key={i} className="min-w-[160px] sm:min-w-[200px] max-w-[240px] p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-1 hover:bg-white/10 transition-colors shrink-0">
                <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono">
                  <span className="text-zinc-400 truncate mr-2">{item.source || 'ERCOT'}</span>
                  <span className={cn("shrink-0", item.trend === 'up' ? "text-red-400" : "text-emerald-400")}>
                    {item.trend === 'up' ? '▲' : '▼'} {item.volatility || '2.4%'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs font-medium text-zinc-100 line-clamp-2 leading-snug">
                  {item.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )
      }
    case 'mini_profile':
      {
        const profiles: MiniProfile[] = (() => {
          if (!isRecord(data) || !Array.isArray(data.profiles)) return []
          return data.profiles
            .map((profile): MiniProfile | null => {
              if (!isRecord(profile)) return null
              const name = typeof profile.name === 'string' ? profile.name : ''
              const company = typeof profile.company === 'string' ? profile.company : undefined
              const title = typeof profile.title === 'string' ? profile.title : undefined
              if (!name) return null
              return { name, company, title }
            })
            .filter((v): v is MiniProfile => v !== null)
        })()

      return (
        <div className="grid grid-cols-1 gap-2 w-full min-w-0 overflow-hidden">
          {profiles.map((profile, i) => (
            <div key={i} className="flex items-center gap-3 p-2 sm:p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold border border-white/5 group-hover:border-blue-500/50 transition-colors shrink-0">
                {profile.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <h4 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">{profile.name}</h4>
                <p className="text-[9px] sm:text-[10px] text-zinc-500 font-mono truncate uppercase tracking-tighter">{profile.company || profile.title}</p>
              </div>
              <Button size="sm" className="h-7 sm:h-8 px-2 sm:px-3 bg-[#002FA7]/20 text-[#002FA7] border border-[#002FA7]/30 hover:bg-[#002FA7] hover:text-white transition-all text-[9px] sm:text-[10px] font-bold uppercase tracking-tighter shrink-0">
                Inject
              </Button>
            </div>
          ))}
        </div>
      )
      }
    default:
      return null
  }
}

export function GeminiChatTrigger(props: { onToggle?: () => void }) {
  const isOpen = useGeminiStore((state) => state.isOpen)
  const toggleChat = useGeminiStore((state) => state.toggleChat)

  return (
    <button
      onClick={() => {
        props.onToggle?.()
        toggleChat()
      }}
      className={cn(
        "icon-button-forensic w-9 h-9 relative overflow-hidden",
        isOpen && "text-white scale-110"
      )}
      title={isOpen ? "Close Gemini" : "Chat with Gemini"}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={isOpen ? "close" : "bot"}
          initial={{ opacity: 0, scale: 0.5, rotate: isOpen ? -90 : 90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.5, rotate: isOpen ? 90 : -90 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="flex items-center justify-center"
        >
          {isOpen ? <X size={24} /> : <Bot size={24} />}
        </motion.div>
      </AnimatePresence>
    </button>
  )
}

export function GeminiChatPanel() {
  const isOpen = useGeminiStore((state) => state.isOpen)
  const auth = useAuth()
  const profile = auth?.profile
  const user = auth?.user
  const pathname = usePathname()
  const params = useParams()
  
  // State for hosted avatar to avoid Google CORS issues
  const [hostedAvatarUrl, setHostedAvatarUrl] = useState<string | null>(null)
  const [isAvatarLoading, setIsAvatarLoading] = useState(false)

  // History State from Store
  const isHistoryOpen = useGeminiStore((state) => state.isHistoryOpen)
  const toggleHistory = useGeminiStore((state) => state.toggleHistory)
  const resetCounter = useGeminiStore((state) => state.resetCounter)
  const resetSession = useGeminiStore((state) => state.resetSession)

  const setIsHistoryOpen = (open: boolean) => {
    if (open !== isHistoryOpen) toggleHistory()
  }

  // Listen for global reset
  useEffect(() => {
    if (resetCounter > 0) {
      setMessages([])
      setCurrentSessionId(null)
    }
  }, [resetCounter])
  const [historySessions, setHistorySessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const storeContext = useGeminiStore((state) => state.activeContext)

  // Contextual Intel Logic
  const contextInfo = useMemo(() => {
    let baseContext: { type: string, id?: string | string[], label: string };
    if (storeContext) {
      baseContext = storeContext;
    } else if (pathname.includes('/people/')) {
      baseContext = { type: 'contact', id: params.id, label: `CONTACT: ${String(params.id).slice(0, 12)}` };
    } else if (pathname.includes('/accounts/')) {
      baseContext = { type: 'account', id: params.id, label: `ACCOUNT: ${String(params.id).slice(0, 12)}` };
    } else if (pathname.includes('/dashboard')) {
      baseContext = { type: 'dashboard', label: 'GLOBAL_DASHBOARD' };
    } else {
      baseContext = { type: 'general', label: 'GLOBAL_SCOPE' };
    }

    // Rethink: Ensure the label is clean and then add the correct prefix here
    // This prevents double prefixing regardless of where the label comes from
    const cleanLabel = baseContext.label
      .replace(/^TARGET:\s*/i, '')
      .replace(/^ACTIVE_CONTEXT:\s*/i, '')
      .replace(/^CONTACT:\s*/i, '')
      .replace(/^ACCOUNT:\s*/i, '')
      .trim();
    
    let displayLabel;
    if (baseContext.type === 'general' || cleanLabel === 'GLOBAL_SCOPE' || cleanLabel === 'GLOBAL_DASHBOARD') {
      displayLabel = `ACTIVE_CONTEXT: ${cleanLabel}`;
    } else {
      displayLabel = `TARGET: ${cleanLabel}`;
    }

    return { ...baseContext, displayLabel };
  }, [pathname, params, storeContext])

  // Fetch History
  useEffect(() => {
    if (isHistoryOpen) {
      const fetchSessions = async () => {
        const { data } = await supabase.from('chat_sessions').select('*').order('created_at', { ascending: false }).limit(20)
        setHistorySessions((data || []) as ChatSession[])
      }
      fetchSessions()
    }
  }, [isHistoryOpen])

  const loadSession = async (sessionId: string) => {
    const { data } = await supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
    if (data) {
      setMessages(data.map((m: { role: string; content: string }) => ({
        role: m.role === 'model' ? 'assistant' : m.role as 'user' | 'assistant',
        content: m.content
      })))
      setCurrentSessionId(sessionId)
      setIsHistoryOpen(false)
    }
  }

  const saveMessageToDb = async (role: 'user' | 'model', content: string) => {
    try {
      let sessionId = currentSessionId
      if (!sessionId) {
        // Create new session
        const { data } = await supabase.from('chat_sessions').insert({
          title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
          context_type: contextInfo.type,
          context_id: ('id' in contextInfo && typeof contextInfo.id === 'string') ? contextInfo.id : null,
        }).select().single()
        
        if (data) {
          const newSession = data as ChatSession
          sessionId = newSession.id
          setCurrentSessionId(newSession.id)
          setHistorySessions(prev => [newSession, ...prev])
        }
      }

      if (sessionId) {
        await supabase.from('chat_messages').insert({
          session_id: sessionId,
          role,
          content
        })
      }
    } catch (err) {
      console.error('Failed to save message:', err)
    }
  }

  const [messages, setMessages] = useState<Message[]>([])
  const [lastProvider, setLastProvider] = useState<string>('openrouter')
  const [lastModel, setLastModel] = useState<string>('openai/gpt-oss-120b:free')
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-oss-120b:free')
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  
  // Host Google Avatar if needed
  useEffect(() => {
    const hostAvatar = async () => {
      const photoURL = user?.photoURL
      if (!photoURL) {
        setIsAvatarLoading(false)
        return
      }

      setIsAvatarLoading(true)

      // If it's already an imgur link or not a google link, use it directly
      if (photoURL.includes('imgur.com') || (!photoURL.includes('googleusercontent.com') && !photoURL.includes('ggpht.com'))) {
        setHostedAvatarUrl(photoURL)
        setIsAvatarLoading(false)
        return
      }

      try {
        const response = await fetch('/api/upload/host-google-avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googlePhotoURL: photoURL })
        })
        if (response.ok) {
          const data = await response.json()
          if (data.imageUrl) {
            setHostedAvatarUrl(data.imageUrl)
            // Preload the image
            const img = new Image()
            img.src = data.imageUrl
          }
        } else {
          setHostedAvatarUrl(photoURL) // Fallback
        }
      } catch (err) {
        console.error('Failed to host avatar:', err)
        setHostedAvatarUrl(photoURL) // Fallback
      } finally {
        setIsAvatarLoading(false)
      }
    }

    if (isOpen) {
      hostAvatar()
    }
  }, [isOpen, user?.photoURL])

  // Initialize with Contextual Greeting
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const firstName = profile?.firstName || 'Trey'
      setMessages([
        { 
          role: 'assistant', 
          content: contextInfo.type === 'contact' 
            ? `System ready, ${firstName}. I see you're viewing contact ${params.id}. Scanning Gmail for recent threads and Apollo for firmographics...`
            : contextInfo.type === 'account'
            ? `System ready, ${firstName}. Analyzing account data for ${params.id}. Checking energy market conditions for this node...`
            : `System ready, ${firstName}. Awaiting command for Nodal Point intelligence network.`
        }
      ])
    }
  }, [isOpen, contextInfo, params.id, profile?.firstName])

  const getProvider = (model: string) => {
    if (model.startsWith('openai/') || model.startsWith('anthropic/')) return 'OpenRouter'
    if (model.startsWith('gemini-')) return 'Google'
    if (model.startsWith('sonar')) return 'Perplexity'
    return 'AI_NODE'
  }

  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-expand textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to calculate scrollHeight correctly
    textarea.style.height = '44px' 
    
    // Set height based on scrollHeight, capped at ~3 lines (approx 112px)
    // Only expand if there's content, otherwise stay at 44px
    if (input.trim()) {
      const newHeight = Math.min(textarea.scrollHeight, 112)
      textarea.style.height = `${newHeight}px`
    }
  }, [input])

  const copySupabaseAIPrompt = () => {
    const prompt = `
I am troubleshooting a Hybrid Search implementation in a Supabase (PostgreSQL) database. 

### CONTEXT:
- **Project**: Nodal Point CRM (Next.js 15)
- **Database**: Supabase with pgvector
- **Search Logic**: Hybrid Search using Reciprocal Rank Fusion (RRF).
- **Current Issue**: Searching for exact names (e.g., "Camp Fire First Texas" or "Integrated Circuit Solutions USA") is not consistently returning the correct record at rank #1, or the AI agent is failing to find them via the \`list_accounts\` tool.

### SCHEMA & SEARCH FUNCTION:
We use a custom PostgreSQL function \`hybrid_search_accounts\`:
\`\`\`sql
CREATE OR REPLACE FUNCTION hybrid_search_accounts(
  query_text TEXT,
  query_embedding VECTOR(768),
  match_count INT,
  full_text_weight FLOAT DEFAULT 4.0,
  semantic_weight FLOAT DEFAULT 0.5,
  rrf_k INT DEFAULT 50
)
RETURNS TABLE (...)
LANGUAGE plpgsql
AS $$
-- Tiered Ranking:
-- 1. Exact Name Match (Priority)
-- 2. Starts With Name
-- 3. FTS (websearch_to_tsquery)
-- 4. Semantic (Vector Similarity)
-- Combined using RRF
$$;
\`\`\`

### THE QUESTION:
1. Why might an exact match for "Camp Fire First Texas" fail to rank #1 if the weights are 4.0 (FTS) vs 0.5 (Semantic)?
2. How can I modify the SQL function to ensure that if \`name ILIKE query_text\`, it is GUARANTEED to be the first result regardless of RRF?
3. Is there a better way to handle multi-word entity names in \`websearch_to_tsquery\`?
    `.trim()
    navigator.clipboard.writeText(prompt)
    alert('Troubleshooting prompt for Supabase AI copied!')
  }

  const copySupabasePrompt = () => {
    const prompt = `
-- HYBRID SEARCH DEBUG COMMAND
-- Use this in Supabase SQL Editor to verify what the AI sees
SELECT * FROM hybrid_search_accounts(
  'Camp Fire First Texas', -- Replace with your search query
  NULL, -- embedding (optional for manual SQL test)
  10, -- limit
  4.0, -- full_text_weight
  0.5, -- semantic_weight
  50 -- rrf_k
);
    `.trim()
    navigator.clipboard.writeText(prompt)
    alert('Supabase debug prompt copied to clipboard!')
  }

  const copyDebugInfo = () => {
    const debugInfo = `
# Gemini Chat Error Report
- **Error Type**: Internal Server Error (500)
- **Root Cause**: Gemini API History Role Mismatch
- **Details**: The Gemini model requires the first message in the history to be from the 'user'. The frontend was sending an 'assistant' greeting as the first message, which was mapped to 'model' in the backend.
- **Action Taken**: Modified \`api/gemini/chat.js\` to filter the history and ensure it starts with a 'user' message.
- **Context**: Next.js 15, Node.js Backend (port 3001), @google/generative-ai SDK.
    `.trim()
    navigator.clipboard.writeText(debugInfo)
    alert('Debug info copied to clipboard!')
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Auto-scroll hook
  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: input }
    saveMessageToDb('user', input)
    const updatedMessages = [...messages, userMessage]
    
    // Ensure history starts with a user message and is trimmed to last 10 for performance
    const firstUserIndex = updatedMessages.findIndex((m) => m.role === 'user')
    const relevantHistory = firstUserIndex >= 0 ? updatedMessages.slice(firstUserIndex) : updatedMessages
    
    // Take last 10, but verify we don't start with an assistant message after slicing
    let messagesForApi = relevantHistory.slice(-10)
    if (messagesForApi.length > 0 && messagesForApi[0].role === 'assistant') {
      messagesForApi = messagesForApi.slice(1)
    }

    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)
    setError(null)
    
    // Set initial routing state for Trey
    setDiagnostics([{ 
      model: 'ROUTER', 
      provider: 'NETWORK', 
      status: 'attempting', 
      reason: 'INITIATING_NEURAL_ROUTING' 
    }])

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messagesForApi,
          context: contextInfo,
          model: selectedModel,
          userProfile: {
            firstName: profile?.firstName || 'Trey'
          }
        })
      })

      const data = await response.json()
      
      // Temporary Routing Diagnostics for Trey
      if (data.diagnostics) {
        setDiagnostics(data.diagnostics as Diagnostic[])
        console.group('%c AI_ROUTER_DIAGNOSTICS ', 'background: #002FA7; color: white; font-weight: bold; border-radius: 4px; padding: 2px 4px;')
        console.table(data.diagnostics)
        console.groupEnd()
      }

      if (data.error) throw new Error(data.message || data.error)

      setLastProvider(typeof data.provider === 'string' ? data.provider : 'gemini')
      setLastModel(typeof data.model === 'string' ? data.model : '')

      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
      saveMessageToDb('model', data.content)
    } catch (err: unknown) {
      console.error('Chat error:', err)
      
      // Try to extract diagnostics from error if available
      const errorWithDiagnostics = err as { diagnostics?: Diagnostic[] };
      if (err instanceof Error && 'diagnostics' in err) {
        setDiagnostics((err as unknown as { diagnostics: Diagnostic[] }).diagnostics)
      } else if (typeof err === 'object' && err !== null && 'diagnostics' in err) {
        setDiagnostics(errorWithDiagnostics.diagnostics || null)
      } else {
        // If no diagnostics in error, mark the router attempt as failed
        setDiagnostics(prev => {
          if (!prev) return null
          return prev.map(d => d.model === 'ROUTER' ? { ...d, status: 'failed' as const, error: err instanceof Error ? err.message : 'Network failure' } : d)
        })
      }

      const errorMessage = err instanceof Error ? err.message : 'Internal server error'
      setError(errorMessage)
      
      const assistantFallback = errorMessage.includes('overloaded') || errorMessage.includes('503')
        ? "The intelligence network is currently under heavy load. I'm initiating a localized retry protocol, but if this persists, please try again in a moment."
        : "Sorry, I encountered an error. Please try again."
        
      setMessages(prev => [...prev, { role: 'assistant', content: assistantFallback }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      key="gemini-panel"
      layout
      initial={{ opacity: 0, y: 4, scaleY: 0.98 }}
      animate={{ opacity: 1, y: 0, scaleY: 1 }}
      exit={{ opacity: 0, y: 4, scaleY: 0.98, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, delay: 0.05 }}
      style={{ transformOrigin: 'top' }}
      className="absolute top-12 right-2 mt-2 w-[calc(100%-1rem)] max-w-[480px] flex flex-col h-[600px] max-h-[calc(100vh-8rem)] rounded-2xl bg-zinc-950/80 backdrop-blur-3xl border border-white/10 shadow-2xl overflow-hidden z-50"
    >
      {/* Nodal Point Glass Highlight */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#002FA7]/5 via-transparent to-white/5 pointer-events-none" />
      
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/50 relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className={cn(
                "w-8 h-8 rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center relative z-10 overflow-hidden transition-all",
                showDiagnostics ? "border-[#002FA7]/50 shadow-[0_0_15px_rgba(0,47,167,0.4)]" : "hover:border-white/20"
              )}
              title="Toggle Routing HUD"
            >
              <Bot size={20} className="text-white" />
            </button>
            {/* Ambient Hum Animation */}
            <motion.div
              animate={{
                scale: showDiagnostics ? [1.1, 1.3, 1.1] : [1, 1.2, 1],
                opacity: showDiagnostics ? [0.4, 0.7, 0.4] : [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: showDiagnostics ? 2 : 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 bg-[#002FA7]/20 rounded-2xl blur-md"
            />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-100 tracking-widest uppercase">Nodal Architect v1.3</h3>
            <div className="flex items-center gap-2">
              <Waveform />
              <span className="text-[10px] font-mono text-emerald-500/70 uppercase tracking-tighter font-bold">LIVE_FEED</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={cn(
              "icon-button-forensic w-8 h-8 flex items-center justify-center",
              isHistoryOpen && "text-white scale-110"
            )}
            title="Chat History"
          >
            <History size={16} />
          </button>
          <button
            onClick={resetSession}
            className="icon-button-forensic w-8 h-8 flex items-center justify-center"
            title="New Chat"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Diagnostics HUD Overlay */}
      <AnimatePresence>
        {showDiagnostics && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-zinc-900/95 border-b border-white/10 overflow-hidden relative z-20"
          >
            <div className="p-3 font-mono text-[10px] space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between border-b border-white/5 pb-1 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[#002FA7] font-bold tracking-widest">AI_ROUTER_HUD // LIVE_DIAGNOSTICS</span>
                  <button 
                    onClick={copySupabaseAIPrompt}
                    className="p-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-white transition-all flex items-center gap-1 group"
                    title="Copy AI Troubleshooting Prompt"
                  >
                    <Bot size={10} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[8px] font-bold uppercase tracking-tighter">AI_PROMPT</span>
                  </button>
                  <button 
                    onClick={copySupabasePrompt}
                    className="p-1 rounded bg-[#002FA7]/10 border border-[#002FA7]/20 text-[#002FA7] hover:bg-[#002FA7] hover:text-white transition-all flex items-center gap-1 group"
                    title="Copy Supabase Debug Prompt"
                  >
                    <Cpu size={10} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[8px] font-bold uppercase tracking-tighter">SQL_DEBUG</span>
                  </button>
                </div>
                <span className="text-zinc-600 text-[8px] uppercase">Routing Protocol v2.3</span>
              </div>
              
              {!diagnostics ? (
                <div className="text-zinc-500 italic py-2">No active trace. Send a message to initiate neural routing...</div>
              ) : (
                <div className="space-y-1.5">
                  {diagnostics.map((d, i) => (
                    <div key={i} className={cn(
                      "flex flex-col gap-0.5 p-1.5 rounded border transition-all duration-300",
                      d.status === 'success' ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" :
                      d.status === 'failed' ? "bg-red-500/5 border-red-500/20 text-red-400" :
                      d.status === 'retry' ? "bg-amber-500/5 border-amber-500/20 text-amber-400" :
                      d.status === 'attempting' ? "bg-[#002FA7]/10 border-[#002FA7]/30 text-[#002FA7] animate-pulse" :
                      "bg-white/5 border-white/10 text-zinc-400"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold uppercase tracking-tighter">
                          [{d.provider || 'AI'}] {d.model}
                        </span>
                        <span className="text-[8px] opacity-70 uppercase font-bold">
                          {d.status}
                        </span>
                      </div>
                      {d.error && (
                        <div className="text-[9px] opacity-80 leading-tight mt-1 border-t border-red-500/10 pt-1">
                          ERR: {d.error}
                        </div>
                      )}
                      {d.reason && (
                        <div className="text-[9px] opacity-80 italic">
                          REASON: {d.reason}
                        </div>
                      )}
                      {d.tools && (
                        <div className="text-[9px] opacity-80 flex items-center gap-1 mt-1">
                          <span className="text-[#002FA7]">TOOLS:</span> {d.tools.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Slide-Over Panel */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-[65px] bottom-0 left-0 w-64 bg-zinc-950/95 backdrop-blur-xl border-r border-white/10 z-30 flex flex-col"
          >
            <div className="p-3 border-b border-white/5 bg-white/5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Neural Logs</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {historySessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => loadSession(session.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border border-transparent transition-all hover:bg-white/5 hover:border-white/5 group",
                      currentSessionId === session.id ? "bg-white/5 border-white/10" : ""
                    )}
                  >
                    <div className="text-xs text-zinc-200 font-medium line-clamp-2 mb-1 group-hover:text-white">
                      {session.title || 'Untitled Session'}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                      {session.context_type && session.context_type !== 'general' && (
                        <span className="text-[9px] font-mono text-[#002FA7] bg-[#002FA7]/10 px-1.5 py-0.5 rounded border border-[#002FA7]/20">
                          {session.context_type}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {historySessions.length === 0 && (
                  <div className="p-4 text-center text-zinc-600 text-xs font-mono">
                    NO_LOGS_FOUND
                  </div>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <ScrollArea className="flex-1 w-full overflow-hidden relative z-10" ref={scrollRef}>
        <div className="p-4 space-y-8 min-w-0 w-full max-w-full overflow-x-hidden flex flex-col">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div 
                key={i} 
                initial={{ 
                  opacity: 0, 
                  x: m.role === 'user' ? 20 : -20,
                  filter: "blur(10px)"
                }}
                animate={{ 
                  opacity: 1, 
                  x: 0,
                  filter: "blur(0px)"
                }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className={cn(
                  "flex gap-3 w-full min-w-0 max-w-full overflow-hidden items-start", 
                  m.role === 'user' ? "flex-row-reverse justify-start" : "flex-row justify-start"
                )}
              >
                {m.role === 'user' ? (
                  /* "Stealth" User Command */
                  <div className="flex justify-end mb-2 group w-full gap-8">
                    <div className="max-w-[85%] relative">
                      <div className="bg-zinc-900/50 border border-white/10 backdrop-blur-md rounded-lg p-4 text-right shadow-xl">
                        <p className="font-mono text-[10px] text-[#002FA7] mb-1 uppercase tracking-widest opacity-70">
                          {'>'} COMMAND_INPUT
                        </p>
                        <p className="text-sm text-zinc-100 font-medium leading-relaxed">
                          {m.content}
                        </p>
                      </div>
                    </div>
                    {/* User Initials/Avatar */}
                    <div className="shrink-0 h-10 w-10 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden">
                      {isAvatarLoading || hostedAvatarUrl ? (
                        <ImageWithSkeleton 
                          src={hostedAvatarUrl} 
                          isLoading={isAvatarLoading} 
                          alt="User" 
                          className="w-full h-full" 
                        />
                      ) : (
                        <span className="font-mono text-xs text-zinc-500">YOU</span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* "Intelligence Block" (AI Response) */
                  <div className="flex justify-start mb-2 relative w-full group">
                    {/* The Neural Line (The glowing spine on the left) */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#002FA7] via-[#002FA7]/20 to-transparent group-hover:from-blue-400 transition-colors duration-500" />
                    
                    <div className="pl-6 w-full">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest font-bold">
                          NODAL_ARCHITECT // v1.3
                        </span>
                        {isLoading && i === messages.length - 1 && <Waveform />}
                      </div>
                      
                      <div className="flex flex-col gap-4 w-full min-w-0 max-w-full overflow-hidden">
                        {m.content.split('JSON_DATA:').map((part, index) => {
                          if (index === 0) {
                            const text = part.trim()
                            if (!text) return null
                            return (
                              <div key={index} className="prose prose-invert prose-p:text-zinc-400 prose-headings:font-mono prose-headings:text-zinc-200 prose-headings:tracking-tighter prose-strong:text-white prose-code:text-[#002FA7] text-sm leading-7 max-w-none break-words [word-break:break-word] [overflow-wrap:anywhere]">
                                <p className="whitespace-pre-wrap">{text}</p>
                              </div>
                            )
                          }
                          try {
                            const [jsonPart, ...rest] = part.split('END_JSON')
                            const data = JSON.parse(jsonPart)
                            const trailingText = rest.join('END_JSON').trim()
                            
                            return (
                              <div key={index} className="flex flex-col gap-4 w-full min-w-0 max-w-full overflow-hidden">
                                <div className="w-full overflow-hidden rounded-lg border border-white/5 bg-black/20 grid grid-cols-1">
                                  <ComponentRenderer type={data.type} data={data.data} />
                                </div>
                                {trailingText && (
                                  <div className="prose prose-invert prose-p:text-zinc-400 prose-headings:font-mono prose-headings:text-zinc-200 prose-headings:tracking-tighter prose-strong:text-white prose-code:text-[#002FA7] text-sm leading-7 max-w-none break-words [word-break:break-word] [overflow-wrap:anywhere]">
                                    <p className="whitespace-pre-wrap">{trailingText}</p>
                                  </div>
                                )}
                              </div>
                            )
                          } catch (e) {
                            return <div key={index} className="text-[10px] text-red-400 font-mono p-2 bg-red-500/10 rounded">[System_Error: Data_Corruption]</div>
                          }
                        })}
                      </div>
                      
                      {i === messages.length - 1 && error && (
                        <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                          <p className="text-[10px] text-red-400 font-mono leading-tight flex-1">
                            {error}
                          </p>
                          <button 
                            onClick={copySupabasePrompt}
                            className="icon-button-forensic w-8 h-8 shrink-0 flex items-center justify-center text-emerald-500 hover:text-emerald-400"
                            title="Copy Supabase Debug Prompt"
                          >
                            <Cpu size={16} />
                          </button>
                          <button 
                            onClick={copyDebugInfo}
                            className="icon-button-forensic w-8 h-8 shrink-0 flex items-center justify-center"
                            title="Copy Prompt for Backend Dev"
                          >
                            <Copy size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <div className="flex justify-start relative w-full">
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#002FA7] to-transparent" />
              <div className="pl-6 flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest opacity-50 animate-pulse">
                  {'>'} PARSING_INTENT...
                </span>
                <Loader2 size={12} className="text-[#002FA7] animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </ScrollArea>

      {/* Control Module (Stacked Command Deck) */}
      <motion.div 
        layout
        className="p-4 border-t border-white/10 bg-zinc-900/40 backdrop-blur-md relative z-10"
      >
        <motion.form 
          layout
          initial={false}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="bg-zinc-950/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/5"
        >
          {/* TIER 1: CONFIGURATION DECK (Metadata) */}
          <motion.div layout className="h-9 bg-black/40 border-b border-white/5 flex items-center justify-between px-3">
            <div className="flex items-center gap-3">
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-full bg-transparent border-none text-[10px] font-mono text-zinc-400 hover:text-white transition-colors uppercase tracking-wider p-0 focus:ring-0 focus:ring-offset-0 w-auto gap-2 flex items-center">
                  <Cpu className="w-3.5 h-3.5 text-white" />
                  <SelectValue placeholder="Select Model" className="leading-none" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-white/10 text-white">
                  <div className="px-2 py-1.5 text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/5 mb-1">
                Priority Agents (Free)
              </div>
              <SelectItem value="openai/gpt-oss-120b:free" className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                GPT-OSS-120B (FREE)
              </SelectItem>
              <SelectItem value="nvidia/nemotron-3-nano-30b-a3b:free" className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                NEMOTRON-30B
              </SelectItem>
                  
                  <div className="px-2 py-1.5 text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/5 my-1">
                    Gemini Intelligence Stack
                  </div>
                  <SelectItem value="gemini-2.5-flash-lite" className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                    GEMINI-2.5-FLASH-LITE
                  </SelectItem>
                  <SelectItem value="gemini-3.0-flash-preview" className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                    GEMINI-3.0-FLASH-PREVIEW
                  </SelectItem>
                  <SelectItem value="gemini-3.0-pro-preview" className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                    GEMINI-3.0-PRO-IMAGE-PREVIEW
                  </SelectItem>
                  
                  <div className="px-2 py-1.5 text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/5 my-1">
                    Perplexity (Paid)
                  </div>
                  <SelectItem value="sonar-pro" className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                    SONAR-PRO
                  </SelectItem>
                  <SelectItem value="sonar" className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                    SONAR-STANDARD
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
              <span className="text-[10px] font-mono text-emerald-500/80 uppercase tracking-tighter leading-none">
                {contextInfo.displayLabel}
              </span>
            </div>
          </motion.div>

          {/* TIER 2: INPUT DECK (Action) */}
          <motion.div 
            layout
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="flex items-end gap-2 p-2 relative min-h-[44px]"
          >
            <div className="relative flex-1">
              <textarea 
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 font-medium resize-none py-3 pl-2 max-h-[112px] min-h-[44px] custom-scrollbar"
                style={{ height: '44px' }}
                placeholder="Input forensic command..."
                rows={1}
              />
            </div>
            
            <div className="flex items-center gap-1 pb-1.5 pr-1">
              <button 
                type="button"
                onMouseDown={() => setIsListening(true)}
                onMouseUp={() => setIsListening(false)}
                className={cn(
                  "icon-button-forensic p-2 flex items-center justify-center",
                  isListening ? "text-red-500 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.3)]" : ""
                )}
              >
                <Mic className="w-4 h-4" />
              </button>

              <button 
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-[#002FA7] hover:bg-blue-600 text-white p-2.5 rounded-xl shadow-[0_0_15px_-3px_rgba(0,47,167,0.5)] transition-all active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed border border-[#002FA7]/30"
              >
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </motion.div>
        </motion.form>
        
        <div className="text-center mt-3">
          <span className="text-[9px] text-zinc-700 font-mono uppercase tracking-[0.2em]">Nodal Point Neural Engine v1.3.0</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
