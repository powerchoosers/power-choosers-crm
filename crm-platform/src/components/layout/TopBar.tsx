'use client'

import { useCallStore } from '@/store/callStore'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Mic, PhoneOff, Grid3X3, RefreshCw, Bell, X, Shield, Search, Zap } from 'lucide-react'
import { cn, formatToE164 } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useVoice } from '@/context/VoiceContext'
import { toast } from 'sonner'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { usePathname, useParams } from 'next/navigation'
import { GeminiChatTrigger, GeminiChatPanel } from '@/components/chat/GeminiChat'
import { useGeminiStore } from '@/store/geminiStore'
import { useMarketPulse } from '@/hooks/useMarketPulse'
import { ActiveCallInterface } from '@/components/calls/ActiveCallInterface'

function getDaysUntilJune() {
  const now = new Date();
  const currentYear = now.getFullYear();
  let juneFirst = new Date(currentYear, 5, 1); // June 1st

  if (now >= juneFirst && now < new Date(currentYear, 9, 1)) {
    return 0; // Already in season
  }

  if (now >= new Date(currentYear, 9, 1)) {
    juneFirst = new Date(currentYear + 1, 5, 1);
  }

  const diffTime = juneFirst.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

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
    clearCallTrigger,
    isCallHUDOpen,
    setIsCallHUDOpen
  } = useCallStore()
  const isGeminiOpen = useGeminiStore((state) => state.isOpen)
  const setIsGeminiOpen = useGeminiStore((state) => state.setIsOpen)
  const { profile } = useAuth()
  const { connect, disconnect, mute, isMuted, sendDigits, metadata: voiceMetadata } = useVoice()
  const pathname = usePathname()
  const params = useParams()

  const { data: marketPulse, isError: isMarketError } = useMarketPulse()
  const storeContext = useGeminiStore((state) => state.activeContext)

  // Operational Strategy Logic
  const marketStrategy = useMemo(() => {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const isSummer = month >= 6 && month <= 9;

    // Check for error state first
    if (isMarketError) {
      return {
        strategy: 'TELEMETRY_ERROR',
        statusColor: 'bg-rose-500',
        pulseColor: 'shadow-[0_0_8px_#f43f5e]',
        windowText: 'SYSTEM: ERROR IN READ'
      };
    }

    // Default strategy
    let strategy = 'ACCUMULATION';
    let statusColor = 'bg-emerald-500';
    let pulseColor = 'shadow-[0_0_8px_#10b981]';
    const daysUntilJune = getDaysUntilJune();
    let windowText = `4CP_WINDOW: INACTIVE (${daysUntilJune} DAYS)`;

    if (isSummer) {
      strategy = '4CP_DEFENSE';
      windowText = '4CP_WINDOW: ACTIVE (CRITICAL)';
      statusColor = 'bg-amber-500';
      pulseColor = 'shadow-[0_0_8px_#f59e0b]';

      // Check market conditions if data is available
      if (marketPulse) {
        const avgPrice = marketPulse.prices.houston;
        const scarcity = marketPulse.grid.scarcity_prob;

        if (avgPrice > 200 || scarcity > 20) {
          strategy = 'GRID_EMERGENCY';
          statusColor = 'bg-red-500';
          pulseColor = 'shadow-[0_0_8px_#ef4444]';
        } else if (avgPrice > 100 || scarcity > 10) {
          strategy = '4CP_ALERT';
        }
      }
    } else {
      if (marketPulse && marketPulse.prices.houston > 100) {
        strategy = 'VOLATILITY_HEDGE';
        statusColor = 'bg-amber-500';
        pulseColor = 'shadow-[0_0_8px_#f59e0b]';
      }
    }

    return { strategy, statusColor, pulseColor, windowText };
  }, [marketPulse, isMarketError])

  // Use voiceMetadata if active, otherwise use storeMetadata if it exists (for dialer display)
  const displayMetadata = isActive ? voiceMetadata : storeMetadata

  // Contextual Intel Logic
  const contextInfo = useMemo(() => {
    let baseContext;
    if (storeContext) {
      baseContext = storeContext;
    } else if (pathname?.includes('/people/')) {
      baseContext = { type: 'contact', id: params?.id, label: `CONTACT: ${String(params?.id || '').slice(0, 12)}` };
    } else if (pathname?.includes('/accounts/')) {
      baseContext = { type: 'account', id: params?.id, label: `ACCOUNT: ${String(params?.id || '').slice(0, 12)}` };
    } else if (pathname?.includes('/dashboard')) {
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

  const [isDialpadOpen, setIsDialpadOpen] = useState(false)
  const [isDialerOpen, setIsDialerOpen] = useState(false)
  const [isShowingCallBar, setIsShowingCallBar] = useState(true)
  const [isScrolled, setIsScrolled] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialpadContainerRef = useRef<HTMLDivElement>(null)

  const durationInterval = useRef<NodeJS.Timeout | null>(null)
  const callStartRef = useRef<number | null>(null)

  // Listen for scroll on the main content container (passive + rAF throttle for smooth scroll)
  useEffect(() => {
    const mainContainer = document.querySelector('main.np-scroll');
    if (!mainContainer) return;

    let rafId: number | null = null;
    let lastValue: boolean | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const value = mainContainer.scrollTop > 20;
        if (value !== lastValue) {
          lastValue = value;
          setIsScrolled(value);
        }
      });
    };

    mainContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      mainContainer.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const selectedNumber = profile.selectedPhoneNumber || (profile.twilioNumbers && profile.twilioNumbers.length > 0 ? profile.twilioNumbers[0].number : null)
  const selectedNumberName = profile.twilioNumbers?.find(n => n.number === selectedNumber)?.name || "Default"

  const handleCall = useCallback(async () => {
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
  }, [phoneNumber, selectedNumber, storeMetadata, connect])

  // Handle cross-component call triggers
  useEffect(() => {
    if (callTriggered && phoneNumber) {
      // Use setTimeout to avoid synchronous state updates in effect
      const timer = setTimeout(() => {
        handleCall()
        clearCallTrigger()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [callTriggered, phoneNumber, handleCall, clearCallTrigger])

  // Track call duration
  useEffect(() => {
    if (status === 'connected' || status === 'dialing') {
      setIsShowingCallBar(true)
    }

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

  // Close dialpad when clicking outside the button or popover
  useEffect(() => {
    if (!isDialpadOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dialpadContainerRef.current && !dialpadContainerRef.current.contains(e.target as Node)) {
        setIsDialpadOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDialpadOpen])

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

  const handleHangup = () => {
    disconnect()
    setActive(false)
    setStatus('ended')
    setPhoneNumber('')
    setStoreMetadata(null)
  }

  return (
    // Updated positioning: constrained to match main content area with "Frost Shield" scroll effect
    <header className={cn(
      "fixed top-0 left-[70px] right-0 lg:right-80 z-40 flex items-center justify-center h-24 pointer-events-none transition-all duration-300 ease-in-out",
      isScrolled
        ? "bg-zinc-950/80 backdrop-blur-xl border-b border-r border-white/5 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-saturate-150"
        : "bg-transparent border-b border-transparent"
    )}>
      <div className="w-full px-8 flex items-center justify-between gap-6 pointer-events-auto">
        {/* Operational Sentinel */}
        <div className="flex items-center gap-6 shrink-0">
          <div className="hidden xl:flex flex-col h-8 justify-center">
            <div className="flex items-center gap-2">
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", marketStrategy.statusColor, marketStrategy.pulseColor)} />
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">
                STRATEGY: <span className="text-white font-semibold">{marketStrategy.strategy}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <div className="text-[9px] font-mono text-[#002FA7] tracking-wider">
                {marketStrategy.windowText}
              </div>
            </div>
          </div>
        </div>

        {/* Center Side: Search or Active Call */}
        <motion.div
          className="flex-1 min-w-0"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <AnimatePresence mode="wait">
            {(!isActive || !isShowingCallBar) ? (
              <motion.div
                key="search-container"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                className="w-full flex items-center gap-4"
              >
                <div className="flex-1">
                  <GlobalSearch />
                </div>
                {isActive && (
                  <button
                    onClick={() => setIsShowingCallBar(true)}
                    className="icon-button-forensic h-[50px] px-4 flex items-center gap-2 text-emerald-500 bg-emerald-500/5 border-emerald-500/20"
                    title="Return to Call"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <Phone size={16} />
                    <span className="text-[10px] font-mono uppercase tracking-widest hidden lg:inline">Active Call</span>
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="active-call"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex justify-center"
              >
                <div className="w-full max-w-2xl h-[50px] nodal-glass border-signal/50 rounded-2xl shadow-[0_10px_30px_-10px_rgba(0,47,167,0.5)] flex items-center justify-between px-6">
                  <div className="flex items-center gap-3">
                    <CompanyIcon
                      key={`callbar-${displayMetadata?.logoUrl ?? ''}-${displayMetadata?.domain ?? ''}`}
                      logoUrl={displayMetadata?.logoUrl}
                      domain={displayMetadata?.domain}
                      name={displayMetadata?.account || displayMetadata?.name || phoneNumber || 'Caller'}
                      size={32}
                      roundedClassName="rounded-[14px]"
                    />
                    <div>
                      <div className="text-sm font-medium text-white leading-none mb-1">{displayMetadata?.name || phoneNumber || "Unknown Caller"}</div>
                      <div className="text-[10px] text-signal font-mono uppercase tracking-tighter flex items-center gap-2">
                        {status === 'dialing' ? 'Dialing...' : formatDuration(callDuration)}
                        {selectedNumberName && (
                          <span className="text-[10px] text-zinc-500 lowercase">via {selectedNumberName}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsShowingCallBar(false)}
                      className="icon-button-forensic p-1.5"
                      title="Search while on call"
                    >
                      <Search size={16} />
                    </button>
                    <button
                      onClick={() => mute(!isMuted)}
                      className={cn(
                        "icon-button-forensic p-1.5",
                        isMuted ? "text-red-500 hover:text-red-400" : ""
                      )}
                    >
                      <Mic size={16} />
                    </button>
                    <div className="relative" ref={dialpadContainerRef}>
                      <button
                        type="button"
                        onClick={() => setIsDialpadOpen(!isDialpadOpen)}
                        className={cn(
                          "icon-button-forensic p-1.5 rounded-[14px] focus:outline-none focus-visible:ring-0",
                          isDialpadOpen && "text-white [&_svg]:scale-[1.15]"
                        )}
                        title="Dialpad (DTMF)"
                        aria-expanded={isDialpadOpen}
                      >
                        <Grid3X3 size={16} />
                      </button>

                      <AnimatePresence>
                        {isDialpadOpen && (
                          <motion.div
                            key="dialpad-popover"
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute top-full mt-3 left-1/2 -translate-x-1/2 w-48 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50"
                          >
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { digit: '1', letters: '' },
                                { digit: '2', letters: 'ABC' },
                                { digit: '3', letters: 'DEF' },
                                { digit: '4', letters: 'GHI' },
                                { digit: '5', letters: 'JKL' },
                                { digit: '6', letters: 'MNO' },
                                { digit: '7', letters: 'PQRS' },
                                { digit: '8', letters: 'TUV' },
                                { digit: '9', letters: 'WXYZ' },
                                { digit: '*', letters: '' },
                                { digit: '0', letters: '+' },
                                { digit: '#', letters: '' },
                              ].map((item) => (
                                <button
                                  key={item.digit}
                                  type="button"
                                  onClick={() => {
                                    sendDigits(item.digit);
                                  }}
                                  className="h-12 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-white font-mono text-base transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5"
                                >
                                  <span className="leading-none">{item.digit}</span>
                                  {item.letters && (
                                    <span className="text-[9px] text-zinc-400 tracking-widest leading-none">{item.letters}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <button
                      onClick={handleHangup}
                      className="icon-button-forensic p-1.5 text-red-500 hover:text-red-400"
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
            width: (isGeminiOpen || isCallHUDOpen) ? 480 : (isDialerOpen ? 350 : 172),
            borderRadius: 24,
          }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 35,
            mass: 0.8
          }}
          className={cn(
            "glass-panel !shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-visible flex flex-col relative h-12 transition-all",
            isDialerOpen && "hover:bg-white/5 hover:border-white/10 group/dialer"
          )}
        >
          {/* Left Side Buttons - Absolute to prevent vertical jumps */}
          <div className="absolute left-2 top-0 h-12 flex items-center gap-2 pointer-events-auto leading-none">
            <AnimatePresence>
              {(isDialerOpen || isGeminiOpen) && (
                <motion.div
                  key="header-left-actions"
                  initial={{ opacity: 0, x: -10, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: -10, filter: 'blur(4px)' }}
                  className="flex items-center gap-2 ml-2"
                >
                  {/* From/Origin Badge (for Dialer) */}
                  {isDialerOpen && selectedNumber && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/20 backdrop-blur-md">
                      <Shield size={10} className="text-[#002FA7] shrink-0" />
                      <span className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase whitespace-nowrap">
                        From: <span className="text-zinc-200">{selectedNumberName}</span>
                      </span>
                    </div>
                  )}

                  {/* Context Badge (for Gemini) */}
                  {isGeminiOpen && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/20 backdrop-blur-md">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full animate-pulse",
                        (!contextInfo || contextInfo.type === 'general') ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-[#002FA7] shadow-[0_0_8px_#002FA7]"
                      )} />
                      <span className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase whitespace-nowrap">
                        {contextInfo.displayLabel}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Side Buttons - Pinned Absolute */}
          <div className="absolute right-2 top-0 h-12 flex items-center gap-1 pointer-events-auto leading-none">
            {/* Gemini Trigger (Bot/X icon) - Restored to original right-side position */}
            <GeminiChatTrigger
              onToggle={() => {
                if (!isGeminiOpen) setIsDialerOpen(false)
              }}
            />

            {/* Refresh Data */}
            <button
              onClick={handleRefresh}
              className="icon-button-forensic w-9 h-9"
              title="Refresh Data"
            >
              <RefreshCw size={22} />
            </button>

            <button
              className="icon-button-forensic w-9 h-9 relative"
              title="Notifications"
            >
              <Bell size={22} />
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-signal rounded-full border border-zinc-900" />
            </button>

            {/* Manual Dialer Trigger OR Active Call HUD Trigger */}
            {isActive ? (
              <button
                onClick={() => {
                  const nextOpen = !isCallHUDOpen
                  if (nextOpen) {
                    setIsGeminiOpen(false)
                    setIsDialerOpen(false)
                  }
                  setIsCallHUDOpen(nextOpen)
                }}
                className={cn(
                  "icon-button-forensic w-9 h-9 relative overflow-hidden transition-all duration-300",
                  isCallHUDOpen ? "text-emerald-500 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.4)] bg-emerald-500/10 border-emerald-500/30" : "text-emerald-500/70"
                )}
                title={isCallHUDOpen ? "Close Neural HUD" : "Open Neural HUD"}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isCallHUDOpen ? "close" : "zap"}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-center"
                  >
                    {isCallHUDOpen ? <X size={22} /> : <Zap size={22} className="animate-pulse" />}
                  </motion.div>
                </AnimatePresence>
              </button>
            ) : (
              <button
                onClick={() => {
                  const nextOpen = !isDialerOpen
                  if (nextOpen) setIsGeminiOpen(false)
                  setIsDialerOpen(nextOpen)
                }}
                className={cn(
                  "icon-button-forensic w-9 h-9 relative overflow-hidden",
                  isDialerOpen && "text-white scale-110"
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
                    {isDialerOpen ? <X size={20} /> : <Phone size={20} />}
                  </motion.div>
                </AnimatePresence>
              </button>
            )}
          </div>

          {/* Expanded Content: Dialer, Gemini, or Active Call HUD */}
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
                        TARGET: {storeMetadata.name}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 flex items-center min-w-0 bg-zinc-950/50 border border-white/10 rounded-xl relative z-10 px-3 transition-all duration-300 group/input focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/5 shadow-2xl">
                  <div className="w-8 h-8 flex items-center justify-center text-zinc-500 group-focus-within/input:text-emerald-500 transition-colors">
                    <Phone size={18} />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    onKeyDown={handleDialerKeyDown}
                    placeholder="Dial external..."
                    className="w-full bg-transparent border-none focus:ring-0 outline-none text-white placeholder-zinc-500 text-sm font-mono tracking-wide h-12"
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
            {isCallHUDOpen && (
              <motion.div
                key="active-call-hud"
                initial={{ opacity: 0, y: 4, scaleY: 0.98 }}
                animate={{ opacity: 1, y: 0, scaleY: 1 }}
                exit={{ opacity: 0, y: 4, scaleY: 0.98, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, delay: 0.05 }}
                style={{ transformOrigin: 'top' }}
                className="absolute top-12 right-2 mt-2 w-[calc(100%-1rem)] max-w-[480px] flex flex-col h-[600px] max-h-[calc(100vh-8rem)] rounded-2xl bg-zinc-950/80 backdrop-blur-3xl border border-white/10 shadow-2xl overflow-hidden z-50"
              >
                <ActiveCallInterface />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </header>
  )
}
