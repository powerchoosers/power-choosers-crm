'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRightLeft, ChevronLeft, ChevronRight, Mic, Sparkles, History } from 'lucide-react'
import { CallListItem } from '@/components/calls/CallListItem'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const CALLS_PER_PAGE = 4

interface EngagementLogProps {
    recentCalls: any[]
    isLoadingCalls: boolean
    currentPage: number
    setCurrentPage: (page: number) => void
    onViewAll: () => void
    id: string
    contact: any
    account: any
    variant?: 'default' | 'skinny'
    showRelativeDate?: boolean
}

export function EngagementLog({
    recentCalls,
    isLoadingCalls,
    currentPage,
    setCurrentPage,
    onViewAll,
    id,
    contact,
    account,
    variant = 'default',
    showRelativeDate = false
}: EngagementLogProps) {
    const totalPages = Math.max(1, Math.ceil((recentCalls?.length ?? 0) / CALLS_PER_PAGE))
    const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
    const pageStart = ((safeCurrentPage - 1) * CALLS_PER_PAGE) + 1
    const pageEnd = Math.min(safeCurrentPage * CALLS_PER_PAGE, recentCalls?.length ?? 0)

    const isSkinny = variant === 'skinny'
    const prevTopId = useRef<string | null>(null)

    // Auto-scroll to top when a new call signal arrives at the peak
    useEffect(() => {
        const topId = recentCalls?.[0]?.id
        if (topId && prevTopId.current && topId !== prevTopId.current) {
            if (safeCurrentPage !== 1) {
                setCurrentPage(1)
            }

            const firstNode = document.getElementById(`call-node-${topId}`)
            if (firstNode) {
                const scrollContainer = firstNode.closest('.np-scroll')
                if (scrollContainer) {
                    scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
                }
            }
        }
        prevTopId.current = topId
    }, [recentCalls, safeCurrentPage, setCurrentPage])

    return (
        <div className={cn(
            "nodal-void-card shadow-xl",
            isSkinny ? "p-4" : "p-6"
        )}>
            <div className={cn(
                "px-1",
                isSkinny ? "flex flex-col items-start gap-1 mb-3" : "flex items-center justify-between mb-4"
            )}>
                <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    {!isSkinny && <History className="w-3.5 h-3.5" />} Transmission Log
                </h3>
                <span className="text-[9px] font-mono text-zinc-600 font-bold tabular-nums">{recentCalls?.length ?? 0} RECORDS</span>
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
                                .slice((safeCurrentPage - 1) * CALLS_PER_PAGE, safeCurrentPage * CALLS_PER_PAGE)
                                .map((call) => {
                                    const companyPhone = account?.companyPhone?.replace(/\D/g, '').slice(-10)
                                    const callToPhone = (call.phoneNumber || '').replace(/\D/g, '').slice(-10)
                                    const isCompanyCall = Boolean(companyPhone && callToPhone && companyPhone === callToPhone)
                                    return (
                                        <motion.div
                                            key={call.id}
                                            id={`call-node-${call.id}`}
                                            layout
                                            initial={{ opacity: 0, y: -20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ 
                                                duration: 0.6, 
                                                ease: [0.23, 1, 0.32, 1],
                                                layout: { duration: 0.6, ease: [0.23, 1, 0.32, 1] }
                                            }}
                                        >
                                            <div className="space-y-1">
                                                 <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider px-2 h-3 flex items-center">
                                                     {isCompanyCall ? (account?.name || 'Account_Node') : (call.contactName && call.contactName !== 'Unknown' ? call.contactName : (contact?.name || 'Signal_Subject'))}
                                                 </div>
                                                <CallListItem
                                                    call={call}
                                                    contactId={id}
                                                    accountId={contact?.linkedAccountId}
                                                    accountLogoUrl={account?.logoUrl}
                                                    accountDomain={account?.domain}
                                                    accountName={account?.name}
                                                    contactName={contact?.name}
                                                    contactPhotoUrl={contact?.avatarUrl || contact?.photoUrl}
                                                    customerAvatar={isCompanyCall ? 'company' : 'contact'}
                                                    variant="minimal"
                                                    showRelativeDate={showRelativeDate}
                                                    showDirectionLabel={!!contact}
                                                />
                                            </div>
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

            {recentCalls && recentCalls.length > 0 && (
                <div className={cn(
                    "mt-4 pt-4 border-t border-white/5 text-[10px] font-mono text-zinc-500 uppercase tracking-widest",
                    isSkinny ? "flex items-center justify-between gap-3" : "flex items-center justify-between"
                )}>
                    <div className={cn(
                        "flex items-center",
                        isSkinny ? "gap-2 min-w-0" : "gap-4"
                    )}>
                        <span className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {String(pageStart).padStart(2, '0')}–{String(pageEnd).padStart(2, '0')}
                        </span>
                        <span className="opacity-40">|</span>
                        <span>{recentCalls.length} total</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
                            disabled={safeCurrentPage === 1}
                            className="w-7 h-7 border-white/5 bg-transparent text-zinc-600 hover:text-white"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-6 text-center tabular-nums">
                            {safeCurrentPage.toString().padStart(2, '0')}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentPage(safeCurrentPage + 1)}
                            disabled={safeCurrentPage >= totalPages}
                            className="w-7 h-7 border-white/5 bg-transparent text-zinc-600 hover:text-white"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
