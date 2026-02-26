'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRightLeft, ChevronLeft, ChevronRight, Mic, Sparkles, History } from 'lucide-react'
import { CallListItem } from '@/components/calls/CallListItem'
import { Button } from '@/components/ui/button'

const CALLS_PER_PAGE = 8

interface EngagementLogProps {
    recentCalls: any[]
    isLoadingCalls: boolean
    currentPage: number
    setCurrentPage: (page: number) => void
    onViewAll: () => void
    id: string
    contact: any
    account: any
}

export function EngagementLog({
    recentCalls,
    isLoadingCalls,
    currentPage,
    setCurrentPage,
    onViewAll,
    id,
    contact,
    account
}: EngagementLogProps) {
    return (
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
                    onClick={onViewAll}
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
                                .slice((currentPage - 1) * CALLS_PER_PAGE, currentPage * CALLS_PER_PAGE)
                                .map((call) => {
                                    const companyPhone = account?.companyPhone?.replace(/\D/g, '').slice(-10)
                                    const callToPhone = (call.phoneNumber || '').replace(/\D/g, '').slice(-10)
                                    const isCompanyCall = Boolean(companyPhone && callToPhone && companyPhone === callToPhone)
                                    return (
                                        <motion.div
                                            key={call.id}
                                            layout
                                            initial={{ opacity: 0, height: 0, x: -10 }}
                                            animate={{ opacity: 1, height: 'auto', x: 0 }}
                                            exit={{ opacity: 0, height: 0, x: 10 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="space-y-1">
                                                {isCompanyCall && (
                                                    <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider px-2">
                                                        Company: {account?.name || 'Unknown'}
                                                    </div>
                                                )}
                                                <CallListItem
                                                    call={call}
                                                    contactId={id}
                                                    accountId={contact?.linkedAccountId}
                                                    accountLogoUrl={account?.logoUrl}
                                                    accountDomain={account?.domain}
                                                    accountName={account?.name}
                                                    contactName={contact?.name}
                                                    customerAvatar={isCompanyCall ? 'company' : 'contact'}
                                                    variant="minimal"
                                                />
                                            </div>
                                        </motion.div>
                                    )
                                })}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-zinc-950/20 flex flex-col items-center justify-center gap-3">
                        <History className="w-12 h-12 text-zinc-600 opacity-20" />
                        <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">No signals detected</p>
                    </div>
                )}
            </div>

            {recentCalls && recentCalls.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Sync_Block {((currentPage - 1) * CALLS_PER_PAGE + 1).toString().padStart(2, '0')}–{Math.min(currentPage * CALLS_PER_PAGE, recentCalls.length).toString().padStart(2, '0')}
                        </span>
                        <span className="opacity-40">|</span>
                        <span>Total_Nodes: {recentCalls.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-8 text-center tabular-nums">
                            {currentPage.toString().padStart(2, '0')}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentPage(currentPage + 1)}
                            disabled={currentPage >= Math.ceil(recentCalls.length / CALLS_PER_PAGE)}
                            className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
