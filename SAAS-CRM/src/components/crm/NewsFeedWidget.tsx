'use client'

import { ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

/** Format ISO date as relative time (e.g. "2h ago", "1d ago") */
function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffM = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)
  if (diffM < 60) return `${diffM}m ago`
  if (diffH < 24) return `${diffH}h ago`
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString()
}

interface EnergyNewsItem {
  title: string
  url?: string
  publishedAt?: string
  source?: string
}

interface EnergyNewsResponse {
  lastRefreshed?: string
  items: EnergyNewsItem[]
}

async function fetchEnergyNews(): Promise<EnergyNewsResponse> {
  const res = await fetch('/api/energy-news')
  if (!res.ok) throw new Error('Failed to fetch energy news')
  return res.json()
}

export default function NewsFeedWidget() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['energy-news'],
    queryFn: fetchEnergyNews,
    staleTime: 10 * 60 * 1000, // 10 min
    refetchOnWindowFocus: false,
  })

  const items = data?.items ?? []

  if (isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-4 text-rose-500/90 text-[11px] font-mono">
        <AlertCircle size={14} />
        <span>{error?.message ?? 'System_Feed unavailable'}</span>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-[11px] font-mono text-zinc-600 py-4">
        No energy news items available.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((item, i) => (
          <a
            key={item.url ?? `${i}-${item.title?.slice(0, 20)}`}
            href={item.url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="group block p-3 rounded-xl nodal-module-glass nodal-monolith-edge hover:border-white/10 transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="text-[11px] font-medium text-zinc-300 group-hover:text-white leading-tight">
                {item.title}
              </h4>
              <ExternalLink size={10} className="text-zinc-600 group-hover:text-zinc-400 shrink-0" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-zinc-600 uppercase">{item.source ?? 'Energy Intel'}</span>
              <span className="text-[9px] font-mono text-zinc-700">
                {item.publishedAt ? formatRelativeTime(item.publishedAt) : '—'}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
