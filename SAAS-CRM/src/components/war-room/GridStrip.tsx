'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, AlertTriangle, Zap } from 'lucide-react'

interface GridData {
    hubPrice: number | null
    north: number | null
    south: number | null
    west: number | null
    houston: number | null
    reserves: number | null
    actualLoad: number | null
    frequency: number | null
    scarcityProb: string | null
    timestamp: string | null
    source: string | null
}

interface GridStripProps {
    onGridUpdate?: (data: GridData) => void
}

function formatPrice(v: number | null) {
    if (v === null) return '—'
    return `$${v.toFixed(2)}`
}

function formatMW(v: number | null) {
    if (v === null) return '—'
    return `${v.toLocaleString()} MW`
}

type AlertLevel = 'normal' | 'tight' | 'critical'

function getAlertLevel(reserves: number | null): AlertLevel {
    if (reserves === null) return 'normal'
    if (reserves < 2000) return 'critical'
    if (reserves < 4000) return 'tight'
    return 'normal'
}

export function GridStrip({ onGridUpdate }: GridStripProps) {
    const [grid, setGrid] = useState<GridData | null>(null)
    const [loading, setLoading] = useState(true)
    const [prevHub, setPrevHub] = useState<number | null>(null)
    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const fetchGrid = async () => {
        try {
            const [priceRes, gridRes] = await Promise.all([
                fetch('/api/market/ercot?type=prices'),
                fetch('/api/market/ercot?type=grid'),
            ])
            const priceData = await priceRes.json()
            const gridData = await gridRes.json()

            const prices = priceData.prices ?? {}
            const metrics = gridData.metrics ?? {}

            const updated: GridData = {
                hubPrice: prices.hub_avg ?? null,
                houston: prices.houston ?? null,
                north: prices.north ?? null,
                south: prices.south ?? null,
                west: prices.west ?? null,
                reserves: metrics.reserves ?? null,
                actualLoad: metrics.actual_load ?? null,
                frequency: metrics.frequency ?? null,
                scarcityProb: metrics.scarcity_prob ?? null,
                timestamp: priceData.timestamp ?? gridData.timestamp ?? null,
                source: priceData.source ?? gridData.source ?? null,
            }

            setPrevHub((prev) => {
                if (prev !== null && updated.hubPrice !== null) {
                    // track direction briefly
                }
                return grid?.hubPrice ?? null
            })
            setGrid(updated)
            onGridUpdate?.(updated)
        } catch {
            // fail silently — grid strip is best-effort
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchGrid()
        intervalRef.current = setInterval(fetchGrid, 60_000)
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const alertLevel = getAlertLevel(grid?.reserves ?? null)
    const priceDir = grid?.hubPrice !== null && prevHub !== null
        ? grid!.hubPrice! > prevHub ? 'up' : grid!.hubPrice! < prevHub ? 'down' : 'flat'
        : 'flat'

    const stripBorder = alertLevel === 'critical'
        ? 'border-b border-white/20 shadow-[0_1px_20px_rgba(255,255,255,0.05)]'
        : alertLevel === 'tight'
            ? 'border-b border-amber-500/30'
            : 'border-b border-white/5'

    return (
        <div className={cn(
            'relative flex items-center gap-0 px-6 h-10 bg-zinc-950/95 backdrop-blur-sm overflow-hidden shrink-0',
            stripBorder
        )}>
            {/* Alert pulse for critical */}
            <AnimatePresence>
                {alertLevel === 'critical' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.15, 0.3, 0.15] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 bg-white/5 pointer-events-none"
                    />
                )}
            </AnimatePresence>

            {/* Label */}
            <div className="flex items-center gap-1.5 pr-5 border-r border-white/10 shrink-0">
                <Activity className="w-3 h-3 text-zinc-100" />
                <span className="text-[10px] font-mono text-zinc-100 uppercase tracking-[0.2em]">ERCOT</span>
            </div>

            {loading ? (
                <span className="text-[10px] font-mono text-zinc-600 pl-5 animate-pulse">Fetching grid telemetry...</span>
            ) : !grid ? (
                <span className="text-[10px] font-mono text-zinc-600 pl-5">Grid data unavailable</span>
            ) : (
                <div className="flex items-center gap-0 overflow-x-auto no-scrollbar pl-4">
                    {/* Hub price */}
                    <GridCell
                        label="HUB"
                        value={formatPrice(grid.hubPrice)}
                        accent={alertLevel === 'critical' ? 'blue' : undefined}
                        suffix={priceDir === 'up' ? ' ▲' : priceDir === 'down' ? ' ▼' : undefined}
                    />

                    {/* Zone prices */}
                    <GridCell label="HOU" value={formatPrice(grid.houston)} />
                    <GridCell label="NTH" value={formatPrice(grid.north)} />
                    <GridCell label="STH" value={formatPrice(grid.south)} />
                    <GridCell label="WST" value={formatPrice(grid.west)} />

                    {/* Grid state */}
                    <GridCell
                        label="RESERVES"
                        value={formatMW(grid.reserves)}
                        accent={alertLevel === 'critical' ? 'red' : alertLevel === 'tight' ? 'amber' : undefined}
                        icon={alertLevel !== 'normal' ? <AlertTriangle className="w-2.5 h-2.5" /> : undefined}
                    />
                    <GridCell label="LOAD" value={formatMW(grid.actualLoad)} />
                    <GridCell
                        label="FREQ"
                        value={grid.frequency !== null ? `${grid.frequency} Hz` : '—'}
                        accent={grid.frequency !== null && (grid.frequency < 59.95 || grid.frequency > 60.05) ? 'amber' : undefined}
                    />

                    {/* Scarcity */}
                    {grid.scarcityProb !== null && parseFloat(grid.scarcityProb) > 0 && (
                        <GridCell
                            label="SCARCITY"
                            value={`${grid.scarcityProb}%`}
                            accent={parseFloat(grid.scarcityProb) > 5 ? 'red' : 'amber'}
                            icon={<Zap className="w-2.5 h-2.5" />}
                        />
                    )}

                    {/* Alert mode label */}
                    {alertLevel !== 'normal' && (
                        <div className={cn(
                            'flex items-center gap-1 ml-4 px-2.5 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-widest shrink-0 font-bold',
                            alertLevel === 'critical'
                                ? 'bg-white/10 text-white border border-white/20'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        )}>
                            {alertLevel === 'critical' ? 'SCARCITY ALERT' : 'RESERVES TIGHT'}
                        </div>
                    )}

                    {/* Timestamp */}
                    {grid.timestamp && (
                        <span className="text-[9px] font-mono text-zinc-700 ml-5 shrink-0">
                            {new Date(grid.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} CST
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

interface GridCellProps {
    label: string
    value: string
    accent?: 'red' | 'amber' | 'blue'
    suffix?: string
    icon?: React.ReactNode
}

function GridCell({ label, value, accent, suffix, icon }: GridCellProps) {
    const valueColor =
        accent === 'red' ? 'text-rose-400' :
            accent === 'amber' ? 'text-amber-400' :
                accent === 'blue' ? 'text-zinc-100 font-bold' :
                    'text-zinc-400'

    return (
        <div className="flex items-baseline gap-1 px-4 border-r border-white/5 last:border-0 shrink-0">
            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">{label} </span>
            <span className={cn('text-[11px] font-mono tabular-nums', valueColor)}>
                {icon && <span className="inline-flex items-center mr-0.5">{icon}</span>}
                {value}
                {suffix && <span className={cn('text-[9px]', accent === 'red' ? 'text-rose-500' : 'text-emerald-400')}>{suffix}</span>}
            </span>
        </div>
    )
}
