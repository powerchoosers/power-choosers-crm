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
  SECURED: 'bg-emerald-400',
  TERMINATED: 'bg-rose-400/60',
}

const STAGE_TEXT: Record<DealStage, string> = {
  IDENTIFIED: 'text-zinc-500',
  AUDITING: 'text-amber-400',
  BRIEFED: 'text-[#002FA7]',
  ENGAGED: 'text-[#002FA7]',
  SECURED: 'text-emerald-400',
  TERMINATED: 'text-rose-400/70',
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
  const probPct = Math.min(100, Math.max(0, deal.probability ?? 0))
  const closeLbl = closeLabel(deal.closeDate)

  return (
    <button
      onClick={() => router.push('/network/contracts')}
      className="w-full text-left group p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all"
    >
      {/* Top row: stage dot + title */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STAGE_DOT[deal.stage])} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-300 truncate flex-1">
          {deal.title}
        </span>
        <span className={cn('font-mono text-[9px] uppercase tracking-wider flex-shrink-0', STAGE_TEXT[deal.stage])}>
          {deal.stage}
        </span>
      </div>

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

      {/* Probability bar */}
      {probPct > 0 && (
        <div className="space-y-1">
          <div className="h-0.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-500 rounded-full transition-all"
              style={{ width: `${probPct}%` }}
            />
          </div>
          <div className="text-[9px] font-mono text-zinc-600 text-right tabular-nums">{probPct}%</div>
        </div>
      )}
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
