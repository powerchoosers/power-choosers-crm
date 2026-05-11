'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addBusinessDays,
  addHours,
  addMinutes,
  format,
  setHours,
  setMinutes,
} from 'date-fns'
import {
  Building2,
  CalendarClock,
  CheckCheck,
  Clock3,
  GitMerge,
  Loader2,
  Mail,
  Phone,
  Save,
  Tags,
  TriangleAlert,
  User2,
  Voicemail,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ComposeContext } from '@/components/emails/ComposeModal'
import { useAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useContact, useUpdateContact } from '@/hooks/useContacts'
import {
  useAccountListMemberships,
  useAddAccountToList,
  useRemoveAccountFromList,
} from '@/hooks/useAccountListMemberships'
import {
  useAddContactToList,
  useContactListMemberships,
  useRemoveContactFromList,
} from '@/hooks/useContactListMemberships'
import {
  useAddContactToProtocol,
  useContactProtocolMemberships,
  useRemoveContactFromProtocol,
} from '@/hooks/useContactProtocolMemberships'
import { useProtocols } from '@/hooks/useProtocols'
import { useTargets } from '@/hooks/useTargets'
import { useTasks, type Task } from '@/hooks/useTasks'
import { buildForensicNoteEntries, formatForensicNoteClipboard } from '@/lib/forensic-notes'
import { buildIntelligenceBriefContext } from '@/lib/intelligence-brief-context'
import { isUnknownAnsweredBy, isVoicemailAnsweredBy } from '@/lib/voice-outcomes'
import { cn } from '@/lib/utils'
import { useComposeStore } from '@/store/composeStore'

const CONTACT_TARGET_KINDS = new Set(['people', 'person', 'contact', 'contacts'])
const ACCOUNT_TARGET_KINDS = new Set(['account', 'accounts', 'company', 'companies'])

type DispositionId =
  | 'qualified'
  | 'send_info'
  | 'call_back'
  | 'voicemail_dropped'
  | 'amd_unknown'
  | 'gatekeeper'
  | 'bad_number'
  | 'do_not_contact'

type DuePreset = 'none' | '15m' | '1h' | 'tomorrow_am' | '2d' | '1w'

interface DispositionDefinition {
  id: DispositionId
  label: string
  summary: string
  priority: Task['priority']
  createTaskDefault: boolean
  openEmailDefault: boolean
  duePreset: DuePreset
  reminderMinutes: number[]
  icon: typeof Save
  tone: string
}

const DISPOSITIONS: DispositionDefinition[] = [
  {
    id: 'qualified',
    label: 'Qualified',
    summary: 'They are interested and should move to a real next step.',
    priority: 'High',
    createTaskDefault: true,
    openEmailDefault: false,
    duePreset: 'tomorrow_am',
    reminderMinutes: [60],
    icon: CheckCheck,
    tone: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
  },
  {
    id: 'send_info',
    label: 'Send Info',
    summary: 'They asked for an email, deck, pricing, or a written follow-up.',
    priority: 'High',
    createTaskDefault: true,
    openEmailDefault: true,
    duePreset: '1h',
    reminderMinutes: [15],
    icon: Mail,
    tone: 'border-[#002FA7]/30 bg-[#002FA7]/15 text-[#a9c3ff]',
  },
  {
    id: 'call_back',
    label: 'Call Back',
    summary: 'They want another call or a retry at a better time.',
    priority: 'High',
    createTaskDefault: true,
    openEmailDefault: false,
    duePreset: '1h',
    reminderMinutes: [15, 60],
    icon: Phone,
    tone: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
  },
  {
    id: 'voicemail_dropped',
    label: 'Voicemail Dropped',
    summary: 'A voicemail was detected and the drop should be treated as completed.',
    priority: 'Medium',
    createTaskDefault: true,
    openEmailDefault: false,
    duePreset: '2d',
    reminderMinutes: [60],
    icon: Voicemail,
    tone: 'border-sky-500/25 bg-sky-500/10 text-sky-200',
  },
  {
    id: 'amd_unknown',
    label: 'AMD Unknown',
    summary: 'Twilio could not classify the answer. Review the number and retry with a longer timeout if needed.',
    priority: 'High',
    createTaskDefault: true,
    openEmailDefault: false,
    duePreset: '15m',
    reminderMinutes: [15, 60],
    icon: TriangleAlert,
    tone: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
  },
  {
    id: 'gatekeeper',
    label: 'Gatekeeper',
    summary: 'You hit a screener and need another route back into the account.',
    priority: 'Medium',
    createTaskDefault: true,
    openEmailDefault: false,
    duePreset: 'tomorrow_am',
    reminderMinutes: [60],
    icon: GitMerge,
    tone: 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-200',
  },
  {
    id: 'bad_number',
    label: 'Bad Number',
    summary: 'The number is wrong, disconnected, or unusable.',
    priority: 'Medium',
    createTaskDefault: true,
    openEmailDefault: false,
    duePreset: '2d',
    reminderMinutes: [60],
    icon: TriangleAlert,
    tone: 'border-rose-500/25 bg-rose-500/10 text-rose-200',
  },
  {
    id: 'do_not_contact',
    label: 'Do Not Contact',
    summary: 'They should be suppressed from future outreach unless reviewed.',
    priority: 'Low',
    createTaskDefault: false,
    openEmailDefault: false,
    duePreset: 'none',
    reminderMinutes: [],
    icon: X,
    tone: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-300',
  },
]

const DUE_PRESET_OPTIONS: Array<{ value: DuePreset; label: string }> = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: 'tomorrow_am', label: 'Tomorrow 9A' },
  { value: '2d', label: '2 Days' },
  { value: '1w', label: '1 Week' },
]

const REMINDER_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15m' },
  { value: 60, label: '1h' },
  { value: 1440, label: '1d' },
]

function nextBusinessMorning(daysAhead: number, hour: number) {
  const shifted = addBusinessDays(new Date(), daysAhead)
  return setMinutes(setHours(shifted, hour), 0)
}

function resolveDueDate(preset: DuePreset): Date | null {
  switch (preset) {
    case '15m':
      return addMinutes(new Date(), 15)
    case '1h':
      return addHours(new Date(), 1)
    case 'tomorrow_am':
      return nextBusinessMorning(1, 9)
    case '2d':
      return nextBusinessMorning(2, 10)
    case '1w':
      return nextBusinessMorning(5, 10)
    default:
      return null
  }
}

function buildDispositionTaskTitle(dispositionId: DispositionId, entityName: string, companyName: string) {
  const displayName = entityName || 'contact'
  const displayCompany = companyName || 'account'

  switch (dispositionId) {
    case 'qualified':
      return `Advance ${displayName} at ${displayCompany}`
    case 'send_info':
      return `Send follow-up info to ${displayName}`
    case 'call_back':
      return `Call back ${displayName}`
    case 'voicemail_dropped':
      return `Retry ${displayName} after voicemail`
    case 'amd_unknown':
      return `Review AMD result for ${displayName}`
    case 'gatekeeper':
      return `Find alternate route into ${displayCompany}`
    case 'bad_number':
      return `Resolve a better phone number for ${displayName}`
    case 'do_not_contact':
      return `Review DNC cleanup for ${displayName}`
    default:
      return `Follow up with ${displayName}`
  }
}

function buildDispositionDescription({
  dispositionLabel,
  note,
  phoneNumber,
  companyName,
}: {
  dispositionLabel: string
  note: string
  phoneNumber: string
  companyName: string
}) {
  const lines = [`Disposition: ${dispositionLabel}`]

  if (companyName) {
    lines.push(`Account: ${companyName}`)
  }

  if (phoneNumber) {
    lines.push(`Phone: ${phoneNumber}`)
  }

  if (note) {
    lines.push('', note)
  }

  return lines.join('\n')
}

export interface PowerDialPostCallSnapshot {
  contactId?: string
  accountId?: string
  name?: string
  accountName?: string
  title?: string
  phoneNumber?: string
  callSid?: string
  answeredBy?: string
  voicemailDropStatus?: string
}

interface PowerDialPostCallWorkspaceProps {
  snapshot: PowerDialPostCallSnapshot | null
  onContinueDialing?: () => void
}

export function PowerDialPostCallWorkspace({ snapshot, onContinueDialing }: PowerDialPostCallWorkspaceProps) {
  const openCompose = useComposeStore((state) => state.openCompose)
  const contactId = snapshot?.contactId || ''
  const { data: contact } = useContact(contactId)

  const accountQueryId = useMemo(() => {
    return snapshot?.accountId || String((contact as any)?.linkedAccountId || (contact as any)?.accountId || '')
  }, [contact, snapshot?.accountId])
  const { data: account } = useAccount(accountQueryId)

  const updateContact = useUpdateContact()
  const updateAccount = useUpdateAccount()
  const { addTaskAsync } = useTasks()

  const contactListMemberships = useContactListMemberships(contactId || undefined)
  const accountListMemberships = useAccountListMemberships(!contactId && accountQueryId ? accountQueryId : undefined)
  const contactProtocolMemberships = useContactProtocolMemberships(contactId || undefined)

  const addContactToList = useAddContactToList()
  const removeContactFromList = useRemoveContactFromList()
  const addAccountToList = useAddAccountToList()
  const removeAccountFromList = useRemoveAccountFromList()
  const addContactToProtocol = useAddContactToProtocol()
  const removeContactFromProtocol = useRemoveContactFromProtocol()

  const { data: targetsData } = useTargets()
  const { data: protocolsData } = useProtocols()

  const [noteDraft, setNoteDraft] = useState('')
  const [targetSearch, setTargetSearch] = useState('')
  const [protocolSearch, setProtocolSearch] = useState('')
  const [isTargetPickerOpen, setIsTargetPickerOpen] = useState(false)
  const [isProtocolPickerOpen, setIsProtocolPickerOpen] = useState(false)
  const [selectedDispositionId, setSelectedDispositionId] = useState<DispositionId | null>(null)
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false)
  const [openEmailAfterDisposition, setOpenEmailAfterDisposition] = useState(false)
  const [dispositionTaskTitle, setDispositionTaskTitle] = useState('')
  const [duePreset, setDuePreset] = useState<DuePreset>('none')
  const [reminderMinutes, setReminderMinutes] = useState<number[]>([])
  const [selectedDispositionProtocolId, setSelectedDispositionProtocolId] = useState('')
  const [isApplyingDisposition, setIsApplyingDisposition] = useState(false)

  const resolvedContactId = contactId || ''
  const resolvedAccountId = account?.id || accountQueryId || ''
  const entityName = contact?.name || snapshot?.name || 'Unknown Contact'
  const entityTitle = contact?.title || snapshot?.title || ''
  const companyName = account?.name || snapshot?.accountName || ''
  const entityPhone = snapshot?.phoneNumber || ''
  const entityEmail = contact?.email || ''
  const currentCallSid = snapshot?.callSid || ''

  const targetMemberships = resolvedContactId
    ? (contactListMemberships.data ?? [])
    : (accountListMemberships.data ?? [])
  const protocolMemberships = contactProtocolMemberships.data ?? []

  const compatibleTargets = useMemo(() => {
    const kinds = resolvedContactId ? CONTACT_TARGET_KINDS : ACCOUNT_TARGET_KINDS
    return (targetsData ?? []).filter((target) => kinds.has(String(target.kind || '').toLowerCase()))
  }, [resolvedContactId, targetsData])

  const availableTargets = useMemo(() => {
    const existingIds = new Set(targetMemberships.map((membership) => membership.listId))
    const query = targetSearch.trim().toLowerCase()

    return compatibleTargets.filter((target) => {
      if (existingIds.has(target.id)) return false
      if (!query) return true
      return String(target.name || '').toLowerCase().includes(query)
    })
  }, [compatibleTargets, targetMemberships, targetSearch])

  const protocols = useMemo(() => {
    return protocolsData?.pages?.flatMap((page) => page.protocols) ?? []
  }, [protocolsData])

  const availableProtocols = useMemo(() => {
    const existingIds = new Set(protocolMemberships.map((membership) => membership.sequenceId))
    const query = protocolSearch.trim().toLowerCase()

    return protocols.filter((protocol) => {
      if (existingIds.has(protocol.id)) return false
      if (!query) return true
      return String(protocol.name || '').toLowerCase().includes(query)
    })
  }, [protocolMemberships, protocolSearch, protocols])

  const composeContext = useMemo((): ComposeContext | null => {
    if (!snapshot) return null

    const noteSources = buildForensicNoteEntries([
      {
        label: `CONTACT NOTE • ${entityName || 'UNKNOWN CONTACT'}`,
        notes: String((contact as any)?.notes || '').trim() || null,
      },
      {
        label: `ACCOUNT NOTE • ${companyName || 'UNKNOWN ACCOUNT'}`,
        notes: String(account?.description || '').trim() || null,
      },
      noteDraft.trim()
        ? {
            label: 'CURRENT CALL NOTE',
            notes: noteDraft.trim(),
          }
        : null,
    ].filter(Boolean) as Array<{ label: string; notes?: string | null }>)

    const contextForAi = noteSources.length > 0 ? formatForensicNoteClipboard(noteSources) : undefined
    const briefContext = buildIntelligenceBriefContext(account as any)
    const combinedContext = [contextForAi, briefContext].filter(Boolean).join('\n\n') || undefined

    return {
      contactName: entityName || undefined,
      contactTitle: entityTitle || undefined,
      companyName: companyName || undefined,
      accountName: companyName || undefined,
      industry: account?.industry || undefined,
      accountDescription: account?.description || undefined,
      contactId: resolvedContactId || undefined,
      accountId: resolvedAccountId || undefined,
      contextForAi: combinedContext,
    }
  }, [account, account?.description, account?.industry, companyName, contact, entityName, entityTitle, noteDraft, resolvedAccountId, resolvedContactId, snapshot])

  const selectedDisposition = useMemo(
    () => DISPOSITIONS.find((item) => item.id === selectedDispositionId) ?? null,
    [selectedDispositionId]
  )

  const applyDispositionDefaults = useCallback((nextDispositionId: DispositionId | null) => {
    const config = DISPOSITIONS.find((item) => item.id === nextDispositionId) ?? null
    setSelectedDispositionId(nextDispositionId)
    setCreateFollowUpTask(Boolean(config?.createTaskDefault))
    setOpenEmailAfterDisposition(Boolean(config?.openEmailDefault))
    setDuePreset(config?.duePreset ?? 'none')
    setReminderMinutes(config?.reminderMinutes ?? [])
    setSelectedDispositionProtocolId('')
    setDispositionTaskTitle(
      config ? buildDispositionTaskTitle(config.id, entityName, companyName) : ''
    )
  }, [companyName, entityName])

  useEffect(() => {
    setNoteDraft('')
    setTargetSearch('')
    setProtocolSearch('')
    setIsTargetPickerOpen(false)
    setIsProtocolPickerOpen(false)

    const defaultDispositionId = isVoicemailAnsweredBy(snapshot?.answeredBy)
      ? 'voicemail_dropped'
      : isUnknownAnsweredBy(snapshot?.answeredBy)
        ? 'amd_unknown'
        : null

    applyDispositionDefaults(defaultDispositionId)
  }, [
    applyDispositionDefaults,
    snapshot?.accountId,
    snapshot?.answeredBy,
    snapshot?.callSid,
    snapshot?.contactId,
    snapshot?.phoneNumber,
  ])

  const saveDraftToDossier = useCallback(async () => {
    const trimmed = noteDraft.trim()
    if (!trimmed) return true

    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm')
    const entry = `[${timestamp}] CALL NOTE: ${trimmed}`

    if (resolvedContactId) {
      const existingNotes = String((contact as any)?.notes || '').trim()
      const nextNotes = existingNotes ? `${existingNotes}\n\n${entry}` : entry
      await updateContact.mutateAsync({
        id: resolvedContactId,
        notes: nextNotes,
        accountId: resolvedAccountId || undefined,
      })
      setNoteDraft('')
      toast.success('Saved to contact dossier')
      return true
    }

    if (resolvedAccountId) {
      const existingDescription = String(account?.description || '').trim()
      const nextDescription = existingDescription ? `${existingDescription}\n\n${entry}` : entry
      await updateAccount.mutateAsync({
        id: resolvedAccountId,
        description: nextDescription,
      })
      setNoteDraft('')
      toast.success('Saved to account dossier')
      return true
    }

    toast.error('This call is not linked to a contact or account yet.')
    return false
  }, [account?.description, contact, noteDraft, resolvedAccountId, resolvedContactId, updateAccount, updateContact])

  const handleSaveNote = useCallback(async () => {
    try {
      await saveDraftToDossier()
    } catch (error) {
      console.error('Failed to save post-call note:', error)
      toast.error('Could not save the post-call note')
    }
  }, [saveDraftToDossier])

  const openFollowUpEmail = useCallback(() => {
    openCompose({
      to: entityEmail || '',
      subject: '',
      context: composeContext,
    })

    if (!entityEmail) {
      toast.info('Compose opened without a recipient. Add the email address before sending.')
    }
  }, [composeContext, entityEmail, openCompose])

  const handleOpenEmail = useCallback(async () => {
    try {
      const saved = await saveDraftToDossier()
      if (!saved) return
      openFollowUpEmail()
    } catch (error) {
      console.error('Failed to launch post-call email:', error)
      toast.error('Could not open the follow-up email')
    }
  }, [openFollowUpEmail, saveDraftToDossier])

  const handleAddToTarget = useCallback(async (targetId: string) => {
    try {
      if (resolvedContactId) {
        await addContactToList.mutateAsync({ contactId: resolvedContactId, listId: targetId })
      } else if (resolvedAccountId) {
        await addAccountToList.mutateAsync({ accountId: resolvedAccountId, listId: targetId })
      } else {
        toast.error('No linked CRM record was found for this call.')
        return
      }

      toast.success('Added to target')
      setTargetSearch('')
      setIsTargetPickerOpen(false)
    } catch (error) {
      console.error('Failed to add to target:', error)
    }
  }, [addAccountToList, addContactToList, resolvedAccountId, resolvedContactId])

  const handleRemoveTarget = useCallback(async (membershipId: string) => {
    try {
      if (resolvedContactId) {
        await removeContactFromList.mutateAsync({ contactId: resolvedContactId, membershipId })
      } else if (resolvedAccountId) {
        await removeAccountFromList.mutateAsync({ accountId: resolvedAccountId, membershipId })
      }
    } catch (error) {
      console.error('Failed to remove target membership:', error)
    }
  }, [removeAccountFromList, removeContactFromList, resolvedAccountId, resolvedContactId])

  const handleAddToProtocol = useCallback(async (sequenceId: string) => {
    if (!resolvedContactId) {
      toast.error('Protocols only apply to contacts, not account-only calls.')
      return
    }

    try {
      await addContactToProtocol.mutateAsync({ contactId: resolvedContactId, sequenceId })
      toast.success('Added to protocol')
      setProtocolSearch('')
      setIsProtocolPickerOpen(false)
    } catch (error) {
      console.error('Failed to add to protocol:', error)
    }
  }, [addContactToProtocol, resolvedContactId])

  const handleRemoveProtocol = useCallback(async (membershipId: string) => {
    if (!resolvedContactId) return

    try {
      await removeContactFromProtocol.mutateAsync({ contactId: resolvedContactId, membershipId })
    } catch (error) {
      console.error('Failed to remove protocol membership:', error)
    }
  }, [removeContactFromProtocol, resolvedContactId])

  const persistDispositionToCall = useCallback(async ({
    taskId,
    dueDate,
    protocolId,
  }: {
    taskId?: string
    dueDate?: string
    protocolId?: string
  }) => {
    if (!currentCallSid || !selectedDisposition) return

    const response = await fetch('/api/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callSid: currentCallSid,
        source: 'power-dial-disposition',
        metadata: {
          disposition: selectedDisposition.id,
          dispositionLabel: selectedDisposition.label,
          dispositionAppliedAt: new Date().toISOString(),
          dispositionTaskId: taskId || null,
          dispositionProtocolId: protocolId || null,
          dispositionReminderMinutes: reminderMinutes,
          dispositionReminderLabel: duePreset,
          dispositionDueDate: dueDate || null,
        },
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || 'Failed to stamp the call disposition')
    }
  }, [currentCallSid, duePreset, reminderMinutes, selectedDisposition])

  const applyDispositionCore = useCallback(async ({
    disposition,
    useDefaults = false,
    continueDialing = true,
  }: {
    disposition: DispositionDefinition
    useDefaults?: boolean
    continueDialing?: boolean
  }) => {
    setIsApplyingDisposition(true)

    try {
      const noteForDisposition = noteDraft.trim()

      if (noteForDisposition) {
        const noteSaved = await saveDraftToDossier()
        if (!noteSaved) {
          return
        }
      }

      const effectiveCreateTask = useDefaults ? disposition.createTaskDefault : createFollowUpTask
      const effectiveOpenEmail = useDefaults ? disposition.openEmailDefault : openEmailAfterDisposition
      const effectiveDuePreset = useDefaults ? disposition.duePreset : duePreset
      const effectiveReminderMinutes = useDefaults ? disposition.reminderMinutes : reminderMinutes
      const effectiveTaskTitle = useDefaults
        ? buildDispositionTaskTitle(disposition.id, entityName, companyName)
        : (dispositionTaskTitle.trim() || buildDispositionTaskTitle(disposition.id, entityName, companyName))
      const effectiveProtocolId = useDefaults ? '' : selectedDispositionProtocolId
      const dueDate = effectiveCreateTask ? resolveDueDate(effectiveDuePreset) : null
      let createdTask: Task | null = null

      if (effectiveCreateTask) {
        createdTask = await addTaskAsync({
          title: effectiveTaskTitle,
          description: buildDispositionDescription({
            dispositionLabel: disposition.label,
            note: noteForDisposition,
            phoneNumber: entityPhone,
            companyName,
          }),
          priority: disposition.priority,
          status: 'Pending',
          dueDate: dueDate?.toISOString(),
          reminders: effectiveReminderMinutes.length > 0 ? effectiveReminderMinutes : null,
          contactId: resolvedContactId || undefined,
          accountId: resolvedAccountId || undefined,
          relatedTo: entityName || companyName,
          relatedType: resolvedContactId ? 'Person' : 'Account',
          metadata: {
            source: 'power_dial_disposition',
            callSid: currentCallSid || null,
            disposition: disposition.id,
            dispositionLabel: disposition.label,
            reminderPreset: effectiveDuePreset,
          },
        })
      }

      if (effectiveProtocolId && resolvedContactId) {
        await addContactToProtocol.mutateAsync({
          contactId: resolvedContactId,
          sequenceId: effectiveProtocolId,
        })
      }

      await persistDispositionToCall({
        taskId: createdTask?.id,
        dueDate: dueDate?.toISOString(),
        protocolId: effectiveProtocolId || undefined,
      })

      if (effectiveOpenEmail) {
        openFollowUpEmail()
      }

      toast.success(`${disposition.label} applied`)

      if (continueDialing) {
        onContinueDialing?.()
      }
    } catch (error) {
      console.error('Failed to apply disposition:', error)
      toast.error(error instanceof Error ? error.message : 'Could not apply the disposition')
    } finally {
      setIsApplyingDisposition(false)
    }
  }, [
    addContactToProtocol,
    addTaskAsync,
    companyName,
    createFollowUpTask,
    currentCallSid,
    duePreset,
    entityName,
    entityPhone,
    noteDraft,
    onContinueDialing,
    openEmailAfterDisposition,
    openFollowUpEmail,
    persistDispositionToCall,
    reminderMinutes,
    resolvedAccountId,
    resolvedContactId,
    saveDraftToDossier,
    selectedDispositionProtocolId,
    dispositionTaskTitle,
  ])

  const handleApplyDisposition = useCallback(async () => {
    if (!selectedDisposition) {
      toast.error('Choose a post-call disposition first.')
      return
    }

    await applyDispositionCore({
      disposition: selectedDisposition,
      useDefaults: false,
      continueDialing: true,
    })
  }, [applyDispositionCore, selectedDisposition])

  const handleQuickVoicemailDrop = useCallback(async () => {
    const voicemailDisposition = DISPOSITIONS.find((item) => item.id === 'voicemail_dropped')
    if (!voicemailDisposition) return

    applyDispositionDefaults('voicemail_dropped')
    await applyDispositionCore({
      disposition: voicemailDisposition,
      useDefaults: true,
      continueDialing: true,
    })
  }, [applyDispositionCore, applyDispositionDefaults])

  const toggleReminderMinute = useCallback((value: number) => {
    setReminderMinutes((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value)
      }

      return [...current, value].sort((left, right) => left - right)
    })
  }, [])

  if (!snapshot) return null

  const isSavingNote =
    updateContact.isPending ||
    updateAccount.isPending
  const isTargetBusy =
    addContactToList.isPending ||
    removeContactFromList.isPending ||
    addAccountToList.isPending ||
    removeAccountFromList.isPending
  const isProtocolBusy =
    addContactToProtocol.isPending ||
    removeContactFromProtocol.isPending
  const dossierDestination = resolvedContactId
    ? 'Contact dossier'
    : resolvedAccountId
      ? 'Account dossier'
      : 'Unlinked call'

  return (
    <div className="rounded-[24px] border border-[#002FA7]/20 bg-[#002FA7]/[0.05] p-4 shadow-[0_0_40px_rgba(0,47,167,0.12)] sm:p-5">
      <div className="sticky top-3 z-20 rounded-[22px] border border-white/10 bg-[#020308]/70 px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-[#7aa3ff]">
              <Save className="h-3.5 w-3.5" />
              Post_Call_Workspace
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <User2 className="h-4 w-4 text-zinc-400" />
                <span className="truncate">{entityName}</span>
              </div>
              {companyName && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="truncate">{companyName}</span>
                </div>
              )}
              {entityPhone && (
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{entityPhone}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              {entityTitle && <span>{entityTitle}</span>}
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono uppercase tracking-widest text-[10px] text-zinc-400">
                {dossierDestination}
              </span>
              {currentCallSid && (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono uppercase tracking-widest text-[10px] text-emerald-200">
                  Call Linked
                </span>
              )}
              {isVoicemailAnsweredBy(snapshot.answeredBy) && (
                <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 font-mono uppercase tracking-widest text-[10px] text-sky-200">
                  Voicemail
                </span>
              )}
              {isUnknownAnsweredBy(snapshot.answeredBy) && (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-mono uppercase tracking-widest text-[10px] text-amber-200">
                  AMD Unknown
                </span>
              )}
            </div>
          </div>

          {!resolvedContactId && !resolvedAccountId && (
            <div className="flex max-w-sm items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This call is not linked to a CRM record yet. Notes cannot be saved until the contact or account is resolved.
              </span>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionButton
            icon={Voicemail}
            label="Voicemail Drop"
            onClick={() => void handleQuickVoicemailDrop()}
            disabled={isApplyingDisposition}
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <textarea
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          rows={4}
          placeholder="Capture what happened on the call, what they asked for, and the next step."
          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#002FA7]/50 focus:bg-black/40"
        />

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            icon={Save}
            label={isSavingNote ? 'Saving' : 'Save To Dossier'}
            onClick={handleSaveNote}
            disabled={isSavingNote || !noteDraft.trim() || (!resolvedContactId && !resolvedAccountId)}
            tone="primary"
          />
          <ActionButton
            icon={Mail}
            label="Post-Call Email"
            onClick={handleOpenEmail}
            disabled={isSavingNote}
          />
          <ActionButton
            icon={Tags}
            label={isTargetPickerOpen ? 'Hide Targets' : 'Add To Target'}
            onClick={() => setIsTargetPickerOpen((current) => !current)}
            disabled={isTargetBusy || compatibleTargets.length === 0}
          />
          <ActionButton
            icon={GitMerge}
            label={isProtocolPickerOpen ? 'Hide Protocols' : 'Add To Protocol'}
            onClick={() => setIsProtocolPickerOpen((current) => !current)}
            disabled={!resolvedContactId || isProtocolBusy || protocols.length === 0}
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
              <CalendarClock className="h-3.5 w-3.5 text-zinc-400" />
              Disposition_Engine
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Stamp the outcome, create the follow-up task, and optionally push the contact into a protocol without leaving the dialer.
            </p>
          </div>

          {!currentCallSid && (
            <div className="flex max-w-sm items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This call is missing a Twilio call ID. Tasks and protocols still work, but the transmission log cannot be stamped yet.
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {DISPOSITIONS.map((disposition) => {
            const Icon = disposition.icon
            const isSelected = selectedDispositionId === disposition.id

            return (
              <button
                key={disposition.id}
                type="button"
                onClick={() => applyDispositionDefaults(disposition.id)}
                className={cn(
                  'rounded-2xl border px-3 py-3 text-left transition-all',
                  isSelected
                    ? disposition.tone
                    : 'border-white/5 bg-white/[0.02] text-zinc-300 hover:border-white/10 hover:bg-white/[0.05]'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-mono uppercase tracking-widest">{disposition.label}</span>
                </div>
                <p className="mt-2 text-xs text-current/80">
                  {disposition.summary}
                </p>
              </button>
            )
          })}
        </div>

        {selectedDisposition ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-3">
              <div>
                <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
                  Follow_Up_Task
                </div>
                <input
                  value={dispositionTaskTitle}
                  onChange={(event) => setDispositionTaskTitle(event.target.value)}
                  disabled={!createFollowUpTask}
                  placeholder="Next-step task title"
                  className={cn(
                    'w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors',
                    createFollowUpTask
                      ? 'border-white/10 bg-white/[0.03] text-zinc-200 focus:border-[#002FA7]/40'
                      : 'border-white/5 bg-white/[0.02] text-zinc-600'
                  )}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  Due_When
                </div>
                <div className="flex flex-wrap gap-2">
                  {DUE_PRESET_OPTIONS.map((option) => (
                    <QuickChoice
                      key={option.value}
                      active={duePreset === option.value}
                      disabled={!createFollowUpTask}
                      label={option.label}
                      onClick={() => setDuePreset(option.value)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Reminders
                </div>
                <div className="flex flex-wrap gap-2">
                  {REMINDER_OPTIONS.map((option) => (
                    <QuickChoice
                      key={option.value}
                      active={reminderMinutes.includes(option.value)}
                      disabled={!createFollowUpTask}
                      label={option.label}
                      onClick={() => toggleReminderMinute(option.value)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
                    Create_Task
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Add a follow-up into the task system.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateFollowUpTask((current) => !current)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-all',
                    createFollowUpTask
                      ? 'border-[#002FA7]/40 bg-[#002FA7] text-white'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400'
                  )}
                >
                  {createFollowUpTask ? 'On' : 'Off'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
                    Open_Email
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Launch the global composer after the disposition is stamped.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenEmailAfterDisposition((current) => !current)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-all',
                    openEmailAfterDisposition
                      ? 'border-[#002FA7]/40 bg-[#002FA7] text-white'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400'
                  )}
                >
                  {openEmailAfterDisposition ? 'On' : 'Off'}
                </button>
              </div>

              {resolvedContactId ? (
                <div>
                  <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
                    Protocol_Feed
                  </div>
                  <select
                    value={selectedDispositionProtocolId}
                    onChange={(event) => setSelectedDispositionProtocolId(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#002FA7]/40"
                  >
                    <option value="">No protocol change</option>
                    {availableProtocols.map((protocol) => (
                      <option key={protocol.id} value={protocol.id}>
                        {protocol.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-xs text-zinc-500">
                  Protocol automation is only available when the call is linked to a contact.
                </div>
              )}

              <ActionButton
                icon={CalendarClock}
                label={isApplyingDisposition ? 'Applying' : 'Apply & Continue'}
                onClick={handleApplyDisposition}
                disabled={isApplyingDisposition || isSavingNote}
                tone="primary"
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 text-xs text-zinc-500">
            Pick a disposition so the dialer can stamp the call and queue the right next action.
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
              Target Memberships
            </div>
            <span className="text-[10px] font-mono text-zinc-600">
              {targetMemberships.length}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {targetMemberships.length > 0 ? targetMemberships.map((membership) => (
              <MembershipChip
                key={membership.id}
                label={membership.listName}
                onRemove={() => handleRemoveTarget(membership.id)}
                disabled={isTargetBusy}
              />
            )) : (
              <div className="text-xs text-zinc-600">
                No target memberships yet.
              </div>
            )}
          </div>

          {isTargetPickerOpen && (
            <div className="mt-3 space-y-2">
              <input
                value={targetSearch}
                onChange={(event) => setTargetSearch(event.target.value)}
                placeholder="Search targets..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#002FA7]/40"
              />
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {availableTargets.length > 0 ? availableTargets.map((target) => (
                  <PickerOption
                    key={target.id}
                    label={target.name}
                    meta={`${String(target.count || 0)} members`}
                    onClick={() => handleAddToTarget(target.id)}
                    disabled={isTargetBusy}
                  />
                )) : (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-zinc-600">
                    No matching targets available.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
              Protocol Memberships
            </div>
            <span className="text-[10px] font-mono text-zinc-600">
              {protocolMemberships.length}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {protocolMemberships.length > 0 ? protocolMemberships.map((membership) => (
              <MembershipChip
                key={membership.id}
                label={membership.sequenceName}
                onRemove={() => handleRemoveProtocol(membership.id)}
                disabled={isProtocolBusy}
              />
            )) : (
              <div className="text-xs text-zinc-600">
                {resolvedContactId ? 'No protocol memberships yet.' : 'Protocols only apply to contact-linked calls.'}
              </div>
            )}
          </div>

          {isProtocolPickerOpen && (
            <div className="mt-3 space-y-2">
              <input
                value={protocolSearch}
                onChange={(event) => setProtocolSearch(event.target.value)}
                placeholder="Search protocols..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#002FA7]/40"
              />
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {availableProtocols.length > 0 ? availableProtocols.map((protocol) => (
                  <PickerOption
                    key={protocol.id}
                    label={protocol.name}
                    meta={`${protocol.steps?.length || 0} steps`}
                    onClick={() => handleAddToProtocol(protocol.id)}
                    disabled={isProtocolBusy}
                  />
                )) : (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-zinc-600">
                    No matching protocols available.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  tone = 'secondary',
}: {
  icon: typeof Save
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'primary' | 'secondary'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-mono uppercase tracking-widest transition-all',
        tone === 'primary'
          ? 'border-[#002FA7]/40 bg-[#002FA7] text-white hover:bg-[#002FA7]/90'
          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white',
        disabled && 'cursor-not-allowed border-white/5 bg-white/[0.02] text-zinc-600 hover:bg-white/[0.02] hover:text-zinc-600'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  )
}

function QuickChoice({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all',
        active
          ? 'border-[#002FA7]/40 bg-[#002FA7] text-white'
          : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200',
        disabled && 'cursor-not-allowed border-white/5 bg-white/[0.02] text-zinc-600 hover:bg-white/[0.02] hover:text-zinc-600'
      )}
    >
      {label}
    </button>
  )
}

function MembershipChip({
  label,
  onRemove,
  disabled = false,
}: {
  label: string
  onRemove: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-300 transition-all hover:bg-white/[0.08] hover:text-white',
        disabled && 'cursor-not-allowed opacity-60'
      )}
      title="Remove"
    >
      <span>{label}</span>
      <X className="h-3 w-3" />
    </button>
  )
}

function PickerOption({
  label,
  meta,
  onClick,
  disabled = false,
}: {
  label: string
  meta: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-left transition-all hover:border-white/10 hover:bg-white/[0.05]',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-zinc-200">
          {label}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          {meta}
        </div>
      </div>
      <div className="ml-3 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/30">
        {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" /> : <span className="text-sm text-zinc-400">+</span>}
      </div>
    </button>
  )
}
