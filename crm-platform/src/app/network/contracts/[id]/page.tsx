'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { differenceInDays, format } from 'date-fns'
import Link from 'next/link'
import {
  Pencil,
  Zap,
  RotateCcw,
  Building2,
  FileSignature,
  ArrowUpRight,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMillValue, millDecimal } from '@/lib/mills'
import { useDeal, useUpdateDeal, useDealsByAccount } from '@/hooks/useDeals'
import { useAccountBillIntelligence, useAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useAccountContacts } from '@/hooks/useContacts'
import { UsageProfilePanel } from '@/components/dossier/account-dossier/UsageProfilePanel'
import { AccountHolderCard } from '@/components/dossier/account-dossier/AccountHolderCard'
import DataIngestionCard from '@/components/dossier/DataIngestionCard'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/context/AuthContext'
import { LoadingOrb } from '@/components/ui/LoadingOrb'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { buildProposalAttentionLine } from '@/lib/proposal'
import { type Deal, type DealStage, DEAL_STAGES } from '@/types/deals'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Design system constants
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<DealStage, string> = {
  IDENTIFIED: 'text-zinc-400 border-zinc-600/50 bg-zinc-800/40',
  AUDITING: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  BRIEFED: 'text-[#002FA7] border-[#002FA7]/50 bg-[#002FA7]/10',
  ENGAGED: 'text-[#002FA7] border-[#002FA7]/60 bg-[#002FA7]/15',
  OUT_FOR_SIGNATURE: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/15',
  SECURED: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10',
  TERMINATED: 'text-rose-400/70 border-rose-500/30 bg-rose-500/10',
}

// Active linear stages — TERMINATED is a terminal exit, excluded from the bar
const ACTIVE_STAGES: DealStage[] = [
  'IDENTIFIED',
  'AUDITING',
  'BRIEFED',
  'ENGAGED',
  'OUT_FOR_SIGNATURE',
  'SECURED',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(val?: number | null) {
  if (val == null) return '—'
  const hasFractional = Math.abs(val % 1) > 0
  return `$${val.toLocaleString(undefined, {
    minimumFractionDigits: hasFractional ? 2 : 0,
    maximumFractionDigits: hasFractional ? 2 : 0,
  })}`
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function DataRow({
  label,
  value,
  urgent = false,
  muted = false,
  signal = false,
}: {
  label: string
  value: string | null | undefined
  urgent?: boolean
  muted?: boolean
  signal?: boolean
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">
        {label}
      </div>
      <div
        className={cn(
          'font-mono text-xs tabular-nums',
          signal && 'text-[#002FA7]',
          urgent && !signal && 'text-[#002FA7] animate-pulse',
          muted && 'text-zinc-600',
          !urgent && !muted && !signal && 'text-zinc-300'
        )}
      >
        {value || '—'}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage Progress Bar + Inline Editor
// ---------------------------------------------------------------------------

function StageModule({
  deal,
  stageEditing,
  stageUpdating,
  onToggleEdit,
  onStageChange,
}: {
  deal: Deal
  stageEditing: boolean
  stageUpdating: boolean
  onToggleEdit: () => void
  onStageChange: (s: DealStage) => void
}) {
  const stageIndex = ACTIVE_STAGES.indexOf(deal.stage)
  const isTerminated = deal.stage === 'TERMINATED'

  return (
    <div className="space-y-3">
      {/* Stage badge — click to open selector */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
          Stage
        </span>
        <button
          onClick={onToggleEdit}
          disabled={stageUpdating}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[10px] uppercase tracking-wider transition-all',
            STAGE_COLORS[deal.stage],
            !stageUpdating && 'hover:opacity-80 cursor-pointer',
            stageUpdating && 'opacity-40 cursor-wait'
          )}
        >
          {(deal.stage === 'ENGAGED' || deal.stage === 'OUT_FOR_SIGNATURE') && (
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full animate-pulse',
                deal.stage === 'ENGAGED' ? 'bg-[#002FA7]' : 'bg-emerald-400'
              )}
            />
          )}
          {deal.stage}
          <Pencil className="w-2.5 h-2.5 opacity-30" />
        </button>
        {stageUpdating && (
          <span className="font-mono text-[9px] text-zinc-700 animate-pulse">
            updating...
          </span>
        )}
      </div>

      {/* Inline stage selector */}
      <AnimatePresence>
        {stageEditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-4 gap-1.5 pt-1 pb-1">
              {DEAL_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => onStageChange(s)}
                  className={cn(
                    'px-2 py-1.5 rounded border font-mono text-[9px] uppercase tracking-wider text-left transition-all',
                    s === deal.stage
                      ? cn(STAGE_COLORS[s], 'ring-1 ring-white/20')
                      : 'border-white/5 text-zinc-600 bg-transparent hover:border-white/10 hover:text-zinc-400'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      {!isTerminated ? (
        <div className="flex items-center gap-1">
          {ACTIVE_STAGES.map((s, i) => {
            const isComplete = i < stageIndex
            const isCurrent = i === stageIndex
            return (
              <div
                key={s}
                className={cn(
                  'h-0.5 flex-1 rounded-full transition-all duration-500',
                  isComplete && 'bg-[#002FA7]',
                  isCurrent && 'bg-[#002FA7]/50',
                  !isComplete && !isCurrent && 'bg-white/10'
                )}
              />
            )
          })}
        </div>
      ) : (
        <div className="font-mono text-[9px] text-rose-400/60 uppercase tracking-widest">
          Terminated — Contract exited pipeline
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Forensic Brief Module
// ---------------------------------------------------------------------------

function ForensicBriefModule({
  brief,
  briefLoading,
  briefGenerated,
  onGenerate,
}: {
  brief: string | null
  briefLoading: boolean
  briefGenerated: boolean
  onGenerate: () => void
}) {
  return (
    <div className="nodal-glass rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-none">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
          Forensic Brief
        </span>
        <button
          onClick={onGenerate}
          disabled={briefLoading}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-[10px] uppercase tracking-wider transition-all',
          briefLoading
            ? 'border-zinc-800 text-white cursor-wait bg-black/30'
            : 'border-[#002FA7]/40 text-white bg-[#002FA7]/40 hover:bg-[#002FA7]/60 hover:border-[#002FA7]'
          )}
        >
          {briefLoading ? (
            <>
              <span className="inline-block w-2 h-3 bg-white/70 animate-pulse" />
              <span className="text-white">Analyzing...</span>
            </>
          ) : (
            <>
              {briefGenerated ? (
                <RotateCcw className="w-3 h-3 text-white" />
              ) : (
                <Zap className="w-3 h-3 text-white" />
              )}
              <span className="text-white">
                {briefGenerated ? 'Regenerate' : 'Generate Forensic Brief'}
              </span>
            </>
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          {brief ? (
            <motion.div
              key="brief"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              className="rounded-xl bg-black/40 border border-white/5 p-5 overflow-y-auto h-full max-h-[480px] np-scroll"
            >
              <pre className="font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                {brief}
              </pre>
            </motion.div>
          ) : !briefLoading ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl bg-black/20 border border-white/[0.03] flex flex-col items-center justify-center gap-2 h-32"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-700">
                Brief not generated
              </div>
              <div className="font-mono text-[9px] text-zinc-800">
                Click Generate to run forensic analysis
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Right panel: Account Intel
// ---------------------------------------------------------------------------

function AccountIntelPanel({ deal }: { deal: Deal }) {
  return (
    <div className="nodal-glass rounded-2xl p-5 space-y-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Account Intel
      </span>
      <div className="flex items-center gap-3">
        <CompanyIcon
          domain={deal.account?.domain}
          logoUrl={deal.account?.logoUrl ?? deal.account?.logo_url}
          name={deal.account?.name || deal.accountId}
          size={36}
        />
        <div className="min-w-0">
          <div className="font-sans text-sm text-zinc-200 truncate font-medium">
            {deal.account?.name || deal.accountId}
          </div>
          {deal.account?.domain && (
            <div className="font-mono text-[10px] text-zinc-600 truncate">
              {deal.account.domain}
            </div>
          )}
        </div>
      </div>
      <Link
        href={`/network/accounts/${deal.accountId}`}
        className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors group w-full"
      >
        <Building2 className="w-3 h-3 flex-none" />
        <span>View Account Dossier</span>
        <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex-none" />
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Right panel: Signature Status
// ---------------------------------------------------------------------------

function SignaturePanel({
  deal,
  onCreateRequest,
}: {
  deal: Deal
  onCreateRequest: () => void
}) {
  const sigRequests = deal.signature_requests || []
  // Do not trust array order from upstream; always derive newest request locally.
  const latest =
    sigRequests.length > 0
      ? [...sigRequests].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
      : null

  function derivedStatus(req: any) {
    if (req.status === 'completed' || req.status === 'signed') return 'signed'
    // Manual cancels are stored as `declined` in the database.
    if (req.status === 'canceled' || req.status === 'cancelled' || req.status === 'declined') return 'cancelled'
    if (req.expires_at && new Date(req.expires_at) < new Date()) return 'expired'
    return req.status
  }

  const statusColor = (status: string) => {
    if (status === 'signed') return 'text-emerald-400'
    if (status === 'expired') return 'text-rose-400'
    if (status === 'cancelled') return 'text-zinc-500'
    if (status === 'pending' || status === 'sent' || status === 'opened' || status === 'viewed') return 'text-amber-400'
    return 'text-zinc-500'
  }

  const latestDerived = latest ? derivedStatus(latest) : null

  return (
    <div className="nodal-glass rounded-2xl p-5 space-y-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Signature Status
      </span>
      {latest && latestDerived ? (
        <div className="space-y-1.5">
          <div
            className={cn(
              'font-mono text-xs uppercase tracking-wider font-medium',
              statusColor(latestDerived)
            )}
          >
            {latestDerived}
          </div>
          <div className="font-mono text-[9px] text-zinc-600">
            Requested {format(new Date(latest.created_at), 'MMM d, yyyy')}
          </div>
        </div>
      ) : (
        <div className="font-mono text-[10px] text-zinc-700">
          No active signature request
        </div>
      )}
      <button
        type="button"
        onClick={() => onCreateRequest()}
        className="w-full flex items-center gap-2 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors group"
      >
        <FileSignature className="w-3 h-3 flex-none" />
        <span>{latestDerived && latestDerived !== 'signed' ? 'New Signature Request' : latest ? 'View / Resend' : 'Request Signature'}</span>
        <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex-none" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Right panel: Commission Structure
// ---------------------------------------------------------------------------

function CommissionPanel({
  deal,
  commissionPct,
  commissionValue,
}: {
  deal: Deal
  commissionPct: number | null
  commissionValue: number | null
}) {
  return (
    <div className="nodal-glass rounded-2xl p-5 space-y-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Commission Structure
      </span>
      <div>
        <div className="font-mono text-xl text-zinc-100 tabular-nums">
          {fmtCurrency(commissionValue)}
          {commissionValue && (
            <span className="text-zinc-600 text-xs ml-1">/yr</span>
          )}
        </div>
        {commissionPct != null && (
          <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
            {commissionPct.toFixed(2)}% of contract value
          </div>
        )}
      </div>
      {deal.commissionType && (
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">
            Type
          </div>
          <div className="font-mono text-xs text-zinc-400">{deal.commissionType}</div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Related contracts on the same account
// ---------------------------------------------------------------------------

function RelatedContractsPanel({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return null

  return (
    <div className="nodal-glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
          Other Contracts
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
          {deals.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {deals.map((otherDeal) => (
          <Link
            key={otherDeal.id}
            href={`/network/contracts/${otherDeal.id}`}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 transition-colors hover:border-white/10 hover:bg-black/30 group"
          >
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-200 truncate">
                {otherDeal.title}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                <span className={cn('inline-flex rounded border px-1.5 py-0.5', STAGE_COLORS[otherDeal.stage])}>
                  {otherDeal.stage}
                </span>
                <span>
                  {otherDeal.closeDate
                    ? `Close ${format(new Date(otherDeal.closeDate), 'MMM d, yyyy')}`
                    : `Created ${format(new Date(otherDeal.createdAt), 'MMM d, yyyy')}`}
                </span>
              </div>
            </div>
            <ArrowUpRight className="w-3 h-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity flex-none" />
          </Link>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bill Intelligence Panel — surfaces analyze-document data for this account
// ---------------------------------------------------------------------------

function BillIntelligencePanel({
  intel,
}: {
  intel: ReturnType<typeof useAccountBillIntelligence>['data']
}) {
  if (!intel) return null

  const hasUsage = intel.usageHistory.length > 0
  const hasMeters = intel.meters.length > 0
  const hasAnyData = hasUsage || hasMeters || !!intel.electricitySupplier

  return (
    <div className="nodal-glass rounded-2xl flex flex-col overflow-hidden flex-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.03]">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-zinc-400" />
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500">
              Bill Intelligence
            </p>
            {intel.latestBillDate && (
              <p className="text-zinc-600 text-[9px] mt-0.5 font-mono">
                Last ingested: {format(new Date(intel.latestBillDate), 'MMM d, yyyy')}
                {intel.latestBillName && ` — ${intel.latestBillName}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="p-8 border-t border-white/5">
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
            No bill data ingested. Upload a bill via the account Data Locker to populate this panel.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-5 border-t border-white/5">
          {/* Asset summary */}
          {(intel.electricitySupplier || intel.currentRate || intel.annualUsage || intel.loadFactor != null) && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {intel.electricitySupplier && (
                <DataRow label="Supplier" value={intel.electricitySupplier} />
              )}
              {intel.currentRate && (
                <DataRow label="Ingested Rate" value={`${intel.currentRate} ¢/kWh`} />
              )}
              {intel.annualUsage && (
                <DataRow
                  label="Annual Usage"
                  value={`${Number(intel.annualUsage).toLocaleString()} kWh`}
                />
              )}
              {intel.loadFactor != null && (
                <DataRow
                  label="Load Factor"
                  value={`${(intel.loadFactor * 100).toFixed(1)}%`}
                />
              )}
            </div>
          )}

          {/* Meters */}
          {hasMeters && (
            <div className="rounded-2xl border border-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-400">
                Meters ({intel.meters.length})
              </div>
              <div className="overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="border-b border-white/5">
                    <tr className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                      <th className="px-3 py-2 text-zinc-500">ESID</th>
                      <th className="px-3 py-2 text-zinc-500">Address</th>
                      <th className="px-3 py-2 text-right text-zinc-500">Rate</th>
                      <th className="px-3 py-2 text-right text-zinc-500">End Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {intel.meters.map((m) => (
                      <tr key={m.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-3 py-2 font-mono text-[10px] text-zinc-300">{m.esid ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-zinc-300 truncate max-w-[180px]">{m.service_address ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-zinc-300 text-right">{m.rate ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-zinc-300 text-right">
                          {m.end_date ? format(new Date(m.end_date), 'MMM yyyy') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 12-Month Usage Profile */}
          <div className="min-h-[340px]">
            <UsageProfilePanel usageHistory={intel.usageHistory} meters={intel.meters} theme="crm" />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ContractDetailPage() {
  const params = useParams()
  const { role } = useAuth()
  const id = params?.id as string
  const commissionRate = role === 'admin' ? 0.7 : 0.5
  const commissionLabel = role === 'admin'
    ? 'Admin Commission / yr'
    : 'Agent Commission / yr'

  const { data: deal, isLoading } = useDeal(id)
  const { data: accountDeals = [] } = useDealsByAccount(deal?.accountId)
  const updateDeal = useUpdateDeal()
  const { data: billIntel } = useAccountBillIntelligence(deal?.accountId)
  const { data: account } = useAccount(deal?.accountId ?? '')
  const { data: contacts = [] } = useAccountContacts(deal?.accountId ?? '')
  const { mutate: updateAccount } = useUpdateAccount()
  const { setRightPanelMode, setDealContext, setSignatureRequestContext, setIngestionContext, setProposalContext } = useUIStore()

  // Brief state
  const [briefLoading, setBriefLoading] = useState(false)
  const [brief, setBrief] = useState<string | null>(null)
  const [briefGenerated, setBriefGenerated] = useState(false)

  // Stage editing state
  const [stageEditing, setStageEditing] = useState(false)
  const [stageUpdating, setStageUpdating] = useState(false)

  // ---------------------------------------------------------------------------
  // Derived metrics
  // ---------------------------------------------------------------------------

  const metrics = useMemo(() => {
    if (!deal) return null
    const rateInCents = parseNumber((deal.metadata as any)?.sellRate)
    const annualUsageKWh = parseNumber(deal.account?.annualUsage)
    const daysToClose = deal.closeDate
      ? differenceInDays(new Date(deal.closeDate), new Date())
      : null
    const commissionValue =
      deal.amount != null && deal.amount > 0
        ? Number((deal.amount * commissionRate).toFixed(2))
        : null
    const commissionPct =
      commissionValue != null && deal.amount != null && deal.amount > 0
        ? (commissionValue / deal.amount) * 100
        : null
    const millsDecimal = millDecimal(deal.mills)
    const impliedSpend =
      deal.annualUsage != null && millsDecimal > 0
        ? deal.annualUsage * millsDecimal
        : null
    return {
      rateInCents,
      annualUsageKWh,
      commissionValue,
      daysToClose,
      commissionPct,
      impliedSpend,
    }
  }, [deal, commissionRate])

  const relatedContracts = useMemo(() => {
    if (!deal) return []

    return [...accountDeals]
      .filter((otherDeal) => otherDeal.id !== deal.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [accountDeals, deal?.id])

  const proposalAttentionLine = useMemo(() => {
    return buildProposalAttentionLine(
      contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: contact.title,
      })),
      deal?.contactId || account?.primaryContactId || null,
      'Decision Team'
    )
  }, [account?.primaryContactId, contacts, deal?.contactId])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOpenEdit = () => {
    if (!deal) return
    setDealContext({
      mode: 'edit',
      dealId: deal.id,
      accountId: deal.accountId,
      accountName: deal.account?.name,
      accountLogoUrl: deal.account?.logoUrl ?? deal.account?.logo_url,
      accountDomain: deal.account?.domain,
      contactId: deal.contactId,
      defaultTitle: deal.title,
      stage: deal.stage,
      amount: deal.amount,
      annualUsage: deal.annualUsage,
      mills: deal.mills,
      contractLength: deal.contractLength,
      closeDate: deal.closeDate,
      probability: deal.probability,
      yearlyCommission: deal.yearlyCommission,
      sellRate: parseNumber((deal.metadata as any)?.sellRate) ?? undefined,
      metadata: (deal.metadata as Record<string, unknown>) || {},
    })
    setRightPanelMode('CREATE_DEAL')
  }

  const handleStageChange = async (newStage: DealStage) => {
    if (!deal || stageUpdating) return
    if (newStage === deal.stage) {
      setStageEditing(false)
      return
    }
    setStageUpdating(true)
    setStageEditing(false)
    try {
      await updateDeal.mutateAsync({ id: deal.id, stage: newStage })
    } catch {
      toast.error('Failed to update stage')
    } finally {
      setStageUpdating(false)
    }
  }

  const handleOpenSignatureRequest = () => {
    if (!deal) return
    setSignatureRequestContext({
      accountId: deal.accountId,
      dealId: deal.id,
      requestKind: 'CONTRACT',
    })
    setRightPanelMode('CREATE_SIGNATURE_REQUEST')
  }

  const handleOpenProposal = () => {
    if (!deal) return
    setProposalContext({
      accountId: deal.accountId,
      accountName: deal.account?.name || deal.accountId,
      accountLogoUrl: deal.account?.logoUrl ?? deal.account?.logo_url,
      accountDomain: deal.account?.domain,
      dealId: deal.id,
      dealTitle: deal.title,
      contactId: deal.contactId || account?.primaryContactId || undefined,
      attentionLine: proposalAttentionLine,
      supplierName: 'ENGIE',
      defaultRate: parseNumber((deal.metadata as any)?.sellRate) ?? undefined,
      defaultTermMonths: deal.contractLength ?? undefined,
    })
    setRightPanelMode('CREATE_PROPOSAL')
  }

  const generateBrief = async () => {
    if (briefLoading || !deal) return
    setBriefLoading(true)
    try {
      const res = await fetch('/api/ai/deal-forensic-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal, account: deal.account }),
      })
      if (!res.ok) {
        throw new Error(`Brief API failed with status ${res.status}`)
      }
      const json = await res.json()
      if (json.brief) {
        setBrief(json.brief)
        setBriefGenerated(true)
      } else {
        toast.error('Brief generation failed')
      }
    } catch {
      toast.error('Failed to reach AI service')
    } finally {
      setBriefLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <LoadingOrb label="LOADING CONTRACT..." />
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-4">
        <div className="font-mono text-zinc-500 text-sm uppercase tracking-widest">
          Contract Not Found
        </div>
        <Link
          href="/network/contracts"
          className="font-mono text-xs text-[#002FA7] hover:text-[#002FA7]/70 transition-colors"
        >
          ← Return to Contracts
        </Link>
      </div>
    )
  }

  const daysToCloseDisplay = metrics?.daysToClose != null
    ? metrics.daysToClose < 0
      ? `${Math.abs(metrics.daysToClose)}d overdue`
      : `${metrics.daysToClose}d remaining`
    : null

  const contractLengthMonths =
    deal?.contractLength != null ? Number(deal.contractLength) : null
  const totalValueFromAnnual =
    metrics?.impliedSpend != null &&
    contractLengthMonths != null &&
    contractLengthMonths > 0
      ? metrics.impliedSpend * (contractLengthMonths / 12)
      : null
  const totalValue = totalValueFromAnnual ?? deal?.amount ?? null

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mb-20 lg:h-[calc(100vh-6rem)] lg:-mb-8 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <CollapsiblePageHeader
        backHref="/network/contracts"
        title={
          <div className="flex items-center gap-3 min-w-0">
            <CompanyIcon
              domain={deal.account?.domain}
              logoUrl={deal.account?.logoUrl ?? deal.account?.logo_url}
              name={deal.account?.name || deal.title}
              size={32}
            />
            <div className="min-w-0">
              <div className="font-semibold text-zinc-100 truncate leading-tight">
                {deal.account?.name || deal.accountId}
              </div>
              <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest truncate">
                {deal.title}
              </div>
            </div>
          </div>
        }
        primaryAction={{
          label: 'Edit Contract',
          onClick: handleOpenEdit,
          icon: <Pencil size={14} className="mr-1.5" />,
        }}
        secondaryAction={{
          label: 'Create Proposal',
          onClick: handleOpenProposal,
          icon: <FileText size={14} className="mr-1.5" />,
        }}
      />

      {/* KPI Strip — 4 monospace metric cards */}
      <div className="grid grid-cols-4 gap-3 flex-none">
        <div className="nodal-void-card p-4">
          <div className="font-mono text-2xl text-zinc-50 tabular-nums leading-none">
            {fmtCurrency(totalValue)}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600 mt-1.5">
            Total Value
          </div>
        </div>

        <div className="nodal-void-card p-4">
          <div className="font-mono text-2xl text-zinc-50 tabular-nums leading-none">
            {metrics?.rateInCents != null
              ? `${metrics.rateInCents.toFixed(2)}¢`
              : '—'}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600 mt-1.5">
            Per kWh
          </div>
        </div>

        <div className="nodal-void-card p-4">
          <div className="font-mono text-2xl text-zinc-50 tabular-nums leading-none">
            {metrics?.annualUsageKWh != null
              ? `${Number(metrics.annualUsageKWh.toFixed(0)).toLocaleString()}`
              : '—'}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600 mt-1.5">
            KWh / Year
          </div>
        </div>

        <div className="nodal-void-card p-4">
          <div className="font-mono text-2xl text-zinc-50 tabular-nums leading-none">
            {fmtCurrency(metrics?.commissionValue ?? null)}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600 mt-1.5">
            {commissionLabel}
          </div>
        </div>
      </div>

      {/* Body — two columns */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0 overflow-hidden">

        {/* LEFT — Contract Intelligence + Forensic Brief */}
        <div className="col-span-8 flex flex-col gap-4 overflow-y-auto pr-1 pb-8 np-scroll">

          {/* Contract Intelligence */}
          <div className="nodal-glass rounded-2xl p-6 space-y-6 flex-none">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              Contract Intelligence
            </div>

            <StageModule
              deal={deal}
              stageEditing={stageEditing}
              stageUpdating={stageUpdating}
              onToggleEdit={() => setStageEditing((v) => !v)}
              onStageChange={handleStageChange}
            />

            {/* Data grid */}
            <div className="grid grid-cols-3 gap-x-8 gap-y-5">
              <DataRow
                label="Term"
                value={deal.contractLength ? `${deal.contractLength} months` : null}
              />
              <DataRow
                label="Close Date"
                value={
                  deal.closeDate
                    ? format(new Date(deal.closeDate), 'MMM d, yyyy')
                    : null
                }
              />
              <DataRow
                label="Days to Close"
                value={daysToCloseDisplay}
                urgent={
                  metrics?.daysToClose != null &&
                  metrics.daysToClose >= 0 &&
                  metrics.daysToClose <= 14
                }
                signal={metrics?.daysToClose != null && metrics.daysToClose < 0}
              />
              <DataRow
                label="Probability"
                value={
                  deal.probability != null ? `${deal.probability}%` : null
                }
              />
              <DataRow
                label="Mills"
                value={
                  deal.mills != null && formatMillValue(deal.mills)
                    ? `${formatMillValue(deal.mills)} mills`
                    : null
                }
              />
              <DataRow
                label="Annual Value"
                value={
                  metrics?.impliedSpend != null
                    ? fmtCurrency(metrics.impliedSpend)
                    : null
                }
                muted
              />
              <DataRow
                label="Created"
                value={
                  deal.createdAt
                    ? format(new Date(deal.createdAt), 'MMM d, yyyy')
                    : null
                }
              />
              {deal.assignedTo && (
                <DataRow label="Assigned To" value={deal.assignedTo} />
              )}
            </div>
          </div>

          {/* Forensic Brief */}
          <ForensicBriefModule
            brief={brief}
            briefLoading={briefLoading}
            briefGenerated={briefGenerated}
            onGenerate={generateBrief}
          />

          {/* Bill Intelligence */}
          <BillIntelligencePanel intel={billIntel} />

          {/* Document Vault */}
          {deal?.accountId && (
            <DataIngestionCard
              accountId={deal.accountId}
              onIngestionComplete={() => {}}
            />
          )}
        </div>

        {/* RIGHT — Sidebar panels */}
        <div className="col-span-4 flex flex-col gap-4 overflow-y-auto pb-8 np-scroll">
          <AccountIntelPanel deal={deal} />
          <RelatedContractsPanel deals={relatedContracts} />

          {/* Decision Maker */}
          {deal?.accountId && (
            <AccountHolderCard
              accountId={deal.accountId}
              accountName={deal.account?.name || ''}
              contacts={contacts}
              primaryContactId={account?.primaryContactId}
              onSetHolder={(contactId) => updateAccount({ id: deal.accountId, primaryContactId: contactId })}
            />
          )}

          <SignaturePanel deal={deal} onCreateRequest={handleOpenSignatureRequest} />
          <CommissionPanel
            deal={deal}
            commissionPct={metrics?.commissionPct ?? null}
            commissionValue={metrics?.commissionValue ?? null}
          />
        </div>
      </div>
    </div>
  )
}
