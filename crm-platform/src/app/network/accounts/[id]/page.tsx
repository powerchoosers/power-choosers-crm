'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, MapPin, Globe, Phone, FileText, Activity,
  Zap, Server, Users, ArrowLeft, MoreHorizontal,
  LayoutDashboard, Database, Terminal, Shield, Sparkles, Clock, Mic,
  Lock, Unlock, Linkedin, Check, Plus, Copy
} from 'lucide-react'
import { useAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useAccountContacts, Contact } from '@/hooks/useContacts'
import { useAccountCalls } from '@/hooks/useCalls'
import { useEntityTasks } from '@/hooks/useEntityTasks'
import { useTasks, useAllPendingTasks } from '@/hooks/useTasks'
import { TaskCommandBar } from '@/components/crm/TaskCommandBar'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { Button } from '@/components/ui/button'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'
import { LoadingOrb } from '@/components/ui/LoadingOrb'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { domainToClickableUrl } from '@/lib/url'
import { differenceInCalendarDays, format, isValid, parseISO, formatDistanceToNow } from 'date-fns'

// Components
import { AccountUplinkCard } from '@/components/accounts/AccountUplinkCard'
import { LoadFactorBar } from '@/components/accounts/LoadFactorBar'
import { MeterArray } from '@/components/accounts/MeterArray'
import { StakeholderMap } from '@/components/accounts/StakeholderMap'
import DataIngestionCard from '@/components/dossier/DataIngestionCard'
import { CallListItem } from '@/components/calls/CallListItem'

function parseContractEndDate(raw: unknown): Date | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  const iso = parseISO(s)
  if (isValid(iso)) return iso
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    const mm = Number(mdy[1])
    const dd = Number(mdy[2])
    const yyyy = Number(mdy[3])
    const d = new Date(yyyy, mm - 1, dd)
    return isValid(d) ? d : null
  }
  const fallback = new Date(s)
  return isValid(fallback) ? fallback : null
}

function clamp01(n: number) {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export default function AccountDossierPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = (params?.id as string) || ''

  const { data: account, isLoading } = useAccount(id)
  const { data: contacts, isLoading: isLoadingContacts } = useAccountContacts(id)
  const contactIds = contacts?.map(c => c.id).filter(Boolean) || []
  const { data: calls, isLoading: isLoadingCalls } = useAccountCalls(id, contactIds)
  const updateAccount = useUpdateAccount()

  const { isEditing, setIsEditing, toggleEditing, setRightPanelMode, setIngestionContext, lastEnrichedAccountId } = useUIStore()
  const setContext = useGeminiStore((state) => state.setContext)

  const [isSaving, setIsSaving] = useState(false)
  const [showSynced, setShowSynced] = useState(false)
  const [activeEditField, setActiveEditField] = useState<'logo' | 'domain' | 'linkedin' | null>(null)
  const prevIsEditing = useRef(isEditing)

  const { pendingTasks } = useEntityTasks(id, account?.name)
  const { data: allPendingData } = useAllPendingTasks()
  const allPendingTasks = allPendingData?.allPendingTasks ?? []
  const globalTotal = allPendingData?.totalCount ?? 0
  const { updateTask } = useTasks()
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0)
  const hasTasks = pendingTasks.length > 0
  const displayTaskIndex = Math.min(currentTaskIndex, Math.max(0, pendingTasks.length - 1))
  const currentTask = pendingTasks[displayTaskIndex]
  const globalIndex = currentTask ? allPendingTasks.findIndex((t) => String(t.id) === String(currentTask.id)) : -1
  const globalPosition = globalIndex >= 0 ? globalIndex + 1 : 0
  const useGlobalPagination = globalIndex >= 0 && globalTotal > 0

  useEffect(() => {
    setCurrentTaskIndex((prev) => Math.min(prev, Math.max(0, pendingTasks.length - 1)))
  }, [pendingTasks.length])

  const taskIdFromUrl = searchParams?.get('taskId') ?? null
  useEffect(() => {
    if (!taskIdFromUrl || !pendingTasks.length) return
    const idx = pendingTasks.findIndex((t) => t.id === taskIdFromUrl)
    if (idx >= 0) setCurrentTaskIndex(idx)
  }, [taskIdFromUrl, pendingTasks])

  const navId = String(id).trim()
  const getTaskContactId = (t: { contactId?: string }) => (t.contactId != null && String(t.contactId).trim() !== '') ? String(t.contactId).trim() : undefined
  const getTaskAccountId = (t: { accountId?: string }) => (t.accountId != null && String(t.accountId).trim() !== '') ? String(t.accountId).trim() : undefined

  const navigateToTaskDossier = (task: { id: string; contactId?: string; accountId?: string }) => {
    const cid = getTaskContactId(task)
    const aid = getTaskAccountId(task)
    if (cid) {
      router.push(`/network/contacts/${cid}?taskId=${encodeURIComponent(task.id)}`)
    } else if (aid) {
      router.push(`/network/accounts/${aid}?taskId=${encodeURIComponent(task.id)}`)
    }
  }

  const handlePrev = () => {
    if (globalIndex < 0) {
      setCurrentTaskIndex((p) => Math.max(0, p - 1))
      return
    }
    if (globalIndex <= 0) return
    let prevIdx = globalIndex - 1
    let prevTask = allPendingTasks[prevIdx]
    while (prevTask && !getTaskContactId(prevTask) && !getTaskAccountId(prevTask) && prevIdx > 0) {
      prevIdx -= 1
      prevTask = allPendingTasks[prevIdx]
    }
    if (!prevTask) return
    const prevContactId = getTaskContactId(prevTask)
    const prevAccountId = getTaskAccountId(prevTask)
    const isSameEntity = (prevAccountId && prevAccountId === navId) || (prevContactId && prevContactId === navId)
    if (isSameEntity) {
      const localIdx = pendingTasks.findIndex((t) => String(t.id) === String(prevTask!.id))
      if (localIdx >= 0) setCurrentTaskIndex(localIdx)
    } else if (prevContactId || prevAccountId) {
      navigateToTaskDossier(prevTask)
    }
  }

  const handleNext = () => {
    if (globalIndex < 0) {
      setCurrentTaskIndex((p) => Math.min(pendingTasks.length - 1, p + 1))
      return
    }
    if (globalIndex >= allPendingTasks.length - 1) return
    let nextIdx = globalIndex + 1
    let nextTask = allPendingTasks[nextIdx]
    while (nextTask && !getTaskContactId(nextTask) && !getTaskAccountId(nextTask) && nextIdx < allPendingTasks.length - 1) {
      nextIdx += 1
      nextTask = allPendingTasks[nextIdx]
    }
    if (!nextTask) return
    const nextContactId = getTaskContactId(nextTask)
    const nextAccountId = getTaskAccountId(nextTask)
    const isSameEntity = (nextAccountId && nextAccountId === navId) || (nextContactId && nextContactId === navId)
    if (isSameEntity) {
      const localIdx = pendingTasks.findIndex((t) => String(t.id) === String(nextTask!.id))
      if (localIdx >= 0) setCurrentTaskIndex(localIdx)
    } else if (nextContactId || nextAccountId) {
      navigateToTaskDossier(nextTask)
    }
  }

  const handleCompleteAndAdvance = () => {
    const task = pendingTasks[displayTaskIndex]
    if (!task) return
    updateTask({ id: task.id, status: 'Completed' })
    const nextGlobalIndex = globalIndex >= 0 ? globalIndex : 0
    if (nextGlobalIndex + 1 < allPendingTasks.length) {
      let nextIdx = nextGlobalIndex + 1
      let nextTask = allPendingTasks[nextIdx]
      while (nextTask && !getTaskContactId(nextTask) && !getTaskAccountId(nextTask) && nextIdx < allPendingTasks.length - 1) {
        nextIdx += 1
        nextTask = allPendingTasks[nextIdx]
      }
      if (nextTask && (getTaskContactId(nextTask) || getTaskAccountId(nextTask))) {
        navigateToTaskDossier(nextTask)
      } else {
        toast.success('Task completed')
      }
    } else {
      toast.success('Mission complete')
    }
  }

  // Enter key in dossier status (edit) mode syncs the record (same as padlock)
  useEffect(() => {
    if (!isEditing) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        toggleEditing()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isEditing, toggleEditing])

  // Terminal State
  const [isTyping, setIsTyping] = useState(false)
  const [terminalInput, setTerminalInput] = useState('')
  const [descriptionCopied, setDescriptionCopied] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editAnnualUsage, setEditAnnualUsage] = useState('')
  const [editStrikePrice, setEditStrikePrice] = useState('')
  const [editIndustry, setEditIndustry] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editLogoUrl, setEditLogoUrl] = useState('')
  const [editDomain, setEditDomain] = useState('')
  const [editLinkedinUrl, setEditLinkedinUrl] = useState('')
  const [editMeters, setEditMeters] = useState<any[]>([])
  const [editContractEnd, setEditContractEnd] = useState('')
  const [editCompanyPhone, setEditCompanyPhone] = useState('')
  const [editAddress, setEditAddress] = useState('')

  // Refraction Event State (for field glow animations)
  const [glowingFields, setGlowingFields] = useState<Set<string>>(new Set())
  const [isRecalibrating, setIsRecalibrating] = useState(false)
  // Blur-in for fields that update after ingestion (so data doesn't just pop in)
  const [recentlyUpdatedFields, setRecentlyUpdatedFields] = useState<Set<string>>(new Set())
  const prevAccountRef = useRef<typeof account>(undefined)
  const justIngestedRef = useRef(false)

  // Set Gemini Context
  useEffect(() => {
    if (account) {
      setContext({
        type: 'account',
        id: account.id,
        label: `${account.name?.toUpperCase() || 'UNKNOWN ACCOUNT'}`,
        data: {
          ...account,
          // Promote fields for AI Context consistency
          revenue: account.revenue || account.metadata?.revenue || account.metadata?.annual_revenue,
          employees: account.employees || account.metadata?.employees || account.metadata?.employee_count,
          industry: account.industry || account.metadata?.industry,
          description: account.description || account.metadata?.description || account.metadata?.general?.description,
          service_addresses: account.serviceAddresses || account.metadata?.service_addresses || [],
          // Ensure energy metrics are visible if only in metadata
          annual_usage: account.annualUsage || account.metadata?.annual_usage,
          current_rate: account.currentRate || account.metadata?.current_rate,
          contract_end_date: account.contractEnd || account.metadata?.contract_end_date,
          electricity_supplier: account.electricitySupplier || account.metadata?.electricity_supplier,
        } as any
      })
      setEditNotes(account.description || '')
      setEditAnnualUsage(account.annualUsage?.toString() || '')
      setEditStrikePrice(account.currentRate || '')
      setEditIndustry(account.industry || '')
      setEditLocation(account.location || '')
      setEditLogoUrl(account.logoUrl || '')
      setEditDomain(account.domain || '')
      setEditLinkedinUrl(account.linkedinUrl || '')
      setEditCompanyPhone(account.companyPhone || '')
      setEditAddress(account.address || '')
      // Transform serviceAddresses into meters format for MeterArray component
      const transformedMeters = (account.serviceAddresses || []).map((addr: any, idx: number) => {
        // Handle both string addresses and structured meter objects
        if (typeof addr === 'string') {
          return {
            id: `addr_${idx}`,
            esiId: '',
            address: addr,
            rate: account.currentRate || '',
            endDate: account.contractEnd || ''
          }
        }
        // Already structured: ensure stable id for list keys
        return { ...addr, id: addr?.id ?? `meter_${idx}` }
      })
      setEditMeters(account.meters?.length ? account.meters : transformedMeters)
      setEditContractEnd(account.contractEnd || '')
    }
    return () => setContext(null)
  }, [account, setContext])

  // Auto-save on edit toggle
  useEffect(() => {
    if (prevIsEditing.current === isEditing) return
    const wasEditing = prevIsEditing.current
    prevIsEditing.current = isEditing

    if (wasEditing && !isEditing) {
      const triggerSave = async () => {
        try {
          // Clean annual usage input (remove commas/non-digits)
          const cleanedUsage = parseInt(editAnnualUsage.replace(/[^0-9]/g, '')) || 0

          await updateAccount.mutateAsync({
            id,
            description: editNotes,
            annualUsage: cleanedUsage.toString(), // Send as string to match interface
            currentRate: editStrikePrice,
            industry: editIndustry,
            location: editLocation,
            logoUrl: editLogoUrl,
            domain: editDomain,
            linkedinUrl: editLinkedinUrl,
            meters: editMeters,
            contractEnd: editContractEnd,
            companyPhone: editCompanyPhone,
            address: editAddress
          })
          setShowSynced(true)
          setTimeout(() => setShowSynced(false), 3000)
          toast.success('System Synced')
        } catch (err: any) {
          console.error('Sync Error Details:', {
            message: err?.message,
            details: err?.details,
            hint: err?.hint,
            code: err?.code,
            error: err
          })
          toast.error(`Sync failed: ${err?.message || 'Unknown error'}`)
        }
      }
      triggerSave()
    }
  }, [isEditing, id, editNotes, editAnnualUsage, editStrikePrice, editIndustry, editLocation, editLogoUrl, editDomain, editLinkedinUrl, editMeters, editContractEnd, editCompanyPhone, editAddress, updateAccount])

  // Uplink fields update local state only; persisted when user locks dossier (padlock)
  const handleUpdate = (updates: Partial<{ companyPhone: string; domain: string; address: string }>) => {
    if (updates.companyPhone !== undefined) setEditCompanyPhone(updates.companyPhone)
    if (updates.domain !== undefined) setEditDomain(updates.domain)
    if (updates.address !== undefined) setEditAddress(updates.address)
  }

  const handleMetersUpdate = (updatedMeters: any[]) => {
    setEditMeters(updatedMeters)
  }

  // Detect which fields changed after ingestion or Org Intelligence enrich and mark for blur-in animation
  useEffect(() => {
    if (!account) return
    const fromEnrich = lastEnrichedAccountId === account.id
    if (!justIngestedRef.current && !isRecalibrating && !fromEnrich) {
      prevAccountRef.current = account
      return
    }
    const prev = prevAccountRef.current
    const changed = new Set<string>()
    if (prev) {
      if ((prev.contractEnd ?? '') !== (account.contractEnd ?? '')) changed.add('contractEnd')
      if ((prev.electricitySupplier ?? '') !== (account.electricitySupplier ?? '')) changed.add('currentSupplier')
      if ((prev.currentRate ?? '') !== (account.currentRate ?? '')) changed.add('strikePrice')
      if ((prev.annualUsage ?? '') !== (account.annualUsage ?? '')) {
        changed.add('annualVolume')
        changed.add('revenue')
      }
      const prevMeters = prev.meters ?? []
      const currMeters = account.meters ?? []
      if (prevMeters.length !== currMeters.length || JSON.stringify(prevMeters.map((m) => m.esiId)) !== JSON.stringify(currMeters.map((m) => m.esiId))) changed.add('meters')
      // Apollo/Org Intelligence enriched fields
      if ((prev.industry ?? '') !== (account.industry ?? '')) changed.add('industry')
      if ((prev.location ?? '') !== (account.location ?? '')) changed.add('location')
      if ((prev.logoUrl ?? '') !== (account.logoUrl ?? '')) changed.add('logoUrl')
      if ((prev.description ?? '') !== (account.description ?? '')) changed.add('description')
      if ((prev.companyPhone ?? '') !== (account.companyPhone ?? '')) changed.add('companyPhone')
      if ((prev.address ?? '') !== (account.address ?? '')) changed.add('address')
      if ((prev.linkedinUrl ?? '') !== (account.linkedinUrl ?? '')) changed.add('linkedinUrl')
      if ((prev.domain ?? '') !== (account.domain ?? '')) changed.add('domain')
    }
    prevAccountRef.current = account
    if (changed.size) {
      setRecentlyUpdatedFields(changed)
      const t = setTimeout(() => setRecentlyUpdatedFields(new Set()), 1600)
      return () => clearTimeout(t)
    }
  }, [account, isRecalibrating, lastEnrichedAccountId])

  // Handle Document Ingestion Complete (Refraction Event)
  const handleIngestionComplete = () => {
    justIngestedRef.current = true
    setTimeout(() => { justIngestedRef.current = false }, 2500)
    setIsRecalibrating(true)
    const fieldsToGlow = new Set([
      'contractEnd',
      'daysRemaining',
      'currentSupplier',
      'strikePrice',
      'annualVolume',
      'revenue'
    ])
    setGlowingFields(fieldsToGlow)
    setTimeout(() => {
      setIsRecalibrating(false)
      setGlowingFields(new Set())
    }, 1500)
  }

  // Maturity Logic
  const contractEndDate = useMemo(() => parseContractEndDate(account?.contractEnd), [account?.contractEnd])
  const daysRemaining = contractEndDate ? differenceInCalendarDays(contractEndDate, new Date()) : null

  const maturityPct = useMemo(() => {
    if (daysRemaining == null) return 0
    return clamp01(1 - daysRemaining / 365)
  }, [daysRemaining])

  const maturityColor = useMemo(() => {
    if (daysRemaining == null) return 'bg-zinc-700'
    if (daysRemaining < 90) return 'bg-red-500'
    if (daysRemaining < 180) return 'bg-yellow-500'
    if (daysRemaining > 365) return 'bg-[#002FA7]'
    return 'bg-[#002FA7]'
  }, [daysRemaining])

  // Terminal Logic
  const handleTerminalClick = () => setIsTyping(true)

  const handleTerminalSubmit = async () => {
    if (!terminalInput.trim()) {
      setIsTyping(false)
      return
    }

    const input = terminalInput.trim()

    // System Commands
    if (input.startsWith('/')) {
      const cmd = input.slice(1).toLowerCase()
      if (cmd === 'clear') {
        try {
          await updateAccount.mutateAsync({ id, description: '' })
          setEditNotes('')
          toast.success('Dossier wiped')
          setTerminalInput('')
          setIsTyping(false)
          return
        } catch (err) {
          toast.error('Wipe failed')
        }
      }
      if (cmd === 'help') {
        toast.info('Available: /clear, /status, /refresh')
        setTerminalInput('')
        return
      }
      if (cmd === 'status') {
        toast.info(`Position Maturity: ${daysRemaining ?? '--'} days`)
        setTerminalInput('')
        return
      }
      if (cmd === 'refresh') {
        router.refresh()
        toast.success('System refreshed')
        setTerminalInput('')
        return
      }
    }

    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm')
    const newNote = `[${timestamp}] ${input}`
    const updatedNotes = editNotes ? `${editNotes}\n\n${newNote}` : newNote

    setEditNotes(updatedNotes)
    await updateAccount.mutateAsync({ id, description: updatedNotes })
    setTerminalInput('')
    setIsTyping(false)
    toast.success('Log entry appended')
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <LoadingOrb label="LOADING ASSET DATA..." />
      </div>
    )
  }

  if (!account) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center gap-4 animate-in fade-in duration-500">
        <div className="font-mono text-zinc-500">ACCOUNT NOT FOUND</div>
        <Button onClick={() => router.back()}>Return to Grid</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#002FA7]/10 blur-[120px] rounded-full pointer-events-none" />

        {/* 1. Corporate Entity Header */}
        <header className="flex-none px-6 py-6 md:px-8 border-b border-white/5 nodal-recessed relative z-10">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="icon-button-forensic w-10 h-10 flex items-center justify-center -ml-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {/* Logo/Icon */}
              <div className="relative group/logo">
                <div onClick={() => isEditing && setActiveEditField(activeEditField === 'logo' ? null : 'logo')}>
                  {recentlyUpdatedFields.has('logoUrl') ? (
                    <motion.div
                      initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                      animate={{ filter: 'blur(0px)', opacity: 1 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                      <CompanyIcon
                        key={`dossier-logo-${account.id}-${(editLogoUrl?.trim() || account.logoUrl?.trim()) || 'none'}`}
                        logoUrl={(editLogoUrl?.trim() || account.logoUrl?.trim()) || undefined}
                        domain={(editDomain?.trim() || account.domain?.trim()) || undefined}
                        name={account.name}
                        size={56}
                        roundedClassName="rounded-[14px]"
                        className={cn(
                          "w-14 h-14 transition-all",
                          isEditing && "cursor-pointer hover:border-[#002FA7]/50 hover:shadow-[0_0_20px_rgba(0,47,167,0.3)]"
                        )}
                      />
                    </motion.div>
                  ) : (
                    <CompanyIcon
                      key={`dossier-logo-${account.id}-${(editLogoUrl?.trim() || account.logoUrl?.trim()) || 'none'}`}
                      logoUrl={(editLogoUrl?.trim() || account.logoUrl?.trim()) || undefined}
                      domain={(editDomain?.trim() || account.domain?.trim()) || undefined}
                      name={account.name}
                      size={56}
                      roundedClassName="rounded-[14px]"
                      className={cn(
                        "w-14 h-14 transition-all",
                        isEditing && "cursor-pointer hover:border-[#002FA7]/50 hover:shadow-[0_0_20px_rgba(0,47,167,0.3)]"
                      )}
                    />
                  )}
                </div>

                <AnimatePresence>
                  {isEditing && activeEditField === 'logo' && (
                    <motion.div
                      key="logo-edit"
                      initial={{ width: 0, opacity: 0, x: -10 }}
                      animate={{ width: "auto", opacity: 1, x: 0 }}
                      exit={{ width: 0, opacity: 0, x: -10 }}
                      className="absolute left-full ml-3 top-1/2 -translate-y-1/2 flex items-center z-50"
                    >
                      <div className="bg-zinc-950/90 backdrop-blur-xl nodal-monolith-edge rounded-lg p-2 shadow-2xl flex items-center gap-2 min-w-[320px]">
                        <div className="p-1.5 bg-white/5 rounded border border-white/10 text-zinc-500">
                          <Activity className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="text"
                          value={editLogoUrl}
                          onChange={(e) => setEditLogoUrl(e.target.value)}
                          placeholder="PASTE LOGO URL..."
                          className="bg-transparent border-none focus:ring-0 text-[10px] font-mono text-white w-full placeholder:text-zinc-700 uppercase tracking-widest"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-semibold tracking-tighter text-white">
                    {!isEditing ? (
                      <ForensicDataPoint
                        value={account.name ?? ''}
                        copyValue={account.name ?? undefined}
                        valueClassName="text-2xl font-semibold tracking-tighter text-white"
                        inline
                        compact
                      />
                    ) : (
                      account.name
                    )}
                  </h1>

                  {/* External Links */}
                  <div className="flex items-center gap-1 bg-white/[0.02] rounded-full p-1 border border-white/5 relative group/links">
                    <div className="flex items-center">
                      <button
                        onClick={() => {
                          if (isEditing) {
                            setActiveEditField(activeEditField === 'domain' ? null : 'domain')
                          } else {
                            const url = editDomain ? domainToClickableUrl(editDomain) : domainToClickableUrl(account.domain)
                            if (url) window.open(url, '_blank')
                          }
                        }}
                        className={cn(
                          "icon-button-forensic p-1.5",
                          !editDomain && !account.domain && "opacity-50 cursor-not-allowed",
                          isEditing && activeEditField === 'domain' && "bg-[#002FA7]/20 text-white",
                          isEditing && "hover:bg-[#002FA7]/20 transition-colors"
                        )}
                        title={isEditing ? "Edit Domain" : "Visit Website"}
                      >
                        <Globe className="w-3.5 h-3.5" />
                      </button>

                      <AnimatePresence>
                        {isEditing && activeEditField === 'domain' && (
                          <motion.div
                            key="domain-edit"
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: "auto", opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="flex items-center overflow-hidden"
                          >
                            <input
                              type="text"
                              value={editDomain}
                              onChange={(e) => setEditDomain(e.target.value)}
                              placeholder="DOMAIN.COM"
                              className="bg-transparent border-none focus:ring-0 text-[9px] font-mono text-white w-24 placeholder:text-zinc-700 uppercase tracking-widest h-6"
                              autoFocus
                              onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="w-px h-3 bg-white/10" />

                    <div className="flex items-center">
                      <button
                        onClick={() => {
                          if (isEditing) {
                            setActiveEditField(activeEditField === 'linkedin' ? null : 'linkedin')
                          } else {
                            const url = editLinkedinUrl || account.linkedinUrl
                            if (url) window.open(url, '_blank')
                          }
                        }}
                        className={cn(
                          "icon-button-forensic p-1.5",
                          !editLinkedinUrl && !account.linkedinUrl && "opacity-50 cursor-not-allowed",
                          isEditing && activeEditField === 'linkedin' && "bg-[#002FA7]/20 text-white",
                          isEditing && "hover:bg-[#002FA7]/20 transition-colors"
                        )}
                        title={isEditing ? "Edit LinkedIn" : "View LinkedIn"}
                      >
                        <Linkedin className="w-3.5 h-3.5" />
                      </button>

                      <AnimatePresence>
                        {isEditing && activeEditField === 'linkedin' && (
                          <motion.div
                            key="linkedin-edit"
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: "auto", opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="flex items-center overflow-hidden"
                          >
                            <input
                              type="text"
                              value={editLinkedinUrl}
                              onChange={(e) => setEditLinkedinUrl(e.target.value)}
                              placeholder="LINKEDIN URL"
                              className="bg-transparent border-none focus:ring-0 text-[9px] font-mono text-white w-24 placeholder:text-zinc-700 uppercase tracking-widest h-6"
                              autoFocus
                              onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Status/Sync Indicators (Mirrored from Contact Dossier) */}
                  <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    {(() => {
                      const hasContract = !!account.contractEnd
                      const contractEnd = parseContractEndDate(account.contractEnd)
                      const isExpired = hasContract && contractEnd && contractEnd < new Date()
                      const isCustomer = account.status === 'CUSTOMER'
                      const isActiveLoad = (hasContract && !isExpired) || account.status === 'ACTIVE_LOAD'

                      const displayStatus = isCustomer
                        ? 'Customer'
                        : isActiveLoad
                          ? 'Active Load'
                          : isExpired
                            ? 'Expired'
                            : 'No Contract'
                      const isActive = isCustomer || isActiveLoad

                      return (
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full nodal-module-glass border border-white/5">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isCustomer ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                              isActiveLoad ? "bg-signal animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.5)]" :
                                isExpired ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                  "bg-zinc-600"
                          )} />
                          <span className={cn(
                            "text-[10px] font-mono uppercase tracking-widest font-medium",
                            isCustomer ? "text-emerald-500" :
                              isActiveLoad ? "text-signal" :
                                isExpired ? "text-red-500/80" :
                                  "text-zinc-500"
                          )}>
                            {displayStatus}
                          </span>
                        </div>
                      )
                    })()}

                    {/* Last Sync Indicator */}
                    {account.updated && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full nodal-module-glass border border-white/5">
                        <Clock className="w-2.5 h-2.5 text-zinc-600" />
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                          Last_Sync: {(() => {
                            try {
                              return formatDistanceToNow(new Date(account.updated), { addSuffix: true }).toUpperCase()
                            } catch (e) {
                              return 'UNKNOWN'
                            }
                          })()}
                        </span>
                      </div>
                    )}

                    {/* Synced indicator with exit animation */}
                    <AnimatePresence>
                      {showSynced && (
                        <motion.div
                          key="synced-indicator"
                          initial={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                          exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                          transition={{ duration: 0.3 }}
                          className="flex items-center gap-1 text-[10px] font-mono text-green-500 ml-2"
                        >
                          <Check className="w-3 h-3" />
                          <span className="uppercase tracking-widest">Synced</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono mb-2 w-full">
                  {isEditing ? (
                    <div className="flex items-center gap-4 w-full">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Activity className="w-3.5 h-3.5 text-white shrink-0" />
                        <input
                          type="text"
                          value={editIndustry}
                          onChange={(e) => setEditIndustry(e.target.value)}
                          className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-full focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                          placeholder="INDUSTRY SECTOR"
                        />
                      </div>
                      <span className="w-1 h-1 rounded-full bg-black/40 shrink-0" />
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
                        <input
                          type="text"
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-full focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                          placeholder="CITY, STATE"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {recentlyUpdatedFields.has('industry') ? (
                        <motion.span
                          initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                          animate={{ filter: 'blur(0px)', opacity: 1 }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          className="flex items-center gap-1.5 uppercase tracking-widest text-zinc-400"
                        >
                          <Activity className="w-3.5 h-3.5 text-white shrink-0" />
                          <ForensicDataPoint value={account.industry || 'Unknown Sector'} copyValue={account.industry || undefined} valueClassName="uppercase tracking-widest text-zinc-400" inline />
                        </motion.span>
                      ) : (
                        <span className="flex items-center gap-1.5 uppercase tracking-widest text-zinc-400">
                          <Activity className="w-3.5 h-3.5 text-white shrink-0" />
                          <ForensicDataPoint value={account.industry || 'Unknown Sector'} copyValue={account.industry || undefined} valueClassName="uppercase tracking-widest text-zinc-400" inline />
                        </span>
                      )}
                      <span className="w-1 h-1 rounded-full bg-zinc-800" />
                      {recentlyUpdatedFields.has('location') ? (
                        <motion.span
                          initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                          animate={{ filter: 'blur(0px)', opacity: 1 }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          className="flex items-center gap-1.5 text-zinc-400"
                        >
                          <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
                          <ForensicDataPoint value={account.location || 'Unknown Location'} copyValue={account.location || undefined} valueClassName="text-zinc-400" inline />
                        </motion.span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-zinc-400">
                          <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
                          <ForensicDataPoint value={account.location || 'Unknown Location'} copyValue={account.location || undefined} valueClassName="text-zinc-400" inline />
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-2">
                    {!hasTasks && (
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Dossier Status</div>
                    )}
                    {hasTasks && (
                      <>
                        <div className={cn(
                          "h-2 w-2 rounded-full animate-pulse shrink-0",
                          isEditing ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                        )} />
                        <TaskCommandBar
                          pendingTasks={pendingTasks}
                          currentIndex={displayTaskIndex}
                          globalTotal={useGlobalPagination ? globalTotal : undefined}
                          globalPosition={useGlobalPagination ? globalPosition : undefined}
                          onPrev={handlePrev}
                          onNext={handleNext}
                          onSkip={handleNext}
                          onCompleteAndAdvance={handleCompleteAndAdvance}
                        />
                      </>
                    )}
                    <button
                      onClick={toggleEditing}
                      className={cn(
                        "w-7 h-7 flex items-center justify-center transition-all duration-300",
                        isEditing
                          ? "text-blue-400 bg-blue-400/10 border border-blue-400/30 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.2)] scale-110"
                          : "text-zinc-500 hover:text-white bg-transparent border border-transparent"
                      )}
                      title={isEditing ? "Lock Dossier" : "Unlock Dossier"}
                    >
                      {isEditing ? (
                        <Unlock className="w-4 h-4" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {!hasTasks && (
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-2 w-2 rounded-full animate-pulse",
                        isEditing ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                      )} />
                      <span className={cn(
                        "text-xs font-mono uppercase tracking-widest transition-colors duration-300",
                        isEditing ? "text-blue-400" : "text-green-500"
                      )}>
                        {isEditing ? "SECURE_FIELD_OVERRIDE" : "ACTIVE_INTELLIGENCE"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Grid Content */}
        <div className="flex-1 flex overflow-hidden relative z-10 group/dossier">
          <div className="grid grid-cols-12 w-full h-full">

            {/* Column A: Physics (3 cols) */}
            <div className="col-span-3 h-full overflow-y-auto p-6 border-r border-white/5 np-scroll scrollbar-thin scrollbar-thumb-zinc-800/0 hover:scrollbar-thumb-zinc-800/50 scrollbar-track-transparent transition-all duration-300 bg-black/10">
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-700">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] mb-4">01 // Physics</div>

                {(recentlyUpdatedFields.has('companyPhone') || recentlyUpdatedFields.has('address') || recentlyUpdatedFields.has('domain')) ? (
                  <motion.div
                    initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                    animate={{ filter: 'blur(0px)', opacity: 1 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  >
                    <AccountUplinkCard
                      account={{
                        ...account,
                        companyPhone: editCompanyPhone || account.companyPhone,
                        domain: editDomain || account.domain,
                        address: editAddress || account.address,
                        logoUrl: editLogoUrl || account.logoUrl,
                        metadata: account.metadata
                      }}
                      isEditing={isEditing}
                      onUpdate={handleUpdate}
                    />
                  </motion.div>
                ) : (
                  <AccountUplinkCard
                    account={{
                      ...account,
                      companyPhone: editCompanyPhone || account.companyPhone,
                      domain: editDomain || account.domain,
                      address: editAddress || account.address,
                      logoUrl: editLogoUrl || account.logoUrl,
                      metadata: account.metadata
                    }}
                    isEditing={isEditing}
                    onUpdate={handleUpdate}
                  />
                )}

                {/* Position Maturity (Ported Style) */}
                <div className={cn(
                  "nodal-void-card transition-all duration-500 p-6 relative overflow-hidden shadow-lg space-y-6",
                  isEditing ? 'border-[#002FA7]/30' : 'border-white/10',
                  isRecalibrating && 'grayscale backdrop-blur-2xl'
                )}>

                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Position Maturity</h4>
                      <div className="text-right flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Expiration:</span>
                        {isEditing ? (
                          <input
                            type="date"
                            value={editContractEnd}
                            onChange={(e) => setEditContractEnd(e.target.value)}
                            className="bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-xs font-mono text-white tabular-nums focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                          />
                        ) : (
                          recentlyUpdatedFields.has('contractEnd') ? (
                            <motion.span
                              initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                              animate={{ filter: 'blur(0px)', opacity: 1 }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                              className={cn(
                                "text-white font-mono font-bold tabular-nums inline-block",
                                glowingFields.has('contractEnd') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)]"
                              )}
                            >
                              <ForensicDataPoint
                                value={contractEndDate ? format(contractEndDate, 'MMM dd, yyyy') : 'TBD'}
                                copyValue={contractEndDate ? format(contractEndDate, 'yyyy-MM-dd') : undefined}
                                valueClassName={cn("text-white font-mono font-bold tabular-nums", glowingFields.has('contractEnd') && "text-[#002FA7]")}
                                inline
                              />
                            </motion.span>
                          ) : (
                            <span className={cn(
                              "text-white font-mono font-bold tabular-nums transition-all duration-800",
                              glowingFields.has('contractEnd') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)] animate-in fade-in duration-500"
                            )}>
                              <ForensicDataPoint
                                value={contractEndDate ? format(contractEndDate, 'MMM dd, yyyy') : 'TBD'}
                                copyValue={contractEndDate ? format(contractEndDate, 'yyyy-MM-dd') : undefined}
                                valueClassName={cn("text-white font-mono font-bold tabular-nums", glowingFields.has('contractEnd') && "text-[#002FA7]")}
                                inline
                              />
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden relative">
                      <div className={`h-full ${maturityColor} transition-all duration-1000 ease-out relative`} style={{ width: `${Math.round(maturityPct * 100)}%` }}>
                        <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 shadow-[0_0_10px_white]" />
                      </div>
                    </div>

                    <div className="flex justify-between mt-2">
                      {recentlyUpdatedFields.has('contractEnd') ? (
                        <motion.span
                          initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                          animate={{ filter: 'blur(0px)', opacity: 1 }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          className={cn(
                            "text-xs text-[#002FA7] font-mono tabular-nums ml-auto inline-block",
                            glowingFields.has('daysRemaining') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                          )}
                        >
                          <ForensicDataPoint
                            value={daysRemaining != null ? `${Math.max(daysRemaining, 0)} Days Remaining` : '-- Days Remaining'}
                            copyValue={daysRemaining != null ? String(Math.max(daysRemaining, 0)) : undefined}
                            valueClassName="text-xs text-[#002FA7] font-mono tabular-nums"
                            inline
                          />
                        </motion.span>
                      ) : (
                        <span className={cn(
                          "text-xs text-[#002FA7] font-mono tabular-nums ml-auto transition-all duration-800",
                          glowingFields.has('daysRemaining') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-in fade-in duration-500"
                        )}>
                          <ForensicDataPoint
                            value={daysRemaining != null ? `${Math.max(daysRemaining, 0)} Days Remaining` : '-- Days Remaining'}
                            copyValue={daysRemaining != null ? String(Math.max(daysRemaining, 0)) : undefined}
                            valueClassName="text-xs text-[#002FA7] font-mono tabular-nums"
                            inline
                          />
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Current Supplier</div>
                    {recentlyUpdatedFields.has('currentSupplier') ? (
                      <motion.div
                        initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                        animate={{ filter: 'blur(0px)', opacity: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className={cn(
                          "text-xl font-semibold tracking-tighter text-white",
                          glowingFields.has('currentSupplier') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)]"
                        )}
                      >
                        <ForensicDataPoint value={account.electricitySupplier || '--'} copyValue={account.electricitySupplier || undefined} valueClassName="text-xl font-semibold tracking-tighter text-white" inline />
                      </motion.div>
                    ) : (
                      <div className={cn(
                        "text-xl font-semibold tracking-tighter text-white transition-all duration-800",
                        glowingFields.has('currentSupplier') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)] animate-in fade-in duration-500"
                      )}>
                        <ForensicDataPoint value={account.electricitySupplier || '--'} copyValue={account.electricitySupplier || undefined} valueClassName="text-xl font-semibold tracking-tighter text-white" inline />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Strike Price</div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editStrikePrice}
                          onChange={(e) => setEditStrikePrice(e.target.value)}
                          className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-[#002FA7] focus:outline-none focus:border-[#002FA7]/50 transition-all"
                          placeholder="0.000"
                        />
                      ) : (
                        recentlyUpdatedFields.has('strikePrice') ? (
                          <motion.div
                            initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                            animate={{ filter: 'blur(0px)', opacity: 1 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className={cn(
                              "text-xl font-mono tabular-nums tracking-tighter text-[#002FA7]",
                              glowingFields.has('strikePrice') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                            )}
                          >
                            <ForensicDataPoint value={editStrikePrice ? `${editStrikePrice}¢` : '--'} copyValue={editStrikePrice || undefined} valueClassName={cn("text-xl font-mono tabular-nums text-[#002FA7]", glowingFields.has('strikePrice') && "text-emerald-400")} inline />
                          </motion.div>
                        ) : (
                          <div className={cn(
                            "text-xl font-mono tabular-nums tracking-tighter text-[#002FA7] transition-all duration-800",
                            glowingFields.has('strikePrice') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-in fade-in duration-500"
                          )}>
                            <ForensicDataPoint value={editStrikePrice ? `${editStrikePrice}¢` : '--'} copyValue={editStrikePrice || undefined} valueClassName="text-xl font-mono tabular-nums text-[#002FA7]" inline />
                          </div>
                        )
                      )}
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Load Factor</div>
                      <div className="text-xl font-mono tabular-nums tracking-tighter text-white">
                        <ForensicDataPoint value={(account.loadFactor || 0.45).toFixed(2)} copyValue={(account.loadFactor ?? 0.45).toString()} valueClassName="text-xl font-mono tabular-nums text-white" inline />
                      </div>
                    </div>
                  </div>

                  {/* Annual Volume (Main Metric) */}
                  <div className="pt-4 border-t border-white/5">
                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Annual Volume</div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editAnnualUsage}
                        onChange={(e) => setEditAnnualUsage(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#002FA7]/50 transition-all"
                        placeholder="0"
                      />
                    ) : (
                      recentlyUpdatedFields.has('annualVolume') ? (
                        <motion.div
                          initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                          animate={{ filter: 'blur(0px)', opacity: 1 }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          className={cn(
                            "text-3xl font-mono tabular-nums tracking-tighter text-white font-semibold",
                            glowingFields.has('annualVolume') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)]"
                          )}
                        >
                          <ForensicDataPoint
                            value={account.annualUsage ? `${parseInt(account.annualUsage).toLocaleString()} kWh` : '--'}
                            copyValue={account.annualUsage ?? undefined}
                            valueClassName={cn("text-3xl font-mono tabular-nums tracking-tighter text-white font-semibold", glowingFields.has('annualVolume') && "text-[#002FA7]")}
                            inline
                          />
                        </motion.div>
                      ) : (
                        <div className={cn(
                          "text-3xl font-mono tabular-nums tracking-tighter text-white font-semibold transition-all duration-800",
                          glowingFields.has('annualVolume') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)] animate-in fade-in duration-500"
                        )}>
                          <ForensicDataPoint
                            value={account.annualUsage ? `${parseInt(account.annualUsage).toLocaleString()} kWh` : '--'}
                            copyValue={account.annualUsage ?? undefined}
                            valueClassName="text-3xl font-mono tabular-nums tracking-tighter text-white font-semibold"
                            inline
                          />
                        </div>
                      )
                    )}
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Estimated Annual Revenue</div>
                    {recentlyUpdatedFields.has('revenue') ? (
                      <motion.div
                        initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                        animate={{ filter: 'blur(0px)', opacity: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className={cn(
                          "text-3xl font-mono tabular-nums tracking-tighter text-green-500/80",
                          glowingFields.has('revenue') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                        )}
                      >
                        <ForensicDataPoint
                          value={(() => {
                            const usageStr = isEditing ? editAnnualUsage : (account.annualUsage || '0');
                            const usage = parseInt(usageStr.toString().replace(/[^0-9]/g, '')) || 0;
                            return (usage * 0.003).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                          })()}
                          copyValue={(() => {
                            const usageStr = isEditing ? editAnnualUsage : (account.annualUsage || '0');
                            const usage = parseInt(usageStr.toString().replace(/[^0-9]/g, '')) || 0;
                            return (usage * 0.003).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                          })()}
                          valueClassName="text-3xl font-mono tabular-nums tracking-tighter text-green-500/80"
                          inline
                        />
                      </motion.div>
                    ) : (
                      <div className={cn(
                        "text-3xl font-mono tabular-nums tracking-tighter text-green-500/80 transition-all duration-800",
                        glowingFields.has('revenue') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-in fade-in duration-500"
                      )}>
                        <ForensicDataPoint
                          value={(() => {
                            const usageStr = isEditing ? editAnnualUsage : (account.annualUsage || '0');
                            const usage = parseInt(usageStr.toString().replace(/[^0-9]/g, '')) || 0;
                            return (usage * 0.003).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                          })()}
                          copyValue={(() => {
                            const usageStr = isEditing ? editAnnualUsage : (account.annualUsage || '0');
                            const usage = parseInt(usageStr.toString().replace(/[^0-9]/g, '')) || 0;
                            return (usage * 0.003).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                          })()}
                          valueClassName="text-3xl font-mono tabular-nums tracking-tighter text-green-500/80"
                          inline
                        />
                      </div>
                    )}
                    <div className="text-[9px] font-mono text-zinc-600 mt-1 uppercase tracking-widest">Calculated at 0.003 margin base</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Column B: Infrastructure (6 cols) */}
            <div className="col-span-6 h-full overflow-y-auto p-6 border-r border-white/5 np-scroll scrollbar-thin scrollbar-thumb-zinc-700/50 hover:scrollbar-thumb-[#002FA7]/50 scrollbar-track-transparent transition-all duration-300">
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] mb-4">02 // Infrastructure</div>

                {/* Forensic Log Stream (Ported) */}
                <div
                  className={`nodal-void-card transition-all duration-500 p-6 min-h-[500px] relative overflow-hidden shadow-2xl group flex flex-col font-mono ${isEditing ? 'border-[#002FA7]/50 ring-1 ring-[#002FA7]/20 cursor-text' : ''}`}
                  onClick={() => {
                    if (!isEditing) handleTerminalClick()
                  }}
                >
                  {/* CRT Effect Overlay */}
                  <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-50" />

                  <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4 relative z-10">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full animate-pulse ${isEditing ? 'bg-[#002FA7] shadow-[0_0_12px_rgba(0,47,167,0.8)]' : 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)]'}`} />
                      <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-400">
                        {isEditing ? 'SYS_CONFIG_OVERRIDE' : 'FORENSIC_LOG_STREAM'}
                      </h3>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                      SECURE_NODE: {id.slice(0, 8).toUpperCase()}
                    </div>
                  </div>

                  <div className="flex-1 text-sm leading-relaxed relative z-10">
                    {isEditing ? (
                      <div className="flex flex-col h-full">
                        <div className="flex gap-3 items-start mb-4">
                          <span className="text-[#002FA7] shrink-0">root@nodal:~$</span>
                          <span className="text-[#002FA7]/50 uppercase tracking-widest text-[10px] mt-1">Direct Dossier Access Granted</span>
                        </div>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="flex-1 bg-transparent border-none outline-none text-zinc-300 p-0 m-0 resize-none focus:ring-0 placeholder:text-zinc-800 min-h-[400px] font-mono"
                          placeholder="// Enter intelligence data..."
                        />
                      </div>
                    ) : (
                      <div className="group/copyblock relative">
                        {editNotes?.trim() && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              navigator.clipboard.writeText(editNotes).then(
                                () => {
                                  setDescriptionCopied(true)
                                  setTimeout(() => setDescriptionCopied(false), 2000)
                                }
                              )
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                navigator.clipboard.writeText(editNotes).then(
                                  () => {
                                    setDescriptionCopied(true)
                                    setTimeout(() => setDescriptionCopied(false), 2000)
                                  }
                                )
                              }
                            }}
                            className="absolute top-0 right-0 z-10 p-1 rounded text-zinc-500 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 cursor-pointer opacity-0 transition-opacity duration-200 group-hover/copyblock:opacity-100"
                            title="Copy full description"
                            aria-label="Copy full description"
                          >
                            {descriptionCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </span>
                        )}
                        <div className="space-y-4">
                          {editNotes ? editNotes.split('\n\n').map((entry, idx) => {
                            const timestampMatch = entry.match(/^\[(.*?)\]/)
                            const timestamp = timestampMatch ? timestampMatch[1] : null
                            const content = timestamp ? entry.replace(/^\[.*?\]/, '').trim() : entry

                            // Calculate approximate height based on content length and line breaks
                            const lineCount = content.split('\n').length
                            const charCount = content.length
                            const estimatedLines = Math.max(lineCount, Math.ceil(charCount / 80)) // ~80 chars per line
                            const lineHeight = Math.max(2, estimatedLines * 1.5) // 1.5rem per line

                            return (
                              <div key={idx} className="group/entry flex gap-4 animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                <div className="flex flex-col items-center mt-1">
                                  <div className="w-1 h-1 rounded-full bg-[#002FA7]/40" />
                                  <div className="w-px bg-[#002FA7]/20" style={{ height: `${lineHeight}rem` }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  {timestamp && (
                                    <div className="text-[10px] text-zinc-600 mb-1 flex items-center gap-2">
                                      <Clock className="w-3 h-3 shrink-0" />
                                      <span>{timestamp}</span>
                                    </div>
                                  )}
                                  <div className="text-zinc-300 group-hover/entry:text-white transition-colors whitespace-pre-wrap break-words">
                                    {content}
                                  </div>
                                </div>
                              </div>
                            )
                          }) : (
                            <div className="text-zinc-600 italic">No forensic data available. Initiate recon...</div>
                          )}
                        </div>

                        {/* Live Terminal Input */}
                        <div className="flex gap-4 pt-4 border-t border-white/5">
                          <span className="text-white shrink-0 mt-1">
                            <Sparkles className="w-4 h-4 animate-pulse" />
                          </span>

                          <div className="flex-1 flex flex-col">
                            {isTyping ? (
                              <div className="flex items-start">
                                <textarea
                                  autoFocus
                                  rows={1}
                                  value={terminalInput}
                                  onChange={(e) => {
                                    setTerminalInput(e.target.value)
                                    e.target.style.height = 'auto'
                                    e.target.style.height = e.target.scrollHeight + 'px'
                                  }}
                                  onBlur={() => {
                                    if (!terminalInput.trim()) setIsTyping(false)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault()
                                      handleTerminalSubmit()
                                    }
                                    if (e.key === 'Escape') {
                                      setIsTyping(false)
                                      setTerminalInput('')
                                    }
                                  }}
                                  className="w-full bg-transparent border-none outline-none text-[#22c55e] p-0 m-0 resize-none focus:ring-0 placeholder:text-zinc-800 font-mono"
                                  placeholder="Awaiting analyst input..."
                                />
                                <span className="w-2 h-4 bg-[#22c55e] animate-[blink_1s_step-end_infinite] inline-block shrink-0 mt-0.5 ml-1" />
                              </div>
                            ) : (
                              <button
                                onClick={handleTerminalClick}
                                className="text-left text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-2 group/btn"
                              >
                                <span className="text-[#22c55e] group-hover:text-[#22c55e] transition-opacity">root@nodal:~$</span>
                                <span className="animate-pulse">_ INITIALIZE_INPUT_STREAM</span>
                              </button>
                            )}

                            {terminalInput.startsWith('/') && (
                              <div className="mt-4 p-4 bg-zinc-950/80 rounded-xl border border-[#002FA7]/30 animate-in fade-in zoom-in-95 duration-200 nodal-monolith-edge">
                                <div className="text-[10px] font-mono text-[#002FA7] uppercase tracking-[0.3em] mb-3 border-b border-[#002FA7]/20 pb-2">Available Protocols</div>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                  <div className="text-[10px] font-mono flex justify-between"><span className="text-zinc-300">/clear</span> <span className="text-zinc-600">WIPE_DOSSIER</span></div>
                                  <div className="text-[10px] font-mono flex justify-between"><span className="text-zinc-300">/status</span> <span className="text-zinc-600">POS_MATURITY</span></div>
                                  <div className="text-[10px] font-mono flex justify-between"><span className="text-zinc-300">/help</span> <span className="text-zinc-600">LIST_PROTOCOLS</span></div>
                                  <div className="text-[10px] font-mono flex justify-between"><span className="text-zinc-300">/refresh</span> <span className="text-zinc-600">NET_SYNC</span></div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Meter Array */}
                {recentlyUpdatedFields.has('meters') ? (
                  <motion.div
                    initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                    animate={{ filter: 'blur(0px)', opacity: 1 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  >
                    <MeterArray
                      meters={editMeters}
                      isEditing={isEditing}
                      onUpdate={handleMetersUpdate}
                    />
                  </motion.div>
                ) : (
                  <MeterArray
                    meters={editMeters}
                    isEditing={isEditing}
                    onUpdate={handleMetersUpdate}
                  />
                )}

                {/* Data Locker */}
                <DataIngestionCard
                  accountId={account.id}
                  onIngestionComplete={handleIngestionComplete}
                />
              </div>
            </div>

            {/* Column C: Network / Command Chain (3 cols) */}
            <div className="col-span-3 h-full overflow-y-auto p-6 np-scroll scrollbar-thin scrollbar-thumb-zinc-700/50 hover:scrollbar-thumb-[#002FA7]/50 scrollbar-track-transparent transition-all duration-300">
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">03 // Network</span>
                  <button
                    onClick={() => {
                      setIngestionContext({ accountId: account.id, accountName: account.name || 'Unknown Account' })
                      setRightPanelMode('INGEST_CONTACT')
                    }}
                    className="icon-button-forensic w-8 h-8"
                    title="Inject Node into Command Chain"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Stakeholder Map */}
                <StakeholderMap contacts={contacts || []} />

                {/* Transmission Log — company calls and contact calls */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      Transmission Log
                    </h3>
                    <span className="text-[9px] font-mono text-zinc-600 font-bold tabular-nums">{calls?.length || 0} RECORDS</span>
                  </div>

                  <div className="space-y-3">
                    {isLoadingCalls ? (
                      <div className="text-center py-12 text-xs font-mono text-zinc-600 animate-pulse">
                        SYNCING LOGS...
                      </div>
                    ) : calls && calls.length > 0 ? (
                      <div className="space-y-2">
                        <AnimatePresence initial={false} mode="popLayout">
                          {calls.slice(0, 5).map(call => {
                            // For contact calls: use contact avatar in transcript; for company calls: use company icon
                            const isContactCall = Boolean(call.contactId?.trim())
                            const contactForCall = isContactCall ? contacts?.find(c => c.id === call.contactId) : null
                            return (
                              <motion.div
                                key={call.id}
                                layout
                                initial={{ opacity: 0, height: 0, x: -10 }}
                                animate={{ opacity: 1, height: 'auto', x: 0 }}
                                exit={{ opacity: 0, height: 0, x: 10 }}
                                transition={{
                                  opacity: { duration: 0.2 },
                                  height: { duration: 0.3 },
                                  layout: { type: 'spring', stiffness: 500, damping: 35, mass: 1 }
                                }}
                                className="overflow-hidden"
                              >
                                <CallListItem
                                  call={call}
                                  contactId={call.contactId || ''}
                                  accountId={id}
                                  accountLogoUrl={account?.logoUrl}
                                  accountDomain={account?.domain}
                                  accountName={account?.name}
                                  customerAvatar={isContactCall ? 'contact' : 'company'}
                                  contactName={contactForCall?.name ?? contactForCall?.firstName ?? ''}
                                  variant="minimal"
                                />
                              </motion.div>
                            )
                          })}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-zinc-950/20 flex flex-col items-center justify-center gap-3 group/empty">
                        <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">No signals detected</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

