'use client'

import { Plus, MoreHorizontal, FileSignature, FileText, X, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDealsByAccount, useDealsByContact } from '@/hooks/useDeals'
import { type Deal, type DealStage } from '@/types/deals'
import { differenceInDays, format } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/store/uiStore'
import { motion, AnimatePresence } from 'framer-motion'
import { useDeleteDeal } from '@/hooks/useDeals'
import { useCancelSignatureRequest } from '@/hooks/useSignatures'
import { useAccountContacts } from '@/hooks/useContacts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useState } from 'react'
import { buildProposalAttentionLine } from '@/lib/proposal'

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

function getSignatureRequestStatus(reqStatus: string, expiresAt?: string | null) {
  if (reqStatus === 'completed' || reqStatus === 'signed') return 'signed'
  // The DB stores manual cancels as `declined`; show that as cancelled in the UI.
  if (reqStatus === 'canceled' || reqStatus === 'cancelled' || reqStatus === 'declined') return 'cancelled'

  // Trust the expires_at set by the backend — don't compute it ourselves
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return 'expired'
  }

  return reqStatus
}

// ---------------------------------------------------------------------------
// Single deal card inside the widget
// ---------------------------------------------------------------------------
interface DealCardProps {
  deal: Deal
  onEdit: (deal: Deal) => void
  onCreateProposal: (deal: Deal) => void
  onRequestDelete: (dealId: string) => void
}

function DealCard({ deal, onEdit, onCreateProposal, onRequestDelete }: DealCardProps) {
  const router = useRouter()
  const cancelSignature = useCancelSignatureRequest()
  const [isSignaturesExpanded, setIsSignaturesExpanded] = useState(false)
  const { setRightPanelMode, setSignatureRequestContext } = useUIStore()
  const probPct = STAGE_PROGRESS[deal.stage] ?? 0
  const closeLbl = closeLabel(deal.closeDate)

  // Find the most recent signature request if any
  const latestSigRequestRaw = deal.signature_requests && deal.signature_requests.length > 0
    ? [...deal.signature_requests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;

  const latestSigStatus = latestSigRequestRaw 
    ? getSignatureRequestStatus(latestSigRequestRaw.status, latestSigRequestRaw.expires_at) 
    : null;

  const handleCreateDocument = () => {
    setSignatureRequestContext({
      accountId: deal.accountId,
      dealId: deal.id,
      documentId: undefined,
      documentName: undefined,
      documentUrl: undefined,
      storagePath: undefined,
      documentType: null,
      requestKind: 'CONTRACT',
    })
    setRightPanelMode('CREATE_SIGNATURE_REQUEST')
  }

  return (
    <div className="w-full text-left group p-3 rounded-xl nodal-module-glass nodal-monolith-edge hover:bg-white/5 transition-colors relative overflow-hidden">
      {/* Top row: stage dot + title. Stage text removed — badge handles status display */}
      <button
        type="button"
        onClick={() => router.push(`/network/contracts/${deal.id}`)}
        className="w-full text-left"
      >
      <div className="flex items-center gap-2 mb-1.5 pr-32">
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STAGE_DOT[deal.stage])} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-300 truncate flex-1">
          {deal.title}
        </span>
      </div>

      {latestSigStatus && (
        <div className="absolute top-3 right-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/5 bg-black/40">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full flex-shrink-0",
            latestSigStatus === 'signed' ? 'bg-emerald-500' :
              latestSigStatus === 'expired' ? 'bg-rose-500' :
              latestSigStatus === 'cancelled' ? 'bg-zinc-500' :
              latestSigStatus === 'viewed' ? 'bg-[#002FA7]' :
                'bg-amber-500 animate-pulse'
          )} />
          <span className={cn(
            "font-mono text-[8.5px] uppercase tracking-widest",
            latestSigStatus === 'expired' ? 'text-rose-400' :
              latestSigStatus === 'cancelled' ? 'text-zinc-500' :
                'text-zinc-400'
          )}>
            {latestSigStatus}
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

      {/* Expanded Signatures Section */}
      <AnimatePresence>
        {isSignaturesExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-3">Signature Links</h4>
              {deal.signature_requests?.length ? (
                [...deal.signature_requests]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((req) => {
                    const derivedStatus = getSignatureRequestStatus(req.status, req.expires_at)
                    
                    return (
                      <div 
                        key={req.id} 
                        className="flex items-center justify-between p-2 rounded border border-white/5 bg-black/20 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-1.5 w-1.5 rounded-full flex-shrink-0",
                            derivedStatus === 'signed' ? 'bg-emerald-500' :
                            derivedStatus === 'expired' ? 'bg-rose-500' :
                            derivedStatus === 'cancelled' ? 'bg-zinc-500' :
                            derivedStatus === 'viewed' ? 'bg-[#002FA7]' : 'bg-amber-500 animate-pulse'
                          )} />
                          <div>
                            <div className={cn(
                              "font-mono text-[9px] uppercase tracking-wider",
                              derivedStatus === 'expired' ? 'text-rose-400' :
                                derivedStatus === 'cancelled' ? 'text-zinc-500' :
                                  'text-zinc-300'
                            )}>
                              {derivedStatus}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 font-mono text-[8px] text-zinc-500">
                              <Clock className="w-2.5 h-2.5" />
                              {format(new Date(req.created_at), 'MMM d, h:mm a')}
                            </div>
                          </div>
                        </div>

                        {derivedStatus !== 'signed' && derivedStatus !== 'cancelled' && (
                          <button
                            onClick={async () => {
                              await cancelSignature.mutateAsync(req.id)
                              if (deal.signature_requests?.length === 1) {
                                setIsSignaturesExpanded(false)
                              }
                            }}
                            disabled={cancelSignature.isPending}
                            className="p-1 rounded hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                            title="Delete Request"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })
              ) : (
                <div className="text-center py-4">
                  <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
                    No signature requests
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-2.5 right-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-6 w-6 rounded-md nodal-module-glass nodal-monolith-edge text-zinc-400 hover:text-zinc-200 hover:bg-white/5 flex items-center justify-center transition-colors focus:outline-none"
              onClick={(e) => e.stopPropagation()}
              aria-label="Contract actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-950 nodal-monolith-edge text-zinc-300">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              className="hover:bg-white/5 cursor-pointer"
              onClick={() => onEdit(deal)}
            >
              Edit Contract
            </DropdownMenuItem>

            <DropdownMenuItem
              className="hover:bg-white/5 cursor-pointer flex items-center gap-2"
              onClick={handleCreateDocument}
            >
              <FileSignature className="h-3.5 w-3.5 text-zinc-400" />
              Create Document
            </DropdownMenuItem>

            <DropdownMenuItem
              className="hover:bg-white/5 cursor-pointer flex items-center gap-2"
              onClick={() => onCreateProposal(deal)}
            >
              <FileText className="h-3.5 w-3.5 text-zinc-400" />
              Create Proposal
            </DropdownMenuItem>
            
            {deal.signature_requests && deal.signature_requests.length > 0 && (
              <DropdownMenuItem
                className="hover:bg-white/5 cursor-pointer flex items-center gap-2"
                onClick={() => setIsSignaturesExpanded(v => !v)}
              >
                <span>{isSignaturesExpanded ? 'Hide Signatures' : 'Manage Signatures'}</span>
                {!isSignaturesExpanded && (
                  <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#002FA7] px-1 text-[9px] font-mono font-medium text-white">
                    {deal.signature_requests.length}
                  </span>
                )}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              className="text-red-400 hover:bg-red-500/10 cursor-pointer"
              onClick={() => onRequestDelete(deal.id)}
            >
              Terminate Contract
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function HistoryDealRow({ deal }: { deal: Deal }) {
  return (
    <Link
      href={`/network/contracts/${deal.id}`}
      className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 transition-colors hover:border-white/10 hover:bg-black/30 group"
    >
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-200 truncate">
          {deal.title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-zinc-500 uppercase tracking-widest">
          <span className={cn('h-1.5 w-1.5 rounded-full flex-none', STAGE_DOT[deal.stage])} />
          <span>{deal.stage}</span>
          {deal.closeDate && (
            <span>Closes {format(new Date(deal.closeDate), 'MMM d, yyyy')}</span>
          )}
        </div>
      </div>
      <Clock className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-none" />
    </Link>
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
  const deleteDeal = useDeleteDeal()
  const { setRightPanelMode, setDealContext, setProposalContext } = useUIStore()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [removedDealIds, setRemovedDealIds] = useState<Record<string, true>>({})

  // Show deals from the most relevant source; avoid duplicates if both provided
  const deals: Deal[] = accountId ? accountDeals : contactDeals
  const isLoading = accountId ? loadingAccount : loadingContact
  const resolvedAccountId = accountId || contactDeals[0]?.accountId || ''
  const { data: accountContacts = [] } = useAccountContacts(resolvedAccountId)

  const visibleDeals = deals.filter(d => !removedDealIds[d.id])
  const activeDeals = visibleDeals.filter(d => d.stage !== 'TERMINATED')
  const historicalDeals = visibleDeals.filter(d => d.stage === 'TERMINATED')

  const openEditInRightPanel = (deal: Deal) => {
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

  const handleCreateProposal = (deal: Deal) => {
    const sellRate = (deal.metadata as Record<string, unknown> | undefined)?.sellRate
    const defaultRate =
      typeof sellRate === 'number' || typeof sellRate === 'string'
        ? sellRate
        : undefined
    const attentionLine = buildProposalAttentionLine(
      accountContacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: contact.title,
      })),
      deal.contactId || null,
      deal.account?.name || deal.title || 'Decision Team'
    )

    setProposalContext({
      accountId: deal.accountId,
      accountName: deal.account?.name || deal.accountId,
      accountLogoUrl: deal.account?.logoUrl ?? deal.account?.logo_url,
      accountDomain: deal.account?.domain,
      dealId: deal.id,
      dealTitle: deal.title,
      contactId: deal.contactId,
      attentionLine,
      supplierName: 'ENGIE',
      defaultRate,
      defaultTermMonths: deal.contractLength ?? undefined,
    })
    setRightPanelMode('CREATE_PROPOSAL')
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const targetId = deleteId
    setDeleteId(null)
    setRemovedDealIds(prev => ({ ...prev, [targetId]: true }))
    try {
      await deleteDeal.mutateAsync(targetId)
    } catch {
      setRemovedDealIds(prev => {
        const next = { ...prev }
        delete next[targetId]
        return next
      })
    }
  }

  if (!accountId && !contactId) return null
  if (visibleDeals.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
            Contract_Intel
          </h3>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
            {activeDeals.length} {activeDeals.length === 1 ? 'active contract' : 'active contracts'}
          </span>
        </div>
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

      {activeDeals.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
            Current Contracts
          </div>
          <AnimatePresence initial={false}>
            {activeDeals.map(deal => (
              <motion.div
                key={deal.id}
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <DealCard
                  deal={deal}
                  onEdit={openEditInRightPanel}
                  onCreateProposal={handleCreateProposal}
                  onRequestDelete={(dealId) => setDeleteId(dealId)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {historicalDeals.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-white/5">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
            Contract History
          </div>
          <div className="space-y-1.5">
            {historicalDeals.map((deal) => (
              <HistoryDealRow key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      )}

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
