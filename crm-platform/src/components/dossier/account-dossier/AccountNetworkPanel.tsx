'use client'

import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { StakeholderMap } from '@/components/accounts/StakeholderMap'
import { CallListItem } from '@/components/calls/CallListItem'
import { EntityEmailFeed } from '@/components/emails/EntityEmailFeed'
import { useUIStore } from '@/store/uiStore'

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

    return (
        <div className="col-span-3 h-full overflow-y-auto p-6 np-scroll">
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">03 // Network</span>
                    <button
                        onClick={() => {
                            setIngestionContext({ accountId: id, accountName: account?.name || 'Unknown Account' })
                            setRightPanelMode('INGEST_CONTACT')
                        }}
                        className="icon-button-forensic w-8 h-8"
                        title="Inject Node into Command Chain"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <StakeholderMap contacts={contacts || []} />

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
                                        const isContactCall = Boolean(call.contactId?.trim())
                                        const contactForCall = isContactCall ? contacts?.find(c => c.id === call.contactId) : null
                                        return (
                                            <motion.div
                                                key={call.id}
                                                layout
                                                initial={{ opacity: 0, height: 0, x: -10 }}
                                                animate={{ opacity: 1, height: 'auto', x: 0 }}
                                                exit={{ opacity: 0, height: 0, x: 10 }}
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
                            <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-zinc-950/20 flex flex-col items-center justify-center gap-3">
                                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">No signals detected</p>
                            </div>
                        )}
                    </div>
                </div>

                <EntityEmailFeed
                    emails={contacts?.map(c => c.email).filter(Boolean) as string[] || []}
                    title="Email Intelligence"
                />
            </div>
        </div>
    )
})
