'use client'

import { useMemo, useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isValid } from 'date-fns'
import { Copy, ExternalLink, Loader2, RefreshCcw, Search, Sparkles, TrendingUp, MessageSquare, Lightbulb, Code, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { splitIntelligenceBriefSections } from '@/lib/intelligence-brief-context'
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
  industry?: string | null
  city?: string | null
  state?: string | null
  contractEndDate?: string | null
  contract_end_date?: string | null
  metadata?: Record<string, any> | null
  intelligenceBriefHeadline?: string | null
  intelligenceBriefDetail?: string | null
  intelligenceBriefOpener?: string | null
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
  const sections = splitIntelligenceBriefSections(account.intelligenceBriefOpener, account.intelligenceBriefTalkTrack)
  const parts = [
    account.intelligenceBriefHeadline ? `Signal Headline: ${account.intelligenceBriefHeadline}` : '',
    account.intelligenceBriefDetail ? `Signal Detail: ${account.intelligenceBriefDetail}` : '',
    sections.opener ? `Opener: ${sections.opener}` : '',
    sections.talkTrack ? `Talk Track: ${sections.talkTrack}` : '',
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

const ANGLE_DISPLAY_NAMES = {
  budgetCertainty: 'Budget Certainty & Volatility',
  renewalTiming: 'Contract Renewal Timing',
  loadFactor: 'Load Factor & TOU Audit',
  demandResponse: 'Demand Response & Curtailment',
  billingOptimization: 'Billing Errors & Tax Audit',
  esgRenewables: 'ESG & Renewable Strategy'
}

export function IntelligenceBrief({ account, className }: IntelligenceBriefProps) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const [showContent, setShowContent] = useState(false)
  const [showDiscoveryFlow, setShowDiscoveryFlow] = useState(false)
  const [showAllAngles, setShowAllAngles] = useState(false)
  const [activePhase, setActivePhase] = useState(0)
  const [mainCopied, setMainCopied] = useState(false)
  const [copiedAngleKey, setCopiedAngleKey] = useState<string | null>(null)
  const [copiedQuestionText, setCopiedQuestionText] = useState<string | null>(null)
  const [optimisticAngleKey, setOptimisticAngleKey] = useState<string | null>(null)
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

  const updateAngleMutation = useMutation<any, Error, string>({
    mutationFn: async (angleKey: string) => {
      if (!account?.id) throw new Error('Missing account ID')

      const headers = await getAuthHeaders()
      const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/intelligence-brief`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          action: 'select_angle',
          angleKey
        })
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to update angle.')
      }

      if (payload?.account) {
        queryClient.setQueriesData({ queryKey: ['account'] }, (cached: any) => {
          if (cached && typeof cached === 'object' && 'id' in cached && cached.id === account.id) {
            return { ...cached, ...payload.account }
          }
          return cached
        })
      }

      return payload
    },
    onMutate: (angleKey) => {
      setOptimisticAngleKey(angleKey)
    },
    onSuccess: (payload) => {
      setOptimisticAngleKey(null)
      if (!account?.id) return
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.some((part) => part === account.id),
      })
      void queryClient.invalidateQueries({ queryKey: ['account', account.id] })
      toast.success(payload?.message || 'Primary angle updated.')
    },
    onError: (error) => {
      setOptimisticAngleKey(null)
      toast.error(error.message)
    }
  })

  const displayAccount = useMemo(() => {
    let result = account
    if (refreshMutation.data?.account) {
      result = result ? { ...result, ...refreshMutation.data.account } : refreshMutation.data.account
    }
    if (updateAngleMutation.data?.account) {
      result = result ? { ...result, ...updateAngleMutation.data.account } : updateAngleMutation.data.account
    }

    // Apply optimistic update for the selected angle immediately on click
    if (optimisticAngleKey && result?.metadata?.intelligenceBriefAngles?.all?.[optimisticAngleKey]) {
      const selectedAngle = result.metadata.intelligenceBriefAngles.all[optimisticAngleKey]
      result = {
        ...result,
        intelligenceBriefHeadline: selectedAngle.headline || selectedAngle.headline || result.intelligenceBriefHeadline,
        intelligenceBriefTalkTrack: selectedAngle.talk_track || selectedAngle.talkTrack || result.intelligenceBriefTalkTrack,
        metadata: {
          ...result.metadata,
          intelligenceBriefAngles: {
            ...result.metadata?.intelligenceBriefAngles,
            primary: optimisticAngleKey
          }
        }
      }
    }

    return result
  }, [account, refreshMutation.data?.account, updateAngleMutation.data?.account, optimisticAngleKey])

  const brief = useMemo(() => ({
    headline: displayAccount?.intelligenceBriefHeadline?.trim() || '',
    detail: displayAccount?.intelligenceBriefDetail?.trim() || '',
    opener: splitIntelligenceBriefSections(
      displayAccount?.intelligenceBriefOpener || null,
      displayAccount?.intelligenceBriefTalkTrack || null,
    ).opener.trim(),
    talkTrack: splitIntelligenceBriefSections(
      displayAccount?.intelligenceBriefOpener || null,
      displayAccount?.intelligenceBriefTalkTrack || null,
    ).talkTrack.trim(),
    signalDate: displayAccount?.intelligenceBriefSignalDate || null,
    reportedAt: displayAccount?.intelligenceBriefReportedAt || null,
    sourceUrl: displayAccount?.intelligenceBriefSourceUrl?.trim() || '',
    confidenceLevel: displayAccount?.intelligenceBriefConfidenceLevel?.trim() || '',
    lastRefreshedAt: displayAccount?.intelligenceBriefLastRefreshedAt || null,
    status: displayAccount?.intelligenceBriefStatus || 'idle',
  }), [displayAccount])

  const parsedBriefInfo = useMemo(() => {
    const cleanTextLocal = (val: any) => typeof val === 'string' ? val.replace(/\s+/g, ' ').trim() : ''
    const profile = displayAccount?.metadata?.intelligenceProfile as Record<string, any> | null
    const company = cleanTextLocal(displayAccount?.name) || 'this company'
    const locationName = [cleanTextLocal(displayAccount?.city), cleanTextLocal(displayAccount?.state)].filter(Boolean).join(', ') || 'Texas'
    const industryName = (cleanTextLocal(displayAccount?.industry) || 'business').toLowerCase()
    const contractDate = cleanTextLocal(displayAccount?.contractEndDate || displayAccount?.contract_end_date)
    const contractLabel = getHumanDate(contractDate) || 'the current contract'
    const briefText = cleanTextLocal(`${brief.headline} ${brief.detail} ${brief.talkTrack}`).toLowerCase()
    
    const isSchoolBrief = /\b(k-?12|k4-?12|private school|school|students|classrooms|campus hvac|athletics|cafeterias)\b/i.test(briefText)
    let facility = cleanTextLocal(profile?.facilityType || industryName || 'commercial facility').toLowerCase()
    let opModel = cleanTextLocal(profile?.operatingModel || 'how the site runs day to day').toLowerCase()
    if (isSchoolBrief && /\b(church|worship|sanctuary|ministry|religious)\b/i.test(`${facility} ${opModel}`)) {
      facility = 'school campus'
      opModel = 'school campus operations'
    }
    const profileKeywords = Array.isArray(profile?.powerKeywords) && profile.powerKeywords.length > 0
      ? profile.powerKeywords
        .map((k) => cleanTextLocal(k).toLowerCase())
        .filter(Boolean)
        .filter((keyword) => !isSchoolBrief || !/\b(sanctuary|worship|ministry|church)\b/i.test(keyword))
      : []
    const briefKeywords = [
      'HVAC',
      'refrigeration',
      'service bays',
      'kitchen equipment',
      'production equipment',
      'forklift charging',
      'lot lighting',
      'shop cooling',
      'campus HVAC',
      'patient-hour HVAC',
      'warehouse lighting',
    ].filter((term) => briefText.includes(term.toLowerCase()))
    const pKeywords = Array.from(new Set([...profileKeywords, ...briefKeywords])).slice(0, 4)
    const primaryDriver = pKeywords[0] || 'the heavier parts of the operation'
    const secondaryDriver = pKeywords[1] || 'building cooling'
      
    return {
      company,
      locationName,
      industryName,
      facility,
      opModel,
      powerKeywords: pKeywords,
      primaryDriver,
      secondaryDriver,
      contractLabel,
    }
  }, [brief.detail, brief.headline, brief.talkTrack, displayAccount])

  const briefAngles = displayAccount?.metadata?.intelligenceBriefAngles || null
  const alternateAngles = useMemo(() => {
    if (!briefAngles?.all) return []
    return Object.entries(briefAngles.all).map(([key, val]: any) => {
      const isPrimary = key === briefAngles.primary
      const isSecondary = key === briefAngles.secondary
      return {
        key,
        name: ANGLE_DISPLAY_NAMES[key as keyof typeof ANGLE_DISPLAY_NAMES] || key,
        headline: val?.headline || '',
        talkTrack: val?.talk_track || '',
        isPrimary,
        isSecondary
      }
    })
  }, [briefAngles])

  const nepqPhases = useMemo(() => {
    const { company, locationName, facility, opModel, primaryDriver, secondaryDriver, contractLabel } = parsedBriefInfo

    return [
      {
        title: 'Connection',
        label: '01 CONNECTION',
        lens: 'CONNECTION LENS: Keep it low-pressure, confirm how they think about the bill, and get them talking instead of defending.',
        questions: [
          `Just so I’m not making assumptions, when does y'all's current electricity contract come up, or is that date not really on the radar yet?`,
          `On average, rates typically go up 5-10 percent every year. Do you have any idea what they’re making y'all pay per kWh lately?`,
          `When y'all signed the current agreement for ${company}, was the focus mostly the rate, or did anyone look at how ${primaryDriver} and ${secondaryDriver} could move the full bill?`,
          `I know y'all are running a tight ship at ${company}. How does your team usually catch a weird bill month, or does it usually just get processed and moved on?`,
        ]
      },
      {
        title: 'Diagnose',
        label: '02 DISRUPTION',
        lens: 'DISRUPTION LENS: Tie their real daily operation to the bill without turning it into a technical lecture.',
        questions: [
          `What does a normal monthly electric bill look like for ${company} these days, roughly speaking?`,
          `What’s been your experience budgeting the summer bills for ${facility} in ${locationName}? Does it stay pretty predictable, or do certain months come in heavier than expected?`,
          `When ${primaryDriver} and ${secondaryDriver} are both running hard, does anyone know how that shows up on the bill, or is that not something the invoice makes easy to see?`,
          `What was the thinking behind the contract structure y'all have now? Was it built around ${opModel}, or was it more of a standard agreement?`,
        ]
      },
      {
        title: 'Exposure',
        label: '03 LIABILITY',
        lens: 'LIABILITY LENS: Help them feel the cost of leaving the bill on autopilot without sounding alarmist.',
        questions: [
          `If y'all leave the electricity setup exactly as it is and we get another rough Texas summer, what does that do to the budget for ${company}?`,
          `If one rough month from ${primaryDriver} caused charges to stay higher longer than expected, would that be something y'all would want to catch, or would it probably just ride until renewal?`,
          `If the contract expires around ${contractLabel}, how far ahead do y'all usually start looking at options, or does that usually happen closer to the deadline?`,
        ]
      },
      {
        title: 'Contract',
        label: '04 COMMITMENT',
        lens: 'COMMITMENT LENS: Ask for a small next step: one bill, one meter, or a quick contract timing check.',
        questions: [
          `Would it be a bad idea to look at one recent bill together and just see if there’s anything worth paying attention to before the contract gets closer?`,
          `Is it easier for y'all to send one bill over first, or should we set ten minutes and walk through the main meter together?`,
          `If we look and everything is already lined up clean, no harm done. But if there is something buried in the bill, would you want to know now or wait until renewal?`,
        ]
      }
    ]
  }, [parsedBriefInfo])

  const hasBrief = Boolean(brief.headline || brief.detail || brief.opener || brief.talkTrack)
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
      setMainCopied(true)
      setTimeout(() => setMainCopied(false), 1500)
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
          <h3 className="text-[10px] font-sans font-bold text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-white" />
            Intelligence Brief
          </h3>
          <p className="mt-1 text-[11px] font-sans text-zinc-600">
            Last updated {brief.lastRefreshedAt ? <span className="font-mono">{getClockLabel(brief.lastRefreshedAt)}</span> : <span className="font-mono">not yet refreshed</span>}
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
            className="border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white min-w-[75px]"
          >
            {mainCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {mainCopied ? 'Copied' : 'Copy'}
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
              <div className="text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-zinc-500">
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
              <div className="text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-zinc-500">
                Signal Detail
              </div>
            </div>
            <div className="prose prose-invert prose-sm max-w-none">
              {formatDetailText(brief.detail)}
            </div>
          </section>

          {/* Talk Track */}
          <section className={cn(
            'rounded-2xl border border-[#002FA7]/20 bg-[#002FA7]/5 p-5',
            'animate-in fade-in slide-in-from-top-2 duration-500 delay-200'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-white" />
              <div className="text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-white">
                Talk Track
              </div>
            </div>
            <div className="space-y-4">
              {brief.opener ? (
                <div>
                  <div className="mb-2 text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-zinc-400">
                    Opener
                  </div>
                  <blockquote className="text-sm leading-7 text-white italic border-l-2 border-white/20 pl-4">
                    "{brief.opener}"
                  </blockquote>
                </div>
              ) : null}
              <div>
                <div className="mb-2 text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-zinc-400">
                  Talk Track
                </div>
                <blockquote className="text-sm leading-7 text-white italic border-l-2 border-[#002FA7]/40 pl-4">
                  "{brief.talkTrack || 'No separate talk track was generated for this brief.'}"
                </blockquote>
              </div>
            </div>
          </section>

          {/* Alternate Opportunity Angles Section */}
          {alternateAngles.length > 0 && (
            <section className={cn(
              'rounded-2xl border border-white/5 bg-zinc-950/60 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden',
              showAllAngles ? 'shadow-[0_18px_45px_rgba(0,0,0,0.22)]' : 'shadow-none',
              'animate-in fade-in slide-in-from-top-2 duration-500 delay-200'
            )}>
              <div className={cn(
                'flex items-center justify-between p-5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
                showAllAngles ? 'border-b border-white/5 pb-4' : 'border-b border-transparent'
              )}>
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-white" />
                  <div className="text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-zinc-400">
                    Alternate Cost & Risk Angles
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllAngles(!showAllAngles)}
                  className={cn(
                    'overflow-hidden text-xs text-zinc-400 hover:text-white cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
                    showAllAngles ? 'w-24 bg-white/[0.03]' : 'w-32'
                  )}
                >
                  {showAllAngles ? 'Hide Angles' : 'Explore Angles'}
                </Button>
              </div>

              <div className={cn(
                'grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
                showAllAngles ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              )}>
                <div className="min-h-0 overflow-hidden">
                  <div className={cn(
                    'p-5 space-y-4 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
                    showAllAngles ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
                  )}>
                    {alternateAngles.map((angle: any) => {
                      const handleCopyAngle = async () => {
                        const copyText = "Angle: " + angle.name + "\nHeadline: " + angle.headline + "\nTalk Track: " + angle.talkTrack;
                        try {
                          await navigator.clipboard.writeText(copyText);
                          setCopiedAngleKey(angle.key);
                          setTimeout(() => setCopiedAngleKey(null), 1500);
                        } catch {
                          toast.error('Copy failed.');
                        }
                      };

                      return (
                        <div
                          key={angle.key}
                          className={cn(
                            'group relative rounded-xl border p-4 transition-all duration-300',
                            angle.isPrimary 
                              ? 'border-[#002FA7]/40 bg-[#002FA7]/5 hover:border-[#002FA7]/60' 
                              : angle.isSecondary
                              ? 'border-white/10 bg-zinc-950/70 hover:border-white/20'
                              : 'border-white/5 bg-zinc-950/90 hover:border-white/10 hover:bg-zinc-900/40'
                          )}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn(
                                  'text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border',
                                  angle.isPrimary
                                    ? 'border-[#002FA7]/40 bg-[#002FA7]/20 text-blue-300'
                                    : angle.isSecondary
                                    ? 'border-white/15 bg-white/5 text-zinc-300'
                                    : 'border-white/10 bg-white/5 text-zinc-500'
                                )}>
                                  {angle.name} {angle.isPrimary ? '(PRIMARY)' : angle.isSecondary ? '(SECONDARY)' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {!angle.isPrimary && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={updateAngleMutation.isPending}
                                    onClick={() => updateAngleMutation.mutate(angle.key)}
                                    className="h-8 text-[11px] font-mono text-zinc-400 hover:text-white border border-transparent hover:border-[#002FA7]/40 hover:bg-[#002FA7]/5 cursor-pointer px-2"
                                  >
                                    {updateAngleMutation.isPending && updateAngleMutation.variables === angle.key ? (
                                      <Loader2 className="h-3 w-3 animate-spin mr-1 text-white" />
                                    ) : null}
                                    Set as Active
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={handleCopyAngle}
                                  className="h-8 w-8 text-zinc-500 hover:text-white shrink-0 border border-transparent hover:border-white/5 cursor-pointer"
                                  aria-label="Copy angle"
                                >
                                  {copiedAngleKey === angle.key ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <h5 className="text-sm font-semibold text-white font-sans leading-snug">
                                {angle.headline}
                              </h5>
                              <blockquote className="text-xs leading-relaxed text-zinc-300 italic border-l border-white/10 pl-3">
                                "{angle.talkTrack}"
                              </blockquote>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* NEPQ Discovery Flow Section */}
          <section className={cn(
            'mb-5 overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/60 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
            showDiscoveryFlow ? 'shadow-[0_18px_45px_rgba(0,0,0,0.22)]' : 'shadow-none',
            'animate-in fade-in slide-in-from-top-2 duration-500 delay-200'
          )}>
            <div className={cn(
              'flex items-center justify-between p-5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
              showDiscoveryFlow ? 'border-b border-white/5 pb-4' : 'border-b border-transparent'
            )}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-white" />
                <div className="text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-zinc-400">
                  NEPQ Discovery Flow
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDiscoveryFlow(!showDiscoveryFlow)}
                className={cn(
                  'overflow-hidden text-xs text-zinc-400 hover:text-white cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
                  showDiscoveryFlow ? 'w-24 bg-white/[0.03]' : 'w-32'
                )}
              >
                {showDiscoveryFlow ? 'Collapse' : 'Expand Flow'}
              </Button>
            </div>

            <div className={cn(
              'grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
              showDiscoveryFlow ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}>
              <div className="min-h-0 overflow-hidden">
                <div className={cn(
                  'p-5 space-y-5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
                  showDiscoveryFlow ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
                )}>
                {/* Timeline Tabs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-b border-white/5 pb-4">
                  {nepqPhases.map((phase, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActivePhase(idx)}
                      className={cn(
                        'flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-300 cursor-pointer',
                        activePhase === idx
                          ? 'border-[#002FA7] bg-[#002FA7]/10 text-white shadow-[0_0_8px_rgba(0,47,167,0.1)]'
                          : 'border-white/5 bg-zinc-950/40 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                      )}
                    >
                      <span className="text-[9px] tracking-wider uppercase">
                        <span className="font-mono">{phase.label.slice(0, 2)}</span>
                        <span className="font-sans font-bold ml-1">{phase.label.slice(2)}</span>
                      </span>
                      <span className="text-xs font-semibold mt-1 font-sans">{phase.title}</span>
                    </button>
                  ))}
                </div>

                {/* Phase Lens */}
                <div className="rounded-xl bg-zinc-900/30 p-3 border border-white/5">
                  <p className="text-[11px] font-sans text-zinc-500 italic">
                    {nepqPhases[activePhase].lens}
                  </p>
                </div>

                {/* Questions */}
                <div className="space-y-3">
                  {nepqPhases[activePhase].questions.map((question, qIdx) => {
                    const handleCopyQuestion = async () => {
                      try {
                        await navigator.clipboard.writeText(question)
                        setCopiedQuestionText(question)
                        setTimeout(() => setCopiedQuestionText(null), 1500)
                      } catch {
                        toast.error('Copy failed.')
                      }
                    }

                    return (
                      <div
                        key={qIdx}
                        className="group relative rounded-xl border border-white/5 bg-zinc-950/90 p-4 transition-all duration-300 hover:border-white/10 hover:bg-zinc-900/40"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                              Question {qIdx === 0 ? 'A' : 'B'} {qIdx === 1 ? '(Alternate)' : ''}
                            </span>
                            <p className="text-sm font-mono text-zinc-200 leading-relaxed">
                              {question}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleCopyQuestion}
                            className="h-8 w-8 text-zinc-500 hover:text-white shrink-0 border border-transparent hover:border-white/5 cursor-pointer"
                            aria-label="Copy question"
                          >
                            {copiedQuestionText === question ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              </div>
            </div>
          </section>

          {/* Metadata Grid */}
          <div className={cn(
            'grid gap-3 md:grid-cols-2 xl:grid-cols-3',
            'animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300'
          )}>
            <div className="rounded-2xl border border-white/5 bg-zinc-950/90 p-4">
              <div className="text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-zinc-500 mb-2">
                Signal Date
              </div>
              <p className="text-sm font-mono text-zinc-100">
                {getHumanDate(brief.signalDate) || 'Not set'}
              </p>
            </div>

            <div className={cn('rounded-2xl border p-4', confidenceTone(brief.confidenceLevel))}>
              <div className="text-[10px] font-sans font-bold uppercase tracking-[0.22em] mb-2">
                Confidence
              </div>
              <p className="text-sm font-mono font-bold">
                {brief.confidenceLevel ? brief.confidenceLevel.charAt(0).toUpperCase() + brief.confidenceLevel.slice(1).toLowerCase() : 'Not set'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-zinc-950/90 p-4">
              <div className="text-[10px] font-sans font-bold uppercase tracking-[0.22em] text-zinc-500 mb-2">
                Source
              </div>
              {brief.sourceUrl ? (
                <a
                  href={brief.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-1 text-sm font-mono text-zinc-500 hover:text-white break-all transition-colors"
                >
                  View source
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 text-current transition-colors group-hover:text-white" />
                </a>
              ) : (
                <p className="text-sm font-mono text-zinc-500">Not set</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
