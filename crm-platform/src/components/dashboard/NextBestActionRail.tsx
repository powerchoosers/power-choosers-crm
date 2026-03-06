'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useExpiringAccounts } from '@/hooks/useExpiringAccounts'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useTasks } from '@/hooks/useTasks'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { supabase } from '@/lib/supabase'

type ActionCandidate = {
  id: string
  name: string
  domain: string | null
  logo_url: string | null
  daysLeft: number
  score: number
  hasPendingCriticalTask: boolean
}

export function NextBestActionRail() {
  const router = useRouter()
  const { data: expiringAccounts = [], isLoading: isLoadingAccounts } = useExpiringAccounts(true)
  const { data: metrics, isLoading: isLoadingMetrics } = useDashboardMetrics()
  const { data: tasksData, isLoading: isLoadingTasks } = useTasks()
  const accountIds = useMemo(() => expiringAccounts.map((a) => a.id), [expiringAccounts])
  const { data: recentlyContactedAccounts, isLoading: isLoadingRecentContacts } = useQuery<Set<string>>({
    queryKey: ['next-best-action-recent-contacted-accounts', accountIds.slice().sort().join(',')],
    queryFn: async () => {
      if (!accountIds.length) return new Set<string>()

      const sinceISO = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString()

      const [accountsRes, contactsRes, callsRes] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, phone')
          .in('id', accountIds),
        supabase
          .from('contacts')
          .select('id, accountId, phone, mobile, workPhone, otherPhone')
          .in('accountId', accountIds),
        supabase
          .from('calls')
          .select('accountId, contactId, from, to, timestamp')
          .gte('timestamp', sinceISO)
          .order('timestamp', { ascending: false })
          .limit(5000),
      ])

      if (accountsRes.error) {
        console.error('NextBestActionRail recent contact accounts query error:', accountsRes.error)
      }
      if (contactsRes.error) {
        console.error('NextBestActionRail recent contact contacts query error:', contactsRes.error)
      }
      if (callsRes.error) {
        console.error('NextBestActionRail recent contact calls query error:', callsRes.error)
      }

      const contacted = new Set<string>()
      const accountSet = new Set(accountIds)
      const contacts = contactsRes.data ?? []

      const normalizePhone = (value: unknown): string | null => {
        if (typeof value !== 'string') return null
        const digits = value.replace(/\D/g, '')
        if (!digits) return null
        return digits.slice(-10)
      }

      const contactToAccount = new Map<string, string>()
      const phoneToAccounts = new Map<string, Set<string>>()

      for (const account of accountsRes.data ?? []) {
        if (!account?.id || !accountSet.has(account.id)) continue
        const normalized = normalizePhone(account.phone)
        if (!normalized) continue
        const existing = phoneToAccounts.get(normalized) ?? new Set<string>()
        existing.add(account.id)
        phoneToAccounts.set(normalized, existing)
      }

      for (const contact of contacts) {
        if (!contact?.id || !contact?.accountId || !accountSet.has(contact.accountId)) continue
        contactToAccount.set(contact.id, contact.accountId)

        const phoneFields = [contact.phone, contact.mobile, contact.workPhone, contact.otherPhone]
        for (const raw of phoneFields) {
          const normalized = normalizePhone(raw)
          if (!normalized) continue
          const existing = phoneToAccounts.get(normalized) ?? new Set<string>()
          existing.add(contact.accountId)
          phoneToAccounts.set(normalized, existing)
        }
      }

      for (const call of callsRes.data ?? []) {
        const accountId = call.accountId ?? undefined
        const contactId = call.contactId ?? undefined

        if (accountId && accountSet.has(accountId)) {
          contacted.add(accountId)
          continue
        }

        if (contactId) {
          const mapped = contactToAccount.get(contactId)
          if (mapped) {
            contacted.add(mapped)
            continue
          }
        }

        const fromNum = normalizePhone(call.from)
        const toNum = normalizePhone(call.to)
        const matched = new Set<string>()
        if (fromNum && phoneToAccounts.has(fromNum)) {
          for (const id of phoneToAccounts.get(fromNum) ?? []) matched.add(id)
        }
        if (toNum && phoneToAccounts.has(toNum)) {
          for (const id of phoneToAccounts.get(toNum) ?? []) matched.add(id)
        }
        for (const id of matched) contacted.add(id)
      }

      return contacted
    },
    enabled: accountIds.length > 0,
    staleTime: 1000 * 60 * 2,
    refetchInterval: 60 * 1000,
  })

  const pendingCriticalByAccount = useMemo(() => {
    const map = new Map<string, boolean>()
    const tasks = tasksData?.pages.flatMap((page) => page.tasks) ?? []

    for (const task of tasks) {
      if (!task.accountId) continue
      if (task.status === 'Completed') continue
      if (task.priority !== 'High' && task.priority !== 'Protocol') continue
      map.set(task.accountId, true)
    }

    return map
  }, [tasksData])

  const best = useMemo<ActionCandidate | null>(() => {
    if (!expiringAccounts.length) return null

    const highVolatility = (metrics?.gridVolatilityIndex ?? 0) > 70

    const eligibleAccounts = expiringAccounts.filter((account) => {
      return !recentlyContactedAccounts?.has(account.id)
    })

    if (!eligibleAccounts.length) return null

    const scored = eligibleAccounts.map((account) => {
      let score = 0

      if (account.daysLeft <= 30) score += 100
      else if (account.daysLeft <= 60) score += 60
      else score += 25

      if (highVolatility) score += 20

      const hasPendingCriticalTask = pendingCriticalByAccount.get(account.id) === true
      if (hasPendingCriticalTask) score += 15

      return {
        id: account.id,
        name: account.name,
        domain: account.domain ?? null,
        logo_url: account.logo_url ?? null,
        daysLeft: account.daysLeft,
        score,
        hasPendingCriticalTask,
      }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored[0] ?? null
  }, [expiringAccounts, recentlyContactedAccounts, metrics?.gridVolatilityIndex, pendingCriticalByAccount])

  const isLoading = isLoadingAccounts || isLoadingMetrics || isLoadingTasks || isLoadingRecentContacts
  const volatility = metrics?.gridVolatilityIndex ?? 0
  const highVolatility = volatility > 70

  const risk = useMemo(() => {
    if (!best) return 'No eligible account (contacted within last 7D)'
    const base = `${best.daysLeft}D to contract expiry`
    if (highVolatility) return `${base} + elevated ERCOT stress`
    return base
  }, [best, highVolatility])

  const move = useMemo(() => {
    if (!best) return 'Monitor and wait for next qualifying trigger'
    if (best.daysLeft <= 30) return 'Open dossier and schedule renewal call'
    if (highVolatility && best.hasPendingCriticalTask) return 'Call stakeholder and execute active protocol task'
    if (highVolatility) return 'Send volatility advisory and book hedge review'
    return 'Queue proactive contract review'
  }, [best, highVolatility])

  return (
    <button
      type="button"
      onClick={() => {
        if (best) router.push(`/network/accounts/${best.id}`)
      }}
      disabled={!best}
      className="group w-full nodal-void-card px-4 py-3 md:px-6 md:py-4 text-left transition-all duration-200 ease-out hover:scale-[1.01] hover:border-white/20 disabled:cursor-default disabled:hover:scale-100 disabled:hover:border-white/5"
      aria-label={best ? `Open account dossier for ${best.name}` : 'No next best action available'}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-center gap-3">
          <CompanyIcon
            logoUrl={best?.logo_url ?? undefined}
            domain={best?.domain ?? undefined}
            name={best?.name ?? 'No Account'}
            size={32}
            className="w-8 h-8 flex-shrink-0"
          />

          <div className="min-w-0 flex-1">
            <div className="text-[9px] md:text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-1.5 text-left">
              Next_Best_Action
            </div>
            {isLoading ? (
              <div className="h-4 w-4/5 bg-white/5 rounded animate-pulse" />
            ) : (
              <p className="text-xs md:text-sm font-mono text-zinc-200 truncate text-left">
                <span className="font-sans text-zinc-100">{best?.name ?? 'None'}</span>
                <span className="text-zinc-500 px-2">•</span>
                <span>{risk}</span>
                <span className="text-zinc-500 px-2">•</span>
                <span className="text-[#002FA7]">{move}</span>
              </p>
            )}
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-white flex-shrink-0">
          <span className="text-[10px] font-mono uppercase tracking-widest">OPEN_DOSSIER</span>
          <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:translate-x-1" />
        </div>
      </div>
    </button>
  )
}
