'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'

// Modular Components
import { useContactDossierState } from '@/hooks/useContactDossierState'
import { DossierHeader } from '@/components/dossier/contact-dossier/DossierHeader'
import { IntelligencePanel } from '@/components/dossier/contact-dossier/IntelligencePanel'
import { AnalystTerminal } from '@/components/dossier/contact-dossier/AnalystTerminal'
import { EngagementLog } from '@/components/dossier/contact-dossier/EngagementLog'
import { EntityEmailFeed } from '@/components/emails/EntityEmailFeed'
import { ComposeModal } from '@/components/emails/ComposeModal'

interface ContactDossierClientProps {
    id: string
    initialData?: {
        contact: any
        account: any
        tasks: any[]
    }
}

export default function ContactDossierClient({ id, initialData }: ContactDossierClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Centralized State Hook
    const s = useContactDossierState(id, initialData)

    const [glowingFields, setGlowingFields] = useState<Set<string>>(new Set())
    const [isRecalibrating, setIsRecalibrating] = useState(false)

    const contact = s.contact || initialData?.contact

    // Task Navigation logic
    const taskIdFromUrl = searchParams?.get('taskId') ?? null
    useEffect(() => {
        if (!taskIdFromUrl || !s.pendingTasks.length) return
        const idx = s.pendingTasks.findIndex((t) => t.id === taskIdFromUrl)
        if (idx >= 0) s.setCurrentTaskIndex(idx)
    }, [taskIdFromUrl, s.pendingTasks])

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
        const prevTask = s.allPendingTasks[globalIndex - 1]
        if (prevTask) {
            const cid = prevTask.contactId
            const aid = prevTask.accountId
            if (cid === id || (aid && aid === (contact as any)?.linkedAccountId)) {
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
            if (cid === id || (aid && aid === (contact as any)?.linkedAccountId)) {
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
        try {
            await s.setEditNotes(updatedNotes)
            toast.success('Analyst note synchronized')
        } catch (err) {
            toast.error('Sync failed')
        }
    }

    if (!contact && s.isLoading && !initialData) {
        return (
            <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
                <div className="font-mono text-zinc-500">ESTABLISHING NEURAL LINK...</div>
            </div>
        )
    }

    if (!contact) {
        return (
            <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center gap-4 animate-in fade-in duration-500">
                <div className="font-mono text-zinc-500">CONTACT_NOT_FOUND</div>
                <button className="icon-button-forensic" onClick={() => router.back()}>Return to Grid</button>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
                <DossierHeader
                    contact={contact}
                    isEditing={s.isEditing}
                    toggleEditing={s.toggleEditing}
                    recentlyUpdatedFields={s.recentlyUpdatedFields}
                    showSynced={s.showSynced}
                    activeEditField={s.activeEditField}
                    setActiveEditField={s.setActiveEditField}
                    // Edit Props
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
                    // Task Integration
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
                        <IntelligencePanel
                            contact={contact}
                            isEditing={s.isEditing}
                            isRecalibrating={isRecalibrating}
                            recentlyUpdatedFields={s.recentlyUpdatedFields}
                            glowingFields={glowingFields}
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
                            editSupplier={s.editSupplier}
                            setEditSupplier={s.setEditSupplier}
                            editContractEnd={s.editContractEnd}
                            setEditContractEnd={s.setEditContractEnd}
                            editStrikePrice={s.editStrikePrice}
                            setEditStrikePrice={s.setEditStrikePrice}
                            editAnnualUsage={s.editAnnualUsage}
                            setEditAnnualUsage={s.setEditAnnualUsage}
                            onEmailClick={s.onEmailClick}
                            onIngestionComplete={s.onIngestionComplete}
                        />

                        <div className="col-span-12 lg:col-span-4 border-l border-white/5 flex flex-col overflow-hidden">
                            <AnalystTerminal
                                id={id}
                                isEditing={s.isEditing}
                                editNotes={s.editNotes}
                                setEditNotes={s.setEditNotes}
                                onNoteSubmit={handleTerminalSubmit}
                                onWipe={s.onWipe}
                                maturityInfo={s.daysRemaining != null ? `${s.daysRemaining} days remaining` : undefined}
                            />
                            <EngagementLog
                                recentCalls={s.recentCalls || []}
                                isLoadingCalls={s.isLoadingCalls}
                                currentPage={s.currentCallPage}
                                setCurrentPage={s.setCurrentCallPage}
                                id={id}
                                contact={contact}
                                account={s.account || initialData?.account}
                                onViewAll={() => router.push('/network/calls')}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <EntityEmailFeed
                emails={[contact.email].filter(Boolean)}
            />

            <ComposeModal
                isOpen={s.isComposeOpen}
                onClose={() => s.setIsComposeOpen(false)}
                context={{
                    contactId: id,
                    accountId: contact.accountId,
                    contactName: contact.name,
                    companyName: s.account?.name || initialData?.account?.name,
                    industry: s.account?.industry || initialData?.account?.industry,
                }}
            />
        </div>
    )
}
