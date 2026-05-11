'use client'

import { useMemo, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Building2,
  Clock,
  FileText,
  Hash,
  Mail,
  Phone,
  RotateCcw,
  UserCog,
  Users,
  ArrowLeft,
  Activity,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAgentProgress } from '@/hooks/useAgentProgress'
import { LoadingOrb } from '@/components/ui/LoadingOrb'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'
import type { TwilioNumberRecord } from '@/types/agents'

function formatCount(value?: number | null) {
  return new Intl.NumberFormat('en-US').format(value || 0)
}

function formatActivity(value?: string | null) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
    return daysAgo <= 30 ? formatDistanceToNow(date, { addSuffix: true }) : format(date, 'MMM d, yyyy')
  } catch {
    return value
  }
}

function formatExactDate(value?: string | null) {
  if (!value) return '—'
  try {
    return format(new Date(value), 'MMM d, yyyy h:mm a')
  } catch {
    return value
  }
}

function kindLabel(kind?: string | null) {
  switch (kind) {
    case 'human':
      return 'Human'
    case 'inbox':
      return 'Inbox'
    case 'raw':
      return 'Raw Owner'
    default:
      return 'Unassigned'
  }
}

function kindTone(kind?: string | null) {
  switch (kind) {
    case 'human':
      return 'bg-[#002FA7]/15 text-blue-300 border-[#002FA7]/30'
    case 'inbox':
      return 'bg-white/5 text-zinc-400 border-white/10'
    case 'raw':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    default:
      return 'bg-white/5 text-zinc-500 border-white/10'
  }
}

function statusTone(status?: string | null) {
  const value = String(status || '').toLowerCase()
  if (value.includes('active')) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
  if (value.includes('warm')) return 'bg-amber-500/15 text-amber-400 border-amber-500/20'
  if (value.includes('stale')) return 'bg-rose-500/15 text-rose-400 border-rose-500/20'
  if (value.includes('idle') || value.includes('no data')) return 'bg-white/5 text-zinc-500 border-white/10'
  return 'bg-white/5 text-zinc-400 border-white/10'
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string
  value: number | string
  detail?: string
  icon: ReactNode
}) {
  return (
    <div className="nodal-glass rounded-2xl border border-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">{label}</div>
        <div className="text-zinc-500">{icon}</div>
      </div>
      <div className="mt-3 text-3xl font-mono text-white tabular-nums">{value}</div>
      {detail ? <div className="mt-2 text-xs text-zinc-500">{detail}</div> : null}
    </div>
  )
}

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = (params?.id as string) || ''
  const { role, loading: authLoading } = useAuth()
  const reportQuery = useAgentProgress(agentId)
  const report = reportQuery.data
  const agent = report?.agents?.[0] ?? null
  const isPrivileged = role === 'admin' || role === 'dev'
  const errorMessage = reportQuery.error instanceof Error ? reportQuery.error.message : 'Unable to load agent progress.'

  const twilioLines = useMemo(() => {
    const lines = new Map<string, TwilioNumberRecord>()
    for (const line of agent?.twilioNumbers || []) {
      if (!line?.number) continue
      lines.set(line.number, line)
    }

    const primaryLine = agent?.assignedPhoneNumber?.trim()
    if (primaryLine && !lines.has(primaryLine)) {
      lines.set(primaryLine, {
        name: 'Primary line',
        number: primaryLine,
        selected: true,
      })
    }

    return Array.from(lines.values())
  }, [agent?.assignedPhoneNumber, agent?.twilioNumbers])

  const ownerAliases = useMemo(() => {
    const values = new Set<string>()
    const preferredKey = agent?.key?.trim()
    if (preferredKey) values.add(preferredKey)

    for (const alias of agent?.aliases || []) {
      const value = String(alias || '').trim()
      // Filter out raw UUID codes from the aliases list
      if (value && value !== agent?.userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        values.add(value)
      }
    }

    return Array.from(values)
  }, [agent?.aliases, agent?.key, agent?.userId])

  if (!authLoading && !isPrivileged) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="nodal-glass rounded-3xl border border-white/5 p-8 max-w-xl w-full">
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Access Restricted</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Agents</h1>
          <p className="mt-2 text-zinc-400">This section is for admin review only.</p>
        </div>
      </div>
    )
  }

  if (authLoading || reportQuery.isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <LoadingOrb label="Loading Agent Progress..." />
      </div>
    )
  }

  if (reportQuery.isError) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <div className="nodal-glass rounded-3xl border border-red-500/20 bg-red-500/[0.03] p-8 max-w-2xl w-full">
          <div className="text-[10px] uppercase tracking-[0.3em] text-red-400/80 font-mono">Load Failed</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Agent progress could not be loaded</h1>
          <p className="mt-2 text-zinc-400">{errorMessage}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => reportQuery.refetch()}
              className="bg-[#002FA7] hover:bg-[#002FA7]/90 text-white"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/network/agents')}
              className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
            >
              Back to Agents
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center gap-4 animate-in fade-in duration-500 px-4">
        <div className="font-mono text-zinc-500">AGENT NOT FOUND</div>
        <Button onClick={() => router.push('/network/agents')}>Return to Agents</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#002FA7]/10 blur-[120px] rounded-full pointer-events-none" />

        {/* Dossier Header */}
        <header className="flex-none px-6 py-6 md:px-8 border-b border-white/5 nodal-recessed relative z-10">
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <button
                onClick={() => router.push('/network/agents')}
                className="flex-none icon-button-forensic w-10 h-10 flex items-center justify-center -ml-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="flex-1 min-w-0 flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl nodal-glass border border-white/5 flex items-center justify-center shrink-0 overflow-hidden bg-zinc-900">
                  {agent.photoUrl ? (
                    <img
                      src={agent.photoUrl}
                      alt={agent.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserCog className="w-6 h-6 text-zinc-300" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-semibold tracking-tighter text-white">
                      <ForensicDataPoint
                        value={agent.displayName ?? ''}
                        copyValue={agent.displayName ?? undefined}
                        valueClassName="text-2xl font-semibold tracking-tighter text-white"
                        inline
                        compact
                      />
                    </h1>
                    
                    <Badge className={cn('border uppercase tracking-[0.2em] text-[10px] font-mono', kindTone(agent.kind))}>
                      {kindLabel(agent.kind)}
                    </Badge>
                    
                    {agent.status ? (
                      <Badge className={cn('border uppercase tracking-[0.2em] text-[10px] font-mono', statusTone(agent.status))}>
                        {agent.status}
                      </Badge>
                    ) : null}

                    {agent.role ? (
                      <Badge className="border border-white/10 bg-white/5 text-zinc-300 uppercase tracking-[0.2em] text-[10px] font-mono">
                        {agent.role}
                      </Badge>
                    ) : null}

                    {agent.territory ? (
                      <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                        {agent.territory}
                      </Badge>
                    ) : null}
                  </div>
                  
                  <div className="flex items-center gap-1.5 uppercase tracking-widest text-zinc-400">
                    <Hash className="w-3 h-3 text-white shrink-0" />
                    <span className="text-[10px] font-mono">{agent.key}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-none shrink-0 text-right">
              <div className="flex flex-col items-end gap-1">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Dossier Status</div>
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full animate-pulse bg-green-500" />
                    <span className="text-xs font-mono uppercase tracking-widest text-green-500">
                        ACTIVE_INTELLIGENCE
                    </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Panels */}
        <div className="flex-1 flex overflow-hidden relative z-10 group/dossier">
          <div className="grid grid-cols-12 w-full h-full">

            {/* Left Panel: Identity & Physics */}
            <div className="col-span-3 h-full overflow-y-auto p-6 border-r border-white/5 np-scroll bg-black/10">
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-700">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] mb-4">01 // Identity</div>
                
                <div className="nodal-void-card border-white/10 p-6 relative overflow-hidden shadow-lg space-y-6">
                    <div>
                        <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Display Name</div>
                        <div className="text-xl font-semibold tracking-tighter text-white">
                            <ForensicDataPoint value={agent.displayName || '--'} valueClassName="text-xl font-semibold tracking-tighter text-white" inline />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Owner Key</div>
                            <div className="text-sm font-mono tracking-tighter text-zinc-300 break-all">
                                <ForensicDataPoint value={agent.key || '--'} valueClassName="text-sm font-mono tabular-nums text-zinc-300" inline />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                        <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Owner Type</div>
                        <Badge className={cn('border uppercase tracking-[0.2em] text-[10px] font-mono mt-1', kindTone(agent.kind))}>
                            {kindLabel(agent.kind)}
                        </Badge>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                        <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Aliases</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {ownerAliases.length > 0 ? (
                            ownerAliases.map((alias) => (
                                <Badge
                                key={alias}
                                className="border border-white/10 bg-white/5 text-zinc-400 font-mono text-[10px] uppercase tracking-[0.2em]"
                                >
                                {alias}
                                </Badge>
                            ))
                            ) : (
                            <span className="text-zinc-500 text-xs font-mono">No alternate keys</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] mb-4 mt-8">Contact Physics</div>
                <div className="nodal-void-card border-white/10 p-6 relative overflow-hidden shadow-lg space-y-6">
                    <div>
                        <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Email Identity</div>
                        {agent.assignedEmailAddress || agent.email ? (
                        <a
                            href={`mailto:${agent.assignedEmailAddress || agent.email || ''}`}
                            className="mt-2 block text-zinc-100 font-medium break-all hover:text-white transition-colors"
                        >
                            {agent.assignedEmailAddress || agent.email}
                        </a>
                        ) : (
                        <div className="mt-2 text-zinc-500 text-xs font-mono">NO_EMAIL_ASSIGNED</div>
                        )}
                    </div>
                    
                    <div className="pt-4 border-t border-white/5">
                        <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Primary Line</div>
                        {agent.assignedPhoneNumber ? (
                        <a
                            href={`tel:${agent.assignedPhoneNumber}`}
                            className="mt-2 block text-zinc-100 font-medium font-mono tabular-nums break-all hover:text-white transition-colors"
                        >
                            {agent.assignedPhoneNumber}
                        </a>
                        ) : (
                        <div className="mt-2 text-zinc-500 text-xs font-mono">NO_PRIMARY_LINE</div>
                        )}
                    </div>
                </div>
              </div>
            </div>

            {/* Middle Panel: Telemetry & Log */}
            <div className="col-span-6 h-full overflow-y-auto p-6 border-r border-white/5 np-scroll">
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">02 // Telemetry</div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    SYNCED: {report?.generatedAt ? formatExactDate(report.generatedAt).toUpperCase() : 'MOMENTS AGO'}
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <MetricCard label="Accounts Owned" value={formatCount(agent.accountCount)} icon={<Building2 className="h-4 w-4" />} />
                    <MetricCard label="People Owned" value={formatCount(agent.contactCount)} icon={<Users className="h-4 w-4" />} />
                    <MetricCard label="Twilio Lines" value={formatCount(agent.activeNumbers)} icon={<Hash className="h-4 w-4" />} />
                </div>

                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] mb-4 mt-8">Activity Ledger</div>
                <div className="nodal-void-card border-white/10 p-6 relative overflow-hidden shadow-2xl flex flex-col font-mono">
                  <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4 relative z-10">
                      <div className="flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-zinc-400" />
                          <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-400">
                              FORENSIC_ENGAGEMENT_STREAM
                          </h3>
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                      <div className="flex items-start justify-between">
                          <div>
                              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Last Telemetry Active</div>
                              <div className="mt-2 text-zinc-100 font-medium">
                                  {agent.lastActivityAt ? formatActivity(agent.lastActivityAt) : 'No recent telemetry'}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">Tasks, calls, emails, and intake combined.</div>
                          </div>
                      </div>

                      <div className="pt-4 border-t border-white/5 flex items-start justify-between">
                          <div>
                              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Outbound Calls</div>
                              <div className="text-zinc-300">
                                  {agent.lastCallAt ? `Last active ${formatActivity(agent.lastCallAt)}` : 'No calls logged'}
                              </div>
                          </div>
                          <Badge className="border border-white/10 bg-white/5 text-zinc-400 font-mono">
                              {formatCount(agent.callCount)}
                          </Badge>
                      </div>

                      <div className="pt-4 border-t border-white/5 flex items-start justify-between">
                          <div>
                              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Email Transmission</div>
                              <div className="text-zinc-300">
                                  {agent.lastEmailAt ? `Last active ${formatActivity(agent.lastEmailAt)}` : 'No emails logged'}
                              </div>
                          </div>
                          <Badge className="border border-white/10 bg-white/5 text-zinc-400 font-mono">
                              {formatCount(agent.emailCount)}
                          </Badge>
                      </div>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] mb-4 mt-8">Intake Metrics</div>
                <div className="nodal-void-card border-white/10 p-6 relative overflow-hidden shadow-2xl flex flex-col font-mono">
                  <div className="grid grid-cols-3 gap-6">
                      <div>
                          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Total Intake</div>
                          <div className="text-3xl font-mono text-zinc-100">{formatCount(agent.billCount)}</div>
                          <div className="text-xs text-zinc-500 mt-1">Processed</div>
                      </div>
                      <div>
                          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Invoices</div>
                          <div className="text-3xl font-mono text-zinc-100">{formatCount(agent.invoiceCount)}</div>
                          <div className="text-xs text-zinc-500 mt-1">Parsed</div>
                      </div>
                      <div>
                          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Usage Data</div>
                          <div className="text-3xl font-mono text-zinc-100">{formatCount(agent.usageCount)}</div>
                          <div className="text-xs text-zinc-500 mt-1">Meter arrays</div>
                      </div>
                  </div>
                  {agent.lastBillAt && (
                      <div className="mt-6 pt-4 border-t border-white/5">
                          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Last Intake Event</div>
                          <div className="text-zinc-300">{formatExactDate(agent.lastBillAt)}</div>
                      </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel: Infrastructure */}
            <div className="col-span-3 h-full overflow-y-auto p-6 np-scroll">
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">03 // Infrastructure</span>
                </div>

                <div className="nodal-void-card border-white/10 relative overflow-hidden shadow-lg p-0">
                  <div className="px-5 py-4 border-b border-white/5 relative z-10">
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-400">Twilio Network</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    {twilioLines.length > 0 ? (
                      twilioLines.map((line, index) => (
                        <div key={`${line.number}-${index}`} className="rounded-xl border border-white/5 bg-black/20 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-zinc-100">
                                {line.name?.trim() || `Line ${index + 1}`}
                              </div>
                              <div className="mt-1 text-xs font-mono text-zinc-500 tabular-nums break-all">
                                {line.number}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {line.selected ? (
                                <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                                  Primary
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-[10px] font-mono text-zinc-500 border border-white/5 rounded-xl p-4 text-center">
                        NO_ACTIVE_LINES_FOUND
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
