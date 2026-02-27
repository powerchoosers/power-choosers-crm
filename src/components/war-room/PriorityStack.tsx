'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { Phone, Mail, CheckSquare, Zap, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AccountRecord {
    id: string
    name: string
    domain: string | null
    industry: string | null
    city: string | null
    state: string | null
    logoUrl: string | null
    contractEndDate: string | null
    lastTouchTs: string | null
    lastCallTs: string | null
    lastCallOutcome: string | null
    overdueTaskCount: number
}

interface ScoredAccount extends AccountRecord {
    liabilityScore: number
    liabilityReasons: string[]
    contractDaysLeft: number | null
    touchDaysAgo: number | null
    healthTier: 'active' | 'warming' | 'cold' | 'never'
}

interface GridSnapshot {
    hubPrice: number | null
    reserves: number | null
    frequency: number | null
    scarcityProb: string | null
}

interface PriorityStackProps {
    gridSnapshot: GridSnapshot | null
    onAccountOpen: (accountId: string) => void
    onQuickCall: (accountId: string, name: string) => void
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function scoreAccount(acct: AccountRecord, reservesTight: boolean): ScoredAccount {
    let score = 0
    const reasons: string[] = []
    const now = Date.now()

    // Contract end date
    let contractDaysLeft: number | null = null
    if (acct.contractEndDate) {
        contractDaysLeft = Math.round(
            (new Date(acct.contractEndDate).getTime() - now) / 86400000
        )
        if (contractDaysLeft <= 0) {
            score += 55; reasons.push('CONTRACT EXPIRED')
        } else if (contractDaysLeft <= 30) {
            score += 50; reasons.push(`CONTRACT IN ${contractDaysLeft}D`)
        } else if (contractDaysLeft <= 90) {
            score += 30; reasons.push(`CONTRACT IN ${contractDaysLeft}D`)
        } else if (contractDaysLeft <= 180) {
            score += 15; reasons.push(`CONTRACT IN ${contractDaysLeft}D`)
        }
    }

    // Last touch / health tier
    let touchDaysAgo: number | null = null
    let healthTier: ScoredAccount['healthTier'] = 'never'
    if (acct.lastTouchTs) {
        touchDaysAgo = Math.round((now - new Date(acct.lastTouchTs).getTime()) / 86400000)
        if (touchDaysAgo <= 30) {
            healthTier = 'active'
        } else if (touchDaysAgo <= 90) {
            healthTier = 'warming'
            score += 15; reasons.push(`WARMING — ${touchDaysAgo}D NO TOUCH`)
        } else {
            healthTier = 'cold'
            score += 30; reasons.push(`COLD — ${touchDaysAgo}D NO TOUCH`)
        }
    } else {
        healthTier = 'never'
        score += 35; reasons.push('NEVER CONTACTED')
    }

    // ERCOT reserve bonus — grid is tight AND account is not active
    if (reservesTight && (healthTier === 'warming' || healthTier === 'cold' || healthTier === 'never')) {
        score += 20; reasons.push('GRID TIGHT — ACT NOW')
    }

    // Overdue tasks
    if (acct.overdueTaskCount > 0) {
        score += acct.overdueTaskCount >= 3 ? 20 : 15
        reasons.push(`${acct.overdueTaskCount} OVERDUE TASK${acct.overdueTaskCount > 1 ? 'S' : ''}`)
    }

    // Last call outcome
    if (acct.lastCallOutcome?.toLowerCase().includes('no answer') ||
        acct.lastCallOutcome?.toLowerCase().includes('voicemail')) {
        score += 10; reasons.push('LAST CALL UNANSWERED')
    }

    return { ...acct, liabilityScore: score, liabilityReasons: reasons, contractDaysLeft, touchDaysAgo, healthTier }
}

// ─── Health dot ─────────────────────────────────────────────────────────────

const HEALTH_DOT = {
    active: 'bg-emerald-500',
    warming: 'bg-amber-500',
    cold: 'bg-rose-500',
    never: 'bg-rose-600',
}

// ─── PriorityStack ──────────────────────────────────────────────────────────

export function PriorityStack({ gridSnapshot, onAccountOpen, onQuickCall }: PriorityStackProps) {
    const router = useRouter()
    const [accounts, setAccounts] = useState<ScoredAccount[]>([])
    const [loading, setLoading] = useState(true)
    const [brief, setBrief] = useState<string | null>(null)
    const [briefLoading, setBriefLoading] = useState(false)
    const [briefError, setBriefError] = useState<string | null>(null)

    const reservesTight = (gridSnapshot?.reserves ?? Infinity) < 4000

    const fetchQueue = useCallback(async () => {
        try {
            const res = await fetch('/api/war-room/liability-queue')
            const json = await res.json()
            const raw: AccountRecord[] = json.accounts ?? []
            const scored = raw
                .map((a) => scoreAccount(a, reservesTight))
                .sort((a, b) => b.liabilityScore - a.liabilityScore)
            setAccounts(scored)
        } catch {
            // silent
        } finally {
            setLoading(false)
        }
    }, [reservesTight])

    useEffect(() => { fetchQueue() }, [fetchQueue])

    const generateBrief = async () => {
        if (briefLoading) return
        setBriefLoading(true)
        setBriefError(null)
        setBrief(null)
        try {
            const res = await fetch('/api/ai/war-room-brief', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topAccounts: accounts.slice(0, 5).map((a) => ({
                        name: a.name,
                        contractEndDate: a.contractEndDate,
                        lastTouchTs: a.lastTouchTs,
                        lastCallOutcome: a.lastCallOutcome,
                        industry: a.industry,
                        overdueTaskCount: a.overdueTaskCount,
                        liabilityScore: a.liabilityScore,
                        liabilityReasons: a.liabilityReasons,
                    })),
                    grid: {
                        hubPrice: gridSnapshot?.hubPrice ?? null,
                        reserves: gridSnapshot?.reserves ?? null,
                        frequency: gridSnapshot?.frequency ?? null,
                        scarcityProb: gridSnapshot?.scarcityProb ?? null,
                    },
                }),
            })
            const json = await res.json()
            if (json.brief) setBrief(json.brief)
            else setBriefError(json.error ?? 'No response')
        } catch (e) {
            setBriefError(e instanceof Error ? e.message : 'Network error')
        } finally {
            setBriefLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
                        Priority Stack
                    </span>
                    {!loading && (
                        <span className="text-[10px] font-mono text-zinc-700">
                            {accounts.length} targets
                        </span>
                    )}
                </div>

                {/* AI Brief button — GATED */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={generateBrief}
                    disabled={briefLoading || accounts.length === 0}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] font-mono uppercase tracking-widest transition-all',
                        briefLoading
                            ? 'border-[#002FA7]/30 text-[#002FA7]/50 cursor-not-allowed'
                            : 'border-[#002FA7]/60 text-[#002FA7] hover:bg-[#002FA7]/10 hover:border-[#002FA7]'
                    )}
                >
                    {briefLoading
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                        : <><Zap className="w-3 h-3" /> Tactical Brief</>}
                </motion.button>
            </div>

            {/* AI Brief output */}
            <AnimatePresence>
                {(brief || briefError) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="nodal-module-glass border-b border-white/10 overflow-hidden shrink-0"
                    >
                        <div className="relative px-5 py-4">
                            <button
                                onClick={() => { setBrief(null); setBriefError(null) }}
                                className="absolute top-3 right-4 icon-button-forensic w-5 h-5 flex items-center justify-center"
                                title="Dismiss brief"
                            >
                                <X className="w-3 h-3" />
                            </button>
                            {briefError ? (
                                <p className="text-xs font-mono text-rose-400">{briefError}</p>
                            ) : (
                                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed pr-6">
                                    {brief}
                                </pre>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Account cards */}
            <div className="flex-1 overflow-y-auto np-scroll">
                {loading ? (
                    <div className="flex flex-col gap-0">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-white/5 animate-pulse">
                                <div className="w-9 h-9 rounded-[14px] bg-white/5 shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3 bg-white/5 rounded w-2/3" />
                                    <div className="h-2.5 bg-white/[0.03] rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {accounts.map((acct, idx) => (
                            <AccountCard
                                key={acct.id}
                                acct={acct}
                                rank={idx + 1}
                                reservesTight={reservesTight}
                                onOpen={() => onAccountOpen(acct.id)}
                                onCall={() => onQuickCall(acct.id, acct.name)}
                                onEmail={() => router.push(`/network/accounts/${acct.id}?tab=emails`)}
                                onTask={() => router.push(`/network/accounts/${acct.id}?tab=tasks`)}
                            />
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </div>
    )
}

// ─── AccountCard ─────────────────────────────────────────────────────────────

interface AccountCardProps {
    acct: ScoredAccount
    rank: number
    reservesTight: boolean
    onOpen: () => void
    onCall: () => void
    onEmail: () => void
    onTask: () => void
}

function AccountCard({ acct, rank, reservesTight, onOpen, onCall, onEmail, onTask }: AccountCardProps) {
    const topReason = acct.liabilityReasons[0] ?? ''
    const secondReason = acct.liabilityReasons[1] ?? ''

    const urgencyGlow =
        reservesTight && (acct.healthTier === 'cold' || acct.healthTier === 'never')
            ? 'hover:shadow-[0_0_20px_rgba(0,47,167,0.12)]'
            : ''

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className={cn(
                'group flex items-center gap-4 px-5 py-3.5 border-b border-white/[0.04]',
                'hover:bg-white/[0.025] hover:border-white/10 transition-all duration-200 cursor-pointer',
                urgencyGlow
            )}
            onClick={onOpen}
        >
            {/* Rank */}
            <span className="text-[10px] font-mono text-zinc-700 w-5 shrink-0 tabular-nums">{rank}</span>

            {/* Icon with health dot */}
            <div className="relative shrink-0">
                <CompanyIcon
                    logoUrl={acct.logoUrl ?? undefined}
                    domain={acct.domain ?? undefined}
                    name={acct.name}
                    size={36}
                    className="w-9 h-9"
                />
                <span className={cn(
                    'absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900',
                    HEALTH_DOT[acct.healthTier]
                )} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100 truncate">{acct.name}</span>
                    {acct.liabilityScore >= 70 && (
                        <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded-sm border border-[#002FA7]/50 text-[#002FA7] bg-[#002FA7]/10 uppercase tracking-widest">
                            HIGH
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn(
                        'text-[10px] font-mono uppercase tracking-wider truncate',
                        topReason.includes('COLD') || topReason.includes('EXPIRED') ? 'text-rose-400' :
                            topReason.includes('WARMING') || topReason.includes('TIGHT') ? 'text-amber-400' :
                                'text-zinc-500'
                    )}>
                        {topReason}
                    </span>
                    {secondReason && (
                        <>
                            <span className="text-zinc-700 text-[9px]">·</span>
                            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider truncate">
                                {secondReason}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Score */}
            <span className="text-[11px] font-mono text-zinc-700 tabular-nums shrink-0">
                {acct.liabilityScore}
            </span>

            {/* Quick actions */}
            <div
                className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onCall}
                    className="icon-button-forensic w-7 h-7 flex items-center justify-center rounded hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"
                    title="Quick call"
                >
                    <Phone className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={onEmail}
                    className="icon-button-forensic w-7 h-7 flex items-center justify-center rounded hover:bg-[#002FA7]/10 hover:text-[#002FA7] transition-colors"
                    title="View emails"
                >
                    <Mail className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={onTask}
                    className="icon-button-forensic w-7 h-7 flex items-center justify-center rounded hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
                    title="View tasks"
                >
                    <CheckSquare className="w-3.5 h-3.5" />
                </button>
            </div>
        </motion.div>
    )
}
