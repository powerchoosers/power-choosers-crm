'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { XCircle, RotateCcw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface SequenceMemberRow {
  memberId: string
  memberStatus: string
  currentNodeId: string | null
  currentNodeLabel: string | null
  contactId: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  title: string | null
  accountName: string | null
  updatedAt: string | null
  totalEmailsSent: number
  totalOpens: number
  totalClicks: number
  totalReplies: number
  executionStatus: string | null
  executionStepType: string | null
  executionScheduledAt: string | null
  executionLabel: string | null
}

interface SequenceIntelSummary {
  totalMembers: number
  activeMembers: number
  pausedMembers: number
  completedMembers: number
  queuedExecutions: number
  runningExecutions: number
  failedExecutions: number
}

interface SequenceIntelResponse {
  sequence: {
    id: string
    name: string | null
  }
  summary: SequenceIntelSummary
  rows: SequenceMemberRow[]
  error?: string
}

interface SequenceIntelModalProps {
  isOpen: boolean
  onClose: () => void
  sequenceId?: string
}

export function SequenceIntelModal({ isOpen, onClose, sequenceId }: SequenceIntelModalProps) {
  console.log('--- SEQUENCE INTEL MODAL RENDER ---', { isOpen, sequenceId })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<SequenceMemberRow[]>([])
  const [name, setName] = useState('')
  const [summary, setSummary] = useState<SequenceIntelSummary | null>(null)
  const [isClient, setIsClient] = useState(false)
  
  // Selection state for when no sequenceId is provided
  const [availableSequences, setAvailableSequences] = useState<{id: string, name: string}[]>([])
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Sync internal selected ID with prop
  useEffect(() => {
    if (sequenceId) {
      setSelectedSequenceId(sequenceId)
    }
  }, [sequenceId])

  const fetchProtocols = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sequences')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) throw error
      setAvailableSequences(data || [])
    } catch (err) {
      console.error('Error fetching sequences:', err)
    }
  }, [])

  const fetchIntel = useCallback(async (targetId: string) => {
    if (!targetId) return

    setLoading(true)
    setError(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      if (!token) {
        throw new Error('Please log in again. Session token is missing.')
      }

      const response = await fetch(`/api/protocols/${targetId}/sequence-intel`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json() as SequenceIntelResponse

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load sequence intel')
      }

      setRows(Array.isArray(data.rows) ? data.rows : [])
      setSummary(data.summary || null)
      setName(data.sequence?.name || '')
    } catch (err: any) {
      setRows([])
      setSummary(null)
      setName('')
      setError(err?.message || 'Failed to load sequence intel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      if (selectedSequenceId) {
        fetchIntel(selectedSequenceId)
      } else {
        fetchProtocols()
      }
    }
  }, [isOpen, selectedSequenceId, fetchIntel, fetchProtocols])

  const formatTimestamp = (value?: string | null) => {
    if (!value) return '-'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return '-'
    return dt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  if (!isClient) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[140] bg-black/72 backdrop-blur-lg flex items-center justify-center p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-[1240px] max-h-[88vh] nodal-monolith-edge bg-zinc-950/95 border border-white/10 rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-white/10 bg-black/30 flex items-center justify-between">
              <div className="flex-1 flex items-center gap-6">
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Sequence Intel</div>
                  {loading ? (
                    <div className="h-5 w-48 bg-white/10 rounded animate-pulse mt-1" />
                  ) : (
                    <div className="text-lg font-semibold tracking-tight text-zinc-100 mt-1">
                      {name || 'Select Protocol'}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-8 w-px bg-white/5 mx-2" />
                  <select
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-[#002FA7] transition-colors cursor-pointer"
                    value={selectedSequenceId || ''}
                    onChange={(e) => setSelectedSequenceId(e.target.value)}
                  >
                    <option value="" disabled>Switch Protocol</option>
                    {availableSequences.map(seq => (
                      <option key={seq.id} value={seq.id}>{seq.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => selectedSequenceId && fetchIntel(selectedSequenceId)}
                  disabled={loading || !selectedSequenceId}
                  className="icon-button-forensic h-9 px-3 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50 flex items-center text-[10px] font-mono uppercase tracking-wider"
                >
                  <RotateCcw className={cn('w-3.5 h-3.5 mr-2', loading && 'animate-spin')} />
                  Refresh
                </button>
                <button
                  onClick={onClose}
                  className="icon-button-forensic h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
                  title="Close"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            {(loading || summary) && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 p-4 border-b border-white/10 bg-black/20">
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="bg-black/40 border border-white/5 rounded-lg p-2.5">
                      <div className="h-2 w-14 bg-white/10 rounded animate-pulse mb-2" />
                      <div className="h-3.5 w-8 bg-white/10 rounded animate-pulse" />
                    </div>
                  ))
                ) : (
                  <>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Members</div>
                      <div className="text-sm font-mono text-zinc-100 tabular-nums">{summary?.totalMembers ?? 0}</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Active</div>
                      <div className="text-sm font-mono text-emerald-400 tabular-nums">{summary?.activeMembers ?? 0}</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Paused</div>
                      <div className="text-sm font-mono text-amber-400 tabular-nums">{summary?.pausedMembers ?? 0}</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Completed</div>
                      <div className="text-sm font-mono text-zinc-100 tabular-nums">{summary?.completedMembers ?? 0}</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Queued</div>
                      <div className="text-sm font-mono text-sky-400 tabular-nums">{summary?.queuedExecutions ?? 0}</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Running</div>
                      <div className="text-sm font-mono text-[#002FA7] tabular-nums">{summary?.runningExecutions ?? 0}</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Failed</div>
                      <div className="text-sm font-mono text-red-400 tabular-nums">{summary?.failedExecutions ?? 0}</div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="p-4 max-h-[58vh] overflow-auto np-scroll scroll-smooth">
              {!loading && error && (
                <div className="h-40 flex items-center justify-center">
                  <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3">
                    {error}
                  </div>
                </div>
              )}

              {!loading && !error && rows.length === 0 && (
                <div className="h-40 flex items-center justify-center text-zinc-500 font-mono text-[11px] uppercase tracking-widest">
                  No active contacts in this sequence yet.
                </div>
              )}

              {(loading || (!error && rows.length > 0)) && (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full min-w-[1150px]">
                    <thead className="bg-black/40 border-b border-white/10 sticky top-0 z-10">
                      <tr className="text-left">
                        <th className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Contact</th>
                        <th className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Company</th>
                        <th className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Member Status</th>
                        <th className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Current Step</th>
                        <th className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Execution</th>
                        <th className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Scheduled</th>
                        <th className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Signals</th>
                        <th className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-white/5 last:border-0">
                            <td className="px-3 py-2.5">
                              <div className="h-3.5 w-28 bg-white/10 rounded animate-pulse mb-1.5" />
                              <div className="h-2.5 w-20 bg-white/5 rounded animate-pulse" />
                            </td>
                            <td className="px-3 py-2.5"><div className="h-3.5 w-24 bg-white/10 rounded animate-pulse" /></td>
                            <td className="px-3 py-2.5"><div className="h-3.5 w-16 bg-white/10 rounded animate-pulse" /></td>
                            <td className="px-3 py-2.5"><div className="h-3.5 w-20 bg-white/10 rounded animate-pulse" /></td>
                            <td className="px-3 py-2.5">
                              <div className="h-3.5 w-20 bg-white/10 rounded animate-pulse mb-1.5" />
                              <div className="h-2.5 w-12 bg-white/5 rounded animate-pulse" />
                            </td>
                            <td className="px-3 py-2.5"><div className="h-3.5 w-24 bg-white/10 rounded animate-pulse" /></td>
                            <td className="px-3 py-2.5"><div className="h-3.5 w-20 bg-white/10 rounded animate-pulse" /></td>
                            <td className="px-3 py-2.5"><div className="h-3.5 w-20 bg-white/10 rounded animate-pulse" /></td>
                          </tr>
                        ))
                      ) : (
                        rows.map((row) => {
                          const fullName = `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.email || 'Unknown';
                          const currentStep = row.currentNodeLabel || row.currentNodeId || '-';
                          const executionLabel = row.executionLabel || row.executionStepType || '-';
                          const signals = `${row.totalEmailsSent}E / ${row.totalOpens}O / ${row.totalClicks}C / ${row.totalReplies}R`;
                          return (
                            <tr key={row.memberId} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                              <td className="px-3 py-2.5">
                                <div className="text-sm text-zinc-100">{fullName}</div>
                                <div className="text-[10px] font-mono text-zinc-500 truncate">{row.title || row.email || '-'}</div>
                              </td>
                              <td className="px-3 py-2.5 text-sm text-zinc-300">{row.accountName || '-'}</td>
                              <td className="px-3 py-2.5">
                                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-200">{row.memberStatus || '-'}</span>
                              </td>
                              <td className="px-3 py-2.5 text-sm text-zinc-200">{currentStep}</td>
                              <td className="px-3 py-2.5">
                                <div className="text-sm text-zinc-100">{executionLabel}</div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{row.executionStatus || '-'}</div>
                              </td>
                              <td className="px-3 py-2.5 text-sm text-zinc-300">{formatTimestamp(row.executionScheduledAt)}</td>
                              <td className="px-3 py-2.5 text-[11px] font-mono text-zinc-300 tabular-nums">{signals}</td>
                              <td className="px-3 py-2.5 text-sm text-zinc-400">{formatTimestamp(row.updatedAt)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
