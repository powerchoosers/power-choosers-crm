'use client'

import { 
  Zap, CheckCircle, Play, DollarSign, Mic, ChevronRight, Plus, AlertCircle 
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
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
import { mapLocationToZone } from '@/lib/market-mapping'

export function RightPanel() {
  const { rightPanelMode } = useUIStore()
  const pathname = usePathname()
  const params = useParams()
  
  // State detection
  const isContactPage = pathname.includes('/contacts/')
  const isAccountPage = pathname.includes('/accounts/')
  const isActiveContext = isContactPage || isAccountPage
  const entityId = params.id as string
  
  const { data: contact } = useContact(isContactPage ? entityId : '')
  const { data: account } = useAccount(isAccountPage ? entityId : '')
  
  const [isReady, setIsReady] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const { data: tasksData } = useTasks()
  const { isError: isMarketError } = useMarketPulse()
  
  const taskCounts = useMemo(() => {
    const tasks = tasksData?.pages.flatMap(page => page.tasks) || []
    const completedCount = tasks.filter(t => t.status === 'Completed').length
    const totalCount = tasks.length
    return { completed: completedCount, total: totalCount }
  }, [tasksData])

  useEffect(() => {
    setIsReady(true)
  }, [])

  if (!isReady) return <aside className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950 border-l border-white/5 hidden lg:flex" />

  if (rightPanelMode !== 'DEFAULT') {
    return (
      <aside className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950 border-l border-white/5 flex flex-col overflow-hidden hidden lg:flex">
        <NodeIngestion />
      </aside>
    )
  }

  const city = contact?.city || account?.metadata?.city || account?.metadata?.general?.city;
  const state = contact?.state || account?.metadata?.state || account?.metadata?.general?.state;
  const rawLocation = account?.location || contact?.location;
  const entityZone = mapLocationToZone(city, state, rawLocation);
  
  const entityAddress = (contact ? contact.address : account?.address) || ''
  const entityName = contact?.name || account?.name

  return (
    <aside className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950 border-l border-white/5 flex flex-col overflow-hidden hidden lg:flex np-scroll">
      
      {/* 1. THE HEADER (Fixed HUD Info) - Glassmorphic Blur */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-50 px-6 h-24 flex items-center justify-between select-none transition-all duration-300 ease-in-out",
        isScrolled 
          ? "bg-zinc-950/80 backdrop-blur-xl border-b border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-saturate-150" 
          : "bg-transparent"
      )}>
        {/* 1. THE LIVE INDICATOR */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              isActiveContext ? "bg-[#002FA7]" : "bg-emerald-500"
            )}></span>
            <span className={cn(
              "relative inline-flex rounded-full h-1.5 w-1.5",
              isActiveContext ? "bg-[#002FA7]" : "bg-emerald-500"
            )}></span>
          </span>
          <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
            {isActiveContext ? 'Active_Context' : 'Scanning_Mode'}
          </span>
        </div>

        {/* 2. THE SYSTEM CLOCK (Forensic Detail) */}
        <div className="text-[10px] font-mono text-zinc-600 hidden md:block tabular-nums">
          {isActiveContext ? 'T-MINUS 14 D' : format(new Date(), 'HH:mm:ss')}
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
            if (target.scrollTop > 10 !== isScrolled) {
              setIsScrolled(target.scrollTop > 10);
            }
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-1 flex flex-col gap-6 overflow-y-auto px-6 pt-24 pb-32 np-scroll scroll-smooth"
        >
          {isActiveContext ? (
              <motion.div
                key="active-context"
                initial={{ y: -20, opacity: 0, filter: "blur(10px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: 20, opacity: 0, filter: "blur(10px)" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex flex-col gap-8 mt-2"
              >
                {/* 1. TELEMETRY (Targeting Mode) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Telemetry</h3>
                    <div className="flex items-center gap-1.5 text-[#002FA7] animate-pulse">
                      <span className="h-1 w-1 rounded-full bg-[#002FA7]" />
                      <span className="text-[9px] font-mono uppercase tracking-widest">Live</span>
                    </div>
                  </div>
                  <TelemetryWidget location={entityZone} />
                </div>

                {/* 2. SATELLITE (Infrastructure) */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Satellite_Uplink</h3>
                  <SatelliteUplink address={entityAddress} />
                </div>

                {/* 3. ORGANIZATIONAL (Intelligence) */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Org_Intelligence</h3>
                  <OrgIntelligence 
                    domain={contact?.companyDomain || account?.domain}
                    companyName={contact?.company || account?.name}
                    website={contact?.website || account?.domain}
                    accountId={isContactPage ? contact?.accountId : entityId}
                  />
                </div>

                {/* 4. TASKS (Execution) */}
                <div className="space-y-3 pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Node_Tasks</h3>
                    <button className="icon-button-forensic p-1 flex items-center justify-center">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <ContextTasksWidget entityId={entityId} entityName={entityName} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="scanning-mode"
                initial={{ opacity: 0, filter: "blur(10px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(10px)" }}
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
          </motion.div>
      </div>
    </aside>
  )
}

