'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ChevronRight, ChevronDown, Check, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { Email } from '@/hooks/useEmails'
import { EmailContent } from './EmailContent'
import { cn } from '@/lib/utils'
import { useEntityEmails } from '@/hooks/useEntityEmails'

interface EntityEmailFeedProps {
    emails: string[]
    title?: string
}

export function EntityEmailFeed({ emails, title = 'Email Intelligence' }: EntityEmailFeedProps) {
    const { data: fetchEmails, isLoading } = useEntityEmails(emails)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id)
    }

    const validEmails = fetchEmails && fetchEmails.length > 0 ? fetchEmails : []

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
                                const isSent = email.type === 'sent' || email.from.includes('nodalpoint') || email.from.includes(emails[0] ? '' : '') // naive fallback

                                return (
                                    <motion.div
                                        key={email.id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "group rounded-xl border transition-all duration-300 overflow-hidden nodal-recessed",
                                            isExpanded ? "bg-zinc-950/90 border-white/10 shadow-2xl" : "bg-zinc-950/40 border-white/5 hover:bg-zinc-950/80 hover:border-white/10"
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

                                                <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2 truncate">
                                                    <span className={email.type === 'sent' ? 'text-emerald-500/80' : 'text-[#002FA7]/80'}>
                                                        {email.type === 'sent' ? 'To: ' : 'From: '}
                                                    </span>
                                                    <span className="truncate">
                                                        {email.type === 'sent' ? (Array.isArray(email.to) ? email.to.join(', ') : email.to) : email.from}
                                                    </span>
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
