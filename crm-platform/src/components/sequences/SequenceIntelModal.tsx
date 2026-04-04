'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { GitMerge } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useGeminiStore } from '@/store/geminiStore'
import { buildProtocolContext } from '@/lib/protocol-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { ForensicRefresh } from '@/components/ui/ForensicRefresh'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { useUIStore } from '@/store/uiStore'

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
  avatarUrl: string | null
  accountId: string | null
  accountName: string | null
  accountDomain: string | null
  accountLogoUrl: string | null
  updatedAt: string | null
  totalEmailsSent: number
  totalOpens: number
  totalClicks: number
  totalReplies: number
  executionStatus: string | null
  executionStepType: string | null
  executionScheduledAt: string | null
  executionLabel: string | null
  nextActionLabel: string | null
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

function MemberStatusBadge({ status }: { status: string | null }) {
  const s = (status || '').toLowerCase()
  const config: Record<string, { label: string; color: string }> = {
    active:    { label: 'Active',     color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    paused:    { label: 'Paused',     color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    completed: { label: 'Completed',  color: 'text-zinc-400 bg-white/5 border-white/10' },
    failed:    { label: 'Failed',     color: 'text-red-400 bg-red-500/10 border-red-500/20' },
    removed:   { label: 'Removed',    color: 'text-zinc-500 bg-white/5 border-white/10' },
  }
  const { label, color } = config[s] ?? { label: status || '-', color: 'text-zinc-400 bg-white/5 border-white/10' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded border text-[9px] font-mono uppercase tracking-widest whitespace-nowrap', color)}>
      {label}
    </span>
  )
}

function ExecStatusBadge({ status }: { status: string | null }) {
  const s = (status || '').toLowerCase()
  const config: Record<string, { label: string; color: string }> = {
    queued:    { label: 'Queued',   color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
    running:   { label: 'Running',  color: 'text-[#002FA7] bg-[#002FA7]/10 border-[#002FA7]/20' },
    waiting:   { label: 'Waiting',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    done:      { label: 'Done',     color: 'text-zinc-400 bg-white/5 border-white/10' },
    completed: { label: 'Done',     color: 'text-zinc-400 bg-white/5 border-white/10' },
    failed:    { label: 'Failed',   color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  }
  const { label, color } = config[s] ?? { label: status || '-', color: 'text-zinc-500 bg-white/5 border-white/10' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded border text-[9px] font-mono uppercase tracking-widest whitespace-nowrap', color)}>
      {label}
    </span>
  )
}

const TH = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th className={cn('px-4 py-2.5 text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em] text-left whitespace-nowrap', className)}>
    {children}
  </th>
)

export function SequenceIntelModal({ isOpen, onClose, sequenceId }: SequenceIntelModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<SequenceMemberRow[]>([])
  const [name, setName] = useState('')
  const [summary, setSummary] = useState<SequenceIntelSummary | null>(null)
  const [isClient, setIsClient] = useState(false)

  const [availableSequences, setAvailableSequences] = useState<{ id: string; name: string }[]>([])
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null)
  const requestTokenRef = useRef(0)
  const setGeminiContext = useGeminiStore((state) => state.setContext)
  const setActiveSequenceId = useUIStore((state) => state.setActiveSequenceId)

  useEffect(() => { setIsClient(true) }, [])

  useEffect(() => {
    if (sequenceId) setSelectedSequenceId(sequenceId)
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
    const requestToken = ++requestTokenRef.current
    setLoading(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('Please log in again. Session token is missing.')

      const response = await fetch(`/api/protocols/${targetId}/sequence-intel`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await response.json() as SequenceIntelResponse
      if (!response.ok) throw new Error(data?.error || 'Failed to load sequence intel')
      if (requestToken !== requestTokenRef.current) return

      setRows(Array.isArray(data.rows) ? data.rows : [])
      setSummary(data.summary || null)
      setName(data.sequence?.name || '')

      const { data: sequenceRecord, error: sequenceError } = await supabase
        .from('sequences')
        .select('*')
        .eq('id', targetId)
        .single()
      if (requestToken !== requestTokenRef.current) return
      if (!sequenceError && sequenceRecord) {
        setGeminiContext(buildProtocolContext(sequenceRecord, { protocolId: targetId }))
      }
    } catch (err: any) {
      if (requestToken !== requestTokenRef.current) return
      setRows([])
      setSummary(null)
      setName('')
      setError(err?.message || 'Failed to load sequence intel')
    } finally {
      if (requestToken !== requestTokenRef.current) return
      setLoading(false)
    }
  }, [setGeminiContext])

  useEffect(() => {
    if (isOpen) {
      if (selectedSequenceId) fetchIntel(selectedSequenceId)
      else fetchProtocols()
    }
  }, [isOpen, selectedSequenceId, fetchIntel, fetchProtocols])

  useEffect(() => {
    if (!isOpen) {
      setGeminiContext(null)
      setActiveSequenceId(null)
      return
    }
    if (selectedSequenceId) {
      setActiveSequenceId(selectedSequenceId)
    }
    return () => setGeminiContext(null)
  }, [isOpen, selectedSequenceId, setActiveSequenceId, setGeminiContext])

  const formatTimestamp = (value?: string | null) => {
    if (!value) return '-'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return '-'
    return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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
            className="w-full max-w-[1240px] max-h-[88vh] nodal-monolith-edge bg-zinc-950/95 border border-white/10 rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.65)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="px-6 py-5 border-b border-white/10 bg-black/30 flex items-center justify-between flex-none">
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
                  <Select value={selectedSequenceId || ''} onValueChange={(val) => setSelectedSequenceId(val)}>
                    <SelectTrigger className="h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[10px] font-mono text-zinc-300 hover:text-white transition-all uppercase tracking-wider focus:ring-0 focus:ring-offset-0 focus:outline-none ring-0 outline-none w-[240px] gap-2 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <GitMerge className="w-3 h-3 text-white" />
                        <SelectValue placeholder="Switch Protocol" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-white/10 text-white min-w-[240px] shadow-2xl backdrop-blur-xl z-[200]">
                      <div className="px-2 py-1.5 text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/5 mb-1 bg-white/5 flex items-center gap-2">
                        Available Protocols
                      </div>
                      {availableSequences.map(seq => (
                        <SelectItem
                          key={seq.id}
                          value={seq.id}
                          className="text-[10px] font-mono focus:bg-[#002FA7]/20 cursor-pointer py-2"
                        >
                          {seq.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ForensicRefresh
                  onClick={() => selectedSequenceId && fetchIntel(selectedSequenceId)}
                  loading={loading}
                  disabled={loading || !selectedSequenceId}
                />
                <ForensicClose onClick={onClose} size={18} />
              </div>
            </div>

            {/* ── Summary Stats ── */}
            {(loading || summary) && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 p-4 border-b border-white/10 bg-black/20 flex-none">
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

            {/* ── Table ── */}
            <div className="flex-1 min-h-0 overflow-auto np-scroll scroll-smooth">
              {!loading && error && (
                <div className="h-40 flex items-center justify-center p-6">
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
                <table className="w-full min-w-[1080px]">
                  <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm border-b border-white/5">
                    <tr>
                      <TH className="pl-5">Contact</TH>
                      <TH>Company</TH>
                      <TH>Status</TH>
                      <TH>Current Step</TH>
                      <TH>Next Action</TH>
                      <TH>Queue Status</TH>
                      <TH>Scheduled</TH>
                      <TH>Signals</TH>
                      <TH className="pr-5">Updated</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          {/* Contact skeleton with avatar */}
                          <td className="px-4 py-3 pl-5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-[10px] bg-white/10 animate-pulse shrink-0" />
                              <div>
                                <div className="h-3 w-28 bg-white/10 rounded animate-pulse mb-1.5" />
                                <div className="h-2.5 w-20 bg-white/5 rounded animate-pulse" />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-[8px] bg-white/10 animate-pulse shrink-0" />
                              <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
                            </div>
                          </td>
                          <td className="px-4 py-3"><div className="h-4 w-16 bg-white/10 rounded animate-pulse" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-20 bg-white/10 rounded animate-pulse" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-20 bg-white/10 rounded animate-pulse" /></td>
                          <td className="px-4 py-3"><div className="h-4 w-14 bg-white/10 rounded animate-pulse" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-20 bg-white/10 rounded animate-pulse" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-24 bg-white/5 rounded animate-pulse" /></td>
                          <td className="px-4 py-3 pr-5"><div className="h-3 w-16 bg-white/5 rounded animate-pulse" /></td>
                        </tr>
                      ))
                    ) : (
                      rows.map((row, i) => {
                        const fullName = `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.email || 'Unknown'
                        const currentStep = row.currentNodeLabel || row.currentNodeId || '-'
                        const executionLabel = row.nextActionLabel || row.executionLabel || row.executionStepType || '-'
                        return (
                          <motion.tr
                            key={row.memberId}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                            className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors group"
                          >
                            {/* Contact */}
                            <td className="px-4 py-3 pl-5">
                              <Link
                                href={`/network/contacts/${row.contactId}`}
                                className="flex items-center gap-2.5 group/contact"
                                onClick={onClose}
                              >
                                <ContactAvatar
                                  name={fullName}
                                  photoUrl={row.avatarUrl ?? undefined}
                                  size={32}
                                  className="shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-zinc-200 group-hover/contact:text-white group-hover/contact:scale-[1.02] transition-all origin-left whitespace-nowrap truncate max-w-[160px]">
                                    {fullName}
                                  </div>
                                  <div className="text-[10px] font-mono text-zinc-500 truncate max-w-[160px]">
                                    {row.title || row.email || '-'}
                                  </div>
                                </div>
                              </Link>
                            </td>

                            {/* Company */}
                            <td className="px-4 py-3">
                              {row.accountId ? (
                                <Link
                                  href={`/network/accounts/${row.accountId}`}
                                  className="flex items-center gap-2.5 group/company"
                                  onClick={onClose}
                                >
                                  <CompanyIcon
                                    name={row.accountName || ''}
                                    logoUrl={row.accountLogoUrl ?? undefined}
                                    domain={row.accountDomain ?? undefined}
                                    size={28}
                                    className="shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-300 group-hover/company:text-white group-hover/company:scale-[1.02] transition-all origin-left whitespace-nowrap truncate max-w-[140px]">
                                      {row.accountName || '-'}
                                    </div>
                                    {row.accountDomain && (
                                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider truncate max-w-[140px]">
                                        {row.accountDomain}
                                      </div>
                                    )}
                                  </div>
                                </Link>
                              ) : (
                                <span className="text-sm text-zinc-500">-</span>
                              )}
                            </td>

                            {/* Member Status */}
                            <td className="px-4 py-3">
                              <MemberStatusBadge status={row.memberStatus} />
                            </td>

                            {/* Current Step */}
                            <td className="px-4 py-3">
                              <span className="text-sm text-zinc-300 whitespace-nowrap truncate max-w-[180px] block">
                                {currentStep}
                              </span>
                            </td>

                            {/* Execution Label */}
                            <td className="px-4 py-3">
                              <span className="text-sm text-zinc-300 whitespace-nowrap truncate max-w-[160px] block">
                                {executionLabel}
                              </span>
                            </td>

                            {/* Exec Status */}
                            <td className="px-4 py-3">
                              <ExecStatusBadge status={row.executionStatus} />
                            </td>

                            {/* Scheduled */}
                            <td className="px-4 py-3">
                              <span className="text-sm text-zinc-400 whitespace-nowrap font-mono tabular-nums">
                                {formatTimestamp(row.executionScheduledAt)}
                              </span>
                            </td>

                            {/* Signals */}
                            <td className="px-4 py-3">
                              <span className="text-[11px] font-mono text-zinc-400 tabular-nums whitespace-nowrap">
                                {row.totalEmailsSent}E&nbsp;&nbsp;{row.totalOpens}O&nbsp;&nbsp;{row.totalClicks}C&nbsp;&nbsp;{row.totalReplies}R
                              </span>
                            </td>

                            {/* Updated */}
                            <td className="px-4 py-3 pr-5">
                              <span className="text-sm text-zinc-500 whitespace-nowrap">
                                {formatTimestamp(row.updatedAt)}
                              </span>
                            </td>
                          </motion.tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
