'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { useAuth } from '@/context/AuthContext'
import { useAgentProgress } from '@/hooks/useAgentProgress'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { UserCog } from 'lucide-react'

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

function statusTone(status?: string | null) {
  const value = String(status || '').toLowerCase()
  if (value.includes('active')) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
  if (value.includes('warm')) return 'bg-amber-500/15 text-amber-400 border-amber-500/20'
  if (value.includes('stale')) return 'bg-rose-500/15 text-rose-400 border-rose-500/20'
  if (value.includes('idle') || value.includes('no data')) return 'bg-white/5 text-zinc-500 border-white/10'
  return 'bg-white/5 text-zinc-400 border-white/10'
}

export default function AgentsPage() {
  const { role, loading } = useAuth()
  const [globalFilter, setGlobalFilter] = useState('')
  const reportQuery = useAgentProgress()
  const report = reportQuery.data

  const visibleAgents = useMemo(() => {
    const agents = report?.agents ?? []
    const term = globalFilter.trim().toLowerCase()
    if (!term) return agents

    return agents.filter((agent) => {
      const haystack = [
        agent.displayName,
        agent.email,
        agent.title,
        agent.territory,
        agent.role,
        agent.status,
        agent.kind,
        agent.assignedPhoneNumber,
        agent.assignedEmailAddress,
        ...(agent.twilioNumbers || []).map((entry) => `${entry.name || ''} ${entry.number || ''}`),
      ].map((value) => String(value || '').toLowerCase()).join(' | ')

      return haystack.includes(term)
    })
  }, [report?.agents, globalFilter])

  const isPrivileged = role === 'admin' || role === 'dev'

  if (!loading && !isPrivileged) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="nodal-glass rounded-3xl border border-white/5 p-8 max-w-xl w-full">
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Access Restricted</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Agents</h1>
          <p className="mt-2 text-zinc-400">
            This section is for admin review only.
          </p>
        </div>
      </div>
    )
  }

  const totals = report?.totals
  const errorMessage = reportQuery.error instanceof Error ? reportQuery.error.message : 'Unable to load agent progress.'

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CollapsiblePageHeader
        title="Agents"
        description="Owner rollup for calls, emails, and bills. Bills are inferred from the account that owns them until document ownership is explicit."
        globalFilter={globalFilter}
        onSearchChange={setGlobalFilter}
        placeholder="Search owners, roles, territory..."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          ['Owners', totals?.owners],
          ['Accounts', totals?.accounts],
          ['Contacts', totals?.contacts],
          ['Calls', totals?.calls],
          ['Emails', totals?.emails],
          ['Bills', totals?.bills],
          ['Numbers', totals?.assignedNumbers],
        ].map(([label, value]) => (
          <div key={String(label)} className="nodal-glass rounded-2xl border border-white/5 p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">{label}</div>
            <div className="mt-3 text-3xl font-mono text-white tabular-nums">
              {value == null ? '—' : formatCount(Number(value))}
            </div>
          </div>
        ))}
      </div>

      {reportQuery.isError ? (
        <div className="nodal-glass rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-red-400/80 font-mono">Load Failed</div>
            <div className="mt-2 text-zinc-100 font-medium">Could not load the agent rollup.</div>
            <p className="mt-1 text-sm text-zinc-400">{errorMessage}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => reportQuery.refetch()}
            className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div className="nodal-void-card overflow-hidden border border-white/5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Roster</div>
            <div className="mt-1 text-sm text-zinc-400">
              {reportQuery.isFetching ? 'Refreshing live rollup' : `Updated ${report?.generatedAt ? formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true }) : 'moments ago'}`}
            </div>
          </div>
          <Badge className={cn('border uppercase tracking-[0.2em] text-[10px] font-mono', 'bg-white/5 text-zinc-400 border-white/10')}>
            Live
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-white/5">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Owner</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Title</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Role</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Territory</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Accounts</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Calls</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Emails</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Bills</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Numbers</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Last Activity</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-zinc-500">
                    Loading agent rollup...
                  </TableCell>
                </TableRow>
              ) : reportQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-red-400">
                    {errorMessage}
                  </TableCell>
                </TableRow>
              ) : visibleAgents.length > 0 ? (
                visibleAgents.map((agent) => (
                   <TableRow key={agent.key} className="border-white/5 hover:bg-white/[0.02]">
                    <TableCell className="py-4">
                      <Link href={`/network/agents/${encodeURIComponent(agent.key)}`} className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg nodal-glass border border-white/5 flex items-center justify-center shrink-0 overflow-hidden bg-zinc-900">
                          {agent.photoUrl ? (
                            <img src={agent.photoUrl} alt={agent.displayName} className="w-full h-full object-cover" />
                          ) : (
                            <UserCog className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-zinc-100 whitespace-nowrap">{agent.displayName}</span>
                          {agent.email ? (
                            <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[220px]">
                              {agent.email}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-300 whitespace-nowrap">{agent.title || '—'}</TableCell>
                    <TableCell className="text-zinc-400 whitespace-nowrap">{agent.role || '—'}</TableCell>
                    <TableCell className="text-zinc-400 whitespace-nowrap">{agent.territory || '—'}</TableCell>
                    <TableCell className="text-zinc-300 font-mono tabular-nums">{formatCount(agent.accountCount)}</TableCell>
                    <TableCell className="text-zinc-300 font-mono tabular-nums">{formatCount(agent.callCount)}</TableCell>
                    <TableCell className="text-zinc-300 font-mono tabular-nums">{formatCount(agent.emailCount)}</TableCell>
                    <TableCell className="text-zinc-300 font-mono tabular-nums">{formatCount(agent.billCount)}</TableCell>
                    <TableCell className="text-zinc-300 font-mono tabular-nums">{formatCount(agent.activeNumbers)}</TableCell>
                    <TableCell className="text-zinc-400 whitespace-nowrap">{formatActivity(agent.lastActivityAt)}</TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] font-mono', statusTone(agent.status))}>
                        {agent.status || '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-zinc-500">
                    No agents matched the current search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
