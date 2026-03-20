'use client'

import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import { StakeholderMap } from '@/components/accounts/StakeholderMap'
import { EntityEmailFeed } from '@/components/emails/EntityEmailFeed'
import { EngagementLog } from '@/components/dossier/contact-dossier/EngagementLog'
import { AccountHolderCard } from './AccountHolderCard'
import { AccountHierarchyCard } from './AccountHierarchyCard'
import { useUIStore } from '@/store/uiStore'
import { useUpdateAccount } from '@/hooks/useAccounts'

interface AccountNetworkPanelProps {
    id: string
    account: any
    contacts: any[]
    calls: any[]
    isLoadingCalls: boolean
}

export const AccountNetworkPanel = memo(function AccountNetworkPanel({
    id,
    account,
    contacts,
    calls,
    isLoadingCalls
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
                    />
                </motion.div>

                <motion.div layout="position" transition={stackShiftTransition}>
                    <StakeholderMap contacts={contacts || []} onAddContact={handleAddContact} />
                </motion.div>

                <motion.div layout="position" transition={stackShiftTransition}>
                    <AccountHierarchyCard
                        accountId={id}
                        account={account}
                    />
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
                    <EntityEmailFeed
                        emails={contacts?.map(c => c.email).filter(Boolean) as string[] || []}
                        title="Email Intelligence"
                        density="compact"
                        layout="transmission"
                        variant="skinny"
                    />
                </motion.div>
            </div>
        </div>
    )
})
