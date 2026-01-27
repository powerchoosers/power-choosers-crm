'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Building2, MapPin, Globe, Phone, FileText, Activity, 
  Zap, Server, Users, ArrowLeft, MoreHorizontal,
  LayoutDashboard, Database, Terminal, Shield, Sparkles
} from 'lucide-react'
import { useAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useAccountContacts } from '@/hooks/useContacts'
import { useAccountCalls } from '@/hooks/useCalls'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

// Components
import { AccountUplinkCard } from '@/components/accounts/AccountUplinkCard'
import { LoadFactorBar } from '@/components/accounts/LoadFactorBar'
import { MeterArray } from '@/components/accounts/MeterArray'
import { StakeholderMap } from '@/components/accounts/StakeholderMap'
import DataIngestionCard from '@/components/dossier/DataIngestionCard'
import { CallListItem } from '@/components/calls/CallListItem'

export default function AccountDossierPage() {
  const params = useParams()
  const router = useRouter()
  const id = (params?.id as string) || ''

  const { data: account, isLoading } = useAccount(id)
  const { data: contacts, isLoading: isLoadingContacts } = useAccountContacts(id)
  const { data: calls, isLoading: isLoadingCalls } = useAccountCalls(id)
  const updateAccount = useUpdateAccount()
  
  const { isEditing, setIsEditing, toggleEditing } = useUIStore()
  const setContext = useGeminiStore((state) => state.setContext)

  const [isSaving, setIsSaving] = useState(false)
  const [showSynced, setShowSynced] = useState(false)
  const prevIsEditing = useRef(isEditing)

  // Set Gemini Context
  useEffect(() => {
    if (account) {
      setContext({
        type: 'account',
        id: account.id,
        label: `${account.name?.toUpperCase() || 'UNKNOWN ACCOUNT'}`,
        data: account
      })
    }
    return () => setContext(null)
  }, [account, setContext])

  // Auto-save on edit toggle
  useEffect(() => {
    if (prevIsEditing.current === isEditing) return
    const wasEditing = prevIsEditing.current
    prevIsEditing.current = isEditing

    if (wasEditing && !isEditing) {
      // Trigger save logic if we were editing and just stopped
      // For now, individual components might handle their own saves or we can trigger a global save here
      // Since components like AccountUplinkCard might update state directly via props, 
      // we rely on the onUpdate prop passed to them.
      setShowSynced(true)
      setTimeout(() => setShowSynced(false), 3000)
    }
  }, [isEditing])

  const handleUpdate = async (updates: any) => {
    try {
      await updateAccount.mutateAsync({ id, ...updates })
      toast.success('Account updated')
    } catch (err) {
      console.error(err)
      toast.error('Failed to update account')
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#002FA7] border-t-transparent rounded-full animate-spin" />
          <div className="font-mono text-xs text-zinc-500 animate-pulse">LOADING ASSET DATA...</div>
        </div>
      </div>
    )
  }

  if (!account) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-4">
        <div className="font-mono text-zinc-500">ACCOUNT NOT FOUND</div>
        <Button onClick={() => router.push('/network/accounts')}>Return to Grid</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden bg-black text-zinc-100">
      {/* 1. Corporate Entity Header */}
      <header className="flex-none px-6 py-4 border-b border-white/5 bg-zinc-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => router.push('/network/accounts')}
              className="text-zinc-500 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            {/* Logo/Icon */}
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center relative overflow-hidden group">
              {account.logoUrl ? (
                <img src={account.logoUrl} alt={account.name} className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-6 h-6 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              )}
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                {account.name}
                {account.status === 'ACTIVE_LOAD' && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-mono text-emerald-500 uppercase tracking-wider">Active Load</span>
                  </div>
                )}
              </h1>
              <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono mt-1">
                <span className="flex items-center gap-1 uppercase tracking-wider">
                  <Activity className="w-3 h-3" />
                  {account.industry || 'Unknown Sector'}
                </span>
                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {account.location || 'Unknown Location'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end mr-4">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Annual Volume</div>
              <div className="text-lg font-mono font-bold text-[#002FA7] tabular-nums tracking-tighter">
                {account.annualUsage ? `${account.annualUsage} kWh` : '--'}
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={toggleEditing}
              className={cn(
                "font-mono text-xs uppercase tracking-wider border-white/10",
                isEditing ? "bg-[#002FA7] text-white border-transparent hover:bg-[#002FA7]/90" : "hover:bg-white/5 text-zinc-400"
              )}
            >
              {isEditing ? 'Save Changes' : 'Edit Asset'}
            </Button>
          </div>
        </div>
      </header>

      {/* 2. Three-Column Grid Topology */}
      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-12 h-full">
          
          {/* Column A: Physics (Left Rail) - 25% */}
          <div className="col-span-3 border-r border-white/5 bg-zinc-900/20 overflow-y-auto p-4 space-y-6">
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-4 pl-1">
              01 // Physics
            </div>

            <AccountUplinkCard 
              account={account} 
              isEditing={isEditing}
              onUpdate={handleUpdate}
            />

            <div className="space-y-4 p-4 rounded-2xl border border-white/5 bg-zinc-900/30 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Volatility Profile</h3>
              </div>
              
              <LoadFactorBar value={account.loadFactor} />
              
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                  <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-tighter mb-1">Strike Price</div>
                  <div className="text-sm font-mono text-white tabular-nums">
                    {account.currentRate ? `${account.currentRate}¢` : '--'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                  <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-tighter mb-1">Contract End</div>
                  <div className={cn(
                    "text-sm font-mono tabular-nums",
                    account.contractEnd ? "text-white" : "text-zinc-600"
                  )}>
                    {account.contractEnd ? format(new Date(account.contractEnd), 'MM/yyyy') : '--'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column B: Infrastructure (Center) - 50% */}
          <div className="col-span-6 border-r border-white/5 bg-black/20 overflow-y-auto p-6 space-y-8">
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-4 pl-1">
              02 // Infrastructure
            </div>

            {/* Forensic Brief */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Terminal className="w-3 h-3" /> Forensic Brief
                </h3>
              </div>
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 min-h-[100px] font-mono text-sm text-zinc-300 leading-relaxed">
                {account.description || (
                  <span className="text-zinc-600 italic">No forensic data available. Initiate recon...</span>
                )}
              </div>
            </div>

            {/* Meter Array */}
            <MeterArray meters={account.meters} />

            {/* Data Locker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Database className="w-3 h-3" /> Data Locker
                </h3>
              </div>
              <DataIngestionCard accountId={account.id} />
            </div>
          </div>

          {/* Column C: Network (Right Rail) - 25% */}
          <div className="col-span-3 bg-zinc-900/20 overflow-y-auto p-4 space-y-6">
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-4 pl-1">
              03 // Network
            </div>

            {/* Stakeholder Map */}
            <StakeholderMap contacts={contacts || []} />

            {/* Engagement Stream (Calls) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Phone className="w-3 h-3" /> Engagement Log
                </h3>
                <span className="text-[9px] font-mono text-zinc-600">{calls?.length || 0} RECORDS</span>
              </div>
              
              <div className="space-y-2">
                {isLoadingCalls ? (
                  <div className="text-center py-8 text-xs font-mono text-zinc-600 animate-pulse">
                    SYNCING LOGS...
                  </div>
                ) : calls && calls.length > 0 ? (
                  calls.slice(0, 5).map(call => (
                    <CallListItem key={call.id} call={call} contactId={call.contactId || ''} />
                  ))
                ) : (
                  <div className="p-6 rounded-xl border border-dashed border-white/5 bg-white/[0.02] flex flex-col items-center justify-center gap-2">
                    <Phone className="w-4 h-4 text-zinc-700" />
                    <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">No signals detected</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
