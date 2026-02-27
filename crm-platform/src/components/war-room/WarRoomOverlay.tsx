'use client'

import { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWarRoomStore } from '@/store/warRoomStore'
import { useCallStore } from '@/store/callStore'
import { GridStrip } from '@/components/war-room/GridStrip'
import { PriorityStack } from '@/components/war-room/PriorityStack'
import { SignalFeed, SignalEntry } from '@/components/war-room/SignalFeed'
import { X, Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

function generateId() {
    return Math.random().toString(36).substring(2, 11)
}

interface GridSnapshot {
    hubPrice: number | null
    reserves: number | null
    frequency: number | null
    scarcityProb: string | null
}

export function WarRoomOverlay() {
    const { isOpen, close } = useWarRoomStore()
    const { isActive: isCallActive, status: callStatus, metadata: callMeta } = useCallStore()
    const router = useRouter()
    const [gridSnapshot, setGridSnapshot] = useState<GridSnapshot | null>(null)
    const [pendingMarketEvents, setPendingMarketEvents] = useState<SignalEntry[]>([])
    const [prevReserves, setPrevReserves] = useState<number | null>(null)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [prevCallActive, setPrevCallActive] = useState(false)

    // Keyboard: Esc closes
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) close()
    }, [isOpen, close])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            clearInterval(timer)
        }
    }, [handleKeyDown])

    useEffect(() => {
        if (isCallActive && !prevCallActive) {
            setPendingMarketEvents([{
                id: generateId(),
                time: new Date(),
                type: 'CALL',
                message: `Live Call initiated: ${callMeta?.name || 'Unknown'} — ${callStatus}`,
            }])
        }
        setPrevCallActive(isCallActive)
    }, [isCallActive, prevCallActive, callMeta?.name, callStatus])

    // Lock body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [isOpen])

    // Receive grid updates from GridStrip and generate market signal events
    const handleGridUpdate = useCallback((data: GridSnapshot & { timestamp?: string | null }) => {
        setGridSnapshot(data)

        const events: SignalEntry[] = []

        // Fire a signal when reserves cross threshold
        if (data.reserves !== null && prevReserves !== null) {
            if (prevReserves >= 3000 && data.reserves < 3000) {
                events.push({
                    id: generateId(),
                    time: new Date(),
                    type: 'MARKET',
                    message: `ERCOT reserves breached 3,000 MW floor — ${data.reserves.toLocaleString()} MW`,
                })
            } else if (prevReserves >= 4000 && data.reserves < 4000) {
                events.push({
                    id: generateId(),
                    time: new Date(),
                    type: 'MARKET',
                    message: `ERCOT reserves tightening — ${data.reserves.toLocaleString()} MW`,
                })
            }
        }

        // Fire when price spikes significantly
        if (data.hubPrice !== null && data.hubPrice > 200) {
            events.push({
                id: generateId(),
                time: new Date(),
                type: 'MARKET',
                message: `RT Hub price elevated: $${data.hubPrice.toFixed(2)}/MWh — scarcity adder active`,
            })
        }

        if (events.length > 0) setPendingMarketEvents(events)
        setPrevReserves(data.reserves)
    }, [prevReserves])

    const handleAccountOpen = useCallback((accountId: string) => {
        router.push(`/network/accounts/${accountId}`)
        close()
    }, [router, close])

    const handleQuickCall = useCallback((accountId: string, name: string) => {
        router.push(`/network/accounts/${accountId}`)
        close()
    }, [router, close])

    const reservesTight = (gridSnapshot?.reserves ?? Infinity) < 4000

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="war-room-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[99] bg-black/70 backdrop-blur-sm"
                        onClick={close}
                    />

                    {/* War Room panel */}
                    <motion.div
                        key="war-room-panel"
                        initial={{ opacity: 0, scale: 0.98, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 8 }}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        className="fixed inset-4 z-[100] flex flex-col rounded-xl overflow-hidden border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)] bg-[#09090b]"
                        style={{ backgroundColor: '#09090b', backgroundImage: 'radial-gradient(circle at 50% 120%, rgba(0, 47, 167, 0.05), transparent)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
                            <div className="flex items-center gap-3">
                                <Shield className={cn(
                                    'w-4 h-4 transition-colors',
                                    reservesTight ? 'text-[#002FA7]' : 'text-zinc-600'
                                )} />
                                <span className="text-xs font-mono text-zinc-300 uppercase tracking-[0.3em]">
                                    Forensic War Room
                                </span>
                                <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
                                    Ctrl+Shift+W
                                </span>
                            </div>

                            {/* Alert badge */}
                            <AnimatePresence>
                                {reservesTight && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#002FA7]/40 bg-[#002FA7]/10"
                                    >
                                        <motion.div
                                            animate={{ opacity: [1, 0.4, 1] }}
                                            transition={{ repeat: Infinity, duration: 1.5 }}
                                            className="w-1.5 h-1.5 rounded-full bg-[#002FA7]"
                                        />
                                        <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest">
                                            Grid Alert Active
                                        </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Live Call Badge */}
                            <AnimatePresence>
                                {isCallActive && (
                                    <motion.div
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        className="flex items-center gap-2 px-3 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.2)] ml-4"
                                    >
                                        <div className="relative">
                                            <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute inset-0" />
                                            <div className="w-2 h-2 rounded-full bg-rose-500 relative" />
                                        </div>
                                        <span className="text-[10px] font-mono text-rose-500 tabular-nums uppercase tracking-widest font-bold">
                                            Live Call: {callStatus}
                                        </span>
                                        {callMeta?.name && (
                                            <>
                                                <span className="text-zinc-700 text-[10px]">/</span>
                                                <span className="text-[10px] font-mono text-zinc-300 truncate max-w-[120px]">
                                                    {callMeta.name}
                                                </span>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <button
                                onClick={close}
                                className="icon-button-forensic w-8 h-8 flex items-center justify-center rounded hover:bg-white/5"
                                title="Close (Esc)"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Station I: Grid Strip */}
                        <GridStrip onGridUpdate={handleGridUpdate} />

                        {/* Stations II + III */}
                        <div className="flex flex-1 overflow-hidden">
                            {/* Station II: Priority Stack — 65% width */}
                            <div className="flex-[65] overflow-hidden border-r border-white/5">
                                <PriorityStack
                                    gridSnapshot={gridSnapshot}
                                    activeAccountId={callMeta?.accountId}
                                    onAccountOpen={handleAccountOpen}
                                    onQuickCall={handleQuickCall}
                                />
                            </div>

                            {/* Station III: Signal Feed — 35% width */}
                            <div className="flex-[35] overflow-hidden">
                                <SignalFeed pendingMarketEvents={pendingMarketEvents} />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-5 py-2 border-t border-white/5 shrink-0 bg-black/40">
                            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                                Nodal Point · Forensic Terminal v1.0
                            </span>
                            <div className="flex items-center gap-4">
                                <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                                    {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                                <span className="text-[10px] font-mono text-[#002FA7] tabular-nums font-bold">
                                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'America/Chicago' })} CST
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
