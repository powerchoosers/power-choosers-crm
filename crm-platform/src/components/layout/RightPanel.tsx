'use client'

import { 
  Zap, CheckCircle, Play, DollarSign, Mic, ChevronRight 
} from 'lucide-react'
import { useParams, usePathname } from 'next/navigation'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { useContact } from '@/hooks/useContacts'
import { useAccount } from '@/hooks/useAccounts'

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
  
  const entityLocation = (contact ? (contact.city || 'LZ_NORTH') : account?.location) || 'LZ_NORTH'
  const entityAddress = (contact ? contact.address : account?.address) || ''
  const entityName = contact?.name || account?.name

  return (
    <aside className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950 border-l border-white/5 pt-9 pb-8 px-6 flex flex-col gap-6 overflow-y-auto hidden lg:flex np-scroll">
      
      {/* Calibration Marks (System Status Header) */}
      <div className="flex items-center justify-between px-2 mb-2 h-6 select-none shrink-0">
        {/* 1. THE LIVE INDICATOR */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#002FA7] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#002FA7]"></span>
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

            {/* 2. OPERATIONS DECK */}
            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6">
              <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Operations</h3>
              <div className="grid grid-cols-2 gap-3">
                  <OperationalButton icon={CheckCircle} label="Add Task" />
                  <OperationalButton icon={Play} label="Protocol" />
                  <OperationalButton icon={DollarSign} label="Create Deal" />
                  <OperationalButton icon={Mic} label="Log Call" />
              </div>
            </div>

            {/* 3. SATELLITE UPLINK */}
            <div className="space-y-1">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Asset Recon</h3>
              <SatelliteUplink address={entityAddress} />
            </div>

            {/* 4. ORG INTELLIGENCE */}
            <div className="space-y-1">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Organizational Intelligence</h3>
              <OrgIntelligence 
                companyName={contact?.companyName || account?.name}
                website={contact?.website || account?.domain}
                accountId={contact?.accountId || account?.id}
              />
            </div>

            {/* 5. CONTEXT TASKS */}
            <ContextTasksWidget entityId={entityId} entityName={entityName} />
          </motion.div>
        ) : (
          <motion.div
            key="global-context"
            initial={{ y: 20, opacity: 0, filter: "blur(10px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: -20, opacity: 0, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col gap-8 mt-2"
          >
            {/* 1. RAPID INGESTION */}
            <QuickActionsGrid />

            {/* 2. TACTICAL AGENDA (Scanning Mode) */}
            <GlobalTasksWidget />

            {/* 3. MARKET PULSE (ERCOT) */}
            <MarketPulseWidget />

            {/* 4. SIGNAL FEED */}
            <NewsFeedWidget />
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Status (Sticky at bottom) */}
      <div className="mt-auto pt-6">
        <div className="p-4 rounded-2xl nodal-glass">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
              <Zap size={16} />
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-400">System Status</div>
              <div className="text-sm font-bold text-white">All Systems Go</div>
            </div>
          </div>
          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
            <div className="bg-green-500 h-full w-full" />
          </div>
        </div>
      </div>

    </aside>
  )
}

