import { supabase } from '@/lib/supabase'

const FALLBACK_SHARED_INBOX_OWNERS: Record<string, string[]> = {
  'l.patterson@nodalpoint.io': ['signal@nodalpoint.io'],
}

export const TRACKED_EMAIL_ID_PREFIXES = [
  'zoho_',
  'zoho_seq_',
  'sig_',
  'sig_exec_',
  'seq_exec_',
]

export function normalizeEmailAddress(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const angleMatch = raw.match(/<\s*([^>]+)\s*>/)
  const candidate = (angleMatch?.[1] || raw).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : ''
}

export function getFallbackEmailOwnerScope(userEmail?: string | null) {
  const primary = normalizeEmailAddress(userEmail)
  if (!primary) return []

  const shared = FALLBACK_SHARED_INBOX_OWNERS[primary] || []
  return Array.from(new Set([primary, ...shared]))
}

export async function resolveEmailOwnerScope(user?: { id?: string; email?: string | null } | null) {
  const primary = normalizeEmailAddress(user?.email)
  if (!primary) return []

  const scope = new Set<string>(getFallbackEmailOwnerScope(primary))

  if (user?.id) {
    const { data: connections } = await supabase
      .from('zoho_connections')
      .select('email')
      .eq('user_id', user.id)

    ;(connections || []).forEach((conn: { email?: string | null }) => {
      const email = normalizeEmailAddress(conn.email)
      if (email) scope.add(email)
    })
  }

  return Array.from(scope)
}

export function applyEmailOwnerScope(query: any, owners: string[]) {
  const normalizedOwners = Array.from(
    new Set((owners || []).map((owner) => normalizeEmailAddress(owner)).filter(Boolean))
  )

  if (normalizedOwners.length === 0) return query

  const ownerConditions = normalizedOwners.flatMap((owner) => [
    `metadata->>ownerId.eq.${owner}`,
    `ownerId.eq.${owner}`,
  ])

  return query.or(ownerConditions.join(','))
}

export function isEmailInOwnerScope(
  emailRow: {
    ownerId?: string | null
    metadata?: Record<string, any> | null
    from?: string | null
  } | null | undefined,
  scope: string[]
) {
  const normalizedScope = new Set(
    (scope || []).map((owner) => normalizeEmailAddress(owner)).filter(Boolean)
  )

  if (normalizedScope.size === 0) return false

  const candidates = [
    emailRow?.ownerId,
    emailRow?.metadata?.ownerId,
    emailRow?.metadata?.owner_id,
    emailRow?.metadata?.assignedTo,
    emailRow?.metadata?.assigned_to,
    emailRow?.metadata?.createdBy,
    emailRow?.metadata?.created_by,
    emailRow?.from,
  ]

  return candidates.some((candidate) => {
    const normalized = normalizeEmailAddress(candidate)
    return normalized ? normalizedScope.has(normalized) : false
  })
}

export function extractRelatedEmailIds(emailRow: {
  id?: string | null
  metadata?: Record<string, any> | null
}) {
  const candidates = [
    emailRow?.id,
    emailRow?.metadata?.email_id,
    emailRow?.metadata?.emailId,
    emailRow?.metadata?.trackingId,
    emailRow?.metadata?.tracking_id,
    emailRow?.metadata?.parentEmailId,
    emailRow?.metadata?.parent_email_id,
  ]

  return Array.from(
    new Set(
      candidates
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )
}

export function isTrackedEmailId(emailId?: string | null) {
  const normalized = String(emailId || '').trim()
  if (!normalized) return false
  return TRACKED_EMAIL_ID_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}
