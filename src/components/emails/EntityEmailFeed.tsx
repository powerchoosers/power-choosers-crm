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
                                            "rounded-xl border transition-all duration-300 overflow-hidden",
                                            isExpanded ? "border-[#002FA7]/50 bg-black/40 shadow-[0_0_15px_rgba(0,47,167,0.1)]" : "border-white/5 bg-zinc-950/20 hover:border-white/10 hover:bg-zinc-900/30"
                                        )}
                                    >
                                        <button
                                            onClick={() => toggleExpand(email.id)}
                                            className="w-full text-left p-4 flex items-start gap-4 focus:outline-none focus:bg-white/[0.02] transition-colors"
                                        >
                                            {/* Icon */}
                                            <div className="shrink-0 mt-0.5 relative">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                                                    isExpanded ? "bg-[#002FA7]/20 border-[#002FA7]/30 text-[#002FA7]" : "bg-black/40 border-white/5 text-zinc-500 group-hover:text-zinc-400"
                                                )}>
                                                    {email.type === 'sent' ? (
                                                        <ArrowUpRight className="w-4 h-4" />
                                                    ) : (
                                                        <ArrowDownLeft className="w-4 h-4" />
                                                    )}
                                                </div>
                                            </div>

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
                                                    <div className="text-xs text-zinc-500 mt-1 truncate">
                                                        {email.snippet}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="shrink-0 mt-1">
                                                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} className={cn("transition-colors", isExpanded ? "text-white" : "text-zinc-600")}>
                                                    <ChevronDown className="w-4 h-4" />
                                                </motion.div>
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
