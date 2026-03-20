'use client'

import { memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
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

    const handleSetHolder = (contactId: string | null) => {
        updateAccount({ id, primaryContactId: contactId })
    }

    return (
        <div className="col-span-3 h-full overflow-y-auto p-6 np-scroll">
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">03 // Network</span>
                    <button
                        onClick={() => {
                            setIngestionContext({
                                accountId: id,
                                accountName: account?.name || 'Unknown Account',
                                accountLogoUrl: account?.logoUrl,
                                accountDomain: account?.domain
                            })
                            setRightPanelMode('INGEST_CONTACT')
                        }}
                        className="icon-button-forensic w-8 h-8"
                        title="Inject Node into Command Chain"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <AccountHolderCard
                    accountId={id}
                    accountName={account?.name || ''}
                    contacts={contacts || []}
                    primaryContactId={account?.primaryContactId}
                    onSetHolder={handleSetHolder}
                />

                <StakeholderMap contacts={contacts || []} />

                <AccountHierarchyCard
                    accountId={id}
                    account={account}
                />

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

                <EntityEmailFeed
                    emails={contacts?.map(c => c.email).filter(Boolean) as string[] || []}
                    title="Email Intelligence"
                    density="compact"
                    layout="transmission"
                    variant="skinny"
                />
            </div>
        </div>
    )
})
