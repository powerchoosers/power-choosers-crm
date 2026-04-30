'use client'

import { useMemo, useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isValid } from 'date-fns'
import { Copy, ExternalLink, Loader2, RefreshCcw, Search, Sparkles, TrendingUp, MessageSquare, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isPrivilegedRole } from '@/lib/auth/roles'

const FALLBACK_MESSAGE = 'No recent signals found for this account. Try again later or check the source manually.'
const EMPTY_MESSAGE = 'No intelligence brief generated yet. Click Research to run research.'
const RESEARCH_COOLDOWN_MS = 60 * 60 * 1000

type IntelligenceBriefStatus = 'idle' | 'ready' | 'empty' | 'error' | string | null

export interface IntelligenceBriefAccount {
  id: string
  name?: string | null
  intelligenceBriefHeadline?: string | null
  intelligenceBriefDetail?: string | null
  intelligenceBriefTalkTrack?: string | null
  intelligenceBriefSignalDate?: string | null
  intelligenceBriefReportedAt?: string | null
  intelligenceBriefSourceUrl?: string | null
  intelligenceBriefConfidenceLevel?: string | null
  intelligenceBriefLastRefreshedAt?: string | null
  intelligenceBriefStatus?: IntelligenceBriefStatus
}

interface IntelligenceBriefProps {
  account: IntelligenceBriefAccount | null | undefined
  className?: string
}

type RefreshPayload = {
  account?: IntelligenceBriefAccount
  message?: string
}

function getHumanDate(value: string | null | undefined) {
  if (!value) return null

  let date: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date = new Date(`${value}T12:00:00`)
  } else {
    date = new Date(value)
  }

  if (!isValid(date)) return null

  return format(date, 'MMMM d, yyyy')
}

function getClockLabel(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (!isValid(date)) return null
  return format(date, 'MMMM d, yyyy \'at\' h:mm a')
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : (process.env.NODE_ENV === 'development' ? { Authorization: 'Bearer dev-bypass-token' } : {})
}

function buildClipboardText(account: IntelligenceBriefAccount) {
  const parts = [
    account.intelligenceBriefHeadline ? `Signal Headline: ${account.intelligenceBriefHeadline}` : '',
    account.intelligenceBriefDetail ? `Signal Detail: ${account.intelligenceBriefDetail}` : '',
    account.intelligenceBriefTalkTrack ? `Talk Track: ${account.intelligenceBriefTalkTrack}` : '',
  ].filter(Boolean)

  return parts.join('\n\n')
}

function confidenceTone(level: string | null | undefined) {
  const normalized = String(level || '').trim().toLowerCase()
  if (normalized === 'high') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
  if (normalized === 'medium') return 'border-amber-500/25 bg-amber-500/10 text-amber-300'
  if (normalized === 'low') return 'border-red-500/25 bg-red-500/10 text-red-300'
  return 'border-white/10 bg-white/5 text-zinc-400'
}

// Animated text component with smooth character-by-character reveal
function AnimatedText({ text, delay = 0, speed = 15 }: { text: string; delay?: number; speed?: number }) {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    setDisplayedText('')
    setIsComplete(false)
    
    const timeout = setTimeout(() => {
      let currentIndex = 0
      const interval = setInterval(() => {
        if (currentIndex <= text.length) {
          setDisplayedText(text.slice(0, currentIndex))
          currentIndex++
        } else {
          setIsComplete(true)
          clearInterval(interval)
        }
      }, speed)

      return () => clearInterval(interval)
    }, delay)

    return () => clearTimeout(timeout)
  }, [text, delay, speed])

  return (
    <span className={cn('inline', !isComplete && 'animate-pulse-subtle')}>
      {displayedText}
      {!isComplete && <span className="inline-block w-0.5 h-4 bg-white ml-0.5 animate-blink" />}
    </span>
  )
}

// Format text with bullet points and better structure
function formatDetailText(text: string) {
  // Split by sentences and add structure
  const sentences = text.split(/\.\s+/).filter(Boolean)
  
  if (sentences.length <= 2) {
    return <p className="text-sm leading-7 text-zinc-200">{text}</p>
  }

  return (
    <div className="space-y-3">
      {sentences.map((sentence, idx) => (
        <div key={idx} className="flex items-start gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-white/50 mt-2.5 shrink-0" />
          <p className="text-sm leading-7 text-zinc-200">{sentence.trim()}.</p>
        </div>
      ))}
    </div>
  )
}

export function IntelligenceBrief({ account, className }: IntelligenceBriefProps) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const [showContent, setShowContent] = useState(false)
  const isPrivilegedUser = isPrivilegedRole(role)

  const refreshMutation = useMutation<RefreshPayload>({
    mutationFn: async () => {
      if (!account?.id) throw new Error('Missing account ID')

      const headers = await getAuthHeaders()
      const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/intelligence-brief`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      })

      const payload = await response.json().catch(() => null)

      if (response.status === 401 || response.status === 403) {
        throw new Error(payload?.message || 'You do not have permission to refresh this account.')
      }

      if (response.status === 429) {
        throw new Error(payload?.message || 'This account was refreshed recently. Please wait before trying again.')
      }

      if (payload?.account) {
        queryClient.setQueriesData({ queryKey: ['account', account.id] }, (cached: any) => (
          cached?.id === account.id ? { ...cached, ...payload.account } : cached
        ))
      }

      if (!response.ok && !payload?.account) {
        throw new Error(payload?.message || 'Research failed.')
      }

      return payload
    },
    onSuccess: (payload) => {
      if (!account?.id || !payload?.account) return
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.some((part) => part === account.id),
      })
      // Trigger animation after successful refresh
      setShowContent(false)
      setTimeout(() => setShowContent(true), 100)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Research failed.'
      toast.error(message)
    },
  })

  const displayAccount = useMemo(() => (
    refreshMutation.data?.account ? { ...account, ...refreshMutation.data.account } : account
  ), [account, refreshMutation.data?.account])

  const brief = useMemo(() => ({
    headline: displayAccount?.intelligenceBriefHeadline?.trim() || '',
    detail: displayAccount?.intelligenceBriefDetail?.trim() || '',
    talkTrack: displayAccount?.intelligenceBriefTalkTrack?.trim() || '',
    signalDate: displayAccount?.intelligenceBriefSignalDate || null,
    reportedAt: displayAccount?.intelligenceBriefReportedAt || null,
    sourceUrl: displayAccount?.intelligenceBriefSourceUrl?.trim() || '',
    confidenceLevel: displayAccount?.intelligenceBriefConfidenceLevel?.trim() || '',
    lastRefreshedAt: displayAccount?.intelligenceBriefLastRefreshedAt || null,
    status: displayAccount?.intelligenceBriefStatus || 'idle',
  }), [displayAccount])

  const hasBrief = Boolean(brief.headline || brief.detail || brief.talkTrack)
  const isCooldownActive = Boolean(
    !isPrivilegedUser &&
    brief.lastRefreshedAt &&
    (Date.now() - new Date(brief.lastRefreshedAt).getTime()) < RESEARCH_COOLDOWN_MS
  )
  const canRefresh = !!displayAccount?.id && !isCooldownActive
  const isFallbackState = brief.status === 'empty' || brief.status === 'error'
  const primaryActionLabel = refreshMutation.isPending
    ? (hasBrief ? 'Refreshing' : 'Researching')
    : (hasBrief ? 'Refresh' : 'Research')

  // Trigger initial animation on mount if there's content
  useEffect(() => {
    if (hasBrief && !isFallbackState) {
      setShowContent(true)
    }
  }, [hasBrief, isFallbackState])

  const handleCopy = async () => {
    if (!hasBrief || !displayAccount || isFallbackState) return
    try {
      await navigator.clipboard.writeText(buildClipboardText(displayAccount))
      toast.success('Copied to clipboard.')
    } catch {
      toast.error('Copy failed.')
    }
  }

  return (
    <div className={cn(
      'nodal-void-card transition-all duration-500 p-6 relative overflow-hidden shadow-lg space-y-4',
      className
    )}>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-white" />
            Intelligence Brief
          </h3>
          <p className="mt-1 text-[11px] font-mono text-zinc-600">
            {brief.lastRefreshedAt ? `Last updated ${getClockLabel(brief.lastRefreshedAt)}` : 'Last updated not yet refreshed'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            disabled={!canRefresh || refreshMutation.isPending || !account?.id}
            onClick={() => refreshMutation.mutate()}
            className="bg-[#002FA7] text-white hover:bg-[#0039cc] border border-[#002FA7]/40 shadow-[0_0_0_1px_rgba(0,47,167,0.1)]"
          >
            {refreshMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {primaryActionLabel}
              </>
            ) : (
              <>
                {hasBrief ? <RefreshCcw className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                {primaryActionLabel}
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasBrief || isFallbackState}
            onClick={handleCopy}
            className="border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {refreshMutation.isPending && (
        <div className="rounded-2xl border border-[#002FA7]/15 bg-[#002FA7]/10 px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <Loader2 className="w-4 h-4 animate-spin text-white" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">
              Researching {displayAccount?.name || 'this account'}…
            </p>
            <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
              Pulling public signals from news, web search, LinkedIn, SEC filings, and company pages
            </p>
          </div>
        </div>
      )}

      {/* Fallback State */}
      {!refreshMutation.isPending && isFallbackState && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-sm text-amber-100">{FALLBACK_MESSAGE}</p>
        </div>
      )}

      {/* Empty State */}
      {!refreshMutation.isPending && !hasBrief && !isFallbackState && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/90 p-5 animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-sm text-zinc-300">{EMPTY_MESSAGE}</p>
        </div>
      )}

      {/* Content */}
      {!refreshMutation.isPending && hasBrief && showContent && (
        <div className="space-y-4">
          {/* Signal Headline */}
          <section className={cn(
            'rounded-2xl border border-white/5 bg-zinc-950/90 p-5',
            'animate-in fade-in slide-in-from-top-2 duration-500'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-white" />
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                Signal Headline
              </div>
            </div>
            <h4 className="text-lg leading-7 text-white font-semibold">
              <AnimatedText text={brief.headline} delay={0} speed={12} />
            </h4>
          </section>

          {/* Signal Detail */}
          <section className={cn(
            'rounded-2xl border border-white/5 bg-zinc-950/90 p-5',
            'animate-in fade-in slide-in-from-top-2 duration-500 delay-100'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-white" />
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                Signal Detail
              </div>
            </div>
            <div className="prose prose-invert prose-sm max-w-none">
              {formatDetailText(brief.detail)}
            </div>
          </section>

          {/* Talk Track */}
          <section className={cn(
            'rounded-2xl border border-[#002FA7]/20 bg-gradient-to-br from-[#002FA7]/10 to-[#002FA7]/5 p-5',
            'animate-in fade-in slide-in-from-top-2 duration-500 delay-200'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-white" />
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-white">
                Talk Track
              </div>
            </div>
            <blockquote className="text-sm leading-7 text-white italic border-l-2 border-[#002FA7]/40 pl-4">
              "{brief.talkTrack}"
            </blockquote>
          </section>

          {/* Metadata Grid */}
          <div className={cn(
            'grid gap-3 md:grid-cols-2 xl:grid-cols-4',
            'animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300'
          )}>
            <div className="rounded-2xl border border-white/5 bg-zinc-950/90 p-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-2">
                Published / announced
              </div>
              <p className="text-sm font-medium text-zinc-100">
                {getHumanDate(brief.reportedAt) || 'Not set'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-zinc-950/90 p-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-2">
                Signal Date
              </div>
              <p className="text-sm font-medium text-zinc-100">
                {getHumanDate(brief.signalDate) || 'Not set'}
              </p>
            </div>

            <div className={cn('rounded-2xl border p-4', confidenceTone(brief.confidenceLevel))}>
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] mb-2">
                Confidence
              </div>
              <p className="text-sm font-medium">
                {brief.confidenceLevel ? brief.confidenceLevel.charAt(0).toUpperCase() + brief.confidenceLevel.slice(1).toLowerCase() : 'Not set'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-zinc-950/90 p-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-2">
                Source
              </div>
              {brief.sourceUrl ? (
                <a
                  href={brief.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-white break-all transition-colors"
                >
                  View source
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 text-current transition-colors group-hover:text-white" />
                </a>
              ) : (
                <p className="text-sm text-zinc-500">Not set</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
