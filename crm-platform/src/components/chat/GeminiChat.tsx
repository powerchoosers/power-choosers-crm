'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Copy, Send, X, Loader2, User, Bot, Mic, Activity, AlertTriangle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, AnimatePresence } from 'framer-motion'
import { useGeminiStore } from '@/store/geminiStore'
import { usePathname, useParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

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
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-white/10 text-zinc-400 font-bold text-lg shrink-0">
              {dossier.initials || dossier.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm tracking-tight truncate">{dossier.name}</h3>
              <p className="text-zinc-400 text-xs truncate">{dossier.title} • {dossier.company}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse shrink-0", dossier.contractStatus === 'active' ? 'bg-emerald-500' : 'bg-red-500')} />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate">{dossier.contractStatus}</span>
                {dossier.energyMaturity && (
                  <span className="text-[10px] font-mono text-indigo-400 ml-2 uppercase tracking-tighter">Maturity: {dossier.energyMaturity}</span>
                )}
              </div>
            </div>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] uppercase tracking-widest border border-indigo-400/30 shadow-[0_0_15px_rgba(79,70,229,0.4)] h-8">
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
                {grid.rows.map((row: any, i: number) => (
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
    case 'data_void': {
      if (!isRecord(data)) return null
      const voidData = data as unknown as DataVoid
      return (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/10 flex items-center gap-4 w-full">
          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
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
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold border border-white/5 group-hover:border-indigo-500/50 transition-colors shrink-0">
                {profile.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <h4 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">{profile.name}</h4>
                <p className="text-[9px] sm:text-[10px] text-zinc-500 font-mono truncate uppercase tracking-tighter">{profile.company || profile.title}</p>
              </div>
              <Button size="sm" className="h-7 sm:h-8 px-2 sm:px-3 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all text-[9px] sm:text-[10px] font-bold uppercase tracking-tighter shrink-0">
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
        "w-8 h-8 inline-flex items-center justify-center rounded-full transition-all duration-200",
        isOpen 
          ? "bg-white/10 text-white shadow-lg" 
          : "text-zinc-400 hover:text-white hover:bg-white/10"
      )}
      title={isOpen ? "Close Gemini" : "Chat with Gemini"}
    >
      {isOpen ? <X size={18} /> : <Activity size={18} />}
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

  // Contextual Intel Logic
  const contextInfo = useMemo(() => {
    if (pathname.includes('/people/')) return { type: 'contact', id: params.id }
    if (pathname.includes('/accounts/')) return { type: 'account', id: params.id }
    if (pathname.includes('/dashboard')) return { type: 'dashboard' }
    return { type: 'general' }
  }, [pathname, params])

  const [messages, setMessages] = useState<Message[]>([])
  const [lastProvider, setLastProvider] = useState<string>('gemini')
  const [lastModel, setLastModel] = useState<string>('gemini-2.5-flash-lite')
  
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

  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

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
    const updatedMessages = [...messages, userMessage]
    
    // Ensure history starts with a user message and is trimmed to last 10 for performance
    const firstUserIndex = updatedMessages.findIndex((m) => m.role === 'user')
    const relevantHistory = firstUserIndex > 0 ? updatedMessages.slice(firstUserIndex) : updatedMessages
    const messagesForApi = relevantHistory.slice(-10)

    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messagesForApi,
          context: contextInfo,
          userProfile: {
            firstName: profile?.firstName || 'Trey'
          }
        })
      })

      const data = await response.json()
      if (data.error) throw new Error(data.message || data.error)

      setLastProvider(typeof data.provider === 'string' ? data.provider : 'gemini')
      setLastModel(typeof data.model === 'string' ? data.model : '')

      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch (err: unknown) {
      console.error('Chat error:', err)
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
      initial={{ opacity: 0, y: 4, scaleY: 0.98 }}
      animate={{ opacity: 1, y: 0, scaleY: 1 }}
      exit={{ opacity: 0, y: 4, scaleY: 0.98, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, delay: 0.05 }}
      style={{ transformOrigin: 'top' }}
      className="absolute top-12 right-2 w-[calc(100%-1rem)] max-w-[420px] flex flex-col h-[500px] max-h-[calc(100vh-8rem)] rounded-2xl bg-zinc-950/40 backdrop-blur-3xl border border-white/10 shadow-2xl overflow-hidden z-50"
    >
      {/* Nodal Point Glass Highlight */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#002FA7]/5 via-transparent to-white/5 pointer-events-none" />
      
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-900/10 relative z-10">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center relative z-10 overflow-hidden">
              <Activity size={16} className="text-indigo-400" />
            </div>
            {/* Ambient Hum Animation */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 bg-indigo-500/20 rounded-full blur-md"
            />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-100 tracking-tighter uppercase">Nodal Architect v1.0</h3>
            <div className="flex items-center gap-2">
              <Waveform />
              <span className="text-[10px] text-emerald-500/80 font-mono tracking-widest uppercase font-bold">Live_Feed</span>
              {lastModel && (
                <span
                  className="text-[10px] text-zinc-400/90 font-mono tabular-nums tracking-tight"
                  title={`${lastProvider}:${lastModel}`}
                >
                  {lastProvider === 'gemini' ? lastModel : `${lastProvider}:${lastModel}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 w-full overflow-hidden relative z-10" ref={scrollRef}>
        <div className="p-4 space-y-6 min-w-0 w-full max-w-full overflow-x-hidden flex flex-col">
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
                {/* Avatar Container */}
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden mt-1",
                  m.role === 'user' ? "bg-zinc-800" : "bg-indigo-950/30 border border-indigo-500/20"
                )}>
                  {m.role === 'user' ? (
                    isAvatarLoading || hostedAvatarUrl ? (
                      <ImageWithSkeleton 
                        src={hostedAvatarUrl} 
                        isLoading={isAvatarLoading} 
                        alt="User" 
                        className="w-full h-full" 
                      />
                    ) : (
                      <User size={14} />
                    )
                  ) : (
                    <Bot size={14} className="text-indigo-400" />
                  )}
                </div>

                {/* Message Bubble */}
                <div className={cn(
                  "min-w-0 p-4 rounded-2xl text-sm leading-relaxed relative",
                  m.role === 'user' 
                    ? "w-fit bg-indigo-600 text-white shadow-[0_0_20px_-5px_rgba(79,70,229,0.4)] max-w-[80%]" 
                    : "w-full bg-zinc-900/40 text-zinc-200 border border-white/5 backdrop-blur-md max-w-[calc(100%-2.5rem)]"
                )}>
                  <div className={cn(
                    "flex flex-col gap-4 w-full min-w-0 max-w-full overflow-hidden",
                    m.role === 'assistant' && "font-light tracking-wide"
                  )}>
                    {m.content.split('JSON_DATA:').map((part, index) => {
                      if (index === 0) {
                        const text = part.trim()
                        if (!text) return null
                        return (
                          <div key={index} className="whitespace-pre-wrap break-words [word-break:break-word] [overflow-wrap:anywhere] max-w-full">
                            {text}
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
                              <div className="whitespace-pre-wrap break-words [word-break:break-word] [overflow-wrap:anywhere] max-w-full">
                                {trailingText}
                              </div>
                            )}
                          </div>
                        )
                      } catch (e) {
                        return <div key={index} className="text-[10px] text-red-400 font-mono p-2 bg-red-500/10 rounded">[System_Error: Data_Corruption]</div>
                      }
                    })}
                  </div>
                  {m.role === 'assistant' && i === messages.length - 1 && error && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
                      <p className="text-[10px] text-red-400 font-mono leading-tight flex-1">
                        {error}
                      </p>
                      <button 
                        onClick={copyDebugInfo}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        title="Copy Prompt for Backend Dev"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-center">
                <Loader2 size={14} className="text-indigo-400 animate-spin" />
              </div>
              <div className="bg-zinc-900/20 text-zinc-400 p-4 rounded-2xl text-sm border border-white/5 backdrop-blur-sm font-mono italic flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">&gt; PARSING_INTENT... [||||||]</span>
                <span className="text-zinc-300">Processing query against Nodal Point neural network...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-white/5 bg-zinc-950/40 relative z-10">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="relative flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query System..."
              className="bg-zinc-950/50 border-white/10 focus-visible:ring-indigo-500/50 pr-10 h-11 font-mono text-sm tracking-tight placeholder:text-zinc-600"
            />
            <Button 
              type="button"
              onMouseDown={() => setIsListening(true)}
              onMouseUp={() => setIsListening(false)}
              className={cn(
                "absolute right-2 top-1.5 h-8 w-8 rounded-lg transition-all",
                isListening ? "bg-red-500 text-white scale-110 shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Mic size={16} />
            </Button>
          </div>
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="h-11 px-4 bg-white text-zinc-950 hover:bg-zinc-200 font-bold tracking-tighter uppercase text-xs"
          >
            Execute
          </Button>
        </form>
      </div>
    </motion.div>
  )
}
