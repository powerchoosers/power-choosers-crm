'use client'

import { TrendingUp, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDealsByAccount, useDealsByContact } from '@/hooks/useDeals'
import { type Deal, type DealStage } from '@/types/deals'
import { differenceInDays } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/store/uiStore'
import { motion, AnimatePresence } from 'framer-motion'

// ---------------------------------------------------------------------------
// Stage indicator styles (compact, for dossier view)
// ---------------------------------------------------------------------------
const STAGE_DOT: Record<DealStage, string> = {
  IDENTIFIED: 'bg-zinc-500',
  AUDITING: 'bg-amber-400',
  BRIEFED: 'bg-[#002FA7]',
  ENGAGED: 'bg-[#002FA7] animate-pulse',
  OUT_FOR_SIGNATURE: 'bg-emerald-400 animate-pulse',
  SECURED: 'bg-emerald-400',
  TERMINATED: 'bg-rose-400/60',
}

// Stage-derived progress — accurate reflection of pipeline position.
// Using deal.probability (a manually-entered guess) was causing the bar
// to show 50% even after a contract was fully signed. Stage is the truth.
const STAGE_PROGRESS: Record<DealStage, number> = {
  IDENTIFIED: 10,
  AUDITING: 25,
  BRIEFED: 40,
  ENGAGED: 60,
  OUT_FOR_SIGNATURE: 80,
  SECURED: 100,
  TERMINATED: 0,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtCurrency(val?: number) {
  if (!val) return null
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M/yr`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K/yr`
  return `$${val}/yr`
}

function closeLabel(closeDate?: string) {
  if (!closeDate) return null
  const days = differenceInDays(new Date(closeDate), new Date())
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Today'
  return `${days}d`
}

// ---------------------------------------------------------------------------
// Single deal card inside the widget
// ---------------------------------------------------------------------------
function DealCard({ deal }: { deal: Deal }) {
  const router = useRouter()
  const probPct = STAGE_PROGRESS[deal.stage] ?? 0
  const closeLbl = closeLabel(deal.closeDate)

  // Find the most recent signature request if any
  const latestSigRequest = deal.signature_requests && deal.signature_requests.length > 0
    ? [...deal.signature_requests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;

  return (
    <button
      onClick={() => router.push('/network/contracts')}
      className="w-full text-left group p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all relative overflow-hidden"
    >
      {/* Top row: stage dot + title. Stage text removed — badge handles status display */}
      <div className="flex items-center gap-2 mb-1.5 pr-16">
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STAGE_DOT[deal.stage])} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-300 truncate flex-1">
          {deal.title}
        </span>
      </div>

      {latestSigRequest && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/5 bg-black/40">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full flex-shrink-0",
            latestSigRequest.status === 'completed' || latestSigRequest.status === 'signed' ? 'bg-emerald-500' :
              latestSigRequest.status === 'viewed' ? 'bg-[#002FA7]' :
                'bg-amber-500 animate-pulse'
          )} />
          <span className="font-mono text-[8.5px] uppercase tracking-widest text-zinc-400">
            {latestSigRequest.status === 'completed' ? 'signed' : latestSigRequest.status}
          </span>
        </div>
      )}

      {/* Data row: value · term · close */}
      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 mb-2">
        {fmtCurrency(deal.amount) && (
          <span className="text-zinc-400">{fmtCurrency(deal.amount)}</span>
        )}
        {deal.contractLength && (
          <>
            <span className="text-zinc-700">·</span>
            <span>{deal.contractLength}mo</span>
          </>
        )}
        {closeLbl && (
          <>
            <span className="text-zinc-700">·</span>
            <span className={cn(
              closeLbl === 'Overdue' ? 'text-rose-400' :
                deal.closeDate && differenceInDays(new Date(deal.closeDate), new Date()) <= 14 ? 'text-[#002FA7]' :
                  'text-zinc-500'
            )}>
              {closeLbl}
            </span>
          </>
        )}
      </div>

      {/* Stage progress bar — always shown, derived from pipeline stage not manual probability */}
      <div className="space-y-1">
        <div className="h-0.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', probPct === 100 ? 'bg-emerald-500' : 'bg-zinc-500')}
            style={{ width: `${probPct}%` }}
          />
        </div>
        <div className={cn('text-[9px] font-mono text-right tabular-nums', probPct === 100 ? 'text-emerald-600' : 'text-zinc-600')}>
          {probPct}%
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// ContractIntelWidget — shown in RightPanel Active_Context dossier
// ---------------------------------------------------------------------------
interface ContractIntelWidgetProps {
  accountId?: string
  contactId?: string
}

export function ContractIntelWidget({ accountId, contactId }: ContractIntelWidgetProps) {
  const { data: accountDeals = [], isLoading: loadingAccount } = useDealsByAccount(accountId)
  const { data: contactDeals = [], isLoading: loadingContact } = useDealsByContact(contactId)
  const router = useRouter()
  const { setRightPanelMode, setDealContext } = useUIStore()

  // Show deals from the most relevant source; avoid duplicates if both provided
  const deals: Deal[] = accountId ? accountDeals : contactDeals
  const isLoading = accountId ? loadingAccount : loadingContact

  // Filter out TERMINATED for the dossier (keep it clean)
  const activeDeals = deals.filter(d => d.stage !== 'TERMINATED')

  if (!accountId && !contactId) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
          Contract_Intel
        </h3>
        <button
          onClick={() => {
            setDealContext({ accountId, contactId })
            setRightPanelMode('CREATE_DEAL')
          }}
          className="icon-button-forensic p-1 flex items-center justify-center"
          title="Initialize Contract"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="text-[10px] font-mono text-zinc-700 px-1">Loading...</div>
      ) : activeDeals.length === 0 ? (
        <div className="py-3 border border-dashed border-zinc-800 rounded-lg flex items-center justify-center">
          <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-wider">
            No active contracts
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {activeDeals.map(deal => (
              <motion.div
                key={deal.id}
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <DealCard deal={deal} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
