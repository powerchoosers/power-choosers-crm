import { differenceInDays } from 'date-fns'
import { type Deal } from '@/types/deals'

export type PriorityFocus =
  | 'all'
  | 'urgent'
  | 'overdue'
  | 'closing_soon'
  | 'signature_pending'
  | 'stale'
  | 'secured'
  | 'terminated'

export type DealPriorityBucket =
  | 'overdue'
  | 'signature_pending'
  | 'closing_soon'
  | 'stale'
  | 'active'
  | 'secured'
  | 'terminated'

export interface DealPriorityMeta {
  bucket: DealPriorityBucket
  rank: number
  label: string
  detail: string
  tone: 'blue' | 'amber' | 'emerald' | 'rose' | 'zinc'
  daysUntilClose: number | null
  daysSinceUpdate: number | null
}

export interface DealSignatureMeta {
  label: string
  detail: string
  tone: 'blue' | 'amber' | 'emerald' | 'rose' | 'zinc'
}

function toValidDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeStatus(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function getLatestSignatureRequest(deal: Deal) {
  const requests = deal.signature_requests || []
  if (requests.length === 0) return null

  return [...requests].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime()
    const bTime = new Date(b.updated_at || b.created_at).getTime()
    return bTime - aTime
  })[0] || null
}

export function getDealSignatureMeta(deal: Deal): DealSignatureMeta {
  const latestRequest = getLatestSignatureRequest(deal)
  const status = normalizeStatus(latestRequest?.status)
  const expiresAt = toValidDate(latestRequest?.expires_at || null)
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false

  if (deal.stage === 'TERMINATED') {
    return {
      label: 'Closed out',
      detail: 'Contract has been terminated',
      tone: 'rose',
    }
  }

  if (!latestRequest) {
    if (deal.stage === 'OUT_FOR_SIGNATURE') {
      return {
        label: 'Awaiting signature',
        detail: 'Contract is out for execution',
        tone: 'amber',
      }
    }

    return {
      label: 'No signature request',
      detail: 'Nothing has been sent yet',
      tone: 'zinc',
    }
  }

  if (isExpired) {
    return {
      label: 'Expired',
      detail: 'The signature link expired',
      tone: 'rose',
    }
  }

  if (['signed', 'completed'].includes(status)) {
    return {
      label: 'Signed',
      detail: 'Execution is complete',
      tone: 'emerald',
    }
  }

  if (status === 'declined') {
    return {
      label: 'Declined',
      detail: 'Counterparty declined the request',
      tone: 'rose',
    }
  }

  if (['pending', 'viewed', 'opened'].includes(status) || deal.stage === 'OUT_FOR_SIGNATURE') {
    return {
      label: 'Awaiting signature',
      detail: 'Request is active and waiting',
      tone: 'amber',
    }
  }

  return {
    label: status ? status.replace(/_/g, ' ') : 'Request active',
    detail: 'Signature request is in flight',
    tone: 'blue',
  }
}

export function getDealPriorityMeta(deal: Deal): DealPriorityMeta {
  const today = new Date()
  const closeDate = toValidDate(deal.closeDate || null)
  const updatedAt = toValidDate(deal.updatedAt || null)
  const daysUntilClose = closeDate ? differenceInDays(closeDate, today) : null
  const daysSinceUpdate = updatedAt ? differenceInDays(today, updatedAt) : null
  const signatureMeta = getDealSignatureMeta(deal)
  const hasPendingSignature = signatureMeta.label === 'Awaiting signature' || signatureMeta.label === 'Expired'

  if (deal.stage === 'TERMINATED') {
    return {
      bucket: 'terminated',
      rank: 6,
      label: 'Terminated',
      detail: 'Exited from the pipeline',
      tone: 'rose',
      daysUntilClose,
      daysSinceUpdate,
    }
  }

  if (deal.stage === 'SECURED') {
    return {
      bucket: 'secured',
      rank: 5,
      label: 'Secured',
      detail: 'Contract is signed and won',
      tone: 'emerald',
      daysUntilClose,
      daysSinceUpdate,
    }
  }

  if (daysUntilClose !== null && daysUntilClose < 0) {
    return {
      bucket: 'overdue',
      rank: 0,
      label: 'Overdue',
      detail: `Close date passed ${Math.abs(daysUntilClose)} day${Math.abs(daysUntilClose) === 1 ? '' : 's'} ago`,
      tone: 'rose',
      daysUntilClose,
      daysSinceUpdate,
    }
  }

  if (hasPendingSignature) {
    return {
      bucket: 'signature_pending',
      rank: 1,
      label: 'Signature pending',
      detail: signatureMeta.detail,
      tone: 'amber',
      daysUntilClose,
      daysSinceUpdate,
    }
  }

  if (daysUntilClose !== null && daysUntilClose <= 30) {
    return {
      bucket: 'closing_soon',
      rank: 2,
      label: daysUntilClose === 0 ? 'Due today' : `Closing in ${daysUntilClose}d`,
      detail: 'Close date is approaching',
      tone: daysUntilClose <= 7 ? 'rose' : 'amber',
      daysUntilClose,
      daysSinceUpdate,
    }
  }

  if (daysSinceUpdate !== null && daysSinceUpdate >= 14) {
    return {
      bucket: 'stale',
      rank: 3,
      label: `Stale ${daysSinceUpdate}d`,
      detail: 'No recent updates',
      tone: 'zinc',
      daysUntilClose,
      daysSinceUpdate,
    }
  }

  return {
    bucket: 'active',
    rank: 4,
    label: 'Active pipeline',
    detail: 'Moving but not urgent',
    tone: 'blue',
    daysUntilClose,
    daysSinceUpdate,
  }
}

export function matchesPriorityFocus(deal: Deal, focus: PriorityFocus) {
  if (focus === 'all') return true

  const meta = getDealPriorityMeta(deal)
  if (focus === 'urgent') {
    return ['overdue', 'signature_pending', 'closing_soon', 'stale'].includes(meta.bucket)
  }

  return meta.bucket === focus
}

export function sortDealsByPriority(deals: Deal[]) {
  return [...deals].sort((a, b) => {
    const metaA = getDealPriorityMeta(a)
    const metaB = getDealPriorityMeta(b)

    if (metaA.rank !== metaB.rank) return metaA.rank - metaB.rank

    const closeA = toValidDate(a.closeDate || null)?.getTime() ?? Number.POSITIVE_INFINITY
    const closeB = toValidDate(b.closeDate || null)?.getTime() ?? Number.POSITIVE_INFINITY
    if (closeA !== closeB) return closeA - closeB

    const updatedA = toValidDate(a.updatedAt || null)?.getTime() ?? 0
    const updatedB = toValidDate(b.updatedAt || null)?.getTime() ?? 0
    if (updatedA !== updatedB) return updatedB - updatedA

    const amountA = Number(a.amount) || 0
    const amountB = Number(b.amount) || 0
    if (amountA !== amountB) return amountB - amountA

    return String(a.title || '').localeCompare(String(b.title || ''))
  })
}
