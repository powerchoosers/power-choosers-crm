'use client'

import { 
  Zap, CheckCircle, Play, DollarSign, Mic, ChevronRight 
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { useContact } from '@/hooks/useContacts'
import { useAccount } from '@/hooks/useAccounts'
import { useCallStore } from '@/store/callStore'
import { ActiveCallInterface } from '../calls/ActiveCallInterface'
import { cn } from '@/lib/utils'

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

export function RightPanel() {
  const pathname = usePathname()
  const params = useParams()
  
  // State detection
  const isContactPage = pathname.includes('/contacts/')
  const isAccountPage = pathname.includes('/accounts/')
  const isActiveContext = isContactPage || isAccountPage
  const entityId = params.id as string
  
  const { data: contact } = useContact(isContactPage ? entityId : '')
  const { data: account } = useAccount(isAccountPage ? entityId : '')
  
  const { isActive, status } = useCallStore()
  const isCallActive = isActive && (status === 'connected' || status === 'dialing')
  
  const [isReady, setIsReady] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsReady(true)
  }, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      setIsScrolled(container.scrollTop > 10)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isReady, isCallActive])

  if (!isReady) return <aside className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950 border-l border-white/5 hidden lg:flex" />

  const entityLocation = (contact ? (contact.city || 'LZ_NORTH') : account?.location) || 'LZ_NORTH'
  const entityAddress = (contact ? contact.address : account?.address) || ''
  const entityName = contact?.name || account?.name

  return (
    <aside className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950 border-l border-white/5 flex flex-col overflow-hidden hidden lg:flex np-scroll">
      
      {/* 1. THE HEADER (Fixed HUD Info) - Glassmorphic Blur */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-50 px-6 h-24 flex items-center justify-between select-none transition-all duration-300 ease-in-out",
        isScrolled 
          ? "bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-saturate-150" 
          : "bg-transparent border-b border-transparent"
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

      <AnimatePresence mode="wait">
        {isCallActive ? (
          <motion.div
            key="active-call"
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex-1 overflow-hidden pt-24"
          >
            <ActiveCallInterface contact={contact} account={account} />
          </motion.div>
        ) : (
          <motion.div 
            key="content-wrapper"
            ref={scrollContainerRef}
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
                <div className="space-y-1">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Telemetry</h3>
                  <TelemetryWidget location={entityLocation} />
                </div>

                {/* 2. SATELLITE (Infrastructure) */}
                <div className="space-y-1">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Satellite_Uplink</h3>
                  <SatelliteUplink address={entityAddress} />
                </div>

                {/* 3. ORGANIZATIONAL (Intelligence) */}
                <div className="space-y-1">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Org_Intelligence</h3>
                  <OrgIntelligence 
                    domain={contact?.companyDomain || account?.domain}
                    companyName={contact?.company || account?.name}
                    website={contact?.website || account?.domain}
                    accountId={isContactPage ? contact?.accountId : entityId}
                  />
                </div>

                {/* 4. TASKS (Execution) */}
                <div className="space-y-1 pb-4">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Node_Tasks</h3>
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
                {/* 1. MARKET PULSE (Global Energy Status) */}
                <div className="space-y-1">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Market_Pulse</h3>
                  <MarketPulseWidget />
                </div>

                {/* 2. SYSTEM TASKS (Network-wide tasks) */}
                <div className="space-y-1">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Network_Tasks</h3>
                  <GlobalTasksWidget />
                </div>

                {/* 3. NEWS FEED (Global Events) */}
                <div className="space-y-1 pb-4">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">System_Feed</h3>
                  <NewsFeedWidget />
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </aside>
  )
}

