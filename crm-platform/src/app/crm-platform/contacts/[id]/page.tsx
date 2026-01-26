'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useRouter } from 'next/navigation'
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { 
  AlertTriangle, ArrowLeft, Clock, Globe, Linkedin, Mail, MapPin, Phone, 
  Lock, Unlock, Check, Sparkles, Plus, Star, Trash2,
  Building2, CheckCircle, Play, DollarSign, Mic, History, RefreshCw, X,
  ArrowRightLeft, ChevronLeft, ChevronRight
} from 'lucide-react'
import { UplinkCard } from '@/components/dossier/UplinkCard'
import DataIngestionCard from '@/components/dossier/DataIngestionCard'
import { useContact, useUpdateContact } from '@/hooks/useContacts'
import { useContactCalls } from '@/hooks/useCalls'
import { CallListItem } from '@/components/calls/CallListItem'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { Button } from '@/components/ui/button'
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

  const { data: contact, isLoading } = useContact(id)
  const { data: recentCalls, isLoading: isLoadingCalls } = useContactCalls(id)
  const updateContact = useUpdateContact()
  const { isEditing, setIsEditing, toggleEditing } = useUIStore()
  const setContext = useGeminiStore((state) => state.setContext)
  const toggleHistory = useGeminiStore((state) => state.toggleHistory)

  const [isSaving, setIsSaving] = useState(false)
  const [showSynced, setShowSynced] = useState(false)
  const [currentCallPage, setCurrentCallPage] = useState(1)
  const CALLS_PER_PAGE = 4
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
  const [editServiceAddresses, setEditServiceAddresses] = useState<Array<{ address: string; isPrimary: boolean }>>([])
  
  // New Phone States
  const [editMobile, setEditMobile] = useState('')
  const [editWorkDirect, setEditWorkDirect] = useState('')
  const [editOther, setEditOther] = useState('')
  const [editCompanyPhone, setEditCompanyPhone] = useState('')
  const [editPrimaryField, setEditPrimaryField] = useState<'mobile' | 'workDirectPhone' | 'otherPhone'>('mobile')

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
          toast.error('Sync failed')
          console.error(err)
        } finally {
          setIsSaving(false)
        }
      }
      triggerSave()
    }
  }, [isEditing, id, editName, editTitle, editCompany, editPhone, editEmail, editNotes, editSupplier, editStrikePrice, editAnnualUsage, editServiceAddresses, editMobile, editWorkDirect, editOther, editCompanyPhone, editPrimaryField, updateContact])

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

  const primaryServiceAddress = useMemo(() => {
    const addrs = Array.isArray(contact?.serviceAddresses)
      ? (contact?.serviceAddresses as Array<{ isPrimary?: boolean; address?: unknown }>)
      : []
    const primary = addrs.find((addr) => addr?.isPrimary) || addrs[0]
    if (!primary?.address) return ''
    return typeof primary.address === 'string' ? primary.address : String(primary.address)
  }, [contact?.serviceAddresses])

  if (isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-800 border-t-[#002FA7]" />
          <div className="text-sm text-zinc-500 font-mono uppercase tracking-widest">Initialising Terminal...</div>
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <div className="nodal-glass p-8 rounded-2xl flex flex-col items-center gap-6 border-white/10 shadow-2xl">
          <div className="p-4 bg-red-500/10 rounded-full">
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
      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none bg-gradient-to-b from-white/5 to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#002FA7]/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="flex-none p-6 md:p-8 border-b border-white/5 bg-zinc-900/80 backdrop-blur-sm relative z-10">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>

              <div className="flex items-center gap-4">
                {/* Refined Glyph Avatar - Nodal Glass Style */}
                <div className="h-14 w-14 rounded-full nodal-glass flex items-center justify-center text-sm font-semibold text-white/90 border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                  {contactName
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-4 group/name">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="text-3xl md:text-4xl font-semibold tracking-tighter text-white bg-transparent border-none outline-none focus:ring-1 focus:ring-[#002FA7]/50 rounded px-1 -ml-1 w-full"
                        placeholder="Contact Name"
                        autoFocus
                      />
                    ) : (
                      <>
                        <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-white">{editName || contactName}</h1>
                        
                        {/* THE SIGNAL ARRAY */}
                        <div className="flex items-center gap-1 bg-white/[0.02] rounded-full p-1 border border-white/5">
                          <a 
                            href={contact?.website || '#'} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={cn(
                              "p-1.5 rounded-full transition-colors",
                              contact?.website ? "hover:bg-zinc-700 text-white" : "text-zinc-600 cursor-not-allowed"
                            )} 
                            title="Visit Website"
                          >
                            <Globe className="w-3.5 h-3.5" />
                          </a>
                          <div className="w-px h-3 bg-white/10" />
                          <a 
                            href={contact?.linkedinUrl || '#'} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={cn(
                              "p-1.5 rounded-full transition-colors",
                              contact?.linkedinUrl ? "hover:bg-[#0077b5] text-white" : "text-zinc-600 cursor-not-allowed"
                            )} 
                            title="View LinkedIn"
                          >
                            <Linkedin className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </>
                    )}
                    
                    {/* Synced indicator with exit animation */}
                    <AnimatePresence>
                      {showSynced && (
                        <motion.div 
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

                  <div className="flex items-center gap-2 text-zinc-400 mt-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="text-sm font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-[#002FA7]/30 rounded px-1 -ml-1 text-zinc-300 w-1/3"
                          placeholder="Title"
                        />
                        <span className="text-zinc-600">at</span>
                        <input
                          type="text"
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          className="text-sm font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-[#002FA7]/30 rounded px-1 -ml-1 text-zinc-300 w-1/2"
                          placeholder="Company"
                        />
                      </div>
                    ) : (
                      <span className="font-medium">
                        {editTitle ? `${editTitle}${editCompany ? ' at ' : ''}` : ''}
                        {editCompany}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>



            <div className="text-right">
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Dossier Status</div>
                  <button
                    onClick={toggleEditing}
                    className={cn(
                      "p-1 rounded-md transition-all duration-300",
                      isEditing 
                        ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20" 
                        : "text-zinc-500 hover:text-white hover:bg-white/5"
                    )}
                    title={isEditing ? "Lock Dossier" : "Unlock Dossier"}
                  >
                    {isEditing ? (
                      <Unlock className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
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
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative z-10 group/dossier">
          <div className="grid grid-cols-12 w-full h-full">
            <div className="col-span-12 lg:col-span-4 h-full overflow-y-auto p-6 md:p-8 border-r border-white/5 scrollbar-thin scrollbar-thumb-zinc-800/0 hover:scrollbar-thumb-zinc-800/50 scrollbar-track-transparent transition-all duration-300">
              <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-1000">
                {contact && (
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
                )}

                {/* Contract & Supplier Intelligence */}
                <div className={`rounded-2xl border transition-all duration-500 bg-zinc-900/30 backdrop-blur-xl p-6 relative overflow-hidden shadow-lg space-y-6 ${isEditing ? 'border-[#002FA7]/30' : 'border-white/10'}`}>
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                  
                  {/* Contract Maturity Field (Moved from Header in Plan) */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Position Maturity</h4>
                      <div className="text-right">
                        <span className="text-xs text-zinc-500 mr-2">Expiration:</span>
                        <span className="text-white font-mono font-bold tabular-nums">
                          {contractEndDate ? format(contractEndDate, 'MMM dd, yyyy') : 'TBD'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full ${maturityColor} transition-all duration-1000 ease-out relative`}
                        style={{ width: `${Math.round(maturityPct * 100)}%` }}
                      >
                        <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 shadow-[0_0_10px_white]" />
                      </div>
                    </div>

                    <div className="flex justify-between mt-2">
                      <span className="text-xs text-[#002FA7] font-mono tabular-nums ml-auto">
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
                      <div className="text-xl font-semibold tracking-tighter text-white">{editSupplier || '--'}</div>
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
                        <div className="text-xl font-mono tabular-nums tracking-tighter text-[#002FA7]">
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
                        <div className="text-xl font-mono tabular-nums tracking-tighter text-white">
                          {editAnnualUsage || '--'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Estimated Annual Revenue</div>
                    <div className="text-3xl font-mono tabular-nums tracking-tighter text-green-500/80">
                      {annualRevenue}
                    </div>
                    <div className="text-[9px] font-mono text-zinc-600 mt-1 uppercase tracking-widest">Calculated at 0.003 margin base</div>
                  </div>
                </div>

                <DataIngestionCard accountId={contact?.accountId} />
              </div>
            </div>

            <div className="col-span-12 lg:col-span-8 h-full overflow-y-auto p-6 md:p-8 scrollbar-thin scrollbar-thumb-zinc-700/50 hover:scrollbar-thumb-[#002FA7]/50 scrollbar-track-transparent transition-all duration-300 np-scroll">
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-1000 delay-300">
                {/* FORENSIC NOTES TERMINAL */}
                <div 
                  className={`rounded-2xl border transition-all duration-500 bg-zinc-950/80 backdrop-blur-xl p-8 min-h-[500px] relative overflow-hidden shadow-2xl group flex flex-col font-mono ${isEditing ? 'border-[#002FA7]/50 ring-1 ring-[#002FA7]/20 cursor-text' : 'border-white/10'}`}
                  onClick={() => {
                    if (!isEditing) handleTerminalClick()
                  }}
                >
                  {/* CRT Effect Overlay */}
                  <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-50" />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#002FA7]/5 to-transparent pointer-events-none" />
                  
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

                          return (
                            <div key={idx} className="group/entry flex gap-4 animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                              <div className="flex flex-col items-center gap-1 mt-1">
                                <div className="w-1 h-1 rounded-full bg-[#002FA7]/40" />
                                <div className="w-[1px] flex-1 bg-gradient-to-b from-[#002FA7]/20 to-transparent" />
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

                {/* RECENT CALLS & AI INSIGHTS */}
                <div className="rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl pt-8 px-8 pb-0 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Mic className="w-5 h-5 text-[#002FA7]" /> Transmission Log
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1 uppercase tracking-widest font-mono">Forensic Voice Data</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#002FA7]/10 border border-[#002FA7]/20">
                        <Sparkles className="w-3 h-3 text-[#002FA7]" />
                        <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-tighter">AI_ENABLED</span>
                      </div>
                      <button 
                        className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
                        onClick={() => router.push('/crm-platform/calls')}
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Recent Calls List */}
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                    {isLoadingCalls ? (
                      <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                        <RefreshCw className="w-8 h-8 animate-spin mb-4 opacity-20" />
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em]">Intercepting_Signals...</p>
                      </div>
                    ) : recentCalls && recentCalls.length > 0 ? (
                      <>
                        <div className="space-y-4 min-h-[320px]">
                          {recentCalls
                            .slice((currentCallPage - 1) * CALLS_PER_PAGE, currentCallPage * CALLS_PER_PAGE)
                            .map((call) => (
                              <CallListItem key={call.id} call={call} contactId={id} />
                            ))}
                        </div>
                        
                        {/* Sync_Block Footer with Integrated Pagination */}
                        <div className="mt-4 pt-4 pb-6 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
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
                            <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
                              {currentCallPage.toString().padStart(2, '0')}
                            </div>
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
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                        <History className="w-12 h-12 mb-4 opacity-10" />
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em]">No_Historical_Data_Found</p>
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
