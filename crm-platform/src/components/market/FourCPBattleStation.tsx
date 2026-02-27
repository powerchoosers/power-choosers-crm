'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Zap, Target, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFourCPForecast, type FourCPRiskLevel } from '@/hooks/useFourCPForecast'
import Link from 'next/link'

const RISK_CONFIG: Record<FourCPRiskLevel, {
    label: string
    color: string
    bgColor: string
    borderColor: string
    glow: string
    pulse: boolean
}> = {
    OFF_SEASON: {
        label: 'OFF_SEASON',
        color: 'text-zinc-600',
        bgColor: 'bg-zinc-800/20',
        borderColor: 'border-zinc-800/40',
        glow: '',
        pulse: false,
    },
    LOW: {
        label: 'LOW_RISK',
        color: 'text-zinc-400',
        bgColor: 'bg-zinc-800/30',
        borderColor: 'border-zinc-700/30',
        glow: '',
        pulse: false,
    },
    MODERATE: {
        label: 'MODERATE_RISK',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/5',
        borderColor: 'border-amber-500/20',
        glow: '',
        pulse: false,
    },
    HIGH: {
        label: 'HIGH_RISK',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
        pulse: false,
    },
    CRITICAL: {
        label: 'CRITICAL',
        color: 'text-rose-400',
        bgColor: 'bg-rose-500/10',
        borderColor: 'border-rose-500/30',
        glow: 'shadow-[0_0_20px_rgba(239,68,68,0.2)]',
        pulse: true,
    },
    BATTLE_STATIONS: {
        label: '⚡ BATTLE_STATIONS',
        color: 'text-zinc-100',
        bgColor: 'bg-white/5',
        borderColor: 'border-zinc-100/50',
        glow: 'shadow-[0_0_30px_rgba(255,255,255,0.12)]',
        pulse: true,
    },
}

function ProbabilityGauge({ probability, riskLevel }: { probability: number; riskLevel: FourCPRiskLevel }) {
    const config = RISK_CONFIG[riskLevel]
    const isBattleStations = riskLevel === 'BATTLE_STATIONS'
    const isOffSeason = riskLevel === 'OFF_SEASON'

    return (
        <div className="flex flex-col items-center gap-3">
            {/* Circular gauge */}
            <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {/* Track */}
                    <circle
                        cx="50" cy="50" r="42"
                        fill="none"
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth="8"
                    />
                    {/* Progress arc */}
                    <motion.circle
                        cx="50" cy="50" r="42"
                        fill="none"
                        stroke={
                            isBattleStations ? 'rgba(255,255,255,0.8)' :
                                riskLevel === 'CRITICAL' ? 'rgba(239,68,68,0.8)' :
                                    riskLevel === 'HIGH' ? 'rgba(245,158,11,0.7)' :
                                        riskLevel === 'MODERATE' ? 'rgba(245,158,11,0.4)' :
                                            'rgba(255,255,255,0.1)'
                        }
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 42}`}
                        initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                        animate={{
                            strokeDashoffset: isOffSeason ? 2 * Math.PI * 42 :
                                2 * Math.PI * 42 * (1 - probability / 100)
                        }}
                        transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
                    />
                </svg>
                {/* Center readout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isOffSeason ? (
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest text-center leading-tight">OFF<br />SEASON</span>
                    ) : (
                        <>
                            <motion.span
                                className={cn('text-2xl font-mono tabular-nums font-bold', config.color)}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                key={probability}
                            >
                                {probability}
                            </motion.span>
                            <span className="text-[9px] font-mono text-zinc-600">%</span>
                        </>
                    )}
                </div>
                {/* Pulse ring for CRITICAL/BATTLE_STATIONS */}
                {config.pulse && (
                    <motion.div
                        className="absolute inset-0 rounded-full border-2 border-zinc-100/20"
                        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                )}
            </div>

            <div className={cn('text-[10px] font-mono uppercase tracking-widest', config.color)}>
                {config.label}
            </div>
        </div>
    )
}

export function FourCPBattleStation() {
    const { data, isLoading, isError } = useFourCPForecast()

    if (isLoading) {
        return (
            <div className="nodal-void-card p-4 animate-pulse h-48 bg-black/40" />
        )
    }

    if (isError || !data) {
        return (
            <div className="nodal-void-card p-4 text-zinc-600 font-mono text-xs">
                4CP data unavailable — live grid required
            </div>
        )
    }

    const config = RISK_CONFIG[data.riskLevel]
    const isBattleStations = data.riskLevel === 'BATTLE_STATIONS'
    const isOffSeason = data.riskLevel === 'OFF_SEASON'

    return (
        <AnimatePresence>
            <motion.div
                key={data.riskLevel}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                    'nodal-void-card p-5 border transition-all duration-500',
                    config.borderColor,
                    config.glow,
                    isBattleStations && 'animate-pulse-slow'
                )}
            >
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left: Gauge */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                        <ProbabilityGauge probability={data.probability} riskLevel={data.riskLevel} />
                        {/* Seasonal status indicators */}
                        <div className="flex gap-3 text-[9px] font-mono">
                            <span className={cn(data.isPeakSeason ? 'text-amber-400' : 'text-zinc-600')}>
                                {data.isPeakSeason ? '◆ PEAK SEASON' : '◇ OFF SEASON'}
                            </span>
                            <span className={cn(data.isTimeWindow ? 'text-rose-400' : 'text-zinc-600')}>
                                {data.isTimeWindow ? '◆ RISK WINDOW' : '◇ RISK WINDOW'}
                            </span>
                        </div>
                    </div>

                    {/* Right: Details */}
                    <div className="flex-1 space-y-4">
                        {/* Header */}
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Zap size={12} className={cn(isOffSeason ? 'text-zinc-600' : 'text-amber-400')} />
                                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
                                    4CP Coincident Peak Probability
                                </span>
                            </div>
                            <p className="text-[9px] font-mono text-zinc-600 max-w-sm">
                                {isOffSeason
                                    ? 'Monitoring resumes June 1. The 4 coincident peak hours across ERCOT are tracked Jun–Sep.'
                                    : 'Live probability that the current hour will be one of the 4 highest-demand hours on ERCOT this season. Missing a peak = transmission liability for the full next year.'}
                            </p>
                        </div>

                        {/* Active alert banner */}
                        <AnimatePresence>
                            {data.alertMessage && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className={cn(
                                        'flex items-start gap-2 rounded-lg px-3 py-2 border text-xs font-mono',
                                        isBattleStations
                                            ? 'bg-white/5 border-zinc-100/40 text-zinc-100'
                                            : 'bg-rose-500/5 border-rose-500/20 text-rose-400'
                                    )}
                                >
                                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                    <span>{data.alertMessage}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Signal breakdown */}
                        {!isOffSeason && data.signals.length > 0 && (
                            <div className="space-y-1">
                                <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">Active Signals</div>
                                {data.signals.map((sig, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                                        <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                                        {sig}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Grid snapshot */}
                        {data.gridSnapshot && !isOffSeason && (
                            <div className="grid grid-cols-3 gap-2 pt-1">
                                {[
                                    { label: 'LOAD', value: `${Math.round(data.gridSnapshot.actualLoad).toLocaleString()} MW` },
                                    { label: 'RESERVES', value: `${Math.round(data.gridSnapshot.reserves).toLocaleString()} MW` },
                                    { label: 'LOAD_%', value: `${data.gridSnapshot.loadPct}%` },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-black/30 rounded-lg p-2 border border-white/5">
                                        <div className="text-[8px] font-mono text-zinc-600 uppercase tracking-widest">{label}</div>
                                        <div className="text-sm font-mono tabular-nums text-zinc-300 mt-0.5">{value}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Strike List — appears when probability > 50% */}
                {!isOffSeason && data.probability > 50 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-5 pt-4 border-t border-white/5"
                    >
                        <StrikeList />
                    </motion.div>
                )}
            </motion.div>
        </AnimatePresence>
    )
}

/** Quick strike list pulled from accounts with 4CP exposure in liability metadata */
function StrikeList() {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Target size={10} className="text-rose-400" />
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                    Strike List — 4CP Exposed Accounts
                </span>
            </div>
            <StrikeListLoader />
        </div>
    )
}

function StrikeListLoader() {
    const { data, isLoading } = useStrikeListAccounts()

    if (isLoading) {
        return <div className="h-8 animate-pulse bg-black/40 rounded" />
    }

    if (!data?.length) {
        return (
            <p className="text-[10px] font-mono text-zinc-600">
                No accounts flagged with 4CP exposure. Tag accounts in their dossier.
            </p>
        )
    }

    return (
        <div className="space-y-1">
            {data.map((account: { id: string; name: string; contract_end_date: string | null }) => (
                <Link
                    key={account.id}
                    href={`/network/accounts/${account.id}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/30 border border-white/5 hover:border-rose-500/30 hover:bg-rose-500/5 transition-all group"
                >
                    <span className="text-[10px] font-mono text-zinc-300 group-hover:text-zinc-100">{account.name}</span>
                    <div className="flex items-center gap-2">
                        {account.contract_end_date && (
                            <span className="text-[9px] font-mono text-zinc-600">
                                Contract ends {new Date(account.contract_end_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                            </span>
                        )}
                        <ChevronRight size={10} className="text-zinc-600 group-hover:text-rose-400 transition-colors" />
                    </div>
                </Link>
            ))}
        </div>
    )
}

/** Hook to fetch accounts with 4CP exposure from Supabase */
function useStrikeListAccounts() {
    const { useQuery } = require('@tanstack/react-query')
    const { supabase } = require('@/lib/supabase')

    return useQuery({
        queryKey: ['4cp-strike-list'],
        queryFn: async () => {
            const { data } = await supabase
                .from('accounts')
                .select('id, name, contract_end_date')
                .or('coincident_peak_exposure.eq.true,liability_notes.ilike.%4CP%,liability_notes.ilike.%coincident peak%')
                .order('name')
                .limit(10)
            return data ?? []
        },
        staleTime: 10 * 60 * 1000,
    })
}
