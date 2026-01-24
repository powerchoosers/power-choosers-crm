'use client'

import { useCallStore } from '@/store/callStore'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { Phone, Mic, PhoneOff, ArrowRightLeft, FileText, RefreshCw, Bell, X, ShieldCheck } from 'lucide-react'
import { cn, formatToE164 } from '@/lib/utils'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useVoice } from '@/context/VoiceContext'
import { toast } from 'sonner'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function TopBar() {
  const { isActive, status, setActive, setStatus } = useCallStore()
  const { profile } = useAuth()
  const { connect, disconnect, mute, isMuted, metadata } = useVoice()
  const pathname = usePathname()
  
  const [isDialerOpen, setIsDialerOpen] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [callDuration, setCallDuration] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const durationInterval = useRef<NodeJS.Timeout | null>(null)

  const selectedNumber = profile.selectedPhoneNumber || (profile.twilioNumbers && profile.twilioNumbers.length > 0 ? profile.twilioNumbers[0].number : null)
  const selectedNumberName = profile.twilioNumbers?.find(n => n.number === selectedNumber)?.name || "Default"

  // Track call duration
  useEffect(() => {
    if (status === 'connected') {
      setCallDuration(0)
      durationInterval.current = setInterval(() => {
        setCallDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (durationInterval.current) clearInterval(durationInterval.current)
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

    await connect({ To: to, From: from })
  }

  const handleHangup = () => {
    disconnect()
    setActive(false)
    setStatus('ended')
    setPhoneNumber('')
  }

  return (
    // Updated positioning: constrained to match main content area
    <div className="fixed top-0 left-16 right-0 lg:right-80 z-40 flex items-start justify-center p-6 pointer-events-none">
      <LayoutGroup>
        <div className="w-full max-w-5xl flex items-start gap-4 pointer-events-auto">
            {/* Left Side: Search or Active Call */}
            <motion.div 
                layout 
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
                        <div className="w-full max-w-2xl h-[50px] bg-zinc-900/90 backdrop-blur-xl border border-signal/50 rounded-full shadow-[0_10px_30px_-10px_rgba(0,47,167,0.5)] flex items-center justify-between px-6">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5 overflow-hidden">
                                    {metadata?.logoUrl ? (
                                        <img src={metadata.logoUrl} alt={metadata.name || "Caller"} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-zinc-400 font-mono text-[10px]">ID</span>
                                    )}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-white">{metadata?.name || phoneNumber || "Unknown Caller"}</div>
                                    <div className="text-xs text-signal font-mono uppercase tracking-tighter flex items-center gap-2">
                                        {status === 'dialing' ? 'Dialing...' : formatDuration(callDuration)}
                                        {selectedNumberName && (
                                            <span className="text-[10px] text-zinc-500 lowercase">via {selectedNumberName}</span>
                                        )}
                                    </div>
                                    {metadata?.account && (
                                        <div className="text-[10px] text-zinc-500 truncate max-w-[150px]">
                                            {metadata.account}
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
                layout
                initial={false}
                animate={{ 
                    width: isDialerOpen ? 320 : 172, // Explicit width matches content (4 icons + gaps)
                    height: isDialerOpen ? 200 : 48,
                    borderRadius: 24,
                    padding: isDialerOpen ? 16 : 6
                }}
                transition={{ 
                    type: "spring", 
                    stiffness: 300, 
                    damping: 30
                }}
                className="bg-zinc-900/70 backdrop-blur-xl border border-white/10 shadow-lg overflow-hidden flex flex-col origin-top-right relative"
            >
                <motion.div layout="position" className="flex items-center justify-between gap-2 w-full min-h-[36px]">
                    <AnimatePresence>
                        {isDialerOpen && selectedNumber && (
                            <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-1.5 text-[10px] text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5"
                            >
                                <ShieldCheck size={10} className="text-signal" />
                                <span>From: {selectedNumberName}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex items-center gap-2 ml-auto">
                        <Link 
                            href="/crm-platform/scripts"
                            className={cn(
                                "p-2 rounded-full transition-all duration-200",
                                pathname === '/crm-platform/scripts' 
                                    ? "bg-white text-black shadow-sm" 
                                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                            )}
                            title="Phone Scripts"
                        >
                            <FileText size={18} />
                        </Link>
                        
                        <button 
                            onClick={handleRefresh}
                            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Refresh Data"
                        >
                            <RefreshCw size={18} />
                        </button>

                        <button 
                            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors relative"
                            title="Notifications"
                        >
                            <Bell size={18} />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-signal rounded-full border border-zinc-900" />
                        </button>
                        
                        {/* Manual Dialer Trigger */}
                        {!isActive && (
                            <button 
                                onClick={() => setIsDialerOpen(!isDialerOpen)}
                                className={cn(
                                    "p-2 rounded-full transition-all duration-300",
                                    isDialerOpen ? "bg-white/10 text-white rotate-90" : "text-zinc-400 hover:text-white hover:bg-white/10 rotate-0"
                                )}
                                title={isDialerOpen ? "Close Dialer" : "Open Dialer"}
                            >
                                {isDialerOpen ? <X size={18} /> : <Phone size={18} />}
                            </button>
                        )}
                    </div>
                </motion.div>

                {/* Expanded Dialer Content */}
                <AnimatePresence>
                    {isDialerOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10, transition: { duration: 0.1 } }}
                            transition={{ duration: 0.2, delay: 0.1 }}
                            className="flex flex-col gap-3 pt-4 absolute top-12 left-4 right-4"
                        >
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Manual Dial</span>
                                {selectedNumber && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                        <ShieldCheck size={10} className="text-[#002FA7]" />
                                        <span>Using: {selectedNumberName}</span>
                                    </div>
                                )}
                            </div>
                            <Input 
                                ref={inputRef}
                                value={phoneNumber}
                                onChange={handlePhoneChange}
                                placeholder="+1 (555) 000-0000"
                                className="bg-black/20 border-white/10 text-lg tracking-wider font-mono h-12"
                            />
                            <Button 
                                onClick={handleCall}
                                className="w-full bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-medium h-10 rounded-xl shadow-lg shadow-blue-900/20"
                            >
                                Call Now
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
      </LayoutGroup>
    </div>
  )
}
