'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PhoneCall, Play, Pause, Square, X, Info, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useCallStore } from '@/store/callStore'
import { usePowerDialerStore } from '@/store/powerDialerStore'
import { buildPowerDialTargets, chunkPowerDialTargets } from '@/lib/powerDialer'
import { cn, formatToE164 } from '@/lib/utils'
import { useVoice } from '@/context/VoiceContext'

type SessionMode = 'idle' | 'running' | 'paused' | 'complete'

function makeSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `power-dial-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatSessionIndex(current: number, total: number) {
  if (total <= 0) return '00/00'
  return `${String(current + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`
}

export function PowerDialerDock() {
  const { connect, disconnect } = useVoice()
  const { profile } = useAuth()
  const callStatus = useCallStore((state) => state.status)
  const isCallActive = useCallStore((state) => state.isActive)

  const contacts = usePowerDialerStore((state) => state.contacts)
  const selectedCount = usePowerDialerStore((state) => state.selectedCount)
  const sourceLabel = usePowerDialerStore((state) => state.sourceLabel)
  const batchSize = usePowerDialerStore((state) => state.batchSize)
  const sessionId = usePowerDialerStore((state) => state.sessionId)
  const clearPowerDialer = usePowerDialerStore((state) => state.clearPowerDialer)

  const [mode, setMode] = useState<SessionMode>('idle')
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [isStarting, setIsStarting] = useState(false)
  const [sessionNote, setSessionNote] = useState<string | null>(null)

  const runIdRef = useRef<string | null>(null)
  const nextBatchIndexRef = useRef(0)
  const previousCallStatusRef = useRef(callStatus)

  const dialTargets = useMemo(() => buildPowerDialTargets(contacts), [contacts])
  const batches = useMemo(() => chunkPowerDialTargets(dialTargets, batchSize), [dialTargets, batchSize])

  const selectedCallerNumber = useMemo(() => {
    const selected = profile?.selectedPhoneNumber || profile?.twilioNumbers?.[0]?.number || ''
    return formatToE164(selected)
  }, [profile?.selectedPhoneNumber, profile?.twilioNumbers])

  const selectedCallerName = useMemo(() => {
    const entries = profile?.twilioNumbers || []
    const selected = profile?.selectedPhoneNumber || entries?.[0]?.number || ''
    return entries.find((entry) => entry.number === selected)?.name || 'Default'
  }, [profile?.selectedPhoneNumber, profile?.twilioNumbers])

  const dialableCount = dialTargets.length
  const skippedCount = Math.max(0, selectedCount - dialableCount)
  const currentBatch = batches[currentBatchIndex] || []
  const totalBatches = batches.length
  const isVoiceBusy = isCallActive || callStatus === 'dialing' || callStatus === 'connected'

  useEffect(() => {
    setMode('idle')
    setCurrentBatchIndex(0)
    setIsStarting(false)
    setSessionNote(null)
    runIdRef.current = null
    nextBatchIndexRef.current = 0
  }, [sessionId])

  const startBatch = useCallback(async (batchIndex: number) => {
    const batch = batches[batchIndex]
    if (!batch || batch.length === 0) {
      setMode('complete')
      return false
    }

    if (!selectedCallerNumber) {
      toast.error('No caller ID selected', {
        description: 'Pick a Twilio number in settings before starting a power dial.',
      })
      return false
    }

    if (isVoiceBusy && mode !== 'running') {
      toast.error('A call is already active', {
        description: 'Finish the current call before starting a new power dial.',
      })
      return false
    }

    setIsStarting(true)

    if (!runIdRef.current || mode === 'idle' || mode === 'complete') {
      runIdRef.current = makeSessionId()
    }

    const runId = runIdRef.current
    const batchId = `${runId}:${batchIndex}`
    const batchLead = batch[0]
    const metadata = {
      name: batchLead?.name || sourceLabel || 'Power Dial',
      account: batchLead?.accountName || sourceLabel || 'Power Dial',
      title: batchLead?.title || undefined,
      photoUrl: batchLead?.photoUrl || undefined,
      logoUrl: batchLead?.logoUrl || undefined,
      domain: batchLead?.domain || undefined,
      accountId: batchLead?.accountId || undefined,
      contactId: batchLead?.contactId || undefined,
      isAccountOnly: false,
      powerDialSessionId: runId,
      powerDialBatchId: batchId,
      powerDialBatchIndex: batchIndex,
      powerDialBatchSize: batchSize,
      powerDialSourceLabel: sourceLabel || undefined,
      powerDialSelectedCount: selectedCount,
      powerDialDialableCount: dialableCount,
      powerDialTargetCount: batch.length,
    }

    const started = await connect({
      To: batchLead.phoneNumber,
      From: selectedCallerNumber,
      metadata,
      powerDialTargets: batch,
      powerDialSessionId: runId,
      powerDialBatchId: batchId,
      powerDialBatchIndex: batchIndex,
      powerDialBatchSize: batchSize,
      powerDialSourceLabel: sourceLabel || undefined,
      powerDialSelectedCount: selectedCount,
      powerDialDialableCount: dialableCount,
    })

    setIsStarting(false)

    if (!started) {
      setMode('paused')
      setSessionNote('Voice is not ready yet. You can resume when the system is ready.')
      return false
    }

    setCurrentBatchIndex(batchIndex)
    nextBatchIndexRef.current = batchIndex + 1
    setMode('running')
    setSessionNote(`Batch ${formatSessionIndex(batchIndex, totalBatches)} started.`)
    return true
  }, [batchSize, batches, connect, dialableCount, isVoiceBusy, mode, selectedCallerNumber, selectedCount, sourceLabel, totalBatches])

  const handleStartOrResume = useCallback(async () => {
    if (isStarting) return

    if (dialableCount === 0) {
      toast.error('Nothing to dial', {
        description: 'This selection does not contain any usable phone numbers.',
      })
      return
    }

    const startIndex = mode === 'paused' ? nextBatchIndexRef.current : 0
    const safeStartIndex = startIndex >= totalBatches ? 0 : startIndex

    if (mode !== 'paused') {
      nextBatchIndexRef.current = 0
      setCurrentBatchIndex(0)
    }

    await startBatch(safeStartIndex)
  }, [dialableCount, isStarting, mode, startBatch, totalBatches])

  const handlePause = useCallback(() => {
    if (mode !== 'running') return
    setMode('paused')
    setSessionNote('Power dial paused. The current call can finish, then you can resume.')
  }, [mode])

  const handleStop = useCallback(() => {
    setMode('idle')
    setCurrentBatchIndex(0)
    nextBatchIndexRef.current = 0
    runIdRef.current = null
    setIsStarting(false)
    setSessionNote('Power dial stopped.')

    if (isVoiceBusy) {
      disconnect()
    }
  }, [disconnect, isVoiceBusy])

  const handleClear = useCallback(() => {
    setMode('idle')
    setCurrentBatchIndex(0)
    nextBatchIndexRef.current = 0
    runIdRef.current = null
    setIsStarting(false)
    setSessionNote(null)
    clearPowerDialer()

    if (isVoiceBusy) {
      disconnect()
    }
  }, [clearPowerDialer, disconnect, isVoiceBusy])

  useEffect(() => {
    const previous = previousCallStatusRef.current
    previousCallStatusRef.current = callStatus

    if (mode !== 'running') return
    if (previous === callStatus) return
    if (callStatus !== 'ended') return

    const nextIndex = nextBatchIndexRef.current
    if (nextIndex < totalBatches) {
      const timer = window.setTimeout(() => {
        void startBatch(nextIndex)
      }, 500)

      return () => window.clearTimeout(timer)
    }

    setMode('complete')
    setSessionNote(`Finished ${dialableCount} dialable contact${dialableCount === 1 ? '' : 's'}.`)
    toast.success('Power dial complete', {
      description: sourceLabel ? `Queue finished for ${sourceLabel}.` : 'Queue finished.',
    })
  }, [callStatus, dialableCount, mode, sourceLabel, startBatch, totalBatches])

  const statusLabel = useMemo(() => {
    if (mode === 'running') return isVoiceBusy ? 'CALL ACTIVE' : 'RUNNING'
    if (mode === 'paused') return 'PAUSED'
    if (mode === 'complete') return 'COMPLETE'
    return 'READY'
  }, [isVoiceBusy, mode])

  const startButtonLabel = mode === 'paused'
    ? 'Resume'
    : mode === 'complete'
      ? 'Restart'
      : 'Start'

  const canStart = dialableCount > 0 && !!selectedCallerNumber && !isStarting && totalBatches > 0 && mode !== 'running' && !(isVoiceBusy && mode !== 'paused')

  if (selectedCount <= 0) return null

  return (
    <AnimatePresence>
      <motion.div
        key={`power-dialer-${sessionId}`}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        className="fixed left-1/2 bottom-24 z-[70] w-[min(94vw,52rem)] -translate-x-1/2 pointer-events-none lg:bottom-28"
      >
        <div className="pointer-events-auto relative overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/90 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.45)] nodal-monolith-edge">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#002FA7]/10 via-transparent to-white/5 pointer-events-none" />

          <div className="relative z-10 p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
                  <PhoneCall className="w-3.5 h-3.5 text-zinc-300" />
                  Power_Dial
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
                    {sourceLabel || 'Selected Contacts'}
                  </h2>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    {statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Call up to {batchSize} contacts at once. The first person to answer gets connected.
                </p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  <span className="text-zinc-600">From:</span>
                  <span className="text-zinc-300">{selectedCallerName}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="tabular-nums">{selectedCallerNumber || 'No caller ID'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartOrResume}
                  disabled={!canStart}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-mono uppercase tracking-widest transition-all',
                    canStart
                      ? 'bg-[#002FA7] text-white shadow-[0_0_24px_rgba(0,47,167,0.35)] hover:bg-[#002FA7]/90'
                      : 'bg-white/5 text-zinc-500 border border-white/10 cursor-not-allowed'
                  )}
                >
                  <Play className="w-3.5 h-3.5" />
                  {isStarting ? 'Starting' : startButtonLabel}
                </button>

                <button
                  type="button"
                  onClick={handlePause}
                  disabled={mode !== 'running'}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-mono uppercase tracking-widest transition-all',
                    mode === 'running'
                      ? 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                      : 'border-white/5 bg-white/[0.02] text-zinc-600 cursor-not-allowed'
                  )}
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>

                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-mono uppercase tracking-widest text-zinc-300 transition-all hover:bg-white/[0.06] hover:text-white"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>

                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 p-2 text-zinc-500 transition-all hover:text-white hover:bg-white/[0.04]"
                  aria-label="Clear power dial selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryTile label="Selected" value={String(selectedCount).padStart(2, '0')} />
              <SummaryTile label="Dialable" value={String(dialableCount).padStart(2, '0')} accent="text-emerald-400" />
              <SummaryTile label="Skipped" value={String(skippedCount).padStart(2, '0')} accent={skippedCount > 0 ? 'text-amber-400' : 'text-zinc-400'} />
              <SummaryTile label="Batch" value={totalBatches > 0 ? formatSessionIndex(currentBatchIndex, totalBatches) : '00/00'} accent="text-white" />
            </div>

            {sessionNote && (
              <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-[11px] text-zinc-400">
                <Info className="h-3.5 w-3.5 text-zinc-300" />
                <span>{sessionNote}</span>
              </div>
            )}

            {skippedCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
                <Users className="h-3.5 w-3.5" />
                <span>
                  {skippedCount} selected contact{skippedCount === 1 ? '' : 's'} do not have a dialable number and were skipped.
                </span>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {currentBatch.length > 0 ? currentBatch.map((target, index) => (
                <div
                  key={`${target.contactId}-${target.phoneNumber}-${index}`}
                  className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-100">
                        {target.name}
                      </div>
                      <div className="truncate text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        {target.accountName || sourceLabel || 'CONTACT'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-zinc-300">
                        {target.phoneNumber}
                      </div>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-4 text-xs text-zinc-500 sm:col-span-2 xl:col-span-3">
                  No dialable contacts in the current batch.
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function SummaryTile({
  label,
  value,
  accent = 'text-zinc-100',
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="text-[9px] font-mono uppercase tracking-[0.24em] text-zinc-600">
        {label}
      </div>
      <div className={cn('mt-1 text-lg font-mono tabular-nums', accent)}>
        {value}
      </div>
    </div>
  )
}
