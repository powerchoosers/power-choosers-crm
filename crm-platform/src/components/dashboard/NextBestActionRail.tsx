'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { useExpiringAccounts } from '@/hooks/useExpiringAccounts'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useTasks } from '@/hooks/useTasks'

type ActionCandidate = {
  id: string
  name: string
  daysLeft: number
  score: number
  hasPendingCriticalTask: boolean
}

export function NextBestActionRail() {
  const router = useRouter()
  const { data: expiringAccounts = [], isLoading: isLoadingAccounts } = useExpiringAccounts(true)
  const { data: metrics, isLoading: isLoadingMetrics } = useDashboardMetrics()
  const { data: tasksData, isLoading: isLoadingTasks } = useTasks()

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

    const scored = expiringAccounts.map((account) => {
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
        daysLeft: account.daysLeft,
        score,
        hasPendingCriticalTask,
      }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored[0] ?? null
  }, [expiringAccounts, metrics?.gridVolatilityIndex, pendingCriticalByAccount])

  const isLoading = isLoadingAccounts || isLoadingMetrics || isLoadingTasks
  const volatility = metrics?.gridVolatilityIndex ?? 0
  const highVolatility = volatility > 70

  const risk = useMemo(() => {
    if (!best) return 'No immediate contract pressure detected'
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
      className="w-full nodal-void-card px-4 py-3 md:px-6 md:py-4 text-left transition-colors hover:border-[#002FA7]/40 disabled:cursor-default disabled:hover:border-white/5"
      aria-label={best ? `Open account dossier for ${best.name}` : 'No next best action available'}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] md:text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-1.5 text-center md:text-left">
            Next_Best_Action
          </div>
          {isLoading ? (
            <div className="h-4 w-4/5 bg-white/5 rounded animate-pulse" />
          ) : (
            <p className="text-xs md:text-sm font-mono text-zinc-200 truncate text-center md:text-left">
              <span className="font-sans text-zinc-100">{best?.name ?? 'None'}</span>
              <span className="text-zinc-500 px-2">•</span>
              <span>{risk}</span>
              <span className="text-zinc-500 px-2">•</span>
              <span className="text-[#002FA7]">{move}</span>
            </p>
          )}
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-[#002FA7] flex-shrink-0">
          <span className="text-[10px] font-mono uppercase tracking-widest">Open_Dossier</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </button>
  )
}
