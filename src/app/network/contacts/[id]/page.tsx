'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { differenceInCalendarDays, format, isValid, parseISO, formatDistanceToNow } from 'date-fns'
import { 
  Activity, AlertTriangle, ArrowLeft, Clock, Globe, Linkedin, Mail, MapPin, Phone, 
  Lock, Unlock, Check, Sparkles, Plus, Star, Trash2,
  Building2, CheckCircle, Play, DollarSign, Mic, History, RefreshCw, X,
  ArrowRightLeft, ChevronLeft, ChevronRight
} from 'lucide-react'
import { UplinkCard } from '@/components/dossier/UplinkCard'
import DataIngestionCard from '@/components/dossier/DataIngestionCard'
import { useContact, useUpdateContact } from '@/hooks/useContacts'
import { useAccount } from '@/hooks/useAccounts'
import { useContactCalls } from '@/hooks/useCalls'
import { useApolloNews } from '@/hooks/useApolloNews'
import { useEntityTasks } from '@/hooks/useEntityTasks'
import { useTasks } from '@/hooks/useTasks'
import { TaskCommandBar } from '@/components/crm/TaskCommandBar'
import { CallListItem } from '@/components/calls/CallListItem'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { Button } from '@/components/ui/button'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { LoadingOrb } from '@/components/ui/LoadingOrb'
import { ComposeModal, type ComposeContext } from '@/components/emails/ComposeModal'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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

export default function ContactDossierPage() {
  const params = useParams()
  const router = useRouter()
  const id = (params?.id as string) || ''

  const { data: contact, isLoading, isFetched } = useContact(id)
  const { data: account } = useAccount((contact as { linkedAccountId?: string })?.linkedAccountId ?? '')
  const domain = account?.domain?.trim() || (() => {
    try {
      const w = (contact as { website?: string })?.website?.trim()
      if (!w) return undefined
      const u = new URL(w.startsWith('http') ? w : `https://${w}`)
      return u.hostname.replace(/^www\./, '') || undefined
    } catch {
      return undefined
    }
  })()
  const { data: apolloNewsSignals } = useApolloNews(domain)
  const { data: recentCalls, isLoading: isLoadingCalls } = useContactCalls(id)
  const updateContact = useUpdateContact()
  const { isEditing, setIsEditing, toggleEditing } = useUIStore()
  const setContext = useGeminiStore((state) => state.setContext)
  const toggleHistory = useGeminiStore((state) => state.toggleHistory)

  const [isSaving, setIsSaving] = useState(false)
  const [showSynced, setShowSynced] = useState(false)
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [currentCallPage, setCurrentCallPage] = useState(1)
  const [activeEditField, setActiveEditField] = useState<'logo' | 'website' | 'linkedin' | null>(null)
  const CALLS_PER_PAGE = 8
  const prevIsEditing = useRef(isEditing)

  // Local Field States for Editing
  const [editName, setEditName] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSupplier, setEditSupplier] = useState('')
  const [editStrikePrice, setEditStrikePrice] = useState('')
  const [editAnnualUsage, setEditAnnualUsage] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editLogoUrl, setEditLogoUrl] = useState('')
  const [editWebsite, setEditWebsite] = useState('')
  const [editLinkedinUrl, setEditLinkedinUrl] = useState('')
  const [editServiceAddresses, setEditServiceAddresses] = useState<Array<{ address: string; isPrimary: boolean }>>([])
  
  // New Phone States
  const [editMobile, setEditMobile] = useState('')
  const [editWorkDirect, setEditWorkDirect] = useState('')
  const [editOther, setEditOther] = useState('')
  const [editCompanyPhone, setEditCompanyPhone] = useState('')
  const [editPrimaryField, setEditPrimaryField] = useState<'mobile' | 'workDirectPhone' | 'otherPhone'>('mobile')

  // Refraction Event State (for field glow animations)
  const [glowingFields, setGlowingFields] = useState<Set<string>>(new Set())
  const [isRecalibrating, setIsRecalibrating] = useState(false)
  // Blur-in for fields updated by Org Intelligence enrich/acquire
  const [recentlyUpdatedFields, setRecentlyUpdatedFields] = useState<Set<string>>(new Set())
  const prevContactRef = useRef<typeof contact>(undefined)
  const lastEnrichedContactId = useUIStore((s) => s.lastEnrichedContactId)

  const { pendingTasks } = useEntityTasks(id, contact?.name)
  const { updateTask } = useTasks()
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0)
  const hasTasks = pendingTasks.length > 0
  const displayTaskIndex = Math.min(currentTaskIndex, Math.max(0, pendingTasks.length - 1))

  useEffect(() => {
    setCurrentTaskIndex((prev) => Math.min(prev, Math.max(0, pendingTasks.length - 1)))
  }, [pendingTasks.length])

  const handleCompleteAndAdvance = () => {
    const task = pendingTasks[displayTaskIndex]
    if (!task) return
    updateTask({ id: task.id, status: 'Completed' })
    if (pendingTasks.length <= 1) toast.success('Mission complete')
  }

  // Reset pagination when contact changes
  useEffect(() => {
    setCurrentCallPage(1)
  }, [id])

  // Sync local state when contact data arrives
  useEffect(() => {
    if (contact && !isEditing) {
      setEditName(contact.name || '')
      setEditTitle(contact.title || '')
      setEditCompany(contact.companyName || contact.company || '')
      setEditPhone(contact.phone || '')
      setEditEmail(contact.email || '')
      setEditNotes(contact.notes || contact.accountDescription || '')
      setEditSupplier(contact.electricitySupplier || '')
      setEditStrikePrice(contact.currentRate || '')
      setEditAnnualUsage(contact.annualUsage || '')
      setEditLocation(contact.location || '')
      setEditLogoUrl((contact.logoUrl || contact.avatarUrl || '') as string)
      setEditWebsite(contact.website || '')
      setEditLinkedinUrl(contact.linkedinUrl || '')
      
      setEditMobile(contact.mobile || '')
      setEditWorkDirect(contact.workDirectPhone || '')
      setEditOther(contact.otherPhone || '')
      setEditCompanyPhone(contact.companyPhone || '')
      setEditPrimaryField(contact.primaryPhoneField || 'mobile')

      const rawAddrs = Array.isArray(contact.serviceAddresses) ? contact.serviceAddresses : []
      setEditServiceAddresses(
        rawAddrs
          .map((addr) => {
            if (!addr || typeof addr !== 'object') return null
            const record = addr as Record<string, unknown>
            const address = typeof record.address === 'string' ? record.address : String(record.address || '')
            const isPrimary = Boolean(record.isPrimary)
            return { address, isPrimary }
          })
          .filter((v): v is { address: string; isPrimary: boolean } => v !== null)
      )
    }
  }, [contact, isEditing])

  // Detect which contact fields changed after Org Intelligence enrich and mark for blur-in
  useEffect(() => {
    if (!contact) return
    if (lastEnrichedContactId !== contact.id) {
      prevContactRef.current = contact
      return
    }
    const prev = prevContactRef.current
    const changed = new Set<string>()
    if (prev) {
      if ((prev.name ?? '') !== (contact.name ?? '')) changed.add('name')
      if ((prev.title ?? '') !== (contact.title ?? '')) changed.add('title')
      if ((prev.companyName ?? prev.company ?? '') !== (contact.companyName ?? contact.company ?? '')) changed.add('company')
      if ((prev.location ?? '') !== (contact.location ?? '')) changed.add('location')
      if ((prev.email ?? '') !== (contact.email ?? '')) changed.add('email')
      if ((prev.phone ?? '') !== (contact.phone ?? '')) changed.add('phone')
      if ((prev.linkedinUrl ?? '') !== (contact.linkedinUrl ?? '')) changed.add('linkedinUrl')
      if ((prev.logoUrl ?? (prev as any).avatarUrl ?? '') !== (contact.logoUrl ?? (contact as any).avatarUrl ?? '')) changed.add('logoUrl')
    }
    prevContactRef.current = contact
    if (changed.size) {
      setRecentlyUpdatedFields(changed)
      const t = setTimeout(() => setRecentlyUpdatedFields(new Set()), 1600)
      return () => clearTimeout(t)
    }
  }, [contact, lastEnrichedContactId])

  // Set Gemini Context
  useEffect(() => {
    if (contact) {
      setContext({
        type: 'contact',
        id: contact.id,
        label: `${contact.name?.toUpperCase().slice(0, 20) || 'UNKNOWN'}`,
        data: contact
      })
    }
    return () => setContext(null)
  }, [contact, setContext])

  // Watch for global edit toggle to trigger save
  useEffect(() => {
    // Only proceed if isEditing actually changed
    if (prevIsEditing.current === isEditing) return
    
    const wasEditing = prevIsEditing.current
    prevIsEditing.current = isEditing

    if (wasEditing && !isEditing) {
      const triggerSave = async () => {
        setIsSaving(true)
        try {
          await updateContact.mutateAsync({
            id,
            name: editName,
            title: editTitle,
            companyName: editCompany,
            phone: editPhone,
            email: editEmail,
            notes: editNotes,
            electricitySupplier: editSupplier,
            currentRate: editStrikePrice,
            annualUsage: editAnnualUsage,
            location: editLocation,
            logoUrl: editLogoUrl,
            website: editWebsite,
            linkedinUrl: editLinkedinUrl,
            serviceAddresses: editServiceAddresses,
            mobile: editMobile,
            workDirectPhone: editWorkDirect,
            otherPhone: editOther,
            companyPhone: editCompanyPhone,
            primaryPhoneField: editPrimaryField
          })
          setShowSynced(true)
          setTimeout(() => setShowSynced(false), 3000)
          toast.success('System Synced')
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sync failed'
          toast.error(`Sync failed: ${message}`)
          console.error('Contact dossier sync error:', err)
        } finally {
          setIsSaving(false)
        }
      }
      triggerSave()
    }
  }, [isEditing, id, editName, editTitle, editCompany, editPhone, editEmail, editNotes, editSupplier, editStrikePrice, editAnnualUsage, editServiceAddresses, editMobile, editWorkDirect, editOther, editCompanyPhone, editPrimaryField, editLogoUrl, editWebsite, editLinkedinUrl, updateContact])

  const contactName = contact?.name || 'Unknown Contact'
  const contactTitle = contact?.title || ''
  const companyName = contact?.companyName || contact?.company || ''
  const email = contact?.email || ''
  const phone = contact?.phone || ''

  const contractEndDate = useMemo(() => parseContractEndDate(contact?.contractEnd), [contact?.contractEnd])
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

  const maturityHint = useMemo(() => {
    if (!contractEndDate || daysRemaining == null) return null
    return `Renew by ${format(contractEndDate, 'MMMM')}`
  }, [contractEndDate, daysRemaining])

  const annualRevenue = useMemo(() => {
    const usage = parseFloat(editAnnualUsage) || 0
    return (usage * 0.003).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }, [editAnnualUsage])

  const supplier = contact?.electricitySupplier || ''
  const strikePrice = contact?.currentRate || ''
  const annualUsage = contact?.annualUsage || ''
  const [isTyping, setIsTyping] = useState(false)
  const [terminalInput, setTerminalInput] = useState('')
  const terminalRef = useRef<HTMLDivElement>(null)

  const handleTerminalClick = () => {
    setIsTyping(true)
  }

  const forensicNotes = contact?.notes || contact?.accountDescription || ''

  const composeContext = useMemo((): ComposeContext | null => {
    if (!contact) return null
    const parts: string[] = []
    if (forensicNotes?.trim()) parts.push(`Notes (Log_Stream): ${forensicNotes.trim().slice(0, 800)}${forensicNotes.length > 800 ? '…' : ''}`)
    const lastCall = recentCalls?.[0]
    if (lastCall) {
      const note = (lastCall as { note?: string }).note
      if (note?.trim()) parts.push(`Last call summary: ${note.trim().slice(0, 400)}${note.length > 400 ? '…' : ''}`)
      const transcript = (lastCall as { transcript?: string }).transcript
      if (transcript?.trim()) parts.push(`Last call transcript (excerpt): ${transcript.trim().slice(0, 600)}${transcript.length > 600 ? '…' : ''}`)
    }
    if (apolloNewsSignals?.length) {
      const newsLines = apolloNewsSignals.slice(0, 5).map((a) => `- ${a.title}${a.snippet ? `: ${a.snippet.slice(0, 120)}${a.snippet.length > 120 ? '…' : ''}` : ''}`)
      parts.push(`Recent company news (for first-line personalization if relevant):\n${newsLines.join('\n')}`)
    }
    const titleStr = typeof contact.title === 'string' ? contact.title : typeof contact.jobTitle === 'string' ? contact.jobTitle : undefined
    return {
      contactName: typeof contact.name === 'string' ? contact.name : undefined,
      contactTitle: titleStr,
      companyName: typeof contact.companyName === 'string' ? contact.companyName : typeof contact.company === 'string' ? contact.company : undefined,
      accountName: typeof (contact as { accountName?: string }).accountName === 'string' ? (contact as { accountName?: string }).accountName : undefined,
      industry: typeof account?.industry === 'string' ? account.industry : undefined,
      accountDescription: typeof account?.description === 'string' ? account.description : undefined,
      contextForAi: parts.length ? parts.join('\n\n') : undefined,
    }
  }, [contact, account, forensicNotes, recentCalls, apolloNewsSignals])

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
          await updateContact.mutateAsync({ id, notes: '' })
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
    }

    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm')
    const newNote = `[${timestamp}] ${input}`
    const updatedNotes = forensicNotes 
      ? `${forensicNotes}\n\n${newNote}`
      : newNote

    try {
      await updateContact.mutateAsync({
        id,
        notes: updatedNotes
      })
      toast.success('Analyst note synchronized')
      setTerminalInput('')
      setIsTyping(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Synchronization failed')
      console.error(err)
    }
  }

  // Handle Document Ingestion Complete (Refraction Event)
  const handleIngestionComplete = () => {
    // Trigger the container blur/desaturation
    setIsRecalibrating(true)
    
    // Mark all key fields as "glowing" for the reveal animation
    const fieldsToGlow = new Set([
      'contractEnd',
      'daysRemaining',
      'currentSupplier',
      'strikePrice',
      'annualUsage',
      'revenue'
    ])
    setGlowingFields(fieldsToGlow)
    
    // Clear effects after animation duration
    setTimeout(() => {
      setIsRecalibrating(false)
      setGlowingFields(new Set())
    }, 1500)
  }

  const primaryServiceAddress = useMemo(() => {
    const addrs = Array.isArray(contact?.serviceAddresses)
      ? (contact?.serviceAddresses as Array<{ isPrimary?: boolean; address?: unknown }>)
      : []
    const primary = addrs.find((addr) => addr?.isPrimary) || addrs[0]
    if (!primary?.address) return ''
    return typeof primary.address === 'string' ? primary.address : String(primary.address)
  }, [contact?.serviceAddresses])

  // Show loading until we've actually attempted to fetch (avoids flash of "Subject Not Found" on refresh when query is disabled or pending)
  const stillLoading = isLoading || (!!id && contact == null && !isFetched)
  if (stillLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <LoadingOrb label="Initialising Terminal..." />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <div className="nodal-glass p-8 rounded-2xl flex flex-col items-center gap-6 border-white/10 shadow-2xl">
          <div className="p-4 bg-red-500/10 rounded-2xl">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tighter text-white">Subject Not Found</h2>
            <p className="text-zinc-500 text-sm mt-1">The requested intelligence dossier does not exist.</p>
          </div>
          <Button 
            className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium"
            onClick={() => router.back()}
          >
            Return to Database
          </Button>
        </div>
      </div>
    )
  }

  const companyLabel = companyName

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#002FA7]/10 blur-[120px] rounded-full pointer-events-none" />

        <header className="flex-none px-6 py-6 md:px-8 border-b border-white/5 nodal-recessed relative z-10">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="icon-button-forensic w-10 h-10 flex items-center justify-center -ml-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 relative group/avatar">
                <div onClick={() => isEditing && setActiveEditField(activeEditField === 'logo' ? null : 'logo')}>
                  {recentlyUpdatedFields.has('logoUrl') ? (
                    <motion.div
                      initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                      animate={{ filter: 'blur(0px)', opacity: 1 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                      <ContactAvatar
                        name={contactName}
                        size={56}
                        className={cn(
                          "w-14 h-14 transition-all",
                          isEditing && "cursor-pointer hover:border-[#002FA7]/50 hover:shadow-[0_0_20px_rgba(0,47,167,0.2)]"
                        )}
                      />
                    </motion.div>
                  ) : (
                    <ContactAvatar 
                      name={contactName} 
                      size={56} 
                      className={cn(
                        "w-14 h-14 transition-all",
                        isEditing && "cursor-pointer hover:border-[#002FA7]/50 hover:shadow-[0_0_20px_rgba(0,47,167,0.2)]"
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
                          placeholder="PASTE AVATAR/LOGO URL..."
                          className="bg-transparent border-none focus:ring-0 text-[10px] font-mono text-white w-full placeholder:text-zinc-700 uppercase tracking-widest"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col">
                  <div className="flex items-center gap-3 mb-0.5">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="text-2xl font-semibold tracking-tighter text-white bg-transparent border-none outline-none focus:ring-1 focus:ring-[#002FA7]/50 rounded px-1 -ml-1 w-full"
                        placeholder="Contact Name"
                        autoFocus
                      />
                    ) : (
                      <>
                        {recentlyUpdatedFields.has('name') ? (
                          <motion.h1
                            initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                            animate={{ filter: 'blur(0px)', opacity: 1 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className="text-2xl font-semibold tracking-tighter text-white"
                          >
                            {editName || contactName}
                          </motion.h1>
                        ) : (
                          <h1 className="text-2xl font-semibold tracking-tighter text-white">{editName || contactName}</h1>
                        )}
                        
                        {/* THE SIGNAL ARRAY */}
                        <div className="flex items-center gap-1 bg-white/[0.02] rounded-full p-1 border border-white/5 ml-2 relative group/links">
                          <div className="flex items-center">
                            <button 
                              onClick={() => {
                                if (isEditing) {
                                  setActiveEditField(activeEditField === 'website' ? null : 'website')
                                } else {
                                  const url = editWebsite || contact?.website
                                  if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank')
                                }
                              }}
                              className={cn(
                                "icon-button-forensic p-1.5",
                                !editWebsite && !contact?.website && "opacity-50 cursor-not-allowed",
                                isEditing && activeEditField === 'website' && "bg-[#002FA7]/20 text-white",
                                isEditing && "hover:bg-[#002FA7]/20 transition-colors"
                              )} 
                              title={isEditing ? "Edit Website" : "Visit Website"}
                            >
                              <Globe className="w-3.5 h-3.5" />
                            </button>
                            
                            <AnimatePresence>
                              {isEditing && activeEditField === 'website' && (
                                <motion.div
                                  key="website-edit"
                                  initial={{ width: 0, opacity: 0 }}
                                  animate={{ width: "auto", opacity: 1 }}
                                  exit={{ width: 0, opacity: 0 }}
                                  className="flex items-center overflow-hidden"
                                >
                                  <input
                                    type="text"
                                    value={editWebsite}
                                    onChange={(e) => setEditWebsite(e.target.value)}
                                    placeholder="WEBSITE URL"
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
                                  const url = editLinkedinUrl || contact?.linkedinUrl
                                  if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank')
                                }
                              }}
                              className={cn(
                                "icon-button-forensic p-1.5",
                                !editLinkedinUrl && !contact?.linkedinUrl && "opacity-50 cursor-not-allowed",
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

                        {/* Status/Sync Indicators — layout so siblings slide when badge appears */}
                        <motion.div layout className="flex items-center gap-2 ml-2 overflow-visible">
                          {/* List Membership Badge — animates in and pushes others right */}
                          <AnimatePresence>
                            {contact.listName && (
                              <motion.div
                                key="list-membership-badge"
                                layout
                                initial={{ opacity: 0, width: 0, minWidth: 0, scale: 0.92 }}
                                animate={{
                                  opacity: 1,
                                  width: 'auto',
                                  minWidth: 'auto',
                                  scale: 1,
                                }}
                                exit={{ opacity: 0, width: 0, minWidth: 0, scale: 0.92 }}
                                transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm overflow-hidden shrink-0 origin-left"
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                <span className="text-[10px] font-mono uppercase tracking-widest font-medium text-emerald-500 whitespace-nowrap">
                                  {contact.listName}
                                </span>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Last Sync — layout so it slides over when badge appears */}
                          {contact.lastContact && (
                            <motion.div layout className="flex items-center gap-1.5 px-2 py-0.5 rounded-full nodal-module-glass border border-white/5 shrink-0">
                              <Clock className="w-2.5 h-2.5 text-zinc-600" />
                              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                                Last_Sync: {(() => {
                                  try {
                                    return formatDistanceToNow(new Date(contact.lastContact), { addSuffix: true }).toUpperCase()
                                  } catch (e) {
                                    return 'UNKNOWN'
                                  }
                                })()}
                              </span>
                            </motion.div>
                          )}
                        </motion.div>
                      </>
                    )}
                    
                    {/* Synced indicator with exit animation */}
                    <AnimatePresence>
                      {showSynced && (
                        <motion.div 
                          key="synced-badge"
                          initial={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                          exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                          transition={{ duration: 0.3 }}
                          className="flex items-center gap-1 text-[10px] font-mono text-green-500"
                        >
                          <Check className="w-3 h-3" />
                          <span className="uppercase tracking-widest">Synced</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono mb-2 w-full">
                    {isEditing ? (
                      <div className="flex items-center gap-4 w-full">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-full focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                            placeholder="TITLE"
                          />
                          <span className="text-zinc-600 lowercase">at</span>
                          <input
                            type="text"
                            value={editCompany}
                            onChange={(e) => setEditCompany(e.target.value)}
                            className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-full focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                            placeholder="COMPANY"
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
                        {(recentlyUpdatedFields.has('title') || recentlyUpdatedFields.has('company')) ? (
                          <motion.span
                            initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                            animate={{ filter: 'blur(0px)', opacity: 1 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className="flex items-center gap-1.5 uppercase tracking-widest text-zinc-400"
                          >
                            {editTitle && (
                              <>
                                <span>{editTitle}</span>
                                <span className="text-zinc-600 lowercase mx-1">at</span>
                              </>
                            )}
                            {contact?.linkedAccountId ? (
                              <Link 
                                href={`/network/accounts/${contact.linkedAccountId}`}
                                className="hover:text-white transition-colors cursor-pointer"
                              >
                                {editCompany || 'Unknown Entity'}
                              </Link>
                            ) : (
                              <span>{editCompany || 'Unknown Entity'}</span>
                            )}
                          </motion.span>
                        ) : (
                          <span className="flex items-center gap-1.5 uppercase tracking-widest text-zinc-400">
                            {editTitle && (
                              <>
                                <span>{editTitle}</span>
                                <span className="text-zinc-600 lowercase mx-1">at</span>
                              </>
                            )}
                            {contact?.linkedAccountId ? (
                              <Link 
                                href={`/network/accounts/${contact.linkedAccountId}`}
                                className="hover:text-white transition-colors cursor-pointer"
                              >
                                {editCompany || 'Unknown Entity'}
                              </Link>
                            ) : (
                              <span>{editCompany || 'Unknown Entity'}</span>
                            )}
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
                            <MapPin className="w-3.5 h-3.5 text-white" />
                            {editLocation || 'Unknown Location'}
                          </motion.span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-zinc-400">
                            <MapPin className="w-3.5 h-3.5 text-white" />
                            {editLocation || 'Unknown Location'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

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
                        onPrev={() => setCurrentTaskIndex((p) => Math.max(0, p - 1))}
                        onNext={() => setCurrentTaskIndex((p) => Math.min(pendingTasks.length - 1, p + 1))}
                        onSkip={() => setCurrentTaskIndex((p) => Math.min(pendingTasks.length - 1, p + 1))}
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
        </header>

        <div className="flex-1 flex overflow-hidden relative z-10 group/dossier">
          <div className="grid grid-cols-12 w-full h-full">
            <div className="col-span-12 lg:col-span-4 h-full overflow-y-auto p-6 md:p-8 border-r border-white/5 scrollbar-thin scrollbar-thumb-zinc-800/0 hover:scrollbar-thumb-zinc-800/50 scrollbar-track-transparent transition-all duration-300">
              <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
                {contact && (
                  (recentlyUpdatedFields.has('email') || recentlyUpdatedFields.has('phone')) ? (
                    <motion.div
                      initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                      animate={{ filter: 'blur(0px)', opacity: 1 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                      <UplinkCard
                        contact={{
                          ...contact,
                          email: editEmail,
                          phone: editPhone,
                          mobile: editMobile,
                          workDirectPhone: editWorkDirect,
                          otherPhone: editOther,
                          companyPhone: editCompanyPhone,
                          primaryPhoneField: editPrimaryField
                        }}
                        isEditing={isEditing}
                        onEmailClick={() => setIsComposeOpen(true)}
                        onUpdate={(updates) => {
                      if (updates.email !== undefined) setEditEmail(updates.email)
                      if (updates.mobile !== undefined) {
                        setEditMobile(updates.mobile)
                        if (editPrimaryField === 'mobile') setEditPhone(updates.mobile)
                      }
                      if (updates.workDirectPhone !== undefined) {
                        setEditWorkDirect(updates.workDirectPhone)
                        if (editPrimaryField === 'workDirectPhone') setEditPhone(updates.workDirectPhone)
                      }
                      if (updates.otherPhone !== undefined) {
                        setEditOther(updates.otherPhone)
                        if (editPrimaryField === 'otherPhone') setEditPhone(updates.otherPhone)
                      }
                      if (updates.companyPhone !== undefined) setEditCompanyPhone(updates.companyPhone)
                      if (updates.primaryPhoneField !== undefined) {
                        setEditPrimaryField(updates.primaryPhoneField)
                        if (updates.primaryPhoneField === 'mobile') setEditPhone(editMobile)
                        else if (updates.primaryPhoneField === 'workDirectPhone') setEditPhone(editWorkDirect)
                        else if (updates.primaryPhoneField === 'otherPhone') setEditPhone(editOther)
                      }
                    }}
                  />
                    </motion.div>
                  ) : (
                  <UplinkCard 
                    contact={{
                      ...contact,
                      email: editEmail,
                      phone: editPhone,
                      mobile: editMobile,
                      workDirectPhone: editWorkDirect,
                      otherPhone: editOther,
                      companyPhone: editCompanyPhone,
                      primaryPhoneField: editPrimaryField
                    }}
                    isEditing={isEditing}
                    onEmailClick={() => setIsComposeOpen(true)}
                    onUpdate={(updates) => {
                      if (updates.email !== undefined) setEditEmail(updates.email)
                      if (updates.mobile !== undefined) {
                        setEditMobile(updates.mobile)
                        if (editPrimaryField === 'mobile') setEditPhone(updates.mobile)
                      }
                      if (updates.workDirectPhone !== undefined) {
                        setEditWorkDirect(updates.workDirectPhone)
                        if (editPrimaryField === 'workDirectPhone') setEditPhone(updates.workDirectPhone)
                      }
                      if (updates.otherPhone !== undefined) {
                        setEditOther(updates.otherPhone)
                        if (editPrimaryField === 'otherPhone') setEditPhone(updates.otherPhone)
                      }
                      if (updates.companyPhone !== undefined) setEditCompanyPhone(updates.companyPhone)
                      if (updates.primaryPhoneField !== undefined) {
                        setEditPrimaryField(updates.primaryPhoneField)
                        // Update the main phone field based on the new primary
                        if (updates.primaryPhoneField === 'mobile') setEditPhone(editMobile)
                        else if (updates.primaryPhoneField === 'workDirectPhone') setEditPhone(editWorkDirect)
                        else if (updates.primaryPhoneField === 'otherPhone') setEditPhone(editOther)
                      }
                    }}
                  />
                  )
                )}

                {/* Contract & Supplier Intelligence */}
                <div className={cn(
                  "nodal-void-card transition-all duration-500 p-6 relative overflow-hidden shadow-lg space-y-6",
                  isEditing ? 'border-[#002FA7]/30' : 'border-white/10',
                  isRecalibrating && 'grayscale backdrop-blur-2xl'
                )}>
                  
                  {/* Contract Maturity Field (Moved from Header in Plan) */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Position Maturity</h4>
                      <div className="text-right">
                        <span className="text-xs text-zinc-500 mr-2">Expiration:</span>
                        <span className={cn(
                          "text-white font-mono font-bold tabular-nums transition-all duration-800",
                          glowingFields.has('contractEnd') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)] animate-in fade-in duration-500"
                        )}>
                          {contractEndDate ? format(contractEndDate, 'MMM dd, yyyy') : 'TBD'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full ${maturityColor} transition-all duration-1000 ease-out relative`}
                        style={{ width: `${Math.round(maturityPct * 100)}%` }}
                      >
                        <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 shadow-[0_0_10px_white]" />
                      </div>
                    </div>

                    <div className="flex justify-between mt-2">
                      <span className={cn(
                        "text-xs text-[#002FA7] font-mono tabular-nums ml-auto transition-all duration-800",
                        glowingFields.has('daysRemaining') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-in fade-in duration-500"
                      )}>
                        {daysRemaining != null ? `${Math.max(daysRemaining, 0)} Days Remaining` : '-- Days Remaining'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Current Supplier</div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editSupplier}
                        onChange={(e) => setEditSupplier(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-[#002FA7]/50 transition-all"
                        placeholder="Supplier Name"
                      />
                    ) : (
                      <div className={cn(
                        "text-xl font-semibold tracking-tighter text-white transition-all duration-800",
                        glowingFields.has('currentSupplier') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)] animate-in fade-in duration-500"
                      )}>
                        {editSupplier || '--'}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Strike Price</div>
                      {isEditing ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={editStrikePrice}
                            onChange={(e) => setEditStrikePrice(e.target.value)}
                            className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-[#002FA7] focus:outline-none focus:border-[#002FA7]/50 transition-all"
                            placeholder="0.000"
                          />
                        </div>
                      ) : (
                        <div className={cn(
                          "text-xl font-mono tabular-nums tracking-tighter text-[#002FA7] transition-all duration-800",
                          glowingFields.has('strikePrice') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-in fade-in duration-500"
                        )}>
                          {editStrikePrice || '--'}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Annual Usage</div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editAnnualUsage}
                          onChange={(e) => setEditAnnualUsage(e.target.value)}
                          className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#002FA7]/50 transition-all"
                          placeholder="0"
                        />
                      ) : (
                        <div className={cn(
                          "text-xl font-mono tabular-nums tracking-tighter text-white transition-all duration-800",
                          glowingFields.has('annualUsage') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)] animate-in fade-in duration-500"
                        )}>
                          {editAnnualUsage || '--'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Estimated Annual Revenue</div>
                    <div className={cn(
                      "text-3xl font-mono tabular-nums tracking-tighter text-green-500/80 transition-all duration-800",
                      glowingFields.has('revenue') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-in fade-in duration-500"
                    )}>
                      {annualRevenue}
                    </div>
                    <div className="text-[9px] font-mono text-zinc-600 mt-1 uppercase tracking-widest">Calculated at 0.003 margin base</div>
                  </div>
                </div>

                <DataIngestionCard 
                  accountId={contact?.accountId}
                  onIngestionComplete={handleIngestionComplete}
                />
              </div>
            </div>

            <div className="col-span-12 lg:col-span-8 h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-700/50 hover:scrollbar-thumb-[#002FA7]/50 scrollbar-track-transparent transition-all duration-300 np-scroll">
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700 delay-100">
                {/* FORENSIC NOTES TERMINAL */}
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
                    <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest flex items-center gap-4">
                      <span>SECURE_NODE: {id.slice(0, 8).toUpperCase()}</span>
                      <span>NP-OS_V.1.0.4</span>
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
                      <div className="space-y-4">
                        {/* Historical Log Entries */}
                        {editNotes.split('\n\n').map((entry, idx) => {
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
                              <div className="flex-1">
                                {timestamp && (
                                  <div className="text-[10px] text-zinc-600 mb-1 flex items-center gap-2">
                                    <Clock className="w-3 h-3" />
                                    <span>{timestamp}</span>
                                  </div>
                                )}
                                <div className="text-zinc-300 group-hover/entry:text-white transition-colors">
                                  {content}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        
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
                              <div className="mt-4 p-4 bg-black/60 rounded-xl border border-[#002FA7]/30 animate-in fade-in zoom-in-95 duration-200">
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

                {/* Transmission Log — same functionality as account dossier Engagement Log */}
                <div className="nodal-void-card p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Mic className="w-3.5 h-3.5" /> Transmission Log
                    </h3>
                    <span className="text-[9px] font-mono text-zinc-600 font-bold tabular-nums">{recentCalls?.length ?? 0} RECORDS</span>
                  </div>
                  <div className="flex items-center justify-end gap-2 mb-3">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#002FA7]/20 border border-[#002FA7]/30">
                      <Sparkles className="w-3 h-3 text-[#002FA7]" />
                      <span className="text-[10px] font-mono text-white uppercase tracking-tighter">AI_ENABLED</span>
                    </div>
                    <button
                      type="button"
                      className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
                      onClick={() => router.push('/network/calls')}
                      title="View all calls"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {isLoadingCalls ? (
                      <div className="text-center py-12 text-xs font-mono text-zinc-600 animate-pulse">
                        SYNCING LOGS...
                      </div>
                    ) : recentCalls && recentCalls.length > 0 ? (
                      <div className="space-y-2">
                        <AnimatePresence initial={false} mode="popLayout">
                          {recentCalls
                            .slice((currentCallPage - 1) * CALLS_PER_PAGE, currentCallPage * CALLS_PER_PAGE)
                            .map((call) => (
                              <motion.div
                                key={call.id}
                                layout
                                initial={{ opacity: 0, x: 20, scale: 0.98 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className="hover:translate-x-1 transition-transform"
                              >
                                <CallListItem
                                  call={call}
                                  contactId={id}
                                  accountId={contact?.linkedAccountId}
                                  contactName={contact?.name}
                                  customerAvatar="contact"
                                  variant="minimal"
                                />
                              </motion.div>
                            ))}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-black/20 flex flex-col items-center justify-center gap-3">
                        <History className="w-12 h-12 text-zinc-600 opacity-20" />
                        <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">No signals detected</p>
                      </div>
                    )}
                  </div>

                  {/* Sync_Block Footer with pagination — more horizontal space on 2-panel layout */}
                  {recentCalls && recentCalls.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Sync_Block {((currentCallPage - 1) * CALLS_PER_PAGE + 1).toString().padStart(2, '0')}–{Math.min(currentCallPage * CALLS_PER_PAGE, recentCalls.length).toString().padStart(2, '0')}
                        </span>
                        <span className="opacity-40">|</span>
                        <span>Total_Nodes: {recentCalls.length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCurrentCallPage(prev => Math.max(1, prev - 1))}
                          disabled={currentCallPage === 1}
                          className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
                          {currentCallPage.toString().padStart(2, '0')}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCurrentCallPage(prev => prev + 1)}
                          disabled={currentCallPage >= Math.ceil(recentCalls.length / CALLS_PER_PAGE)}
                          className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        to={editEmail}
        subject=""
        context={composeContext}
      />
    </div>
  )
}
