'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Eye, MousePointer2, Reply, Forward, ExternalLink, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import DOMPurify from 'dompurify'
import { Email } from '@/hooks/useEmails'
import { EmailContent } from './EmailContent'
import { cn } from '@/lib/utils'
import { useEntityEmails } from '@/hooks/useEntityEmails'
import { useEmailThread } from '@/hooks/useEmailThread'
import { useComposeStore } from '@/store/composeStore'

interface EntityEmailFeedProps {
    emails: string[]
    title?: string
    density?: 'compact' | 'full'
    layout?: 'default' | 'transmission'
    variant?: 'default' | 'skinny'
}

const EMAILS_PER_PAGE = 4

function extractEmailAddress(value: string): string {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const angle = raw.match(/<\s*([^>]+)\s*>/)
    const candidate = (angle?.[1] || raw).trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : ''
}

/** Inline thread badge — fetches thread count for the given email */
function ThreadBadge({ threadKey }: { threadKey: string }) {
    const { data: threadEmails = [] } = useEmailThread(threadKey)
    if (threadEmails.length <= 1) return null
    return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 tabular-nums">
            <MessageSquare className="w-3 h-3 text-zinc-500" />
            {threadEmails.length}
        </span>
    )
}

/** Action bar rendered inside expanded email card */
function EmailActionBar({ email, variant }: { email: Email; variant: 'default' | 'skinny' }) {
    const router = useRouter()
    const openCompose = useComposeStore((s) => s.openCompose)

    const handleReply = (e: React.MouseEvent) => {
        e.stopPropagation()
        const fromAddr = extractEmailAddress(email.from || '')
        const toAddr = email.type === 'sent'
            ? (Array.isArray(email.to) ? extractEmailAddress(email.to[0] || '') : extractEmailAddress(email.to || ''))
            : fromAddr
        openCompose({
            to: toAddr,
            subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
            context: {
                contactId: email.contactId || undefined,
            }
        })
    }

    const handleForward = (e: React.MouseEvent) => {
        e.stopPropagation()
        openCompose({
            to: '',
            subject: email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`,
            context: {
                contactId: email.contactId || undefined,
            }
        })
    }

    const handleViewThread = (e: React.MouseEvent) => {
        e.stopPropagation()
        router.push(`/network/emails/${email.id}`)
    }

    return (
        <div className={cn(
            "flex items-center gap-1.5 border-t border-white/5 mt-3",
            variant === 'skinny' ? "pt-2.5" : "pt-3"
        )}>
            <button
                type="button"
                onClick={handleReply}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white rounded-md border border-white/5 hover:border-white/10 hover:bg-zinc-900/60 transition-all duration-300"
            >
                <Reply className="w-3 h-3" />
                Reply
            </button>
            <button
                type="button"
                onClick={handleForward}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white rounded-md border border-white/5 hover:border-white/10 hover:bg-zinc-900/60 transition-all duration-300"
            >
                <Forward className="w-3 h-3" />
                Forward
            </button>
            <div className="flex-1" />
            <button
                type="button"
                onClick={handleViewThread}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#002FA7] hover:text-white rounded-md border border-[#002FA7]/20 hover:border-[#002FA7]/40 hover:bg-[#002FA7]/10 transition-all duration-300"
            >
                <ExternalLink className="w-3 h-3" />
                View Thread
            </button>
        </div>
    )
}

export function EntityEmailFeed({ 
    emails, 
    title = 'Email Intelligence', 
    density = 'full', 
    layout = 'default',
    variant = 'default' 
}: EntityEmailFeedProps) {
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
    const isSkinny = variant === 'skinny'

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
        const threadKey = email.threadId || email.id

        const getDisplayName = (address: string) => {
            const match = address.match(/^([^<]+)/)
            return match ? match[1].trim() : address
        }

        const displayName = getDisplayName(addressLine)

        return (
            <motion.div
                key={email.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
            >
                <div className={cn(
                    "group rounded-xl border transition-all duration-300 nodal-recessed",
                    isExpanded ? "bg-zinc-950/90 border-white/10 shadow-2xl" : "bg-zinc-950/40 border-white/5 hover:bg-zinc-950/80 hover:border-white/10"
                )}>
                    <button
                        onClick={() => toggleExpand(email.id)}
                        className="w-full text-left cursor-pointer"
                    >
                        {isSkinny ? (
                            <div className="flex flex-col gap-1.5 p-4">
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-sm font-semibold truncate transition-colors",
                                        isExpanded ? "text-white" : "text-zinc-200"
                                    )}>
                                        {email.subject || '(No Subject)'}
                                    </span>
                                </div>

                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest tabular-nums">
                                    {format(new Date(email.date), 'MMM dd, yyyy h:mm a')}
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2 min-w-0 flex-1">
                                        <span className={isSent ? 'text-emerald-500/80' : 'text-[#002FA7]/80'}>
                                            {isSent ? 'To:' : 'From:'}
                                        </span>
                                        <span className="truncate block" title={addressLine}>
                                            {displayName}
                                        </span>
                                    </div>

                                    <div className="inline-flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950/40 px-2 py-1 shrink-0">
                                        {isSent && (
                                            <>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                    {openCount}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                    <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                    {clickCount}
                                                </span>
                                            </>
                                        )}
                                        {threadKey && <ThreadBadge threadKey={threadKey} />}
                                    </div>
                                </div>

                                {!isExpanded && email.snippet && (
                                    <div className="text-xs text-zinc-500 mt-0.5 truncate max-w-full italic opacity-70">
                                        {email.snippet}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-start justify-between gap-3 p-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className={cn(
                                                "text-sm font-semibold truncate transition-colors",
                                                isExpanded ? "text-white" : "text-zinc-200"
                                            )}>
                                                {email.subject || '(No Subject)'}
                                            </span>
                                        </div>
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

                                        <div className="inline-flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950/40 px-2.5 py-1 shrink-0">
                                            {isSent ? (
                                                density === 'compact' ? (
                                                    <>
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                            <Eye className="w-3 h-3 text-emerald-400" />
                                                            {openCount}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                            <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                            {clickCount}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                                            <Eye className="w-3 h-3 text-emerald-400" />
                                                            Opened <span className="tabular-nums text-zinc-200">{openCount}</span>
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                                            <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                            Clicked <span className="tabular-nums text-zinc-200">{clickCount}</span>
                                                        </span>
                                                    </>
                                                )
                                            ) : null}
                                            {threadKey && <ThreadBadge threadKey={threadKey} />}
                                        </div>
                                    </div>

                                    {!isExpanded && email.snippet && (
                                        <div className="text-xs text-zinc-500 mt-1 truncate max-w-full">
                                            {email.snippet}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </button>

                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                                className="overflow-hidden border-t border-white/5"
                            >
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.4, ease: "linear" }}
                                    className="px-4 py-5"
                                >
                                    <div className="max-h-[520px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800">
                                        {renderInlineBody(email)}
                                    </div>
                                    <EmailActionBar email={email} variant={variant} />
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        )
    }

    if (useTransmissionLayout) {
        return (
            <div className={cn(
                "nodal-void-card shadow-xl",
                isSkinny ? "p-4" : "p-6"
            )}>
                <div className={cn(
                    "flex items-center justify-between",
                    isSkinny ? "mb-3" : "mb-4"
                )}>
                    <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        {title}
                    </h3>
                    <span className="text-[9px] font-mono text-zinc-600 font-bold tabular-nums">{validEmails.length} RECORDS</span>
                </div>

                {isLoading ? (
                    <div className="text-center py-12 text-xs font-mono text-zinc-600 animate-pulse">
                        SYNCING TRANSMISSIONS...
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

                {validEmails.length > 0 && (
                    <div className={cn(
                        "mt-4 pt-4 border-t border-white/5 text-[10px] font-mono text-zinc-500 uppercase tracking-widest",
                        isSkinny ? "flex flex-col gap-3" : "flex items-center justify-between"
                    )}>
                        <div className={cn(
                            "flex items-center",
                            isSkinny ? "gap-2" : "gap-4"
                        )}>
                            <span className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {String(pageStart).padStart(2, '0')}–{String(pageEnd).padStart(2, '0')}
                            </span>
                            <span className="opacity-40">|</span>
                            <span>{validEmails.length} total</span>
                        </div>
                        <div className={cn(
                            "flex items-center gap-2",
                            isSkinny && "self-end"
                        )}>
                            <button
                                type="button"
                                onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
                                disabled={safeCurrentPage === 1}
                                className="w-7 h-7 border border-white/5 bg-transparent text-zinc-600 hover:text-white rounded-md flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                title="Previous page"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-6 text-center tabular-nums">
                                {safeCurrentPage.toString().padStart(2, '0')}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage(safeCurrentPage + 1)}
                                disabled={safeCurrentPage >= totalPages}
                                className="w-7 h-7 border border-white/5 bg-transparent text-zinc-600 hover:text-white rounded-md flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    {title}
                </h3>
                <span className="text-[9px] font-mono text-zinc-600 font-bold tabular-nums">{validEmails.length} RECORDS</span>
            </div>

            <div className="space-y-3">
                {isLoading ? (
                    <div className="text-center py-12 text-xs font-mono text-zinc-600 animate-pulse">
                        SYNCING TRANSMISSIONS...
                    </div>
                ) : validEmails.length > 0 ? (
                    <div className="space-y-2">
                        <AnimatePresence initial={false} mode="popLayout">
                            {validEmails.map((email) => {
                                const isExpanded = expandedId === email.id
                                const isSent = email.type === 'sent'
                                const openCount = email.openCount || 0
                                const clickCount = email.clickCount || 0
                                const addressLine = email.type === 'sent'
                                    ? (Array.isArray(email.to) ? email.to.join(', ') : email.to)
                                    : email.from
                                const threadKey = email.threadId || email.id

                                const getDisplayName = (address: string) => {
                                    const match = address.match(/^([^<]+)/)
                                    return match ? match[1].trim() : address
                                }
                        
                                const displayName = getDisplayName(addressLine)

                                return (
                                    <motion.div
                                        key={email.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className={cn(
                                            "group rounded-xl border transition-all duration-300 nodal-recessed",
                                            isExpanded ? "bg-zinc-950/90 border-white/10 shadow-2xl" : "bg-zinc-950/40 border-white/5 hover:bg-zinc-950/80 hover:border-white/10"
                                        )}>
                                            <button
                                                onClick={() => toggleExpand(email.id)}
                                                className="w-full text-left cursor-pointer"
                                            >
                                                {isSkinny ? (
                                                     <div className="flex flex-col gap-1.5 p-4">
                                                     <div className="flex items-center gap-2">
                                                         <span className={cn(
                                                             "text-sm font-semibold truncate transition-colors",
                                                             isExpanded ? "text-white" : "text-zinc-200"
                                                         )}>
                                                             {email.subject || '(No Subject)'}
                                                         </span>
                                                     </div>
                     
                                                     <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest tabular-nums">
                                                         {format(new Date(email.date), 'MMM dd, yyyy h:mm a')}
                                                     </div>
                     
                                                     <div className="flex items-center justify-between gap-3">
                                                         <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2 min-w-0 flex-1">
                                                             <span className={isSent ? 'text-emerald-500/80' : 'text-[#002FA7]/80'}>
                                                                 {isSent ? 'To:' : 'From:'}
                                                             </span>
                                                             <span className="truncate block" title={addressLine}>
                                                                 {displayName}
                                                             </span>
                                                         </div>
                     
                                                         <div className="inline-flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950/40 px-2 py-1 shrink-0">
                                                             {isSent && (
                                                                 <>
                                                                     <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                                         <Eye className="w-3 h-3 text-emerald-400" />
                                                                         {openCount}
                                                                     </span>
                                                                     <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                                         <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                                         {clickCount}
                                                                     </span>
                                                                 </>
                                                             )}
                                                             {threadKey && <ThreadBadge threadKey={threadKey} />}
                                                         </div>
                                                     </div>
                     
                                                     {!isExpanded && email.snippet && (
                                                         <div className="text-xs text-zinc-500 mt-0.5 truncate max-w-full italic opacity-70">
                                                             {email.snippet}
                                                         </div>
                                                     )}
                                                 </div>
                                                ) : (
                                                    <div className="flex items-start gap-3 p-4">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                    <span className={cn(
                                                                        "text-sm font-semibold truncate transition-colors",
                                                                        isExpanded ? "text-white" : "text-zinc-200"
                                                                    )}>
                                                                        {email.subject || '(No Subject)'}
                                                                    </span>
                                                                </div>
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

                                                                <div className="inline-flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950/40 px-2.5 py-1 shrink-0">
                                                                    {isSent ? (
                                                                        density === 'compact' ? (
                                                                            <>
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                                                    {openCount}
                                                                                </span>
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 tabular-nums">
                                                                                    <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                                                    {clickCount}
                                                                                </span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                                                                    <Eye className="w-3 h-3 text-emerald-400" />
                                                                                    Opened <span className="tabular-nums text-zinc-200">{openCount}</span>
                                                                                </span>
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                                                                    <MousePointer2 className="w-3 h-3 text-[#002FA7]" />
                                                                                    Clicked <span className="tabular-nums text-zinc-200">{clickCount}</span>
                                                                                </span>
                                                                            </>
                                                                        )
                                                                    ) : null}
                                                                    {threadKey && <ThreadBadge threadKey={threadKey} />}
                                                                </div>
                                                            </div>

                                                            {!isExpanded && email.snippet && (
                                                                <div className="text-xs text-zinc-500 mt-1 truncate max-w-full">
                                                                    {email.snippet}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </button>

                                            {/* Expanded body — renders INSIDE the card border, not outside */}
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                                                        className="overflow-hidden border-t border-white/5"
                                                    >
                                                        <motion.div 
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            transition={{ duration: 0.4, ease: "linear" }}
                                                            className="bg-zinc-950/40 p-6 max-h-[600px] overflow-y-auto w-full scrollbar-thin scrollbar-thumb-zinc-800"
                                                        >
                                                            <EmailContent
                                                                html={email.html}
                                                                text={email.text}
                                                                subject={email.subject}
                                                            />
                                                            <EmailActionBar email={email} variant={variant} />
                                                        </motion.div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-zinc-950/20 flex flex-col items-center justify-center gap-3">
                        <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">No email transmissions detected</p>
                    </div>
                )}
            </div>
        </div>
    )
}
