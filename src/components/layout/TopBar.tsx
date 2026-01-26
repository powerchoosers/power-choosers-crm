'use client'

import { useCallStore } from '@/store/callStore'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { Phone, Mic, PhoneOff, ArrowRightLeft, FileText, RefreshCw, Bell, X, ShieldCheck, History, Plus } from 'lucide-react'
import { cn, formatToE164 } from '@/lib/utils'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useEffect, useState, useRef, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useVoice } from '@/context/VoiceContext'
import { toast } from 'sonner'
import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GeminiChatTrigger, GeminiChatPanel } from '@/components/chat/GeminiChat'
import { useGeminiStore } from '@/store/geminiStore'

export function TopBar() {
  const { 
    isActive, 
    status, 
    setActive, 
    setStatus, 
    phoneNumber, 
    setPhoneNumber, 
    metadata: storeMetadata,
    setMetadata: setStoreMetadata,
    callTriggered,
    clearCallTrigger
  } = useCallStore()
  const isGeminiOpen = useGeminiStore((state) => state.isOpen)
  const setIsGeminiOpen = useGeminiStore((state) => state.setIsOpen)
  const { profile } = useAuth()
  const { connect, disconnect, mute, isMuted, metadata: voiceMetadata } = useVoice()
  const pathname = usePathname()
  const params = useParams()
  
  const isHistoryOpen = useGeminiStore((state) => state.isHistoryOpen)
  const toggleHistory = useGeminiStore((state) => state.toggleHistory)
  const resetSession = useGeminiStore((state) => state.resetSession)
  const storeContext = useGeminiStore((state) => state.activeContext)

  // Use voiceMetadata if active, otherwise use storeMetadata if it exists (for dialer display)
  const displayMetadata = isActive ? voiceMetadata : storeMetadata

  // Contextual Intel Logic
  const contextInfo = useMemo(() => {
    let baseContext;
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

    // Clean label for prefixing
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

  const [isDialerOpen, setIsDialerOpen] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const durationInterval = useRef<NodeJS.Timeout | null>(null)
  const callStartRef = useRef<number | null>(null)

  const selectedNumber = profile.selectedPhoneNumber || (profile.twilioNumbers && profile.twilioNumbers.length > 0 ? profile.twilioNumbers[0].number : null)
  const selectedNumberName = profile.twilioNumbers?.find(n => n.number === selectedNumber)?.name || "Default"

  // Handle cross-component call triggers
  useEffect(() => {
    if (callTriggered && phoneNumber) {
      handleCall()
      clearCallTrigger()
    }
  }, [callTriggered, phoneNumber])

  // Track call duration
  useEffect(() => {
    if (status === 'connected') {
      callStartRef.current = Date.now()
      if (durationInterval.current) clearInterval(durationInterval.current)
      durationInterval.current = setInterval(() => {
        if (callStartRef.current) {
          setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000))
        }
      }, 1000)
    } else {
      if (durationInterval.current) clearInterval(durationInterval.current)
      callStartRef.current = null
    }
    return () => {
      if (durationInterval.current) clearInterval(durationInterval.current)
    }
  }, [status])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    // Show toast on mount as a replacement for the "System Ready" indicator
    toast.success("System Ready", {
        description: "Connected to Nodal Point Network",
        className: "bg-zinc-900 border-white/10 text-white",
        duration: 4000,
    })
  }, [])

  // Focus input when dialer opens
  useEffect(() => {
    if (isDialerOpen) {
        // Small delay to allow animation to start/finish
        setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isDialerOpen])

  const handleRefresh = () => {
    toast.info("Refreshing Data...")
    // In a real app, this would invalidate React Query queries
    setTimeout(() => toast.success("Data Synced"), 1000)
  }

  const formatPhoneNumber = (value: string) => {
    let digits = value.replace(/\D/g, '')
    
    // Handle country code: If it starts with 1, strip it (it's the +1 we added)
    // US Area codes cannot start with 1, so a leading 1 is always the country code
    if (digits.startsWith('1')) {
        digits = digits.substring(1)
    }

    if (digits.length === 0) return ''
    
    // Limit to 10 digits (US standard)
    digits = digits.slice(0, 10)
    
    // US Format: +1 (XXX)-XXX-XXXX
    let formatted = '+1'
    if (digits.length > 0) {
      formatted += ' (' + digits.slice(0, 3)
    }
    if (digits.length >= 4) {
      formatted += ')-' + digits.slice(3, 6)
    }
    if (digits.length >= 7) {
      formatted += '-' + digits.slice(6, 10)
    }
    return formatted
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value
    // Handle clearing
    if (inputVal === '') {
      setPhoneNumber('')
      return
    }
    setPhoneNumber(formatPhoneNumber(inputVal))
  }

  const handleDialerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCall()
    }
    if (e.key === 'Escape') {
      setIsDialerOpen(false)
    }
  }

  const handleCall = async () => {
    if (phoneNumber.length < 10) {
        toast.error("Invalid Phone Number")
        return
    }

    if (!selectedNumber) {
        toast.error("No Caller ID selected", {
            description: "Please select a phone number in Settings."
        })
        return
    }

    setIsDialerOpen(false)
    
    // Normalize phone numbers for Twilio (E.164 format)
    const to = formatToE164(phoneNumber)
    // For From, we use the selectedNumber directly if it's already in E.164 or format it
    const from = formatToE164(selectedNumber || '')

    await connect({ To: to, From: from, metadata: storeMetadata || undefined })
  }

  const handleHangup = () => {
    disconnect()
    setActive(false)
    setStatus('ended')
    setPhoneNumber('')
    setStoreMetadata(null)
  }

  return (
    // Updated positioning: constrained to match main content area
    <header className="fixed top-0 left-16 right-0 lg:right-80 z-40 flex items-start justify-center p-6 pointer-events-none nodal-glass !border-none !shadow-none">
      <div className="w-full max-w-5xl flex items-center gap-4 pointer-events-auto">
          {/* Left Side: Search or Active Call */}
          <motion.div 
              className="flex-1 min-w-0"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
              <AnimatePresence mode="wait">
              {!isActive ? (
                  <motion.div
                      key="search"
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      className="w-full"
                  >
                      <GlobalSearch />
                  </motion.div>
              ) : (
                    <motion.div
                        key="active-call"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex justify-center"
                    >
                        <div className="w-full max-w-2xl h-[50px] nodal-glass border-signal/50 rounded-full shadow-[0_10px_30px_-10px_rgba(0,47,167,0.5)] flex items-center justify-between px-6">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5 overflow-hidden">
                                    {displayMetadata?.logoUrl ? (
                                        <img src={displayMetadata.logoUrl} alt={displayMetadata.name || "Caller"} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-zinc-400 font-mono text-[10px]">ID</span>
                                    )}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-white">{displayMetadata?.name || phoneNumber || "Unknown Caller"}</div>
                                    <div className="text-xs text-signal font-mono uppercase tracking-tighter flex items-center gap-2">
                                        {status === 'dialing' ? 'Dialing...' : formatDuration(callDuration)}
                                        {selectedNumberName && (
                                            <span className="text-[10px] text-zinc-500 lowercase">via {selectedNumberName}</span>
                                        )}
                                    </div>
                                    {displayMetadata?.account && (
                                        <div className="text-[10px] text-zinc-500 truncate max-w-[150px]">
                                            {displayMetadata.account}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => mute(!isMuted)}
                                    className={cn(
                                        "p-1.5 rounded-full transition-colors",
                                        isMuted ? "bg-red-500/20 text-red-500" : "hover:bg-zinc-800 text-zinc-400 hover:text-white"
                                    )}
                                >
                                    <Mic size={16} />
                                </button>
                                <button className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                                    <ArrowRightLeft size={16} />
                                </button>
                                <button 
                                    onClick={handleHangup}
                                    className="p-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                >
                                    <PhoneOff size={16} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>
            </motion.div>

            {/* Right Actions / Dialer Widget */}
            <motion.div 
                initial={false}
                animate={{ 
                    width: (isDialerOpen || isGeminiOpen) ? 400 : 172,
                    borderRadius: 24,
                }}
                transition={{ 
                    type: "spring",
                    stiffness: 320,
                    damping: 35,
                    mass: 0.8
                }}
                className="glass-panel shadow-lg overflow-visible flex flex-col relative h-12"
            >
                {/* Left Side Buttons - Absolute to prevent vertical jumps */}
                    <div className="absolute left-2 top-0 h-12 flex items-center gap-1 pointer-events-auto leading-none">
                        <AnimatePresence>
                          {isGeminiOpen && (
                            <motion.div
                              key="gemini-header-actions"
                              initial={{ opacity: 0, x: -20, filter: 'blur(4px)' }}
                              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                              exit={{ opacity: 0, x: -20, filter: 'blur(4px)' }}
                              className="flex items-center ml-2"
                            >
                              {/* Target Badge (Global Scope) */}
                              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/20 backdrop-blur-md">
                                <div className={cn(
                                  "w-1.5 h-1.5 rounded-full animate-pulse",
                                  (!contextInfo || contextInfo.type === 'general') ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-[#002FA7] shadow-[0_0_8px_#002FA7]"
                                )} />
                                <span className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase whitespace-nowrap">
                                  {contextInfo.displayLabel}
                                </span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                    </div>

                    {/* Right Side Buttons - Pinned Absolute */}
                    <div className="absolute right-2 top-0 h-12 flex items-center gap-1 pointer-events-auto leading-none">
                        {/* Gemini Trigger (Bot/X icon) */}
                        <GeminiChatTrigger
                          onToggle={() => {
                            if (!isGeminiOpen) setIsDialerOpen(false)
                          }}
                        />
                        
                        {/* Refresh Data */}
                        <button 
                            onClick={handleRefresh}
                            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Refresh Data"
                        >
                            <RefreshCw size={22} />
                        </button>

                        <button 
                            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors relative"
                            title="Notifications"
                        >
                            <Bell size={22} />
                            <span className="absolute top-2 right-2.5 w-2 h-2 bg-signal rounded-full border border-zinc-900" />
                        </button>
                        
                        {/* Manual Dialer Trigger */}
                        {!isActive && (
                            <button 
                                onClick={() => {
                                  const nextOpen = !isDialerOpen
                                  if (nextOpen) setIsGeminiOpen(false)
                                  setIsDialerOpen(nextOpen)
                                }}
                                className={cn(
                                    "w-9 h-9 inline-flex items-center justify-center rounded-full transition-colors duration-200 relative overflow-hidden",
                                    isDialerOpen ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/10"
                                )}
                                title={isDialerOpen ? "Close Dialer" : "Open Dialer"}
                            >
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={isDialerOpen ? "close" : "phone"}
                                        initial={{ opacity: 0, scale: 0.5, rotate: isDialerOpen ? -90 : 90 }}
                                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                        exit={{ opacity: 0, scale: 0.5, rotate: isDialerOpen ? 90 : -90 }}
                                        transition={{ duration: 0.2, ease: "easeInOut" }}
                                        className="flex items-center justify-center"
                                    >
                                        {isDialerOpen ? <X size={22} /> : <Phone size={22} />}
                                    </motion.div>
                                </AnimatePresence>
                            </button>
                        )}
                    </div>

                {/* Expanded Content: Dialer or Gemini */}
                <AnimatePresence>
                    {isDialerOpen && (
                        <motion.div
                            key="dialer-panel"
                            initial={{ opacity: 0, y: 4, scaleY: 0.98 }}
                            animate={{ opacity: 1, y: 0, scaleY: 1 }}
                            exit={{ opacity: 0, y: 4, scaleY: 0.98, transition: { duration: 0.12 } }}
                            transition={{ duration: 0.18, delay: 0.05 }}
                            style={{ transformOrigin: 'top' }}
                            className="absolute top-12 left-0 right-0 mt-2 mx-2 flex flex-col gap-4 rounded-2xl bg-zinc-950/80 backdrop-blur-3xl border border-white/10 shadow-2xl p-4 overflow-hidden"
                        >
                            {/* Nodal Point Glass Highlight */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-[#002FA7]/5 via-transparent to-white/5 pointer-events-none" />
                            
                            <div className="flex items-center justify-between px-1 relative z-10">
                                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-semibold">Uplink // Manual_Dial</span>
                                {storeMetadata?.name && (
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#002FA7]/10 border border-[#002FA7]/20">
                                        <div className="w-1 h-1 rounded-full bg-signal animate-pulse" />
                                        <span className="text-[9px] font-mono text-signal uppercase tracking-wider truncate max-w-[120px]">
                                            {storeMetadata.name}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 flex items-center min-w-0 bg-zinc-950/50 border border-white/10 rounded-xl relative z-10 px-3">
                                <div className="w-8 h-8 flex items-center justify-center text-zinc-500">
                                    <Phone size={18} />
                                </div>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={phoneNumber}
                                    onChange={handlePhoneChange}
                                    onKeyDown={handleDialerKeyDown}
                                    placeholder="Dial external..."
                                    className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-zinc-500 text-sm font-mono tracking-wide h-12"
                                />
                            </div>
                            <Button 
                                onClick={handleCall}
                                className="w-full bg-[#002FA7] hover:bg-blue-600 text-white font-mono text-xs uppercase tracking-widest h-10 rounded-xl shadow-[0_0_20px_rgba(0,47,167,0.4)] hover:shadow-[0_0_30px_rgba(0,47,167,0.6)] border border-blue-400/30 relative z-10 transition-all active:scale-95"
                            >
                                Execute Call
                            </Button>
                        </motion.div>
                    )}
                    {isGeminiOpen && (
                        <GeminiChatPanel />
                    )}
                </AnimatePresence>
            </motion.div>
          </div>
        </header>
    )
}
