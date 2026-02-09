'use client'

import { TrendingUp, Users, Radio, Loader2 } from 'lucide-react'
import { useApolloSignals, type ApolloSignal } from '@/hooks/useApolloSignals'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

function formatRelativeTime(iso: string | null): string {
  if (!iso) return ''
  try {
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
  } catch {
    return ''
  }
}

function signalIcon(categories: string[]) {
  const c = categories.map((x) => x?.toLowerCase?.()).filter(Boolean)
  if (c.some((x) => x.includes('funding') || x.includes('investment')))
    return <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
  if (c.some((x) => x.includes('hires') || x.includes('hire')))
    return <Users className="w-3 h-3 text-[#002FA7] shrink-0" />
  return <Radio className="w-3 h-3 text-zinc-500 shrink-0" />
}

interface SignalStreamProps {
  accountId: string | undefined
}

async function analyzeSignal(headline: string, snippet?: string): Promise<string> {
  const res = await fetch('/api/ai/analyze-signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headline, snippet }),
  })
  if (!res.ok) throw new Error('Analysis failed')
  const data = (await res.json()) as { summary?: string }
  return data.summary ?? 'No summary available.'
}

export default function SignalStream({ accountId }: SignalStreamProps) {
  const { data: signals = [], isLoading, isError } = useApolloSignals(accountId)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)

  const handleDelta = useCallback(async (item: ApolloSignal) => {
    setAnalyzingId(item.id)
    try {
      const summary = await analyzeSignal(item.title, item.snippet || undefined)
      toast.success(summary, { duration: 6000 })
    } catch {
      toast.error('Impact analysis unavailable')
    } finally {
      setAnalyzingId(null)
    }
  }, [])

  return (
    <div className="w-full bg-black/20 border-t border-white/5 border-b border-white/5 border-l border-white/5 border-r border-white/5 backdrop-blur-sm mb-4 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          TARGET_SIGNALS
        </span>
        <span className="flex items-center gap-1.5 text-emerald-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-mono uppercase tracking-widest">Live</span>
        </span>
      </div>
      <div
        className="max-h-[180px] overflow-y-auto overflow-x-hidden np-scroll"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {isLoading && signals.length === 0 ? (
          <div className="flex items-center justify-center py-6 gap-2 text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-[9px] font-mono uppercase tracking-widest">Scanning...</span>
          </div>
        ) : isError ? (
          <div className="py-4 px-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            NO_ACTIVE_SIGNALS_DETECTED
          </div>
        ) : signals.length === 0 ? (
          <div className="py-4 px-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            NO_ACTIVE_SIGNALS_DETECTED
          </div>
        ) : (
          signals.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between p-3 hover:bg-black/30 transition-colors cursor-default border-b border-white/5 last:border-0"
            >
              <div className="flex items-center min-w-0 flex-1 gap-3">
                {signalIcon(item.event_categories)}
                <div className="flex flex-col ml-0 flex-1 min-w-0">
                  <span className="text-xs text-zinc-200 truncate font-medium block">
                    {item.title}
                  </span>
                  <span className="text-[10px] text-zinc-600 font-mono mt-0.5">
                    {item.domain ? `${item.domain} · ` : ''}
                    {formatRelativeTime(item.published_at)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  handleDelta(item)
                }}
                disabled={analyzingId === item.id}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-7 h-7 rounded-[14px] bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center text-[10px] font-mono text-zinc-300 hover:text-white disabled:opacity-50"
                title="Analyze Impact"
              >
                {analyzingId === item.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Δ'
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
