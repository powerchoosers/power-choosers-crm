'use client'

import { useCallStore } from '@/store/callStore'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Grid3X3, RefreshCw, Bell, X, Shield, Search, Zap, Handshake, FileSignature, Headphones, ChevronLeft } from 'lucide-react'
import { Building2 } from 'lucide-react'
import { cn, formatToE164 } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useVoice } from '@/context/VoiceContext'
import { toast } from 'sonner'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { usePathname, useParams, useRouter } from 'next/navigation'
import { GeminiChatTrigger, GeminiChatPanel } from '@/components/chat/GeminiChat'
import { useGeminiStore } from '@/store/geminiStore'
import { useUIStore } from '@/store/uiStore'
import { useMarketPulse } from '@/hooks/useMarketPulse'
import { ActiveCallInterface } from '@/components/calls/ActiveCallInterface'
import { useAccount } from '@/hooks/useAccounts'
import { useQueryClient } from '@tanstack/react-query'
import { playNavigation } from '@/lib/audio'
import { forensicNotify } from '@/lib/notifications'
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel'
import { useNotificationCenter } from '@/hooks/useNotificationCenter'
import { useSyncStore } from '@/store/syncStore'

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

/**
 * Dedicated icon for the active call bar.
 * - Contact call: shows ContactAvatar when the call is not account-only
 * - Company call: shows logo img → Clearbit fallback → Building2
 */
function CallBarIcon({ logoUrl, domain, name, contactName, photoUrl, isAccountOnly }: { logoUrl?: string; domain?: string; name: string; contactName?: string; photoUrl?: string; isAccountOnly?: boolean }) {
  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()}` : null
  const [src, setSrc] = useState<string | null>(logoUrl || clearbitUrl)
  const [failed, setFailed] = useState(false)

  // Reset whenever the call changes (key prop handles this, but also guard here)
  useEffect(() => {
    setSrc(logoUrl || clearbitUrl)
    setFailed(false)
  }, [logoUrl, domain]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleError = () => {
    if (src === logoUrl && clearbitUrl && src !== clearbitUrl) {
      setSrc(clearbitUrl)
    } else {
      setFailed(true)
    }
  }

  const shouldShowContactAvatar = !isAccountOnly && !!(contactName || photoUrl)

  // Personal/contact call should show contact identity, even when company branding exists.
  if (shouldShowContactAvatar) {
    return (
      <ContactAvatar
        name={contactName || name}
        photoUrl={photoUrl}
        size={32}
        className="rounded-[14px] shrink-0"
      />
    )
  }

  if (failed || !src) {
    return (
      <div className="w-8 h-8 rounded-[14px] nodal-glass bg-zinc-900/80 border border-white/20 flex items-center justify-center shrink-0">
        <Building2 size={16} className="text-zinc-400" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      onError={handleError}
      className="w-8 h-8 rounded-[14px] object-cover border border-white/20 shrink-0 bg-zinc-900/80"
    />
  )
}

export function TopBar() {
  const {
    isActive,
    status,
    phoneNumber,
    setPhoneNumber,
    metadata: storeMetadata,
    callTriggered,
    clearCallTrigger,
    isCallHUDOpen,
    setIsCallHUDOpen,
    callSessionId,
    sentiment,
    setSentiment,
    callHealth,
  } = useCallStore()
  const isGeminiOpen = useGeminiStore((state) => state.isOpen)
  const setIsGeminiOpen = useGeminiStore((state) => state.setIsOpen)
  const rightPanelMinimized = useUIStore((state) => state.rightPanelMinimized)
  const toggleRightPanel = useUIStore((state) => state.toggleRightPanel)
  const { profile } = useAuth()
  const { connect, disconnect, sendDigits, metadata: voiceMetadata } = useVoice()
  const pathname = usePathname()
  const params = useParams()
  const router = useRouter()

  const { data: marketPulse, isError: isMarketError } = useMarketPulse()
  const queryClient = useQueryClient()
  const storeContext = useGeminiStore((state) => state.activeContext)
  const [mounted, setMounted] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const { unreadCount: notificationsUnreadCount } = useNotificationCenter()
  const { isIngesting, ingestProgress, ingestVector } = useSyncStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Operational Strategy Logic
  const marketStrategy = useMemo(() => {
    if (!mounted) {
      return {
        strategy: 'INITIALIZING',
        statusColor: 'bg-zinc-500',
        pulseColor: 'shadow-[0_0_8px_rgba(113,113,122,0.5)]',
        windowText: 'SYNCHRONIZING_TELEMETRY...'
      };
    }

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

  // Aggressive merge of dossier vs voice metadata to prevent branding loss
  const displayMetadata = useMemo(() => {
    const s = (storeMetadata || {}) as any;
    const v = (voiceMetadata || {}) as any;
    const c = (storeContext?.data || {}) as any;
    const preferVoice = isActive;

    const logoUrl = preferVoice
      ? (v.logoUrl || v.logo_url || s.logoUrl || s.logo_url || c.logoUrl || c.logo_url || '')
      : (s.logoUrl || s.logo_url || c.logoUrl || c.logo_url || v.logoUrl || v.logo_url || '');
    const domain = preferVoice
      ? (v.domain || s.domain || c.domain || '')
      : (s.domain || c.domain || v.domain || '');
    const accountId = preferVoice
      ? (v.accountId || s.accountId || c.id || '')
      : (s.accountId || c.id || v.accountId || '');
    const isAccountOnly = preferVoice
      ? (v.isAccountOnly ?? s.isAccountOnly ?? (storeContext?.type === 'account'))
      : (s.isAccountOnly ?? v.isAccountOnly ?? (storeContext?.type === 'account'));

    return {
      ...s,
      ...v,
      logoUrl,
      domain,
      accountId,
      isAccountOnly,
      metadata: { ...(c.metadata || {}), ...(s.metadata || {}), ...(v.metadata || {}) }
    };
  }, [isActive, voiceMetadata, storeMetadata, storeContext]);

  // Contextual Intel Logic
  const contextInfo = useMemo(() => {
    let baseContext;
    if (storeContext) {
      baseContext = storeContext;
    } else if (pathname?.includes('/people/') || pathname?.includes('/contacts/')) {
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

  const openCommandBar = useCallback(() => {
    setIsShowingCallBar(false)
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('nodal:open-command-bar'))
    }, 0)
  }, [])

  const durationInterval = useRef<NodeJS.Timeout | null>(null)
  const callStartRef = useRef<number | null>(null)
  // Directly resolve the account from DB using accountId — hard guarantee for logo/domain
  const callbarAccountId = isActive ? (displayMetadata?.accountId || '') : ''
  const { data: callbarAccount } = useAccount(callbarAccountId)

  // Merge: direct DB data wins over whatever came through metadata chain
  const callbarLogoUrl = callbarAccount?.logoUrl || displayMetadata?.logoUrl || ''
  const callbarDomain = callbarAccount?.domain || displayMetadata?.domain || ''
  const activeCallContactId = displayMetadata?.contactId || displayMetadata?.metadata?.contactId || ''
  const activeCallAccountId = displayMetadata?.accountId || displayMetadata?.metadata?.accountId || ''
  const activeCallName = displayMetadata?.isPowerDialBatch
    ? (displayMetadata?.powerDialTargetCount ? `${displayMetadata.powerDialTargetCount} Targets Ringing` : 'Power Dial Ringing')
    : (displayMetadata?.name || phoneNumber || 'Unknown Caller')


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

  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault()
        openCommandBar()
      }
    }

    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [openCommandBar])

  useEffect(() => {
    const bridge = window.nodalDesktop
    if (!bridge?.isDesktop) return

    const unsubscribe = bridge.onUiEvent((event) => {
      if (event.type === 'open-command-bar') {
        openCommandBar()
      }
    })

    return () => unsubscribe()
  }, [openCommandBar])

  const selectedNumber = profile.selectedPhoneNumber || (profile.twilioNumbers && profile.twilioNumbers.length > 0 ? profile.twilioNumbers[0].number : null)
  const selectedNumberName = profile.twilioNumbers?.find(n => n.number === selectedNumber)?.name || "Default"

  const handleCall = useCallback(async () => {
    if (phoneNumber.length < 10) {
      forensicNotify.warn("Invalid Phone Number")
      return
    }

    if (!selectedNumber) {
      forensicNotify.warn("No Caller ID selected", "Please select a phone number in Settings.")
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
      setCallDuration(0)
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

  // Removed automatic "System Ready" signal to prevent jarring audio on mount

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
    playNavigation()
    forensicNotify.update("Refreshing Data...")
    queryClient.invalidateQueries()
    setTimeout(() => forensicNotify.signal("Data Synced"), 600)
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
  }

  const handleOpenContactDossier = useCallback(() => {
    if (!activeCallContactId) return
    router.push(`/network/contacts/${activeCallContactId}`)
  }, [activeCallContactId, router])

  const handleOpenAccountDossier = useCallback(() => {
    if (!activeCallAccountId) return
    router.push(`/network/accounts/${activeCallAccountId}`)
  }, [activeCallAccountId, router])

  const handleOpenActiveDossier = useCallback(() => {
    if (activeCallContactId) {
      handleOpenContactDossier()
      return
    }
    if (activeCallAccountId) {
      handleOpenAccountDossier()
    }
  }, [activeCallContactId, activeCallAccountId, handleOpenContactDossier, handleOpenAccountDossier])

  const callHealthStyles = useMemo(() => {
    if (callHealth === 'poor') {
      return {
        border: 'border-rose-500/40',
        bg: 'bg-rose-500/10',
        text: 'text-rose-400',
        bar: 'bg-rose-500/50',
        dot: 'bg-rose-500',
      }
    }
    if (callHealth === 'fair') {
      return {
        border: 'border-amber-500/40',
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        bar: 'bg-amber-500/50',
        dot: 'bg-amber-500',
      }
    }
    return {
      border: 'border-emerald-500/40',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-500',
      bar: 'bg-emerald-500/50',
      dot: 'bg-emerald-500',
    }
  }, [callHealth])

  const handleDialClick = (digit: string) => {
    sendDigits(digit)
  }

  return (
    // Updated positioning: constrained to match main content area with "Frost Shield" scroll effect
    <header className={cn(
      "fixed top-0 left-0 lg:left-[70px] z-40 flex items-center justify-center h-16 lg:h-24 pointer-events-none transition-all duration-300 ease-in-out",
      "border-b border-transparent",
      rightPanelMinimized ? "right-0" : "right-0 lg:right-80"
    )}>
      {/* Visual background and blur layer - Moved here to prevent nested backdrop-filter issues */}
      <AnimatePresence>
        {isScrolled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl border-b border-r border-white/5 shadow-[0_0_30px_rgba(0,0,0,0.5)] pointer-events-none z-[-1] backdrop-saturate-150"
          />
        )}
      </AnimatePresence>
      <div className="w-full px-4 lg:px-8 flex items-center justify-between gap-3 lg:gap-6 pointer-events-auto">
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
              <div className="text-[9px] font-mono text-zinc-400 tracking-wider">
                {marketStrategy.windowText}
              </div>
            </div>
          </div>
        </div>

        {/* Center Side: Search or Active Call */}
        <motion.div
          className="flex-1 min-w-0 overflow-visible"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <AnimatePresence mode="wait">
            {(!isActive || !isShowingCallBar) ? (
              <motion.div
                key="search-container"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                className="w-full flex items-center gap-4 overflow-visible"
              >
                <div className="flex-1 min-w-0 transition-all duration-300 overflow-visible">
                  <GlobalSearch />
                </div>
                
                <AnimatePresence mode="popLayout">
                  {isIngesting && (
                      <motion.div
                        layout
                        onClick={() => useUIStore.getState().setRightPanelMode('BULK_INGESTION_TERMINAL')}
                        initial={{ opacity: 0, x: 20, width: 0 }}
                        animate={{ opacity: 1, x: 0, width: "auto" }}
                        exit={{ opacity: 0, x: 20, width: 0 }}
                        className="shrink-0 flex items-center gap-3 px-4 h-[50px] nodal-glass border-white/10 rounded-2xl overflow-hidden cursor-pointer hover:border-white/20 transition-all hover:bg-white/5"
                      >
                      <div className="w-1.5 h-1.5 rounded-full bg-[#002FA7] animate-pulse shrink-0" />
                      <div className="flex flex-col justify-center w-[140px]">
                        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-1">
                          <span className="truncate mr-2">SYNC: {ingestVector}</span>
                          <span className="text-white shrink-0">{ingestProgress}%</span>
                        </div>
                        <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-[#002FA7]"
                            initial={{ width: 0 }}
                            animate={{ width: `${ingestProgress}%` }}
                            transition={{ ease: "linear", duration: 0.3 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {isActive && (
                  <button
                    onClick={() => {
                      playNavigation()
                      setIsShowingCallBar(true)
                    }}
                  className="h-[50px] px-4 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all duration-300 shrink-0"
                    aria-label="Return to Call"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <Phone size={14} />
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
                className="w-full flex"
              >
                <div className="w-full h-[50px] nodal-glass border-white/20 rounded-2xl shadow-[0_10px_30px_-10px_rgba(255,255,255,0.1)] flex items-center justify-between px-3 transition-all duration-300">

                  {/* Left Sector: Identity */}
                  <div className="flex items-center gap-2 w-max max-w-[35%] flex-shrink-0">
                    <CallBarIcon
                      key={`callbar-icon-${callSessionId}`}
                      logoUrl={callbarLogoUrl || undefined}
                      domain={callbarDomain || undefined}
                      name={displayMetadata?.account || activeCallName || 'Caller'}
                      contactName={displayMetadata?.isPowerDialBatch ? undefined : (displayMetadata?.name || undefined)}
                      photoUrl={
                        displayMetadata?.photoUrl ||
                        displayMetadata?.avatarUrl ||
                        displayMetadata?.metadata?.photoUrl ||
                        displayMetadata?.metadata?.avatarUrl ||
                        undefined
                      }
                      isAccountOnly={Boolean(displayMetadata?.isAccountOnly)}
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="text-sm font-medium text-white leading-none mb-1 flex items-center gap-2 truncate">
                        {(activeCallContactId || activeCallAccountId) ? (
                          <button
                            type="button"
                            onClick={handleOpenActiveDossier}
                            className="truncate text-left transition-transform duration-200 hover:scale-[1.04] origin-left"
                            aria-label={activeCallContactId ? "Open contact dossier" : "Open account dossier"}
                          >
                            {activeCallName}
                          </button>
                        ) : (
                          <span className="truncate">{activeCallName}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 lowercase truncate">
                        {selectedNumberName ? `via ${selectedNumberName}` : 'via Default'}
                      </div>
                    </div>
                  </div>

                  {/* Center Sector: Dynamics (Reduced Size & Left-Aligned) */}
                  <div className="flex-1 flex items-center justify-start min-w-0 ml-4">
                    <motion.div
                      layout
                      transition={{ layout: { type: "spring", bounce: 0, duration: 0.4 } }}
                      className={cn(
                        "flex items-center gap-2 px-2 py-0.5 border border-dotted rounded-lg overflow-hidden",
                        callHealthStyles.border,
                        callHealthStyles.bg
                      )}
                    >
                      <AnimatePresence mode="popLayout">
                        {status === 'connected' && (
                          <motion.div
                            key="left-bars"
                            initial={{ width: 0, opacity: 0, y: 5 }}
                            animate={{ width: "auto", opacity: 0.6, y: 0 }}
                            exit={{ width: 0, opacity: 0, y: 5 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex items-center gap-0.5 origin-bottom"
                          >
                            <div className="flex items-center gap-0.5 w-max">
                              {[...Array(5)].map((_, i) => (
                                <motion.div
                                  key={i}
                                  className={cn("w-[1.5px] rounded-full flex-shrink-0", callHealthStyles.bar)}
                                  initial={{ height: "2px" }}
                                  animate={{ height: ["2px", "8px", "2px"] }}
                                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15, ease: "easeInOut" }}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <motion.div
                        layout
                        className={cn(
                          "text-[10px] font-mono uppercase tracking-widest font-semibold flex items-center gap-1.5 whitespace-nowrap",
                          callHealthStyles.text
                        )}
                      >
                        {status === 'connected' && <span className={cn("w-1 h-1 rounded-full animate-pulse flex-shrink-0", callHealthStyles.dot)} />}
                        {status === 'dialing' ? (
                          <span className="flex items-center">
                            Dialing
                            <span className="inline-flex ml-[2px] w-3 font-bold justify-start">
                              <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}>.</motion.span>
                              <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.5 }}>.</motion.span>
                              <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 1.0 }}>.</motion.span>
                            </span>
                          </span>
                        ) : (
                          formatDuration(callDuration)
                        )}
                      </motion.div>

                      <AnimatePresence mode="popLayout">
                        {status === 'connected' && (
                          <motion.div
                            key="right-bars"
                            initial={{ width: 0, opacity: 0, y: 5 }}
                            animate={{ width: "auto", opacity: 0.6, y: 0 }}
                            exit={{ width: 0, opacity: 0, y: 5 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex items-center gap-0.5 origin-bottom"
                          >
                            <div className="flex items-center gap-0.5 w-max justify-end">
                              {[...Array(5)].map((_, i) => (
                                <motion.div
                                  key={i}
                                  className={cn("w-[1.5px] rounded-full flex-shrink-0", callHealthStyles.bar)}
                                  initial={{ height: "2px" }}
                                  animate={{ height: ["2px", "8px", "2px"] }}
                                  transition={{ repeat: Infinity, duration: 1.2, delay: (4 - i) * 0.15, ease: "easeInOut" }}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>

                  {/* Right Sector: Intervention Triggers */}
                  <div className="flex items-center justify-end gap-1 flex-shrink-0 ml-2">
                    <button
                      onClick={() => {
                        playNavigation()
                        setSentiment(sentiment === 'connect' ? null : 'connect')
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 h-8 rounded-lg text-[10px] font-mono tracking-widest uppercase transition-all border",
                        sentiment === 'connect'
                          ? "bg-white/10 border-white/40 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                          : "bg-zinc-950/50 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-300"
                      )}
                    >
                      <Handshake size={14} className={sentiment === 'connect' ? "text-zinc-100" : "text-zinc-500"} />
                      <span>Connect</span>
                    </button>
                    <button
                      onClick={() => {
                        playNavigation()
                        setSentiment(sentiment === 'interest' ? null : 'interest')
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 h-8 rounded-lg text-[10px] font-mono tracking-widest uppercase transition-all border",
                        sentiment === 'interest'
                          ? "bg-white/10 border-white/40 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                          : "bg-zinc-950/50 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-300"
                      )}
                    >
                      <Zap size={14} className={sentiment === 'interest' ? "text-zinc-100" : "text-zinc-500"} />
                      <span>Interest</span>
                    </button>
                    <button
                      onClick={() => {
                        playNavigation()
                        setSentiment(sentiment === 'lock' ? null : 'lock')
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 h-8 rounded-lg text-[10px] font-mono tracking-widest uppercase transition-all border",
                        sentiment === 'lock'
                          ? "bg-white/10 border-white/40 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                          : "bg-zinc-950/50 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-300"
                      )}
                    >
                      <FileSignature size={14} className={sentiment === 'lock' ? "text-zinc-100" : "text-zinc-500"} />
                      <span>Lock</span>
                    </button>

                    <div className="w-px h-6 bg-white/10 mx-1" />

                    <div className="relative" ref={dialpadContainerRef}>
                      <button
                        type="button"
                        onClick={() => {
                          playNavigation()
                          setIsDialpadOpen(!isDialpadOpen)
                        }}
                        className={cn(
                          "icon-button-forensic p-1.5 rounded-[12px] focus:outline-none focus-visible:ring-0",
                          isDialpadOpen && "text-white [&_svg]:scale-[1.15]"
                        )}
                        aria-label="Toggle dialpad"
                        aria-haspopup="menu"
                        aria-expanded={isDialpadOpen ? 'true' : 'false'}
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
                            className="absolute top-full mt-3 left-1/2 -translate-x-1/2 w-48 bg-zinc-950/80 backdrop-blur-xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-2xl p-4 z-50"
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
                                  onClick={() => handleDialClick(item.digit)}
                                className="h-12 rounded-xl bg-zinc-950/40 border border-white/10 hover:bg-zinc-950/60 hover:border-white/20 text-zinc-200 font-mono text-base transition-colors active:scale-95 flex flex-col items-center justify-center gap-0.5"
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
                      onClick={() => setIsShowingCallBar(false)}
                      className="icon-button-forensic p-1.5"
                      aria-label="Open Search"
                    >
                      <Search size={16} />
                    </button>

                    <button
                      onClick={() => {
                        setSentiment('hangup');
                        handleHangup();
                      }}
                      className="group flex items-center justify-center min-w-[32px] min-h-[32px] w-[32px] h-[32px] shrink-0 ml-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 hover:text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.2)] transition-all duration-300 hover:scale-[1.12]"
                      aria-label="Hang up"
                    >
                      <Phone size={16} className="transition-transform duration-300 group-hover:rotate-[135deg]" />
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
            width: (isGeminiOpen || isCallHUDOpen || isNotificationsOpen) ? 480 : (isDialerOpen ? 350 : 172),
            borderRadius: 24,
          }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 35,
            mass: 0.8
          }}
          className={cn(
            "overflow-visible flex flex-col relative h-12 transition-all max-w-[calc(100vw-5rem)] lg:max-w-none",
            isDialerOpen && "group/dialer"
          )}
        >
          {/* Glass Background Layer - Absolute to prevent nesting filters with children */}
          <div className={cn(
            "absolute inset-0 rounded-[24px] bg-zinc-950/80 backdrop-blur-xl border border-white/5 !shadow-[0_0_20px_rgba(0,0,0,0.5)] z-0 pointer-events-none transition-colors",
            isDialerOpen && "bg-white/5 border-white/10"
          )} />

          {/* Left Side Buttons - Absolute to prevent vertical jumps */}
          <div className="absolute left-2 top-0 h-12 flex items-center gap-2 pointer-events-auto leading-none z-10">
            <AnimatePresence>
              {(isDialerOpen || isGeminiOpen || isNotificationsOpen) && (
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
                      <Shield size={10} className="text-white shrink-0" />
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
                        (!contextInfo || contextInfo.type === 'general') ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                      )} />
                      <span className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase whitespace-nowrap">
                        {contextInfo.displayLabel}
                      </span>
                    </div>
                  )}

                  {isNotificationsOpen && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/20 backdrop-blur-md">
                      <div className={cn(
                        'w-1.5 h-1.5 rounded-full animate-pulse',
                        notificationsUnreadCount > 0
                          ? 'bg-[#002FA7] shadow-[0_0_8px_rgba(0,47,167,0.8)]'
                          : 'bg-zinc-500 shadow-[0_0_8px_rgba(113,113,122,0.5)]'
                      )} />
                      <span className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase whitespace-nowrap">
                        SIGNALS: {notificationsUnreadCount} UNREAD
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Side Buttons - Pinned Absolute */}
          <div className="absolute right-2 top-0 h-12 flex items-center gap-1 pointer-events-auto leading-none z-10">
            {/* Gemini Trigger (Bot/X icon) - Restored to original right-side position */}
            <GeminiChatTrigger
              onToggle={() => {
                if (!isGeminiOpen) {
                  setIsDialerOpen(false)
                  setIsCallHUDOpen(false)
                  setIsNotificationsOpen(false)
                }
              }}
            />

            {/* Refresh Data */}
              <button
                onClick={handleRefresh}
                className="icon-button-forensic w-9 h-9"
                aria-label="Refresh Data"
              >
              <RefreshCw size={22} />
            </button>

            <button
              onClick={() => {
                const nextOpen = !isNotificationsOpen
                if (nextOpen) {
                  setIsGeminiOpen(false)
                  setIsDialerOpen(false)
                  setIsCallHUDOpen(false)
                }
                setIsNotificationsOpen(nextOpen)
              }}
              className={cn(
                'icon-button-forensic w-9 h-9 relative',
                isNotificationsOpen && 'text-white scale-110'
              )}
              aria-label={isNotificationsOpen ? 'Close Notifications' : 'Open Notifications'}
            >
              <Bell size={22} />
              {notificationsUnreadCount > 0 && (
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-signal rounded-full border border-zinc-900" />
              )}
            </button>

            {/* Manual Dialer Trigger OR Active Call HUD Trigger */}
            {isActive ? (
              <button
                onClick={() => {
                  const nextOpen = !isCallHUDOpen
                  if (nextOpen) {
                    setIsGeminiOpen(false)
                    setIsDialerOpen(false)
                    setIsNotificationsOpen(false)
                  }
                  setIsCallHUDOpen(nextOpen)
                }}
                className={cn(
                  "icon-button-forensic w-9 h-9 relative overflow-hidden transition-all duration-300",
                  isCallHUDOpen ? "text-emerald-500 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.4)] bg-emerald-500/10 border-emerald-500/30" : "text-emerald-500/70"
                )}
                aria-label={isCallHUDOpen ? "Close Neural HUD" : "Open Neural HUD"}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isCallHUDOpen ? "close" : "headphones"}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-center"
                  >
                    {isCallHUDOpen ? <X size={22} /> : <Headphones size={21} />}
                  </motion.div>
                </AnimatePresence>
              </button>
            ) : (
              <button
                onClick={() => {
                  const nextOpen = !isDialerOpen
                  if (nextOpen) {
                    setIsGeminiOpen(false)
                    setIsCallHUDOpen(false)
                    setIsNotificationsOpen(false)
                  }
                  setIsDialerOpen(nextOpen)
                }}
                className={cn(
                  "icon-button-forensic w-9 h-9 relative overflow-hidden",
                  isDialerOpen && "text-white scale-110"
                )}
                aria-label={isDialerOpen ? "Close Dialer" : "Open Dialer"}
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

          {/* Expanded Content: Modals stay inside for positioning, relying on sibling glass layers to avoid conflict */}
          <AnimatePresence>
            {isDialerOpen && (
              <motion.div
                key="dialer-panel"
                initial={{ opacity: 0, y: 4, scaleY: 0.98 }}
                animate={{ opacity: 1, y: 0, scaleY: 1 }}
                exit={{ opacity: 0, y: 4, scaleY: 0.98, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, delay: 0.05 }}
                style={{ transformOrigin: 'top' }}
                className="absolute top-16 left-2 right-2 flex flex-col gap-4 rounded-2xl glass-panel nodal-monolith-edge !bg-zinc-950/90 backdrop-blur-xl p-4 overflow-hidden z-[60] pointer-events-auto"
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
                <div className="flex-1 flex items-center min-w-0 nodal-recessed border border-white/10 rounded-xl relative z-10 px-3 transition-all duration-300 group/input focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/5 shadow-2xl">
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
                  className="w-full bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-xs uppercase tracking-widest h-10 rounded-xl shadow-[0_0_20px_rgba(0,47,167,0.4)] hover:shadow-[0_0_30px_rgba(0,47,167,0.6)] border border-[#002FA7]/30 relative z-10 transition-all active:scale-95"
                >
                  Execute Call
                </Button>
              </motion.div>
            )}
            {isGeminiOpen && (
              <div className="absolute top-16 left-2 right-2 pointer-events-none z-[60]">
                <div className="pointer-events-auto h-full">
                  <GeminiChatPanel />
                </div>
              </div>
            )}
            {isNotificationsOpen && (
              <NotificationsPanel />
            )}
            {isCallHUDOpen && (
              <motion.div
                key="active-call-hud"
                initial={{ opacity: 0, y: 4, scaleY: 0.98 }}
                animate={{ opacity: 1, y: 0, scaleY: 1 }}
                exit={{ opacity: 0, y: 4, scaleY: 0.98, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, delay: 0.05 }}
                style={{ transformOrigin: 'top' }}
                className="absolute top-16 left-2 right-2 flex flex-col h-[600px] max-h-[calc(100vh-8rem)] rounded-2xl glass-panel overflow-hidden z-[60] pointer-events-auto"
              >
                <ActiveCallInterface />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Restore Right Panel Button - Positioned outside the quick actions container */}
        <AnimatePresence>
          {rightPanelMinimized && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.5, x: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="pointer-events-auto ml-3"
            >
              <button
                onClick={toggleRightPanel}
                className="w-12 h-12 rounded-[24px] bg-zinc-950/80 backdrop-blur-xl border border-white/5 hover:border-white/10 flex items-center justify-center text-[#002FA7] hover:text-[#002FA7]/80 transition-all shadow-[0_0_20px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(0,47,167,0.3)] relative group"
                aria-label="Restore Intelligence Feed"
              >
                <ChevronLeft size={22} className="transition-transform group-hover:scale-110" />
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#002FA7] animate-pulse" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div >
    </header >
  )
}
