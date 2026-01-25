'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, X, Loader2, User, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, AnimatePresence } from 'framer-motion'
import { useGeminiStore } from '@/store/geminiStore'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function GeminiChatTrigger(props: { onToggle?: () => void }) {
  const isOpen = useGeminiStore((state) => state.isOpen)
  const toggleChat = useGeminiStore((state) => state.toggleChat)

  return (
    <Button
      onClick={() => {
        props.onToggle?.()
        toggleChat()
      }}
      className={cn(
        "w-8 h-8 p-0 rounded-full transition-all duration-200",
        isOpen ? "bg-indigo-600 text-white shadow-lg scale-110" : "text-zinc-400 hover:text-white hover:bg-white/10"
      )}
      title="Chat with Gemini"
    >
      <Sparkles size={18} className={isOpen ? "animate-pulse" : ""} />
    </Button>
  )
}

export function GeminiChatPanel() {
  const setIsOpen = useGeminiStore((state) => state.setIsOpen)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am Gemini, your CRM assistant. How can I help you today? I can search contacts, update info, and more.' }
  ])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
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
        body: JSON.stringify({ messages: updatedMessages })
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
      className="absolute top-12 left-0 right-0 mt-2 mx-2 flex flex-col h-[500px] rounded-2xl bg-zinc-900/40 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden z-50"
    >
      {/* Nodal Point Glass Highlight */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#002FA7]/10 via-transparent to-white/5 pointer-events-none" />
      
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/50 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-100">Gemini Assistant</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">System Online</span>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white">
          <X size={18} />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 overflow-y-auto relative z-10" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                m.role === 'user' ? "bg-zinc-800" : "bg-indigo-900/50 border border-indigo-500/30"
              )}>
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} className="text-indigo-400" />}
              </div>
              <div className={cn(
                "max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed",
                m.role === 'user' 
                  ? "bg-indigo-600 text-white rounded-tr-none" 
                  : "bg-zinc-900 text-zinc-200 border border-white/5 rounded-tl-none"
              )}>
                {m.content}
                {m.role === 'assistant' && i === messages.length - 1 && error && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-2">
                    <p className="text-[10px] text-red-400 font-mono leading-tight">
                      {error}
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={copyDebugInfo}
                      className="h-7 text-[10px] bg-zinc-950/50 border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white transition-all w-fit gap-1.5"
                    >
                      <Sparkles size={10} />
                      Copy Prompt for Backend Dev
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-900/50 border border-indigo-500/30 flex items-center justify-center">
                <Loader2 size={14} className="text-indigo-400 animate-spin" />
              </div>
              <div className="bg-zinc-900 text-zinc-400 p-3 rounded-2xl rounded-tl-none text-sm border border-white/5">
                Thinking...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-zinc-900/30 relative z-10">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="relative flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Gemini..."
            className="bg-zinc-950 border-white/10 focus-visible:ring-indigo-500 pr-10 h-10"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={isLoading || !input.trim()}
            className="absolute right-1 top-1 h-8 w-8 bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </motion.div>
  )
}
