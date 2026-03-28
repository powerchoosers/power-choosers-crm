import type { OwnerDirectoryEntry, OwnerKind, UserIdentityRecord } from '@/types/agents'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface OwnerIndex {
  byId: Map<string, UserIdentityRecord>
  byEmail: Map<string, UserIdentityRecord>
}

export function normalizeEmail(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const angleMatch = raw.match(/<\s*([^>]+)\s*>/)
  const candidate = (angleMatch?.[1] || raw).trim().toLowerCase()
  return EMAIL_REGEX.test(candidate) ? candidate : ''
}

export function normalizeOwnerKey(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.toLowerCase() === 'unassigned') return 'unassigned'

  const email = normalizeEmail(raw)
  if (email) return email

  return raw
}

export function isUnassignedOwner(value?: string | null) {
  const normalized = normalizeOwnerKey(value)
  return !normalized || normalized === 'unassigned'
}

export function buildOwnerIndex(users: UserIdentityRecord[]) {
  const byId = new Map<string, UserIdentityRecord>()
  const byEmail = new Map<string, UserIdentityRecord>()

  for (const user of users || []) {
    if (user.id) {
      byId.set(user.id, user)
    }

    const email = normalizeEmail(user.email)
    if (email) {
      byEmail.set(email, user)
    }
  }

  return { byId, byEmail } satisfies OwnerIndex
}

export function resolveOwnerUser(value: string | null | undefined, index: OwnerIndex) {
  const normalized = normalizeOwnerKey(value)
  if (!normalized || normalized === 'unassigned') return null

  const byId = index.byId.get(normalized)
  if (byId) return byId

  const email = normalizeEmail(normalized)
  if (email) {
    return index.byEmail.get(email) ?? null
  }

  return null
}

export function formatOwnerDisplayName(user?: UserIdentityRecord | null, fallback?: string | null) {
  if (!user) {
    const rawFallback = String(fallback || '').trim()
    return rawFallback || 'Unassigned'
  }

  const first = String(user.first_name || user.firstName || '').trim()
  const last = String(user.last_name || user.lastName || '').trim()
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full

  const email = normalizeEmail(user.email)
  if (email) return email

  const rawFallback = String(fallback || '').trim()
  return rawFallback || user.id || 'Unassigned'
}

export function resolveOwnerKind(value: string | null | undefined, index: OwnerIndex): OwnerKind {
  if (isUnassignedOwner(value)) return 'unassigned'
  const user = resolveOwnerUser(value, index)
  if (user) return 'human'
  const email = normalizeEmail(value)
  if (email) return 'inbox'
  return 'raw'
}

export function resolveOwnerDisplayName(
  value: string | null | undefined,
  index: OwnerIndex,
  fallback?: string | null
) {
  if (isUnassignedOwner(value)) return 'Unassigned'
  const user = resolveOwnerUser(value, index)
  if (user) return formatOwnerDisplayName(user, fallback ?? value ?? null)

  const normalized = normalizeOwnerKey(value)
  return String(fallback || normalized || 'Unassigned').trim() || 'Unassigned'
}

export function canonicalizeOwnerKey(value: string | null | undefined, index: OwnerIndex) {
  if (isUnassignedOwner(value)) return 'unassigned'
  const user = resolveOwnerUser(value, index)
  if (user) return user.id
  return normalizeOwnerKey(value)
}

export function buildOwnerDirectoryEntry(
  value: string | null | undefined,
  index: OwnerIndex,
  fallback?: string | null
): OwnerDirectoryEntry {
  const user = resolveOwnerUser(value, index)
  const key = canonicalizeOwnerKey(value, index)
  const email = user ? normalizeEmail(user.email) || user.email || null : normalizeEmail(value) || null
  const kind = resolveOwnerKind(value, index)

  return {
    key,
    displayName: resolveOwnerDisplayName(value, index, fallback),
    kind,
    userId: user?.id ?? null,
    email: email || null,
    firstName: user?.first_name ?? user?.firstName ?? null,
    lastName: user?.last_name ?? user?.lastName ?? null,
  }
}
