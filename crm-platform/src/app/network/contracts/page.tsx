'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { TrendingUp, Plus, X, Pencil, Trash2, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDeals, useCreateDeal, useUpdateDeal, useDeleteDeal, useDealsStats } from '@/hooks/useDeals'
import { type Deal, type DealStage, DEAL_STAGES } from '@/types/deals'
import { differenceInDays, format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Stage display helpers
// ---------------------------------------------------------------------------
const STAGE_COLORS: Record<DealStage, string> = {
  IDENTIFIED: 'text-zinc-400 border-zinc-600/50 bg-zinc-800/40',
  AUDITING:   'text-amber-400 border-amber-500/40 bg-amber-500/10',
  BRIEFED:    'text-[#002FA7] border-[#002FA7]/50 bg-[#002FA7]/10',
  ENGAGED:    'text-[#002FA7] border-[#002FA7]/60 bg-[#002FA7]/15',
  SECURED:    'text-emerald-400 border-emerald-500/50 bg-emerald-500/10',
  TERMINATED: 'text-rose-400/70 border-rose-500/30 bg-rose-500/10',
}

function StageBadge({ stage }: { stage: DealStage }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] uppercase tracking-wider',
      STAGE_COLORS[stage]
    )}>
      {stage === 'ENGAGED' && (
        <span className="h-1 w-1 rounded-full bg-[#002FA7] animate-pulse" />
      )}
      {stage}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Close date urgency dots
// ---------------------------------------------------------------------------
function CloseDots({ closeDate }: { closeDate?: string }) {
  if (!closeDate) return <span className="font-mono text-xs text-zinc-600">—</span>

  const days = differenceInDays(new Date(closeDate), new Date())
  if (days < 0) {
    return <span className="font-mono text-xs text-rose-400/70">Overdue</span>
  }

  const label = days === 0 ? 'Today' : `${days}d`
  const dots = days <= 14 ? '●●●' : days <= 30 ? '●●' : days <= 60 ? '●' : ''
  const dotColor = days <= 14 ? 'text-[#002FA7] animate-pulse' : days <= 30 ? 'text-amber-400' : 'text-zinc-500'

  return (
    <span className="font-mono text-xs flex items-center gap-1">
      <span className="text-zinc-400">{label}</span>
      {dots && <span className={dotColor}>{dots}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
function fmtCurrency(val?: number) {
  if (!val) return '—'
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`
  return `$${val}`
}

function fmtUsage(val?: number) {
  if (!val) return '—'
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M kWh`
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K kWh`
  return `${val} kWh`
}

function fmtMills(val?: number) {
  if (!val) return '—'
  return `${val.toFixed(2)}¢`
}

// ---------------------------------------------------------------------------
// Account search hook (inline, for dialogs)
// ---------------------------------------------------------------------------
function useAccountSearch(query: string) {
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('accounts')
        .select('id, name')
        .ilike('name', `%${query}%`)
        .limit(8)
      setResults(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return results
}

// ---------------------------------------------------------------------------
// Deal form (used in both create and edit dialogs)
// ---------------------------------------------------------------------------
interface DealFormState {
  title: string
  accountId: string
  accountName: string
  contactId: string
  stage: DealStage
  amount: string
  annualUsage: string
  mills: string
  contractLength: string
  closeDate: string
  probability: string
  commissionType: string
  yearlyCommission: string
}

const EMPTY_FORM: DealFormState = {
  title: '',
  accountId: '',
  accountName: '',
  contactId: '',
  stage: 'IDENTIFIED',
  amount: '',
  annualUsage: '',
  mills: '',
  contractLength: '',
  closeDate: '',
  probability: '0',
  commissionType: '',
  yearlyCommission: '',
}

function dealToForm(deal: Deal): DealFormState {
  return {
    title: deal.title,
    accountId: deal.accountId,
    accountName: deal.account?.name || '',
    contactId: deal.contactId || '',
    stage: deal.stage,
    amount: deal.amount?.toString() || '',
    annualUsage: deal.annualUsage?.toString() || '',
    mills: deal.mills?.toString() || '',
    contractLength: deal.contractLength?.toString() || '',
    closeDate: deal.closeDate || '',
    probability: deal.probability?.toString() || '0',
    commissionType: deal.commissionType || '',
    yearlyCommission: deal.yearlyCommission?.toString() || '',
  }
}

interface DealFormProps {
  form: DealFormState
  onChange: (f: DealFormState) => void
  onAccountSelect: (id: string, name: string) => void
}

function DealForm({ form, onChange, onAccountSelect }: DealFormProps) {
  const accountResults = useAccountSearch(form.accountName)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)

  const set = (key: keyof DealFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...form, [key]: e.target.value })

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Contract Title</label>
        <Input
          value={form.title}
          onChange={set('title')}
          placeholder="e.g. Acme Industries Q2 Renewal"
          className="bg-black/40 border-white/10 text-white font-mono text-xs placeholder:text-zinc-600"
        />
      </div>

      {/* Account search */}
      <div className="space-y-1.5 relative">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Account</label>
        <Input
          value={form.accountName}
          onChange={(e) => {
            onChange({ ...form, accountName: e.target.value, accountId: '' })
            setShowAccountDropdown(true)
          }}
          onFocus={() => setShowAccountDropdown(true)}
          onBlur={() => setTimeout(() => setShowAccountDropdown(false), 150)}
          placeholder="> SEARCH_ACCOUNT..."
          className="bg-black/40 border-white/10 text-white font-mono text-xs placeholder:text-zinc-600"
        />
        {showAccountDropdown && accountResults.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl">
            {accountResults.map(a => (
              <button
                key={a.id}
                type="button"
                onMouseDown={() => {
                  onAccountSelect(a.id, a.name)
                  setShowAccountDropdown(false)
                }}
                className="w-full text-left px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                {a.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stage */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Stage</label>
        <select
          value={form.stage}
          onChange={set('stage')}
          className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white"
        >
          {DEAL_STAGES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Energy fields row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Value/yr ($)</label>
          <Input
            type="number"
            value={form.amount}
            onChange={set('amount')}
            placeholder="2400000"
            className="bg-black/40 border-white/10 text-white font-mono text-xs placeholder:text-zinc-600"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">kWh/yr</label>
          <Input
            type="number"
            value={form.annualUsage}
            onChange={set('annualUsage')}
            placeholder="3200000"
            className="bg-black/40 border-white/10 text-white font-mono text-xs placeholder:text-zinc-600"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Mills/kWh</label>
          <Input
            type="number"
            step="0.01"
            value={form.mills}
            onChange={set('mills')}
            placeholder="4.20"
            className="bg-black/40 border-white/10 text-white font-mono text-xs placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Contract + close date row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Term (months)</label>
          <select
            value={form.contractLength}
            onChange={set('contractLength')}
            className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white"
          >
            <option value="">—</option>
            {[12, 24, 36, 48, 60].map(m => (
              <option key={m} value={m}>{m} mo</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Close Date</label>
          <Input
            type="date"
            value={form.closeDate}
            onChange={set('closeDate')}
            className="bg-black/40 border-white/10 text-white font-mono text-xs"
          />
        </div>
      </div>

      {/* Probability + commission row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Probability (%)</label>
          <Input
            type="number"
            min="0"
            max="100"
            value={form.probability}
            onChange={set('probability')}
            placeholder="0"
            className="bg-black/40 border-white/10 text-white font-mono text-xs placeholder:text-zinc-600"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Yearly Commission</label>
          <Input
            type="number"
            value={form.yearlyCommission}
            onChange={set('yearlyCommission')}
            placeholder="0"
            className="bg-black/40 border-white/10 text-white font-mono text-xs placeholder:text-zinc-600"
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ContractsPage() {
  const { user } = useAuth()
  const [stageFilter, setStageFilter] = useState<DealStage | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editDeal, setEditDeal] = useState<Deal | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<DealFormState>(EMPTY_FORM)

  const createDeal = useCreateDeal()
  const updateDeal = useUpdateDeal()
  const deleteDeal = useDeleteDeal()
  const { data: statsData } = useDealsStats()

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useDeals({
    stage: stageFilter,
    search: search.length >= 2 ? search : undefined,
  })

  const deals = useMemo(
    () => data?.pages.flatMap(p => p.deals) ?? [],
    [data]
  )

  const handleCreate = async () => {
    if (!form.title.trim() || !form.accountId) return
    await createDeal.mutateAsync({
      title: form.title.trim(),
      accountId: form.accountId,
      contactId: form.contactId || undefined,
      stage: form.stage,
      amount: form.amount ? Number(form.amount) : undefined,
      annualUsage: form.annualUsage ? Number(form.annualUsage) : undefined,
      mills: form.mills ? Number(form.mills) : undefined,
      contractLength: form.contractLength ? Number(form.contractLength) : undefined,
      closeDate: form.closeDate || undefined,
      probability: form.probability ? Number(form.probability) : undefined,
      yearlyCommission: form.yearlyCommission ? Number(form.yearlyCommission) : undefined,
    })
    setForm(EMPTY_FORM)
    setCreateOpen(false)
  }

  const handleEdit = async () => {
    if (!editDeal) return
    await updateDeal.mutateAsync({
      id: editDeal.id,
      title: form.title.trim() || editDeal.title,
      accountId: form.accountId || editDeal.accountId,
      contactId: form.contactId || undefined,
      stage: form.stage,
      amount: form.amount ? Number(form.amount) : undefined,
      annualUsage: form.annualUsage ? Number(form.annualUsage) : undefined,
      mills: form.mills ? Number(form.mills) : undefined,
      contractLength: form.contractLength ? Number(form.contractLength) : undefined,
      closeDate: form.closeDate || undefined,
      probability: form.probability ? Number(form.probability) : undefined,
      yearlyCommission: form.yearlyCommission ? Number(form.yearlyCommission) : undefined,
    })
    setEditDeal(null)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await deleteDeal.mutateAsync(deleteId)
    setDeleteId(null)
  }

  const openEdit = (deal: Deal) => {
    setEditDeal(deal)
    setForm(dealToForm(deal))
  }

  const stats = statsData

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-950">

      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-8 pb-4 space-y-6">

        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-[#002FA7]" />
            <div>
              <h1 className="text-sm font-mono uppercase tracking-[0.2em] text-zinc-200">
                Contract_Matrix
              </h1>
              <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mt-0.5">
                Active Pipeline
              </p>
            </div>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true) }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#002FA7]/10 border border-[#002FA7]/30 text-[#002FA7] hover:bg-[#002FA7]/20 transition-colors font-mono text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Initialize Contract
          </button>
        </div>

        {/* KPI strip */}
        {stats && (
          <div className="flex items-center gap-6 py-3 px-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div>
              <div className="font-mono text-lg text-zinc-100 tabular-nums">
                {fmtCurrency(stats.totalPipeline)}
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Pipeline</div>
            </div>
            <div className="h-8 w-px bg-white/5" />
            <div>
              <div className="font-mono text-sm text-amber-400 tabular-nums">
                {stats.closing30dCount} <span className="text-zinc-600 text-xs">contracts</span>
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Closing 30d</div>
            </div>
            <div className="h-8 w-px bg-white/5" />
            <div>
              <div className="font-mono text-sm text-[#002FA7] tabular-nums flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#002FA7] animate-pulse" />
                {stats.engagedCount}
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Engaged</div>
            </div>
            <div className="h-8 w-px bg-white/5" />
            <div>
              <div className="font-mono text-sm text-emerald-400 tabular-nums">{stats.securedCount}</div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Secured</div>
            </div>
          </div>
        )}

        {/* Filter chips + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contracts..."
              className="bg-black/30 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-white/20 w-44"
            />
          </div>
          <div className="h-5 w-px bg-white/5" />
          {(['ALL', ...DEAL_STAGES] as const).map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(s as DealStage | 'ALL')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all',
                stageFilter === s
                  ? s === 'ALL'
                    ? 'bg-white/10 border-white/20 text-zinc-200'
                    : s === 'SECURED'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : s === 'TERMINATED'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : s === 'AUDITING'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'bg-[#002FA7]/15 border-[#002FA7]/40 text-[#002FA7]'
                  : 'border-white/5 text-zinc-600 hover:border-white/10 hover:text-zinc-500'
              )}
            >
              {s === 'ALL' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABLE ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-zinc-600 font-mono text-xs">
            Loading contracts...
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <TrendingUp className="w-8 h-8 text-zinc-700" />
            <p className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
              No contracts in pipeline
            </p>
            <button
              onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true) }}
              className="text-[#002FA7] font-mono text-xs hover:underline"
            >
              + Initialize first contract
            </button>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr_0.8fr_0.6fr_auto] gap-4 px-4 py-2 mb-1">
              {['Account', 'Stage', 'Value/yr', 'kWh/yr', 'Mills', 'Term', 'Close', ''].map((h, i) => (
                <div key={i} className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">{h}</div>
              ))}
            </div>

            <div className="space-y-1.5">
              {deals.map(deal => (
                <DealRow
                  key={deal.id}
                  deal={deal}
                  onEdit={() => openEdit(deal)}
                  onDelete={() => setDeleteId(deal.id)}
                />
              ))}
            </div>

            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-6 w-full py-3 border border-dashed border-zinc-800 hover:border-zinc-600 rounded-xl text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more contracts'}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── CREATE DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-widest text-zinc-300">
              Initialize Contract
            </DialogTitle>
          </DialogHeader>
          <DealForm
            form={form}
            onChange={setForm}
            onAccountSelect={(id, name) => setForm(f => ({ ...f, accountId: id, accountName: name }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-lg border border-white/10 text-zinc-500 font-mono text-xs hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.title.trim() || !form.accountId || createDeal.isPending}
              className="px-4 py-2 rounded-lg bg-[#002FA7]/20 border border-[#002FA7]/40 text-[#002FA7] font-mono text-xs hover:bg-[#002FA7]/30 transition-colors disabled:opacity-40"
            >
              {createDeal.isPending ? 'Initializing...' : 'Initialize'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT DIALOG ───────────────────────────────────────────────── */}
      <Dialog open={!!editDeal} onOpenChange={v => !v && setEditDeal(null)}>
        <DialogContent className="bg-zinc-950 border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-widest text-zinc-300">
              Edit Contract
            </DialogTitle>
          </DialogHeader>
          <DealForm
            form={form}
            onChange={setForm}
            onAccountSelect={(id, name) => setForm(f => ({ ...f, accountId: id, accountName: name }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setEditDeal(null)}
              className="px-4 py-2 rounded-lg border border-white/10 text-zinc-500 font-mono text-xs hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleEdit}
              disabled={updateDeal.isPending}
              className="px-4 py-2 rounded-lg bg-[#002FA7]/20 border border-[#002FA7]/40 text-[#002FA7] font-mono text-xs hover:bg-[#002FA7]/30 transition-colors disabled:opacity-40"
            >
              {updateDeal.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM ────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent className="bg-zinc-950 border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-widest text-rose-400">
              Terminate Contract
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-mono text-zinc-400">
            This will permanently remove the contract record. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setDeleteId(null)}
              className="px-4 py-2 rounded-lg border border-white/10 text-zinc-500 font-mono text-xs hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteDeal.isPending}
              className="px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono text-xs hover:bg-rose-500/20 transition-colors disabled:opacity-40"
            >
              {deleteDeal.isPending ? 'Terminating...' : 'Terminate'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deal row
// ---------------------------------------------------------------------------
function DealRow({ deal, onEdit, onDelete }: { deal: Deal; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr_0.8fr_0.6fr_auto] gap-4 items-center px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all">
      {/* Account name */}
      <div className="min-w-0">
        <div className="font-sans text-sm text-zinc-200 truncate">{deal.account?.name || deal.accountId}</div>
        <div className="font-mono text-[10px] text-zinc-600 truncate">{deal.title}</div>
      </div>

      {/* Stage */}
      <div>
        <StageBadge stage={deal.stage} />
      </div>

      {/* Value */}
      <div className="font-mono text-xs text-zinc-300 tabular-nums">{fmtCurrency(deal.amount)}</div>

      {/* kWh */}
      <div className="font-mono text-xs text-zinc-400 tabular-nums">{fmtUsage(deal.annualUsage)}</div>

      {/* Mills */}
      <div className="font-mono text-xs text-zinc-400 tabular-nums">{fmtMills(deal.mills)}</div>

      {/* Term */}
      <div className="font-mono text-xs text-zinc-400">
        {deal.contractLength ? `${deal.contractLength}mo` : '—'}
      </div>

      {/* Close date */}
      <div>
        <CloseDots closeDate={deal.closeDate} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded hover:bg-white/5 text-zinc-600 hover:text-zinc-300 transition-colors"
          title="Edit"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
