'use client'

import {
  Zap, CheckCircle, Play, DollarSign, Mic, ChevronRight, Plus, AlertCircle
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { useContact } from '@/hooks/useContacts'
import { useAccount } from '@/hooks/useAccounts'
import { useTasks } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import { useMarketPulse } from '@/hooks/useMarketPulse'
import { useUIStore } from '@/store/uiStore'
import { NodeIngestion } from '../right-panel/NodeIngestion'
import { TaskCreationPanel } from '../right-panel/TaskCreationPanel'
import { DealCreationPanel } from '../right-panel/DealCreationPanel'

/** When on dossier: 'context' = Active Context widgets, 'scanning' = Scanning Mode widgets. Only used when isActiveContext. */
type DossierPanelView = 'context' | 'scanning'

// Widgets
import TelemetryWidget from '../crm/TelemetryWidget'
import OperationalButton from '../crm/OperationalButton'
import SatelliteUplink from '../crm/SatelliteUplink'
import MarketPulseWidget from '../crm/MarketPulseWidget'
import QuickActionsGrid from '../crm/QuickActionsGrid'
import NewsFeedWidget from '../crm/NewsFeedWidget'
import GlobalTasksWidget from '../crm/GlobalTasksWidget'
import ContextTasksWidget from '../crm/ContextTasksWidget'
import OrgIntelligence from '../crm/OrgIntelligence'
import SignalStream from '../crm/SignalStream'
import { VectorControlModule } from '../crm/VectorControlModule'
import { ContractIntelWidget } from '../crm/ContractIntelWidget'
import { TaskInjectionPopover } from '../crm/TaskInjectionPopover'
import { mapLocationToZone } from '@/lib/market-mapping'
import { useWeather } from '@/hooks/useWeather'

export function RightPanel() {
  const { rightPanelMode, setRightPanelMode, setTaskContext } = useUIStore()
  const pathname = usePathname()
  const params = useParams()

  // State detection
  const isContactPage = pathname?.includes('/contacts/') || false
  const isAccountPage = pathname?.includes('/accounts/') || false
  const isActiveContext = isContactPage || isAccountPage
  const entityId = params?.id as string

  const { data: contact, refetch: refetchContact } = useContact(isContactPage ? entityId : '')
  const { data: account, refetch: refetchAccount } = useAccount(isAccountPage ? entityId : (contact?.accountId || ''))

  const [isReady, setIsReady] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  const lastScrolledRef = useRef<boolean | null>(null)
  const snapToTopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SNAP_TOP_THRESHOLD = 80
  /** On dossier: which content to show. Only relevant when isActiveContext. */
  const [dossierPanelView, setDossierPanelView] = useState<DossierPanelView>('context')
  /** Hover over header mode strip: reveal other mode (carousel) without switching. */
  const [headerHoverReveal, setHeaderHoverReveal] = useState(false)
  /** Prevent immediate re-hover after clicking to switch modes. */
  const hoverLockRef = useRef(false)

  const { data: tasksData } = useTasks()
  const { isError: isMarketError } = useMarketPulse()

  const taskCounts = useMemo(() => {
    const tasks = tasksData?.pages.flatMap(page => page.tasks) || []
    const completedCount = tasks.filter(t => t.status === 'Completed').length
    const totalCount = tasks.length
    return { completed: completedCount, total: totalCount }
  }, [tasksData])

  // All hooks MUST come before any conditional returns
  const city = contact?.city || account?.metadata?.city || account?.metadata?.general?.city;
  const state = contact?.state || account?.metadata?.state || account?.metadata?.general?.state;
  const rawLocation = account?.location || contact?.location;
  const entityZone = mapLocationToZone(city, state, rawLocation);

  // Always use account address for the map, fall back to contact address only if no account
  const entityAddress = account?.address || contact?.address || ''
  const entityName = contact?.name || account?.name

  // Weather: always use account location (not contact). On contact dossier we still show weather for the account's city.
  const accountLocationForWeather = useMemo(() => {
    if (!account) return null
    return {
      latitude: account.latitude ?? undefined,
      longitude: account.longitude ?? undefined,
      address: account.address || undefined,
      city: account.city || undefined,
      state: account.state || undefined,
    }
  }, [account?.id, account?.latitude, account?.longitude, account?.address, account?.city, account?.state])
  const { data: weatherData } = useWeather(accountLocationForWeather)
  const weatherLocationLabel = account?.location || (account?.city && account?.state ? `${account.city}, ${account.state}` : account?.address || '')

  /** Effective panel content mode: on dossier use dossierPanelView, else always scanning. */
  const effectiveView: DossierPanelView = isActiveContext ? dossierPanelView : 'scanning'

  const handleSwitchToScanning = useCallback(() => {
    setDossierPanelView('scanning')
    setHeaderHoverReveal(false)
    // Lock hover for 300ms to prevent immediate re-trigger
    hoverLockRef.current = true
    setTimeout(() => { hoverLockRef.current = false }, 300)
  }, [])
  const handleSwitchToContext = useCallback(() => {
    setDossierPanelView('context')
    setHeaderHoverReveal(false)
    // Lock hover for 300ms to prevent immediate re-trigger
    hoverLockRef.current = true
    setTimeout(() => { hoverLockRef.current = false }, 300)
  }, [])

  const handleMouseEnterHeader = useCallback(() => {
    if (!hoverLockRef.current) {
      setHeaderHoverReveal(true)
    }
  }, [])

  const handleMouseLeaveHeader = useCallback(() => {
    setHeaderHoverReveal(false)
  }, [])

  useEffect(() => {
    setIsReady(true)
  }, [])

  useEffect(() => {
    return () => {
      if (snapToTopTimeoutRef.current !== null) clearTimeout(snapToTopTimeoutRef.current)
    }
  }, [])

  // Update time every second (client-side only to avoid hydration mismatch)
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(format(new Date(), 'HH:mm:ss'))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  if (!isReady) return <aside className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950 border-l border-white/5 hidden lg:flex" />

  return (
    <aside className={cn(
      "fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950 border-l border-white/5 flex flex-col overflow-hidden hidden lg:flex",
      rightPanelMode === 'DEFAULT' && "np-scroll"
    )}>
      <AnimatePresence mode="wait">
        {rightPanelMode === 'CREATE_TASK' ? (
          <TaskCreationPanel key="task" />
        ) : rightPanelMode === 'CREATE_DEAL' ? (
          <DealCreationPanel key="deal" />
        ) : rightPanelMode !== 'DEFAULT' ? (
          <NodeIngestion key="ingest" />
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex-1 flex flex-col overflow-hidden relative"
          >

            {/* 1. THE HEADER (Fixed HUD Info) - Glassmorphic Blur */}
            <div className={cn(
              "absolute top-0 left-0 right-0 z-50 px-6 h-24 flex items-center justify-between select-none transition-all duration-300 ease-in-out",
              isScrolled
                ? "bg-zinc-950/80 backdrop-blur-xl border-b border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-saturate-150"
                : "bg-transparent"
            )}>
              {/* 1. MODE INDICATOR — On dossier: hover-reveal carousel to switch to Scanning Mode; click to switch */}
              {isActiveContext ? (
                <div
                  className="relative h-[18px] w-[140px] overflow-hidden cursor-pointer"
                  onMouseEnter={handleMouseEnterHeader}
                  onMouseLeave={handleMouseLeaveHeader}
                  aria-label="Panel mode: hover to reveal Scanning Mode, click to switch"
                >
                  {/* Active_Context row — slides up/out on hover when current; slides up into view when other is revealed */}
                  <motion.div
                    className="absolute inset-x-0 top-0 flex h-[18px] items-center gap-2"
                    initial={false}
                    animate={{
                      y: dossierPanelView === 'context' ? (headerHoverReveal ? -18 : 0) : (headerHoverReveal ? 0 : 18),
                      opacity: (dossierPanelView === 'context' && !headerHoverReveal) || (headerHoverReveal && dossierPanelView === 'scanning') ? 1 : 0,
                    }}
                    transition={{ type: 'tween', duration: 0.25, ease: 'easeInOut' }}
                  >
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[#002FA7] opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#002FA7]" />
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Active_Context</span>
                  </motion.div>
                  {/* Scanning_Mode row — clickable when revealed to switch to scanning */}
                  <motion.div
                    className="absolute inset-x-0 top-0 flex h-[18px] items-center gap-2"
                    initial={false}
                    animate={{
                      y: dossierPanelView === 'scanning' ? (headerHoverReveal ? -18 : 0) : (headerHoverReveal ? 0 : 18),
                      opacity: (dossierPanelView === 'scanning' && !headerHoverReveal) || (headerHoverReveal && dossierPanelView === 'context') ? 1 : 0,
                    }}
                    transition={{ type: 'tween', duration: 0.25, ease: 'easeInOut' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (headerHoverReveal && dossierPanelView === 'context') handleSwitchToScanning()
                    }}
                  >
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Scanning_Mode</span>
                  </motion.div>
                  {/* Clickable overlay when Context is revealed (to switch back) */}
                  {headerHoverReveal && dossierPanelView === 'scanning' && (
                    <motion.div
                      className="absolute inset-0 z-10 cursor-pointer"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={(e) => { e.stopPropagation(); handleSwitchToContext() }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Scanning_Mode</span>
                </div>
              )}

              {/* 2. THE SYSTEM CLOCK (Forensic Detail) */}
              <div className="text-[10px] font-mono text-zinc-600 hidden md:block tabular-nums">
                {effectiveView === 'context' ? 'T-MINUS 14 D' : (currentTime || '--:--:--')}
              </div>

              {/* 3. THE CONTROL (Minimize) */}
              <button
                className="icon-button-forensic"
                title="Minimize Intelligence Feed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative">
              <motion.div
                key="content-wrapper"
                ref={scrollContainerRef}
                onScroll={(e) => {
                  const target = e.currentTarget;
                  if (scrollRafRef.current !== null) return;
                  scrollRafRef.current = requestAnimationFrame(() => {
                    scrollRafRef.current = null;
                    const value = target.scrollTop > 10;
                    if (value !== lastScrolledRef.current) {
                      lastScrolledRef.current = value;
                      setIsScrolled(value);
                    }
                  });
                  // Snap to top when close to top after scroll settles
                  if (snapToTopTimeoutRef.current !== null) clearTimeout(snapToTopTimeoutRef.current);
                  snapToTopTimeoutRef.current = setTimeout(() => {
                    snapToTopTimeoutRef.current = null;
                    const el = scrollContainerRef.current;
                    if (!el) return;
                    const top = el.scrollTop;
                    if (top > 0 && top <= SNAP_TOP_THRESHOLD) {
                      el.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }, 120);
                }}
                className="flex-1 flex flex-col gap-4 overflow-y-auto px-6 pt-[93px] pb-4 np-scroll scroll-smooth"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {effectiveView === 'context' ? (
                    <motion.div
                      key="active-context"
                      initial={{ y: 24, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -24, opacity: 0 }}
                      transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
                      className="flex flex-col gap-4 mt-1"
                    >
                      {/* 0. ASSIGN OPERATIONAL VECTOR — Contacts: protocols + lists; Accounts: lists only (account-filtered) */}
                      {isContactPage && entityId ? (
                        <VectorControlModule key={`vector-contact-${entityId}`} contactId={entityId} accountId={contact?.accountId} />
                      ) : isAccountPage && entityId ? (
                        <VectorControlModule key={`vector-account-${entityId}`} accountId={entityId} />
                      ) : null}

                      {/* 0b. CONTRACT INTEL — active deals for this entity */}
                      {isContactPage && entityId ? (
                        <ContractIntelWidget key={`contract-contact-${entityId}`} contactId={entityId} />
                      ) : isAccountPage && entityId ? (
                        <ContractIntelWidget key={`contract-account-${entityId}`} accountId={entityId} />
                      ) : null}

                      {/* 1. NODE TASKS (Execution) */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Node_Tasks</h3>
                          <button
                            className="icon-button-forensic p-1 flex items-center justify-center"
                            type="button"
                            onClick={() => {
                              setTaskContext({
                                entityId,
                                entityName,
                                entityType: isContactPage ? 'contact' : 'account',
                                entityLogoUrl: account?.logoUrl,
                                entityDomain: account?.domain,
                                contactId: isContactPage ? entityId : undefined,
                                accountId: isAccountPage ? entityId : undefined,
                              })
                              setRightPanelMode('CREATE_TASK')
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <ContextTasksWidget entityId={entityId} entityName={entityName} />
                      </div>

                      {/* 2. TELEMETRY (Targeting Mode) */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Telemetry</h3>
                          <div className="flex items-center gap-1.5 text-[#002FA7] animate-pulse">
                            <span className="h-1 w-1 rounded-full bg-[#002FA7]" />
                            <span className="text-[9px] font-mono uppercase tracking-widest">Live</span>
                          </div>
                        </div>
                        <TelemetryWidget location={entityZone} weather={weatherData} weatherLocationLabel={weatherLocationLabel} />
                      </div>

                      {/* 2b. TARGET SIGNAL STREAM (Apollo news/signals for account) */}
                      <div className="space-y-3">
                        <SignalStream accountId={isAccountPage ? entityId : contact?.accountId} />
                      </div>

                      {/* 3. SATELLITE (Infrastructure) */}
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Satellite_Uplink</h3>
                        <SatelliteUplink
                          address={entityAddress}
                          name={entityName}
                          entityId={entityId}
                          entityType={isContactPage ? 'contact' : 'account'}
                          currentPhone={contact?.phone || account?.companyPhone}
                          city={city}
                          state={state}
                          // Contacts always use account location (business location, not personal address)
                          latitude={account?.latitude ?? null}
                          longitude={account?.longitude ?? null}
                          accountId={account?.id || contact?.accountId}
                          onSyncComplete={() => {
                            if (isContactPage) refetchContact()
                            else refetchAccount()
                          }}
                        />
                      </div>

                      {/* 4. ORGANIZATIONAL (Intelligence) */}
                      <div className="space-y-3 pb-4">
                        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Org_Intelligence</h3>
                        <OrgIntelligence
                          domain={contact?.companyDomain || account?.domain}
                          companyName={contact?.company || account?.name}
                          website={contact?.website || account?.domain}
                          accountId={isContactPage ? contact?.accountId : entityId}
                          accountLogoUrl={account?.logoUrl}
                          accountDomain={account?.domain}
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="scanning-mode"
                      initial={{ y: 24, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -24, opacity: 0 }}
                      transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
                      className="flex flex-col gap-8"
                    >
                      {/* 0. QUICK ACTIONS (Rapid Ingestion) */}
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Rapid_Ingestion</h3>
                        <QuickActionsGrid />
                      </div>

                      {/* 1. MARKET PULSE (Global Energy Status) */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Market_Pulse</h3>
                          <div className="flex items-center gap-1.5">
                            {isMarketError ? (
                              <div className="flex items-center gap-1.5 text-rose-500 animate-pulse">
                                <AlertCircle size={10} />
                                <span className="text-[9px] font-mono uppercase tracking-widest">error in read</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[#002FA7] animate-pulse">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#002FA7]" />
                                <span className="text-[9px] font-mono uppercase tracking-widest">Live</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <MarketPulseWidget />
                      </div>

                      {/* 2. SYSTEM TASKS (Network-wide tasks) */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Network_Tasks</h3>
                          <span className="text-[9px] font-mono text-zinc-600 uppercase tabular-nums tracking-wider">
                            {taskCounts.completed}/{taskCounts.total} Units
                          </span>
                        </div>
                        <GlobalTasksWidget />
                      </div>

                      {/* 3. NEWS FEED (Global Events) */}
                      <div className="space-y-3 pb-4">
                        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">System_Feed</h3>
                        <NewsFeedWidget />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  )
}

