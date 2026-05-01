'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  RowSelectionState,
} from '@tanstack/react-table'
import {
  TrendingUp,
  Plus,
  X,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Check,
  Clock,
  MoreHorizontal,
  Mail,
  Search,
  ShieldCheck,
  Eye
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { millDecimal } from '@/lib/mills'
import { useDeals, useDealsCount, useCreateDeal, useUpdateDeal, useDeleteDeal, useDealsStats } from '@/hooks/useDeals'
import { type Deal, type DealStage, DEAL_STAGES } from '@/types/deals'
import { differenceInDays, format, subMonths, isAfter } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import Link from 'next/link'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { ForensicTableSkeleton } from '@/components/network/ForensicTableSkeleton'
import BulkActionDeck from '@/components/network/BulkActionDeck'
import DestructModal from '@/components/network/DestructModal'
import FilterCommandDeck from '@/components/network/FilterCommandDeck'
import { DealTableRow } from '@/components/network/DealTableRow'
import { useTableState } from '@/hooks/useTableState'
import { useTableScrollRestore } from '@/hooks/useTableScrollRestore'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from 'sonner'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { useUIStore } from '@/store/uiStore'
import {
  getDealPriorityMeta,
  matchesPriorityFocus,
  sortDealsByPriority,
  type PriorityFocus,
} from '@/lib/deal-priority'
import { DEALS_QUERY_BUSTER } from '@/hooks/useDeals'

const PAGE_SIZE = 50

// ---------------------------------------------------------------------------
// Stage display helpers
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

function StageBadge({ stage }: { stage: DealStage }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] uppercase tracking-wider',
      STAGE_COLORS[stage]
    )}>
      {(stage === 'ENGAGED' || stage === 'OUT_FOR_SIGNATURE') && (
        <span className={cn("h-1 w-1 rounded-full animate-pulse", stage === 'ENGAGED' ? "bg-[#002FA7]" : "bg-emerald-400")} />
      )}
      {stage}
    </span>
  )
}

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
  if (val === undefined || val === null) return '—'
  return val.toFixed(2)
}

const PRIORITY_FOCUS_OPTIONS: Array<{
  id: PriorityFocus
  label: string
  description: string
}> = [
  { id: 'all', label: 'All Contracts', description: 'Full pipeline, sorted by urgency' },
  { id: 'urgent', label: 'Needs Attention', description: 'Overdue, closing soon, signature, stale' },
  { id: 'overdue', label: 'Overdue', description: 'Close date already passed' },
  { id: 'closing_soon', label: 'Closing Soon', description: 'Close date in the next 30 days' },
  { id: 'signature_pending', label: 'Signature Pending', description: 'Requests waiting on execution' },
  { id: 'stale', label: 'Stale', description: 'No recent updates' },
  { id: 'secured', label: 'Secured', description: 'Won contracts' },
  { id: 'terminated', label: 'Terminated', description: 'Exited contracts' },
]

function PriorityRailButton({
  label,
  description,
  count,
  active,
  onClick,
}: {
  label: string
  description: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border p-3 text-left transition-all',
        active
          ? 'border-[#002FA7] bg-[#002FA7]/10 text-white shadow-[0_0_20px_-12px_rgba(0,47,167,0.55)]'
          : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10 hover:text-zinc-200'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm">{label}</div>
          <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            {description}
          </div>
        </div>
        <div className={cn(
          'rounded-lg border px-2 py-1 font-mono text-[10px] tabular-nums',
          active
            ? 'border-[#002FA7]/40 bg-[#002FA7]/20 text-white'
            : 'border-white/10 bg-black/20 text-zinc-300'
        )}>
          {String(count).padStart(2, '0')}
        </div>
      </div>
    </button>
  )
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

  const set = (key: keyof DealFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const nextForm = { ...form, [key]: e.target.value }

    // Auto-calculate amount if usage or mills changes
    if (key === 'annualUsage' || key === 'mills') {
      const usage = parseFloat(nextForm.annualUsage.replace(/[^0-9.-]/g, '')) || 0
      const sanitizedMills = nextForm.mills.replace(/[^0-9.]/g, '')
      const millsDecimal = millDecimal(sanitizedMills)
      if (usage && millsDecimal) {
        nextForm.amount = (usage * millsDecimal).toFixed(2)
      }
    }

    onChange(nextForm)
  }

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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { pageIndex, setPage, searchQuery, setSearch, pagination } = useTableState({ pageSize: PAGE_SIZE })
  const scrollKey = useMemo(() => {
    const paramsCopy = new URLSearchParams(searchParams?.toString() ?? '')
    paramsCopy.delete('contractId')
    const query = paramsCopy.toString()
    return `${pathname ?? '/network/contracts'}${query ? `?${query}` : ''}`
  }, [pathname, searchParams])

  const [globalFilter, setGlobalFilter] = useState(searchQuery)
  const [debouncedFilter, setDebouncedFilter] = useState(searchQuery)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
      setSearch(globalFilter)
    }, 400)
    return () => clearTimeout(timer)
  }, [globalFilter, setSearch])

  const dealFilters = useMemo(() => {
    return {
      stages: (columnFilters.find(f => f.id === 'stage')?.value as DealStage[]) || undefined,
      search: debouncedFilter.length >= 2 ? debouncedFilter : undefined,
    };
  }, [columnFilters, debouncedFilter]);

  const { data, isLoading: queryLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useDeals({
    stage: dealFilters.stages,
    search: dealFilters.search,
  })

  const { data: totalDeals } = useDealsCount({
    stage: dealFilters.stages,
    search: dealFilters.search,
  })

  const { data: statsData } = useDealsStats()

  const updateDeal = useUpdateDeal()
  const deleteDeal = useDeleteDeal()

  const { setRightPanelMode, setDealContext, setPortalAccessContext, setSignatureRequestContext } = useUIStore()

  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isMounted, setIsMounted] = useState(false)
  const [isDestructModalOpen, setIsDestructModalOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [priorityFocus, setPriorityFocus] = useState<PriorityFocus>('all')
  const selectedDealId = searchParams?.get('contractId') ?? null
  const [editDeal, setEditDeal] = useState<Deal | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<DealFormState>(EMPTY_FORM)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const queryDeals = useMemo(() => data?.pages.flatMap(page => page.deals) || [], [data])
  const sortedDeals = useMemo(() => sortDealsByPriority(queryDeals), [queryDeals])
  const visibleDeals = useMemo(
    () => sortedDeals.filter((deal) => matchesPriorityFocus(deal, priorityFocus)),
    [priorityFocus, sortedDeals]
  )
  const isLoading = queryLoading || !isMounted
  const { scrollContainerRef, saveScroll } = useTableScrollRestore(scrollKey, pageIndex, !isLoading)
  const openContractPreview = useCallback((deal: Deal) => {
    const paramsCopy = new URLSearchParams(searchParams?.toString() ?? '')
    paramsCopy.set('contractId', deal.id)
    queryClient.setQueryData(['deal', DEALS_QUERY_BUSTER, deal.id], deal)
    router.replace(`${pathname ?? '/network/contracts'}?${paramsCopy.toString()}`, { scroll: false })
  }, [pathname, queryClient, router, searchParams])

  const priorityCounts = useMemo(() => {
    const counts = {
      all: queryDeals.length,
      urgent: 0,
      overdue: 0,
      closing_soon: 0,
      signature_pending: 0,
      stale: 0,
      active: 0,
      secured: 0,
      terminated: 0,
    }

    queryDeals.forEach((deal) => {
      const meta = getDealPriorityMeta(deal)
      counts[meta.bucket] += 1
      if (['overdue', 'signature_pending', 'closing_soon', 'stale'].includes(meta.bucket)) {
        counts.urgent += 1
      }
    })

    return counts
  }, [queryDeals])

  const effectiveTotalRecords = visibleDeals.length
  const totalPages = Math.max(1, Math.ceil(effectiveTotalRecords / PAGE_SIZE))
  const displayTotalPages = totalDeals == null && hasNextPage
    ? Math.max(totalPages, pagination.pageIndex + 2)
    : totalPages


  const handleFilterChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const existing = prev.find(f => f.id === columnId)
      if (existing) {
        if (value === undefined) {
          return prev.filter(f => f.id !== columnId)
        }
        return prev.map(f => f.id === columnId ? { ...f, value } : f)
      }
      if (value === undefined) return prev
      return [...prev, { id: columnId, value }]
    })
    setPage(0)
  }

  useEffect(() => {
    const needed = (pagination.pageIndex + 2) * PAGE_SIZE
    if (hasNextPage && !isFetchingNextPage && queryDeals.length < needed) {
      fetchNextPage()
    }
  }, [pagination.pageIndex, queryDeals.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const selectedCount = Object.keys(rowSelection).length



  const handleEdit = async () => {
    if (!editDeal) return
    try {
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
    } catch (e) { }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteDeal.mutateAsync(deleteId)
      setDeleteId(null)
    } catch (e) { }
  }

  const openEdit = (deal: Deal) => {
    setDealContext({
      mode: 'edit',
      dealId: deal.id,
      accountId: deal.accountId,
      accountName: deal.account?.name || deal.accountId,
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
    })
    setRightPanelMode('CREATE_DEAL')
  }

  const handleBulkAction = async (action: string) => {
    if (action === 'delete') {
      setIsDestructModalOpen(true)
    }
  }

  const handleConfirmBulkDelete = async () => {
    const selectedIds = Object.keys(rowSelection).filter(Boolean)
    for (const id of selectedIds) {
      await deleteDeal.mutateAsync(id)
    }
    setRowSelection({})
    setIsDestructModalOpen(false)
  }

  const columns = useMemo<ColumnDef<Deal>[]>(() => {
    return [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center px-2">
            <button
              onClick={table.getToggleAllPageRowsSelectedHandler()}
              className={cn(
                "w-4 h-4 rounded border border-white/20 transition-all flex items-center justify-center",
                table.getIsAllPageRowsSelected() ? "bg-[#002FA7] border-[#002FA7]" : "bg-transparent opacity-50 hover:opacity-100"
              )}
            >
              {table.getIsAllPageRowsSelected() && <Check className="w-3 h-3 text-white" />}
            </button>
          </div>
        ),
        cell: ({ row }) => {
          const index = row.index + 1 + pagination.pageIndex * PAGE_SIZE
          const isSelected = row.getIsSelected()
          return (
            <div className="flex items-center justify-center px-2 relative group/select h-full min-h-[40px]">
              <span className={cn(
                "font-mono text-[10px] text-zinc-700 transition-opacity",
                isSelected ? "opacity-0" : "group-hover/select:opacity-0"
              )}>
                {index.toString().padStart(2, '0')}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  row.toggleSelected()
                }}
                className="absolute inset-x-[-8px] inset-y-[-12px] z-20 flex items-center justify-center group/check"
              >
                <div className={cn(
                  "w-4 h-4 rounded border transition-all flex items-center justify-center",
                  isSelected
                    ? "bg-[#002FA7] border-[#002FA7] opacity-100"
                    : "bg-white/5 border-white/10 opacity-0 group-hover/select:opacity-100 group-hover/check:opacity-100"
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>
            </div>
          )
        }
      },
      {
        accessorKey: 'title',
        header: 'Account / Contract',
        cell: ({ row }) => {
          const deal = row.original
          return (
            <div className="flex items-center gap-3 min-w-0">
              <CompanyIcon
                logoUrl={deal.account?.logoUrl ?? deal.account?.logo_url}
                domain={deal.account?.domain}
                name={deal.account?.name || deal.accountId}
                size={32}
                className="w-8 h-8 flex-none"
              />
              <div className="min-w-0">
                <div className="font-sans text-sm text-zinc-200 truncate group-hover:text-white transition-colors">
                  {deal.account?.name || deal.accountId}
                </div>
                <div className="font-mono text-[10px] text-zinc-600 truncate uppercase tracking-tight">
                  {deal.title}
                </div>
              </div>
            </div>
          )
        }
      },
      {
        accessorKey: 'stage',
        header: 'Stage',
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true
          const currentStage = row.getValue(id) as string
          if (!currentStage) return false
          return Array.isArray(value) ? value.includes(currentStage) : currentStage === value
        },
        cell: ({ row }) => <StageBadge stage={row.original.stage} />
      },
      {
        accessorKey: 'amount',
        header: 'Value/yr',
        cell: ({ row }) => <div className="font-mono text-xs text-zinc-300 tabular-nums">{fmtCurrency(row.original.amount)}</div>
      },
      {
        accessorKey: 'annualUsage',
        header: 'kWh/yr',
        cell: ({ row }) => <div className="font-mono text-xs text-zinc-400 tabular-nums">{fmtUsage(row.original.annualUsage)}</div>
      },
      {
        accessorKey: 'mills',
        header: 'Mills',
        cell: ({ row }) => <div className="font-mono text-xs text-zinc-400 tabular-nums">{fmtMills(row.original.mills)}</div>
      },
      {
        accessorKey: 'contractLength',
        header: 'Term',
        cell: ({ row }) => <div className="font-mono text-xs text-zinc-400">{row.original.contractLength ? `${row.original.contractLength}mo` : '—'}</div>
      },
      {
        accessorKey: 'closeDate',
        header: 'Close',
        cell: ({ row }) => <CloseDots closeDate={row.original.closeDate} />
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => openContractPreview(row.original)}
              className="p-1.5 rounded hover:bg-white/5 text-zinc-600 hover:text-zinc-300 transition-colors"
              title="Preview"
            >
              <Eye className="w-3 h-3" />
            </button>
            <button
              onClick={() => openEdit(row.original)}
              className="p-1.5 rounded hover:bg-white/5 text-zinc-600 hover:text-zinc-300 transition-colors"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 icon-button-forensic flex items-center justify-center">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-950 nodal-monolith-edge text-zinc-300">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  className="hover:bg-white/5 cursor-pointer"
                  onClick={() => openEdit(row.original)}
                >
                  Edit Contract
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  className="hover:bg-white/5 cursor-pointer"
                  onClick={() => {
                    saveScroll()
                    router.push(`/network/accounts/${row.original.accountId}`)
                  }}
                >View Account</DropdownMenuItem>
                <DropdownMenuItem
                  className="hover:bg-white/5 cursor-pointer flex items-center gap-2"
                  onClick={() => {
                    setPortalAccessContext({
                      accountId: row.original.accountId,
                      accountName: row.original.account?.name,
                    })
                    setRightPanelMode('SEND_PORTAL_ACCESS')
                  }}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#002FA7]" />
                  Send Portal Access
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  className="text-red-400 hover:bg-red-500/10 cursor-pointer"
                  onClick={() => setDeleteId(row.original.id)}
                >Terminate Contract</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      }
    ]
  }, [pagination.pageIndex, rowSelection])

  const table = useReactTable({
    data: visibleDeals,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const nextPagination = updater(pagination)
        setPage(nextPagination.pageIndex)
      } else {
        setPage(updater.pageIndex)
      }
    },
    onRowSelectionChange: setRowSelection,
    autoResetPageIndex: false,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      rowSelection,
    },
  })

  const filteredRowCount = visibleDeals.length
  const showingStart = filteredRowCount === 0 ? 0 : Math.min(filteredRowCount, pagination.pageIndex * PAGE_SIZE + 1)
  const showingEnd = Math.min(filteredRowCount, (pagination.pageIndex + 1) * PAGE_SIZE)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Contracts"
        description="Forensic pipeline of energy supply agreements."
        globalFilter={globalFilter}
        onSearchChange={(value) => {
          setGlobalFilter(value)
          setPage(0)
        }}
        onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
        isFilterActive={isFilterOpen || columnFilters.length > 0}
        primaryAction={{
          label: "Initialize Contract",
          onClick: () => {
            setDealContext(null);
            setRightPanelMode('CREATE_DEAL');
          },
          icon: <Plus size={18} className="mr-2" />
        }}
      />

      {statsData && (
        <div className="flex items-center gap-6 py-3 px-6 rounded-xl bg-white/[0.02] border border-white/5 flex-none">
          <div>
            <div className="font-mono text-lg text-zinc-100 tabular-nums">
              {fmtCurrency(statsData.totalPipeline)}
            </div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Pipeline</div>
          </div>
          <div className="h-8 w-px bg-white/5" />
          <div>
            <div className="font-mono text-sm text-amber-400 tabular-nums">
              {statsData.closing30dCount} <span className="text-zinc-600 text-xs">contracts</span>
            </div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Closing 30d</div>
          </div>
          <div className="h-8 w-px bg-white/5" />
          <div>
            <div className="font-mono text-sm text-[#002FA7] tabular-nums flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#002FA7] animate-pulse" />
              {statsData.engagedCount}
            </div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Engaged</div>
          </div>
          <div className="h-8 w-px bg-white/5" />
          <div>
            <div className="font-mono text-sm text-emerald-400 tabular-nums">{statsData.securedCount}</div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Secured</div>
          </div>
        </div>
      )}

      <FilterCommandDeck
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        type="deals"
        columnFilters={columnFilters}
        onFilterChange={handleFilterChange}
      />

      <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <motion.aside
          initial={{ opacity: 0, x: -16, filter: 'blur(8px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          className="rounded-2xl nodal-module-glass border border-white/5 p-4 flex flex-col gap-4 min-h-0 overflow-hidden"
        >
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">
              Work Queue
            </div>
            <h3 className="text-sm text-zinc-100">Sort by urgency, not age.</h3>
            <p className="text-xs leading-5 text-zinc-500">
              Use these lanes to move quickly between contracts that need action and contracts that can wait.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <div className="font-mono text-lg text-zinc-100 tabular-nums">{String(priorityCounts.urgent).padStart(2, '0')}</div>
              <div className="mt-1 text-[9px] font-mono uppercase tracking-widest text-zinc-600">Urgent</div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <div className="font-mono text-lg text-emerald-400 tabular-nums">{String(priorityCounts.secured).padStart(2, '0')}</div>
              <div className="mt-1 text-[9px] font-mono uppercase tracking-widest text-zinc-600">Secured</div>
            </div>
          </div>

          <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar min-h-0">
            {PRIORITY_FOCUS_OPTIONS.map((option) => (
              <PriorityRailButton
                key={option.id}
                label={option.label}
                description={option.description}
                count={priorityCounts[option.id] ?? 0}
                active={priorityFocus === option.id}
                onClick={() => {
                  setPriorityFocus(option.id)
                  setPage(0)
                }}
              />
            ))}
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">
              Queue Rules
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Sorted by urgency, then close date, then value. Click a row to load the dossier in the right panel.
            </p>
          </div>
        </motion.aside>

        <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative min-h-0">
          <div
            ref={scrollContainerRef}
            data-contracts-scroll-container="true"
            className="flex-1 min-h-0 overflow-y-auto relative scroll-smooth scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll"
          >
            <Table>
              <TableHeader className="sticky top-0 z-20 border-b border-white/5">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-none hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <ForensicTableSkeleton columns={columns.length} rows={12} type="deal" />
                ) : visibleDeals.length ? (
                  <AnimatePresence mode="popLayout">
                    {table.getRowModel().rows.map((row, index) => (
                      <DealTableRow
                        key={row.id}
                        row={row}
                        index={index}
                        isSelected={row.getIsSelected()}
                        isPreviewActive={selectedDealId === row.original.id}
                        onSelect={openContractPreview}
                      />
                    ))}
                  </AnimatePresence>
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
                      No contracts found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex-none border-t border-white/5 nodal-recessed p-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                <span>Sync_Block {showingStart}–{showingEnd}</span>
                <div className="h-1 w-1 rounded-full bg-black/40" />
                <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{effectiveTotalRecords}</span></span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, pagination.pageIndex - 1))}
                disabled={pagination.pageIndex === 0}
                className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Previous page"
                title="Previous Page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
                {(pagination.pageIndex + 1).toString().padStart(2, '0')}
              </div>
              <button
                onClick={async () => {
                  const nextPageIndex = pagination.pageIndex + 1
                  if (nextPageIndex >= displayTotalPages) return

                  const needed = (nextPageIndex + 1) * PAGE_SIZE
                  if (queryDeals.length < needed && hasNextPage && !isFetchingNextPage) {
                    await fetchNextPage()
                  }

                  setPage(nextPageIndex)
                }}
                disabled={pagination.pageIndex + 1 >= displayTotalPages}
                className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Next page"
                title="Next Page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <BulkActionDeck
        selectedCount={selectedCount}
        totalAvailable={effectiveTotalRecords}
        onClear={() => setRowSelection({})}
        onAction={handleBulkAction}
        onSelectCount={() => { }} // Not implemented for deals yet
      />

      <DestructModal
        isOpen={isDestructModalOpen}
        onClose={() => setIsDestructModalOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        count={selectedCount}
      />

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
