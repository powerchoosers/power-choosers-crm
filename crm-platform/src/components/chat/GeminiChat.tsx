'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Copy, Send, X, Loader2, User, Bot, Mic, Activity } from 'lucide-react'
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
  componentData?: any
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

function ComponentRenderer({ type, data }: { type: string, data: any }) {
  switch (type) {
    case 'news_ticker':
      return (
        <div className="flex flex-col gap-2 w-full overflow-hidden">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Market_Volatility_Feed</span>
            <Activity size={10} className="text-emerald-500" />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {data.items?.map((item: any, i: number) => (
              <div key={i} className="min-w-[200px] p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-1 hover:bg-white/10 transition-colors">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-400">{item.source || 'ERCOT'}</span>
                  <span className={cn(item.trend === 'up' ? "text-red-400" : "text-emerald-400")}>
                    {item.trend === 'up' ? '▲' : '▼'} {item.volatility || '2.4%'}
                  </span>
                </div>
                <p className="text-xs font-medium text-zinc-100 line-clamp-2 leading-snug">
                  {item.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )
    case 'mini_profile':
      return (
        <div className="grid grid-cols-1 gap-2 w-full">
          {data.profiles?.map((profile: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold border border-white/5 group-hover:border-indigo-500/50 transition-colors">
                {profile.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-zinc-100 truncate">{profile.name}</h4>
                <p className="text-[10px] text-zinc-500 font-mono truncate uppercase">{profile.company || profile.title}</p>
              </div>
              <Button size="sm" className="h-8 px-3 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-bold uppercase tracking-tighter">
                Inject_Node
              </Button>
            </div>
          ))}
        </div>
      )
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
  
  // Host Google Avatar if needed
  useEffect(() => {
    const hostAvatar = async () => {
      const photoURL = user?.photoURL || profile?.photoURL
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
  }, [isOpen, user?.photoURL, profile?.photoURL])

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: input }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: updatedMessages,
          context: contextInfo,
          userProfile: profile
        })
      })

      const data = await response.json()
      if (data.error) throw new Error(data.message || data.error)

      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch (err: any) {
      console.error('Chat error:', err)
      setError(err.message || 'Internal server error')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
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
      className="absolute top-12 left-0 right-0 mt-2 mx-2 flex flex-col h-[500px] rounded-2xl bg-zinc-950/20 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden z-50"
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
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 overflow-y-auto relative z-10" ref={scrollRef}>
        <div className="space-y-6">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden",
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
              <div className={cn(
                "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                m.role === 'user' 
                  ? "bg-indigo-600 text-white shadow-[0_0_20px_-5px_rgba(79,70,229,0.4)]" 
                  : "bg-zinc-900/40 text-zinc-200 border border-white/5 backdrop-blur-md"
              )}>
                <div className={cn(m.role === 'assistant' && "font-light tracking-wide flex flex-col gap-4")}>
                  {m.content.split('JSON_DATA:').map((part, index) => {
                    if (index === 0) return <span key={index}>{part}</span>
                    try {
                      const data = JSON.parse(part.split('END_JSON')[0])
                      return <ComponentRenderer key={index} type={data.type} data={data.data} />
                    } catch (e) {
                      return <span key={index}>[Structured Data Error]</span>
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
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-center">
                <Loader2 size={14} className="text-indigo-400 animate-spin" />
              </div>
              <div className="bg-zinc-900/20 text-zinc-400 p-4 rounded-2xl text-sm border border-white/5 backdrop-blur-sm font-mono italic">
                Processing_Query...
              </div>
            </div>
          )}
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
