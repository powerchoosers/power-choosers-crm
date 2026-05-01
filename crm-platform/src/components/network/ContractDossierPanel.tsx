'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUpRight,
  Clock3,
  FileSignature,
  MapPin,
  Pencil,
  Loader2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { Deal, DealStage, DEAL_STAGES } from '@/types/deals'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { cn } from '@/lib/utils'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { panelTheme, useEscClose } from '@/components/right-panel/panelTheme'
import {
  getDealPriorityMeta,
  getDealSignatureMeta,
} from '@/lib/deal-priority'

const STAGE_COLORS: Record<DealStage, string> = {
  IDENTIFIED: 'text-zinc-400 border-zinc-600/50 bg-zinc-800/40',
  AUDITING: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  BRIEFED: 'text-[#002FA7] border-[#002FA7]/50 bg-[#002FA7]/10',
  ENGAGED: 'text-[#002FA7] border-[#002FA7]/60 bg-[#002FA7]/15',
  OUT_FOR_SIGNATURE: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/15',
  SECURED: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10',
  TERMINATED: 'text-rose-400/70 border-rose-500/30 bg-rose-500/10',
}

const PIPELINE_STAGES = DEAL_STAGES.filter((stage) => stage !== 'TERMINATED')

function formatCurrencyShort(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${Number(value).toLocaleString()}`
}

function formatUsageShort(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M kWh`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K kWh`
  return `${Number(value).toLocaleString()} kWh`
}

function formatMillsShort(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(2)
}

function formatCloseDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return format(date, 'MMM d, yyyy')
}

interface ContractDossierPanelProps {
  deal: Deal | null
  isLoading?: boolean
  isError?: boolean
  onClose: () => void
  onOpenFullDossier: (deal: Deal) => void
  onEditContract: (deal: Deal) => void
  onCreateSignatureRequest: (deal: Deal) => void
  onSendPortalAccess: (deal: Deal) => void
  onViewAccount: (accountId: string) => void
}

export function ContractDossierPanel({
  deal,
  isLoading = false,
  isError = false,
  onClose,
  onOpenFullDossier,
  onEditContract,
  onCreateSignatureRequest,
  onSendPortalAccess,
  onViewAccount,
}: ContractDossierPanelProps) {
  useEscClose(onClose)
  const priorityMeta = deal ? getDealPriorityMeta(deal) : null
  const signatureMeta = deal ? getDealSignatureMeta(deal) : null
  const latestSignature = deal?.signature_requests?.length
    ? [...deal.signature_requests].sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at).getTime()
        const bTime = new Date(b.updated_at || b.created_at).getTime()
        return bTime - aTime
      })[0]
    : null
  const currentStageIndex = deal && deal.stage !== 'TERMINATED'
    ? PIPELINE_STAGES.indexOf(deal.stage as (typeof PIPELINE_STAGES)[number])
    : -1

  if (!deal && !isLoading && !isError) {
    return null
  }

  return (
    <motion.div
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'min-h-0 flex flex-col',
        panelTheme.shell
      )}
    >
      <div className={panelTheme.header}>
        <div className={panelTheme.headerTitleWrap}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#002FA7]/60 bg-[#002FA7]/40">
            <ArrowUpRight className="h-4 w-4 text-white" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300">
            CONTRACT_DOSSIER
          </span>
        </div>
        <ForensicClose onClick={onClose} size={16} />
      </div>

      <div className={panelTheme.body}>
        <AnimatePresence mode="wait" initial={false}>
          {isLoading && !deal ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, x: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 24, filter: 'blur(8px)' }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#002FA7]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="mt-4 text-sm text-zinc-200">Loading selected contract...</div>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Pulling the full dossier into the right panel.
                </p>
              </div>
            </motion.div>
          ) : isError && !deal ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, x: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 24, filter: 'blur(8px)' }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
                <div className="text-sm text-rose-200">Could not load that contract.</div>
                <p className="mt-2 text-xs leading-5 text-rose-300/70">
                  The selected record may have been removed or there was a fetch problem.
                </p>
              </div>
            </motion.div>
          ) : deal ? (
            <motion.div
              key={deal.id}
              initial={{ opacity: 0, x: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 24, filter: 'blur(8px)' }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <CompanyIcon
                    logoUrl={deal.account?.logoUrl ?? deal.account?.logo_url}
                    domain={deal.account?.domain}
                    name={deal.account?.name || deal.accountId}
                    size={44}
                    className="h-11 w-11 flex-none"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base text-zinc-100">
                      {deal.account?.name || deal.accountId}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      {deal.title || 'Untitled contract'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider', STAGE_COLORS[deal.stage])}>
                    {deal.stage}
                  </span>
                  {priorityMeta && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider',
                        priorityMeta.tone === 'rose' && 'border-rose-500/30 bg-rose-500/10 text-rose-300',
                        priorityMeta.tone === 'amber' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                        priorityMeta.tone === 'emerald' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                        priorityMeta.tone === 'blue' && 'border-[#002FA7]/30 bg-[#002FA7]/10 text-blue-200',
                        priorityMeta.tone === 'zinc' && 'border-white/10 bg-white/[0.03] text-zinc-400'
                      )}
                    >
                      {priorityMeta.label}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">
                    Pipeline position
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                    {deal.stage}
                  </div>
                </div>
                {deal.stage === 'TERMINATED' ? (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-rose-300">
                    Contract has exited the pipeline
                  </div>
                ) : (
                  <div className="flex gap-1">
                    {PIPELINE_STAGES.map((stage) => {
                      const isActive = stage === deal.stage
                      const isPast = currentStageIndex >= 0 && PIPELINE_STAGES.indexOf(stage) < currentStageIndex
                      return (
                        <div
                          key={stage}
                          className={cn(
                            'h-1.5 flex-1 rounded-full transition-all',
                            isActive && 'bg-[#002FA7]',
                            isPast && !isActive && 'bg-[#002FA7]/45',
                            !isActive && !isPast && 'bg-white/10'
                          )}
                        />
                      )
                    })}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Close date</div>
                    <div className="mt-1 text-sm text-zinc-200">{formatCloseDate(deal.closeDate)}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Updated</div>
                    <div className="mt-1 text-sm text-zinc-200">
                      {deal.updatedAt ? (
                        <span title={format(new Date(deal.updatedAt), 'MMM d, yyyy h:mm a')}>
                          {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true })}
                        </span>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Value / yr
                  </div>
                  <div className="mt-2 font-mono text-sm text-zinc-100">
                    {formatCurrencyShort(deal.amount ?? null)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                    <Sparkles className="h-3.5 w-3.5" />
                    kWh / yr
                  </div>
                  <div className="mt-2 font-mono text-sm text-zinc-100">
                    {formatUsageShort(deal.annualUsage ?? null)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Mills
                  </div>
                  <div className="mt-2 font-mono text-sm text-zinc-100">
                    {formatMillsShort(deal.mills ?? null)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                    <Clock3 className="h-3.5 w-3.5" />
                    Term
                  </div>
                  <div className="mt-2 font-mono text-sm text-zinc-100">
                    {deal.contractLength ? `${deal.contractLength} mo` : '—'}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">
                    Signature state
                  </div>
                  <div
                    className={cn(
                      'rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest',
                      signatureMeta?.tone === 'rose' && 'border-rose-500/30 bg-rose-500/10 text-rose-300',
                      signatureMeta?.tone === 'amber' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                      signatureMeta?.tone === 'emerald' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                      signatureMeta?.tone === 'blue' && 'border-[#002FA7]/30 bg-[#002FA7]/10 text-blue-200',
                      signatureMeta?.tone === 'zinc' && 'border-white/10 bg-white/[0.03] text-zinc-400'
                    )}
                  >
                    {signatureMeta?.label || '—'}
                  </div>
                </div>
                <p className="text-xs leading-5 text-zinc-500">
                  {signatureMeta?.detail || 'No signature request data is attached to this deal.'}
                </p>
                {latestSignature && latestSignature.expires_at && (
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                    <AlertLine />
                    Expires {format(new Date(latestSignature.expires_at), 'MMM d, yyyy')}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">
                  Action Deck
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenFullDossier(deal)}
                    className="flex items-center justify-between rounded-xl border border-[#002FA7]/30 bg-[#002FA7]/10 px-3 py-2 text-left transition-colors hover:border-[#002FA7] hover:bg-[#002FA7]/15"
                  >
                    <span>
                      <span className="block text-xs text-zinc-100">Open full dossier</span>
                      <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        Navigate to the detail page
                      </span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-[#002FA7]" />
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onEditContract(deal)}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2 text-xs text-zinc-100">
                        <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                        Edit
                      </div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        Open right panel
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCreateSignatureRequest(deal)}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2 text-xs text-zinc-100">
                        <FileSignature className="h-3.5 w-3.5 text-zinc-400" />
                        Signature
                      </div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        Request execution
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSendPortalAccess(deal)}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2 text-xs text-zinc-100">
                        <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
                        Portal
                      </div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        Send access
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewAccount(deal.accountId)}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2 text-xs text-zinc-100">
                        <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                        Account
                      </div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        Open account page
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function AlertLine() {
  return <span className="inline-flex h-2 w-2 rounded-full bg-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.45)]" />
}
