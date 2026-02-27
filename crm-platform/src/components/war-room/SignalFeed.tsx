'use client'

import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Activity, Phone, Mail, CheckSquare } from 'lucide-react'

function generateId() {
    return Math.random().toString(36).substring(2, 11)
}

interface SignalEntry {
    id: string
    time: Date
    type: 'MARKET' | 'INTEL' | 'CALL' | 'EMAIL' | 'TASK'
    message: string
}

interface SignalFeedProps {
    /** Pass new market events in whenever the grid updates */
    pendingMarketEvents?: SignalEntry[]
    /** Called when an account name is clicked to open dossier */
    onAccountClick?: (accountId: string) => void
}

const TYPE_STYLE: Record<SignalEntry['type'], { label: string; color: string; icon: React.ReactNode }> = {
    MARKET: { label: 'MARKET', color: 'text-[#002FA7]', icon: <Activity className="w-2.5 h-2.5" /> },
    INTEL: { label: 'INTEL', color: 'text-amber-400', icon: null },
    CALL: { label: 'CALL', color: 'text-zinc-400', icon: <Phone className="w-2.5 h-2.5" /> },
    EMAIL: { label: 'EMAIL', color: 'text-zinc-400', icon: <Mail className="w-2.5 h-2.5" /> },
    TASK: { label: 'TASK', color: 'text-emerald-400', icon: <CheckSquare className="w-2.5 h-2.5" /> },
}

function formatTime(d: Date) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function SignalFeed({ pendingMarketEvents }: SignalFeedProps) {
    const [entries, setEntries] = useState<SignalEntry[]>([])
    const listRef = useRef<HTMLDivElement>(null)

    const push = (entry: Omit<SignalEntry, 'id' | 'time'>) => {
        const newEntry: SignalEntry = { ...entry, id: generateId(), time: new Date() }
        setEntries((prev) => [newEntry, ...prev].slice(0, 60))
    }

    // Realtime: listen for new calls
    useEffect(() => {
        const channel = supabase
            .channel('war-room-signal-feed')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (payload) => {
                const record = payload.new as Record<string, unknown>
                const outcome = (record.outcome as string) ?? 'Outbound'
                const name = (record.contactName as string) ?? (record.accountName as string) ?? 'Unknown'
                push({ type: 'CALL', message: `${name} — ${outcome}` })
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emails' }, (payload) => {
                const record = payload.new as Record<string, unknown>
                const subject = (record.subject as string) ?? 'Email'
                const to = Array.isArray(record.to) ? (record.to as string[])[0] : (record.to as string) ?? ''
                push({ type: 'EMAIL', message: `${subject.slice(0, 40)} → ${to.slice(0, 30)}` })
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload) => {
                const record = payload.new as Record<string, unknown>
                const title = (record.title as string) ?? 'Task'
                push({ type: 'TASK', message: title.slice(0, 60) })
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [])

    // Inject market events from grid
    useEffect(() => {
        if (!pendingMarketEvents?.length) return
        for (const e of pendingMarketEvents) {
            setEntries((prev) => [e, ...prev].slice(0, 60))
        }
    }, [pendingMarketEvents])

    // Initial placeholder entries
    useEffect(() => {
        push({ type: 'INTEL', message: 'War Room active — monitoring ERCOT and CRM signals' })
    }, [])

    return (
        <div className="flex flex-col h-full nodal-glass border-l border-white/5">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Signal Feed</span>
            </div>

            {/* Entries */}
            <div ref={listRef} className="flex-1 overflow-y-auto np-scroll">
                <AnimatePresence initial={false}>
                    {entries.map((entry) => {
                        const style = TYPE_STYLE[entry.type]
                        return (
                            <motion.div
                                key={entry.id}
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-start gap-2 px-4 py-2 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                            >
                                <span className="text-[9px] font-mono text-zinc-700 tabular-nums shrink-0 mt-0.5 w-10">
                                    {formatTime(entry.time)}
                                </span>
                                <span className={cn('text-[9px] font-mono uppercase tracking-widest shrink-0 mt-0.5 w-10 flex items-center gap-0.5', style.color)}>
                                    {style.icon}
                                    {style.label}
                                </span>
                                <span className="text-[11px] font-mono text-zinc-400 leading-snug">
                                    {entry.message}
                                </span>
                            </motion.div>
                        )
                    })}
                </AnimatePresence>
            </div>
        </div>
    )
}

export type { SignalEntry }
