'use client'

import dynamic from 'next/dynamic'
import { memo, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { ComposeContext } from '@/components/emails/ComposeModal'
import { IntelligenceBrief } from '@/components/dossier/IntelligenceBrief'
import { EngagementLog } from '@/components/dossier/contact-dossier/EngagementLog'
import { DossierSectionSkeleton } from '@/components/dossier/DossierSectionSkeleton'
import { AccountHolderCard } from './AccountHolderCard'
import { useUIStore } from '@/store/uiStore'
import { useUpdateAccount } from '@/hooks/useAccounts'
import { buildForensicNoteEntries, formatForensicNoteClipboard } from '@/lib/forensic-notes'
import { buildUsableCallContextBlock } from '@/lib/call-context'

const StakeholderMap = dynamic(
    () => import('@/components/accounts/StakeholderMap').then((mod) => mod.StakeholderMap),
    { ssr: false }
)

const AccountHierarchyCard = dynamic(
    () => import('./AccountHierarchyCard').then((mod) => mod.AccountHierarchyCard),
    { ssr: false }
)

const EntityEmailFeed = dynamic(
    () => import('@/components/emails/EntityEmailFeed').then((mod) => mod.EntityEmailFeed),
    { ssr: false }
)

interface AccountNetworkPanelProps {
    id: string
    account: any
    contacts: any[]
    calls: any[]
    isLoadingContacts: boolean
    isLoadingCalls: boolean
    isSecondaryReady?: boolean
}

export const AccountNetworkPanel = memo(function AccountNetworkPanel({
    id,
    account,
    contacts,
    calls,
    isLoadingContacts,
    isLoadingCalls,
    isSecondaryReady = true
}: AccountNetworkPanelProps) {
    const { setRightPanelMode, setIngestionContext } = useUIStore()
    const { mutate: updateAccount } = useUpdateAccount()
    const [callPage, setCallPage] = useState(1)
    const handleAddContact = () => {
        setIngestionContext({
            accountId: id,
            accountName: account?.name || 'Unknown Account',
            accountLogoUrl: account?.logoUrl,
            accountDomain: account?.domain
        })
        setRightPanelMode('INGEST_CONTACT')
    }

    const handleSetHolder = (contactId: string | null) => {
        updateAccount({ id, primaryContactId: contactId })
    }

    const composeContext = useMemo((): ComposeContext | null => {
        if (!account) return null

        const noteEntries = buildForensicNoteEntries([
            {
                label: `ACCOUNT NOTE • ${account?.name || 'UNKNOWN ACCOUNT'}`,
                notes: account?.description || null,
            },
            ...((contacts || [])
                .filter((contact) => String(contact?.notes || '').trim())
                .map((contact) => ({
                    label: `CONTACT NOTE • ${contact?.name || contact?.email || 'UNKNOWN CONTACT'}`,
                    notes: contact?.notes || null,
                })) as any[]),
        ])

        let contextForAi = noteEntries.length > 0 ? formatForensicNoteClipboard(noteEntries) : ''

        const recentCallContext = buildUsableCallContextBlock(
            (calls || []).map((call: any) => ({
                id: call.id,
                timestamp: call.date || call.timestamp || null,
                direction: call.type || call.direction || null,
                status: call.status || null,
                duration: typeof call.duration === 'number' || typeof call.duration === 'string' ? call.duration : null,
                transcript: call.transcript || null,
                summary: call.note || call.summary || null,
                aiInsights: call.aiInsights || null,
            })),
            4
        )

        if (recentCallContext) {
            contextForAi += contextForAi ? '\n\n' + recentCallContext : recentCallContext
        }

        return {
            accountId: account.id,
            accountName: account.name,
            companyName: account.name,
            industry: account.industry || undefined,
            accountDescription: account.description || undefined,
            contextForAi: contextForAi.trim() || undefined,
        }
    }, [account, calls, contacts])

    const stackShiftTransition = {
        layout: { duration: 0.24, ease: [0.23, 1, 0.32, 1] as const }
    }

    return (
        <div className="col-span-3 h-full overflow-y-auto p-6 np-scroll">
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">03 // Network</span>
                </div>

                <motion.div layout="position" transition={stackShiftTransition}>
                    <AccountHolderCard
                        accountId={id}
                        accountName={account?.name || ''}
                        contacts={contacts || []}
                        primaryContactId={account?.primaryContactId}
                        onSetHolder={handleSetHolder}
                        composeContext={composeContext}
                        isLoadingContacts={isLoadingContacts}
                    />
                </motion.div>

                <motion.div layout="position" transition={stackShiftTransition}>
                    {isSecondaryReady ? (
                        <StakeholderMap
                            contacts={contacts || []}
                            onAddContact={handleAddContact}
                            isLoadingContacts={isLoadingContacts}
                        />
                    ) : (
                        <DossierSectionSkeleton
                            title="Command Chain"
                            rows={4}
                            className="min-h-[260px]"
                        />
                    )}
                </motion.div>

                <motion.div layout="position" transition={stackShiftTransition}>
                    {isSecondaryReady ? (
                        <AccountHierarchyCard
                            accountId={id}
                            account={account}
                        />
                    ) : (
                        <DossierSectionSkeleton
                            title="Corporate Chain"
                            rows={5}
                            className="min-h-[320px]"
                        />
                    )}
                </motion.div>

                <motion.div layout="position" transition={stackShiftTransition}>
                    <EngagementLog
                        recentCalls={calls || []}
                        isLoadingCalls={isLoadingCalls}
                        currentPage={callPage}
                        setCurrentPage={setCallPage}
                        onViewAll={() => {}}
                        id={id}
                        contact={null}
                        account={account}
                        variant="skinny"
                        showRelativeDate={true}
                    />
                </motion.div>

                <motion.div layout="position" transition={stackShiftTransition}>
                    <IntelligenceBrief account={account} />
                </motion.div>

                <motion.div layout="position" transition={stackShiftTransition}>
                    {isSecondaryReady ? (
                        <EntityEmailFeed
                            emails={contacts?.map(c => c.email).filter(Boolean) as string[] || []}
                            accountId={id}
                            title="Email Intelligence"
                            density="compact"
                            layout="transmission"
                            variant="skinny"
                        />
                    ) : (
                        <DossierSectionSkeleton
                            title="Email Intelligence"
                            rows={4}
                            className="min-h-[340px]"
                        />
                    )}
                </motion.div>
            </div>
        </div>
    )
})
