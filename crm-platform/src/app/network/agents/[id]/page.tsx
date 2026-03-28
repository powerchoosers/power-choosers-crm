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
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAgentProgress } from '@/hooks/useAgentProgress'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { LoadingOrb } from '@/components/ui/LoadingOrb'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
      if (value) values.add(value)
    }

    return Array.from(values)
  }, [agent?.aliases, agent?.key])

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
      <div className="flex flex-col h-[60vh] items-center justify-center space-y-4 animate-in fade-in duration-500">
        <LoadingOrb label="Loading Agent Progress..." />
      </div>
    )
  }

  if (reportQuery.isError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
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
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="nodal-glass rounded-3xl border border-white/5 p-8 max-w-xl w-full">
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Not Found</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Agent not found</h1>
          <p className="mt-2 text-zinc-400">
            There is no agent row for <span className="font-mono text-zinc-200">{agentId || 'this id'}</span>.
          </p>
          <Button
            onClick={() => router.push('/network/agents')}
            className="mt-6 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white"
          >
            Back to Agents
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CollapsiblePageHeader
        backHref="/network/agents"
        title={
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight text-white truncate">
                {agent.displayName}
              </h1>
              <Badge className={cn('border uppercase tracking-[0.2em] text-[10px] font-mono', kindTone(agent.kind))}>
                {kindLabel(agent.kind)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
          </div>
        }
        description={
          <div className="text-zinc-500 mt-1">
            <span className="font-mono text-zinc-400">Owner key:</span>{' '}
            <span className="font-mono text-zinc-300">{agent.key}</span>
            {'  '}·{'  '}
            Refreshed {report?.generatedAt ? formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true }) : 'moments ago'}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="xl:col-span-8 nodal-void-card overflow-hidden border border-white/5 relative">
          <div className="absolute top-0 right-0 w-72 h-72 bg-[#002FA7]/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="p-6 md:p-8 border-b border-white/5">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Owner Record</div>
                  <div className="mt-3 flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl nodal-glass border border-white/5 flex items-center justify-center shrink-0">
                      <UserCog className="w-8 h-8 text-zinc-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-4xl md:text-5xl font-semibold tracking-tight text-white break-words">
                        {agent.displayName}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {agent.email ? (
                          <Badge className="border border-white/10 bg-white/5 text-zinc-300 uppercase tracking-[0.2em] text-[10px] font-mono">
                            {agent.email}
                          </Badge>
                        ) : null}
                        {agent.assignedEmailAddress && agent.assignedEmailAddress !== agent.email ? (
                          <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                            {agent.assignedEmailAddress}
                          </Badge>
                        ) : null}
                        {agent.title ? (
                          <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                            {agent.title}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-full max-w-sm nodal-glass rounded-2xl border border-white/5 p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Live Snapshot</div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MetricCard label="Accounts" value={formatCount(agent.accountCount)} icon={<Building2 className="h-4 w-4" />} />
                    <MetricCard label="Contacts" value={formatCount(agent.contactCount)} icon={<Users className="h-4 w-4" />} />
                    <MetricCard label="Calls" value={formatCount(agent.callCount)} icon={<Phone className="h-4 w-4" />} />
                    <MetricCard label="Emails" value={formatCount(agent.emailCount)} icon={<Mail className="h-4 w-4" />} />
                    <MetricCard
                      label="Bills"
                      value={formatCount(agent.billCount)}
                      icon={<FileText className="h-4 w-4" />}
                      detail={`${formatCount(agent.invoiceCount)} invoices + ${formatCount(agent.usageCount)} usage docs`}
                    />
                    <MetricCard
                      label="Lines"
                      value={formatCount(agent.activeNumbers)}
                      icon={<Hash className="h-4 w-4" />}
                      detail="Twilio assigned"
                    />
                  </div>
                  <div className="mt-4 rounded-xl border border-white/5 bg-black/20 p-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">
                      <Clock className="h-3.5 w-3.5" />
                      Last Activity
                    </div>
                    <div className="mt-2 text-sm text-zinc-100 font-medium">{formatActivity(agent.lastActivityAt)}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Generated {report?.generatedAt ? formatExactDate(report.generatedAt) : 'moments ago'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Email</div>
                  {agent.assignedEmailAddress || agent.email ? (
                    <a
                      href={`mailto:${agent.assignedEmailAddress || agent.email || ''}`}
                      className="mt-2 block text-zinc-100 font-medium break-all hover:text-white transition-colors"
                    >
                      {agent.assignedEmailAddress || agent.email}
                    </a>
                  ) : (
                    <div className="mt-2 text-zinc-500">No email assigned</div>
                  )}
                </div>
                <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Primary Line</div>
                  {agent.assignedPhoneNumber ? (
                    <a
                      href={`tel:${agent.assignedPhoneNumber}`}
                      className="mt-2 block text-zinc-100 font-medium font-mono tabular-nums break-all hover:text-white transition-colors"
                    >
                      {agent.assignedPhoneNumber}
                    </a>
                  ) : (
                    <div className="mt-2 text-zinc-500">No Twilio line assigned</div>
                  )}
                </div>
                <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Owner Key</div>
                  <div className="mt-2 text-zinc-100 font-medium font-mono break-all">{agent.key}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {agent.userId ? `User ID ${agent.userId}` : 'No linked user id'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 p-6 md:p-8">
            <MetricCard
              label="Accounts Owned"
              value={formatCount(agent.accountCount)}
              icon={<Building2 className="h-4 w-4" />}
              detail="Companies under this owner"
            />
            <MetricCard
              label="People Owned"
              value={formatCount(agent.contactCount)}
              icon={<Users className="h-4 w-4" />}
              detail="Contacts mapped to this owner"
            />
            <MetricCard
              label="Calls Logged"
              value={formatCount(agent.callCount)}
              icon={<Phone className="h-4 w-4" />}
              detail={agent.lastCallAt ? `Last call ${formatActivity(agent.lastCallAt)}` : 'No calls yet'}
            />
            <MetricCard
              label="Emails Sent"
              value={formatCount(agent.emailCount)}
              icon={<Mail className="h-4 w-4" />}
              detail={agent.lastEmailAt ? `Last email ${formatActivity(agent.lastEmailAt)}` : 'No emails yet'}
            />
            <MetricCard
              label="Bills Ingested"
              value={formatCount(agent.billCount)}
              icon={<FileText className="h-4 w-4" />}
              detail={agent.lastBillAt ? `Last bill ${formatActivity(agent.lastBillAt)}` : 'No bill intake yet'}
            />
            <MetricCard
              label="Twilio Lines"
              value={formatCount(agent.activeNumbers)}
              icon={<Hash className="h-4 w-4" />}
              detail="Active numbers assigned"
            />
          </div>
        </section>

        <aside className="xl:col-span-4 space-y-6">
          <div className="nodal-glass rounded-2xl border border-white/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Twilio Lines</div>
            <div className="mt-4 space-y-3">
              {twilioLines.length > 0 ? (
                twilioLines.map((line, index) => (
                  <div key={`${line.number}-${index}`} className="rounded-2xl border border-white/5 bg-black/20 p-4">
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
                <div className="rounded-2xl border border-white/5 bg-black/20 p-4 text-zinc-500">
                  No Twilio numbers are assigned to this owner.
                </div>
              )}
            </div>
          </div>

          <div className="nodal-glass rounded-2xl border border-white/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Ownership Trail</div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Owner Type</div>
                <div className="mt-2">
                  <Badge className={cn('border uppercase tracking-[0.2em] text-[10px] font-mono', kindTone(agent.kind))}>
                    {kindLabel(agent.kind)}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Aliases</div>
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
                    <span className="text-zinc-500">No alternate keys found.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="nodal-void-card overflow-hidden border border-white/5">
          <div className="px-5 py-4 border-b border-white/5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Bill Intake</div>
            <div className="mt-1 text-sm text-zinc-400">
              Bills are counted from the accounts this owner controls until documents carry a direct owner field.
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Total" value={formatCount(agent.billCount)} icon={<FileText className="h-4 w-4" />} />
              <MetricCard label="Invoices" value={formatCount(agent.invoiceCount)} icon={<FileText className="h-4 w-4" />} />
              <MetricCard label="Usage Data" value={formatCount(agent.usageCount)} icon={<FileText className="h-4 w-4" />} />
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Last Bill Ingested</div>
              <div className="mt-2 text-zinc-100 font-medium">
                {agent.lastBillAt ? formatActivity(agent.lastBillAt) : 'No bills ingested yet'}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {agent.lastBillAt ? formatExactDate(agent.lastBillAt) : 'Waiting for bill ingestion'}
              </div>
            </div>
          </div>
        </section>

        <section className="nodal-void-card overflow-hidden border border-white/5">
          <div className="px-5 py-4 border-b border-white/5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Activity Ledger</div>
            <div className="mt-1 text-sm text-zinc-400">
              Recent touch points by channel.
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="rounded-2xl border border-white/5 bg-black/20 p-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Last Call</div>
                <div className="mt-2 text-zinc-100 font-medium">
                  {agent.lastCallAt ? formatActivity(agent.lastCallAt) : 'No calls logged'}
                </div>
              </div>
              <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                {formatCount(agent.callCount)}
              </Badge>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 p-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Last Email</div>
                <div className="mt-2 text-zinc-100 font-medium">
                  {agent.lastEmailAt ? formatActivity(agent.lastEmailAt) : 'No emails logged'}
                </div>
              </div>
              <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                {formatCount(agent.emailCount)}
              </Badge>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 p-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Last Activity</div>
                <div className="mt-2 text-zinc-100 font-medium">
                  {agent.lastActivityAt ? formatActivity(agent.lastActivityAt) : 'No activity recorded'}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Includes tasks, calls, emails, and bills.
                </div>
              </div>
              <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                {formatCount(agent.taskCount)}
              </Badge>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
