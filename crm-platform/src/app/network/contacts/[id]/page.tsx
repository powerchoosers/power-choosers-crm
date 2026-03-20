'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { Button } from '@/components/ui/button'
import { LoadingOrb } from '@/components/ui/LoadingOrb'
import type { ComposeContext } from '@/components/emails/ComposeModal'
import { EntityEmailFeed } from '@/components/emails/EntityEmailFeed'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useComposeStore } from '@/store/composeStore'
import { buildForensicNoteEntries, formatForensicNoteClipboard } from '@/lib/forensic-notes'
import { buildUsableCallContextBlock } from '@/lib/call-context'

// Modular Components
import { useContactDossierState } from '@/hooks/useContactDossierState'
import { useDeleteContact } from '@/hooks/useContacts'
import { DossierHeader } from '@/components/dossier/contact-dossier/DossierHeader'
import { IntelligencePanel } from '@/components/dossier/contact-dossier/IntelligencePanel'
import { AnalystTerminal } from '@/components/dossier/contact-dossier/AnalystTerminal'
import { EngagementLog } from '@/components/dossier/contact-dossier/EngagementLog'

export default function ContactDossierPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = (params?.id as string) || ''

  // Centralized State Hook
  const s = useContactDossierState(id)
  const openCompose = useComposeStore((state) => state.openCompose)
  const deleteContact = useDeleteContact()

  const handleDelete = () => {
    s.lockWithoutSaving()
    deleteContact.mutate(id, {
      onSuccess: () => router.back(),
    })
  }

  const [glowingFields, setGlowingFields] = useState<Set<string>>(new Set())
  const [isRecalibrating, setIsRecalibrating] = useState(false)

  // Task Navigation logic (bridging the hook and UI)
  const taskIdFromUrl = searchParams?.get('taskId') ?? null
  useEffect(() => {
    if (!taskIdFromUrl || !s.pendingTasks.length) return
    const idx = s.pendingTasks.findIndex((t) => t.id === taskIdFromUrl)
    if (idx >= 0) s.setCurrentTaskIndex(idx)
  }, [taskIdFromUrl, s.pendingTasks]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayTaskIndex = Math.min(s.currentTaskIndex, Math.max(0, s.pendingTasks.length - 1))
  const currentTask = s.pendingTasks[displayTaskIndex]
  const globalIndex = currentTask ? s.allPendingTasks.findIndex((t) => String(t.id) === String(currentTask.id)) : -1
  const globalPosition = globalIndex >= 0 ? globalIndex + 1 : 0
  const useGlobalPagination = globalIndex >= 0 && s.globalTotal > 0

  const handlePrev = () => {
    if (globalIndex <= 0) {
      s.setCurrentTaskIndex((p) => Math.max(0, p - 1))
      return
    }
    // Deep navigation logic remains in main or moved to hook if possible - keeping here for safety
    const prevTask = s.allPendingTasks[globalIndex - 1]
    if (prevTask) {
      const cid = prevTask.contactId
      const aid = prevTask.accountId
      if (cid === id || (aid && aid === (s.contact as any)?.linkedAccountId)) {
        const localIdx = s.pendingTasks.findIndex(t => t.id === prevTask.id)
        if (localIdx >= 0) { s.setCurrentTaskIndex(localIdx); return; }
      }
      if (cid) router.push(`/network/contacts/${cid}?taskId=${encodeURIComponent(prevTask.id)}`)
      else if (aid) router.push(`/network/accounts/${aid}?taskId=${encodeURIComponent(prevTask.id)}`)
    }
  }

  const handleNext = () => {
    if (globalIndex < 0 || globalIndex >= s.allPendingTasks.length - 1) {
      s.setCurrentTaskIndex((p) => Math.min(s.pendingTasks.length - 1, p + 1))
      return
    }
    const nextTask = s.allPendingTasks[globalIndex + 1]
    if (nextTask) {
      const cid = nextTask.contactId
      const aid = nextTask.accountId
      if (cid === id || (aid && aid === (s.contact as any)?.linkedAccountId)) {
        const localIdx = s.pendingTasks.findIndex(t => t.id === nextTask.id)
        if (localIdx >= 0) { s.setCurrentTaskIndex(localIdx); return; }
      }
      if (cid) router.push(`/network/contacts/${cid}?taskId=${encodeURIComponent(nextTask.id)}`)
      else if (aid) router.push(`/network/accounts/${aid}?taskId=${encodeURIComponent(nextTask.id)}`)
    }
  }

  const handleCompleteAndAdvance = () => {
    if (!currentTask) return
    s.updateTask({ id: currentTask.id, status: 'Completed' })
    handleNext()
  }

  const handleTerminalSubmit = async (input: string) => {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm')
    const newNote = `[${timestamp}] ${input}`
    const updatedNotes = s.editNotes ? `${s.editNotes}\n\n${newNote}` : newNote
    const previousNotes = s.editNotes
    try {
      s.setEditNotes(updatedNotes)
      await s.updateContactMutation.mutateAsync({
        id,
        notes: updatedNotes
      })
      toast.success('Analyst note synchronized')
    } catch (err) {
      s.setEditNotes(previousNotes)
      toast.error('Sync failed')
    }
  }

  const handleTerminalWipe = async () => {
    s.setEditNotes('')
    toast.success('Dossier wiped')
  }

  const handleIngestionComplete = () => {
    setIsRecalibrating(true)
    const fieldsToGlow = new Set(['contractEnd', 'daysRemaining', 'currentSupplier', 'strikePrice', 'annualUsage', 'revenue'])
    setGlowingFields(fieldsToGlow)
    setTimeout(() => {
      setIsRecalibrating(false)
      setGlowingFields(new Set())
    }, 1500)
  }

  const composeContext = useMemo((): ComposeContext | null => {
    if (!s.contact) return null

    const noteEntries = buildForensicNoteEntries([
      {
        label: `CONTACT NOTE • ${s.contact.name || 'UNKNOWN CONTACT'}`,
        notes: s.editNotes || null,
      },
      {
        label: `ACCOUNT NOTE • ${s.account?.name || 'UNKNOWN ACCOUNT'}`,
        notes: s.account?.description || null,
      },
    ])

    let contextForAi = noteEntries.length > 0 ? formatForensicNoteClipboard(noteEntries) : ''

    // Add recent call transcripts to Context
    const recentCallContext = buildUsableCallContextBlock(
      (s.recentCalls || []).map((c: any) => ({
        id: c.id,
        timestamp: c.date || c.timestamp || null,
        direction: c.type || c.direction || null,
        status: c.status || null,
        duration: typeof c.duration === 'number' || typeof c.duration === 'string' ? c.duration : null,
        transcript: c.transcript || null,
        summary: c.note || c.summary || null,
        aiInsights: c.aiInsights || null,
      })),
      4
    )
    if (recentCallContext) {
      contextForAi += contextForAi ? '\\n\\n' + recentCallContext : recentCallContext
    }

    return {
      contactName: s.contact.name,
      contactTitle: s.contact.title,
      companyName: s.editCompany,
      accountName: (s.contact as any).accountName,
      industry: (s.account as any)?.industry,
      accountDescription: (s.account as any)?.description,
      contactId: s.contact.id,
      accountId: s.account?.id,
      contextForAi: contextForAi.trim() || undefined
    }
  }, [s.contact, s.account, s.editCompany, s.editNotes, s.recentCalls])

  if (s.isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <LoadingOrb label="Initialising Terminal..." />
      </div>
    )
  }

  if (!s.contact) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <div className="nodal-glass p-8 rounded-2xl flex flex-col items-center gap-6 border-white/10 shadow-2xl">
          <div className="p-4 bg-red-500/10 rounded-2xl"><AlertTriangle className="w-8 h-8 text-red-500" /></div>
          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tighter text-white">Subject Not Found</h2>
            <p className="text-zinc-500 text-sm mt-1">The requested intelligence dossier does not exist.</p>
          </div>
          <Button onClick={() => router.back()}>Return to Database</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#002FA7]/10 blur-[120px] rounded-full pointer-events-none" />

        <DossierHeader
          contact={s.contact}
          isEditing={s.isEditing}
          toggleEditing={s.toggleEditing}
          onDelete={handleDelete}
          recentlyUpdatedFields={s.recentlyUpdatedFields}
          showSynced={s.showSynced}
          isSaving={s.isSaving}
          editName={s.editName}
          editFirstName={s.editFirstName}
          setEditFirstName={s.setEditFirstName}
          editLastName={s.editLastName}
          setEditLastName={s.setEditLastName}
          editTitle={s.editTitle}
          setEditTitle={s.setEditTitle}
          editCompany={s.editCompany}
          setEditCompany={s.setEditCompany}
          editLocation={s.editLocation}
          setEditLocation={s.setEditLocation}
          editLogoUrl={s.editLogoUrl}
          setEditLogoUrl={s.setEditLogoUrl}
          editWebsite={s.editWebsite}
          setEditWebsite={s.setEditWebsite}
          editLinkedinUrl={s.editLinkedinUrl}
          setEditLinkedinUrl={s.setEditLinkedinUrl}
          activeEditField={s.activeEditField}
          setActiveEditField={s.setActiveEditField}
          hasTasks={s.pendingTasks.length > 0}
          pendingTasks={s.pendingTasks}
          displayTaskIndex={displayTaskIndex}
          globalTotal={s.globalTotal}
          globalPosition={globalPosition}
          useGlobalPagination={useGlobalPagination}
          handlePrev={handlePrev}
          handleNext={handleNext}
          handleCompleteAndAdvance={handleCompleteAndAdvance}
        />

        <div className="flex-1 flex overflow-hidden relative z-10 group/dossier">
          <div className="grid grid-cols-12 w-full h-full">
            {/* Left Panel */}
            <div className="col-span-12 lg:col-span-4 h-full overflow-y-auto p-6 md:p-8 border-r border-white/5 scrollbar-thin np-scroll">
            <IntelligencePanel
                contact={s.contact}
                isEditing={s.isEditing}
                isRecalibrating={isRecalibrating}
                glowingFields={glowingFields}
                recentlyUpdatedFields={s.recentlyUpdatedFields}
                isSaving={s.isSaving}
                editEmail={s.editEmail}
                setEditEmail={s.setEditEmail}
                editPhone={s.editPhone}
                setEditPhone={s.setEditPhone}
                editMobile={s.editMobile}
                setEditMobile={s.setEditMobile}
                editWorkDirect={s.editWorkDirect}
                setEditWorkDirect={s.setEditWorkDirect}
                editOther={s.editOther}
                setEditOther={s.setEditOther}
                editCompanyPhone={s.editCompanyPhone}
                setEditCompanyPhone={s.setEditCompanyPhone}
                editPrimaryField={s.editPrimaryField}
                setEditPrimaryField={s.setEditPrimaryField}
                editContractEnd={s.editContractEnd}
                setEditContractEnd={s.setEditContractEnd}
                editSupplier={s.editSupplier}
                setEditSupplier={s.setEditSupplier}
                editStrikePrice={s.editStrikePrice}
                setEditStrikePrice={s.setEditStrikePrice}
                editAnnualUsage={s.editAnnualUsage}
                setEditAnnualUsage={s.setEditAnnualUsage}
                editMills={s.editMills}
                setEditMills={s.setEditMills}
                onEmailClick={() => openCompose({ to: s.editEmail || '', subject: '', context: composeContext })}
                onIngestionComplete={handleIngestionComplete}
                toggleEditing={s.toggleEditing}
              />
            </div>

            {/* Main Content (Right Panel) */}
            <div className="col-span-12 lg:col-span-8 h-full overflow-y-auto p-6 scrollbar-thin np-scroll">
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700 delay-100">
                <AnalystTerminal
                  id={id}
                  isEditing={s.isEditing}
                  editNotes={s.editNotes}
                  setEditNotes={s.setEditNotes}
                  noteSources={[
                    {
                      label: `ACCOUNT NOTE • ${s.account?.name || 'UNKNOWN ACCOUNT'}`,
                      notes: s.account?.description || '',
                    },
                  ]}
                  onNoteSubmit={handleTerminalSubmit}
                  onWipe={handleTerminalWipe}
                  maturityInfo={s.editContractEnd ? `Position Maturity: ${s.editContractEnd}` : undefined}
                  recentlyUpdatedFields={s.recentlyUpdatedFields}
                  isSaving={s.isSaving}
                />

                <EngagementLog
                  id={id}
                  contact={s.contact}
                  account={s.account}
                  recentCalls={s.recentCalls || []}
                  isLoadingCalls={s.isLoadingCalls}
                  currentPage={s.currentCallPage}
                  setCurrentPage={s.setCurrentCallPage}
                  onViewAll={() => router.push('/network/calls')}
                  showRelativeDate={false}
                />

                <EntityEmailFeed
                  emails={[s.editEmail].filter(Boolean) as string[]}
                  title="Email Intelligence"
                  density="full"
                  layout="transmission"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
