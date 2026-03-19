'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Eye, MousePointer2 } from 'lucide-react'
import { format } from 'date-fns'
import DOMPurify from 'dompurify'
import { Email } from '@/hooks/useEmails'
import { EmailContent } from './EmailContent'
import { cn } from '@/lib/utils'
import { useEntityEmails } from '@/hooks/useEntityEmails'

interface EntityEmailFeedProps {
    emails: string[]
    title?: string
    density?: 'compact' | 'full'
    layout?: 'default' | 'transmission'
}

const EMAILS_PER_PAGE = 4

export function EntityEmailFeed({ emails, title = 'Email Intelligence', density = 'full', layout = 'default' }: EntityEmailFeedProps) {
    const { data: fetchEmails, isLoading } = useEntityEmails(emails)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id)
    }

    const validEmails = fetchEmails && fetchEmails.length > 0 ? fetchEmails : []
    const useTransmissionLayout = layout === 'transmission'
    const totalPages = Math.max(1, Math.ceil(validEmails.length / EMAILS_PER_PAGE))
    const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
    const pageStart = validEmails.length > 0 ? ((safeCurrentPage - 1) * EMAILS_PER_PAGE) + 1 : 0
    const pageEnd = Math.min(safeCurrentPage * EMAILS_PER_PAGE, validEmails.length)

    useEffect(() => {
        setCurrentPage(1)
        setExpandedId(null)
    }, [layout, emails.join('|')])

    useEffect(() => {
        setCurrentPage((prev) => Math.min(Math.max(prev, 1), totalPages))
    }, [totalPages])

    const visibleEmails = useTransmissionLayout
        ? validEmails.slice((safeCurrentPage - 1) * EMAILS_PER_PAGE, safeCurrentPage * EMAILS_PER_PAGE)
        : validEmails

    const renderInlineBody = (email: Email) => {
        if (email.html) {
            const safeHtml = DOMPurify.sanitize(email.html, {
                USE_PROFILES: { html: true }
            })

            return (
                <div
                    className="prose prose-invert max-w-none text-zinc-300 prose-p:my-3 prose-a:text-[#002FA7] prose-a:underline prose-img:rounded-md prose-img:my-3"
                    dangerouslySetInnerHTML={{ __html: safeHtml }}
                />
            )
        }

        if (email.text) {
            return (
                <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                    {email.text}
                </div>
            )
        }

        return (
            <div className="text-sm text-zinc-500 italic">
                No message body available.
            </div>
        )
    }

    const renderTransmissionRow = (email: Email) => {
        const isExpanded = expandedId === email.id
        const isSent = email.type === 'sent'
        const openCount = email.openCount || 0
        const clickCount = email.clickCount || 0
        const addressLine = email.type === 'sent'
            ? (Array.isArray(email.to) ? email.to.join(', ') : email.to)
            : email.from

        return (
            <motion.div
                key={email.id}
                layout
                initial={{ opacity: 0, height: 0, x: -10 }}
                animate={{ opacity: 1, height: 'auto', x: 0 }}
                exit={{ opacity: 0, height: 0, x: 10 }}
                className="overflow-hidden"
            >
                <div className="space-y-1">
                    <button
                        onClick={() => toggleExpand(email.id)}
                        className={cn(
                            "group w-full rounded-xl border transition-all duration-300 overflow-hidden nodal-recessed text-left",
                            isExpanded ? "bg-zinc-950/90 border-white/10 shadow-2xl" : "bg-zinc-950/40 border-white/5 hover:bg-zinc-950/80 hover:border-white/10"
                        )}
                    >
                        <div className="flex items-start justify-between gap-3 p-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                    <span className={cn(
                                        "text-sm font-semibold truncate transition-colors",
                                        isExpanded ? "text-white" : "text-zinc-200"
                                    )}>
                                        {email.subject || '(No Subject)'}
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest shrink-0 tabular-nums">
                                        {format(new Date(email.date), 'MMM dd, yyyy h:mm a')}
                                    </span>
                                </div>

                                <div className="mt-1 flex items-center justify-between gap-2">
                                    <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2 min-w-0 flex-1">
                                        <span className={isSent ? 'text-emerald-500/80' : 'text-[#002FA7]/80'}>
                                            {isSent ? 'To:' : 'From:'}
                                        </span>
                                        <span className="truncate block" title={addressLine}>
                                            {addressLine}
                                        </span>
                                    </div>

                                    {isSent ? (
                                        density === 'compact' ? (
                                            <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-zinc-950/40 px-2 py-1 shrink-0">
                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                    {openCount}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                    <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                    {clickCount}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="inline-flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950/40 px-2.5 py-1 shrink-0">
                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                    Opened <span className="tabular-nums text-zinc-200">{openCount}</span>
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                                    <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                    Clicked <span className="tabular-nums text-zinc-200">{clickCount}</span>
                                                </span>
                                            </div>
                                        )
                                    ) : null}
                                </div>

                                {!isExpanded && email.snippet && (
                                    <div className="text-xs text-zinc-500 mt-1 truncate max-w-full">
                                        {email.snippet}
                                    </div>
                                )}
                            </div>
                        </div>
                    </button>

                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                className="overflow-hidden border-t border-white/5"
                            >
                                <div className="px-4 py-5">
                                    <div className="max-h-[520px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-300">
                                        {renderInlineBody(email)}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        )
    }

    if (useTransmissionLayout) {
        return (
            <div className="nodal-void-card p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        {title}
                    </h3>
                    <span className="text-[9px] font-mono text-zinc-600 font-bold tabular-nums">
                        {validEmails.length} RECORDS
                    </span>
                </div>

                <div className="space-y-3">
                    {isLoading ? (
                        <div className="text-center py-12 text-xs font-mono text-zinc-600 animate-pulse">
                            DECRYPTING MESSAGES...
                        </div>
                    ) : validEmails.length > 0 ? (
                        <div className="space-y-2">
                            <AnimatePresence initial={false} mode="popLayout">
                                {visibleEmails.map(renderTransmissionRow)}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-zinc-950/20 flex flex-col items-center justify-center gap-3">
                            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">No email transmissions detected</p>
                        </div>
                    )}
                </div>

                {validEmails.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Msg_Block {String(pageStart).padStart(2, '0')}–{String(pageEnd).padStart(2, '0')}
                            </span>
                            <span className="opacity-40">|</span>
                            <span>Total_Nodes: {validEmails.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
                                disabled={safeCurrentPage === 1}
                                className="w-8 h-8 border border-white/5 bg-transparent text-zinc-600 hover:text-white rounded-md flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                title="Previous page"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-8 text-center tabular-nums">
                                {safeCurrentPage.toString().padStart(2, '0')}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage(safeCurrentPage + 1)}
                                disabled={safeCurrentPage >= totalPages}
                                className="w-8 h-8 border border-white/5 bg-transparent text-zinc-600 hover:text-white rounded-md flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                title="Next page"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    {title}
                </h3>
                <span className="text-[9px] font-mono text-zinc-600 font-bold tabular-nums">
                    {validEmails.length} MESSAGES
                </span>
            </div>

            <div className="space-y-3">
                {isLoading ? (
                    <div className="text-center py-12 text-xs font-mono text-zinc-600 animate-pulse">
                        DECRYPTING MESSAGES...
                    </div>
                ) : validEmails.length > 0 ? (
                    <div className="space-y-2">
                        <AnimatePresence initial={false}>
                            {validEmails.map((email) => {
                                const isExpanded = expandedId === email.id
                                const isSent = email.type === 'sent'
                                const openCount = email.openCount || 0
                                const clickCount = email.clickCount || 0

                                return (
                                    <motion.div
                                        key={email.id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "group rounded-xl border transition-all duration-300 overflow-hidden nodal-recessed",
                                            isExpanded ? "bg-zinc-950/40 border-white/10 shadow-2xl" : "bg-zinc-950/40 border-white/5 hover:bg-zinc-950/40 hover:border-white/10"
                                        )}
                                    >
                                        <button
                                            onClick={() => toggleExpand(email.id)}
                                            className="w-full text-left p-4 flex items-start focus:outline-none transition-colors"
                                        >
                                            {/* Header Content */}
                                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={cn(
                                                        "text-sm font-semibold truncate transition-colors",
                                                        isExpanded ? "text-white" : "text-zinc-200"
                                                    )}>
                                                        {email.subject || '(No Subject)'}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest shrink-0 tabular-nums">
                                                        {format(new Date(email.date), 'MMM dd, yyyy h:mm a')}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2 min-w-0 flex-1">
                                                        <span className={email.type === 'sent' ? 'text-emerald-500/80' : 'text-[#002FA7]/80'}>
                                                            {email.type === 'sent' ? 'To: ' : 'From: '}
                                                        </span>
                                                        <span className="truncate block" title={email.type === 'sent' ? (Array.isArray(email.to) ? email.to.join(', ') : email.to) : email.from}>
                                                            {email.type === 'sent' ? (Array.isArray(email.to) ? email.to.join(', ') : email.to) : email.from}
                                                        </span>
                                                    </div>

                                                    {isSent ? (
                                                        density === 'compact' ? (
                                                            <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-zinc-950/40 px-2 py-1 shrink-0">
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                                    {openCount}
                                                                </span>
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                                    <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                                    {clickCount}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="inline-flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950/40 px-2.5 py-1 shrink-0">
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                                    Opened <span className="tabular-nums text-zinc-200">{openCount}</span>
                                                                </span>
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                                                    <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                                    Clicked <span className="tabular-nums text-zinc-200">{clickCount}</span>
                                                                </span>
                                                            </div>
                                                        )
                                                    ) : null}
                                                </div>

                                                {!isExpanded && email.snippet && (
                                                    <div className="text-xs text-zinc-500 mt-1 truncate max-w-full">
                                                        {email.snippet}
                                                    </div>
                                                )}
                                            </div>

                                        </button>

                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                                    className="overflow-hidden border-t border-white/5"
                                                >
                                                    <div className="bg-white p-6 max-h-[600px] overflow-y-auto w-full scrollbar-thin scrollbar-thumb-zinc-300">
                                                        <EmailContent
                                                            html={email.html}
                                                            text={email.text}
                                                            subject={email.subject}
                                                        />
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-zinc-950/20 flex flex-col items-center justify-center gap-3 group/empty">
                        <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">No email transmissions detected</p>
                    </div>
                )}
            </div>
        </div>
    )
}
