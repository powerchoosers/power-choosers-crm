import { normalizeEmail } from '@/lib/owner-display'

type OwnerScopeUser = {
  id?: string | null
  email?: string | null
}

export function buildOwnerScopeValues(user?: OwnerScopeUser | null) {
  const values = new Set<string>()

  if (user?.id) {
    const id = String(user.id).trim()
    if (id) values.add(id)
  }

  const email = normalizeEmail(user?.email)
  if (email) {
    values.add(email)
  }

  const rawEmail = String(user?.email || '').trim().toLowerCase()
  if (rawEmail) {
    values.add(rawEmail)
  }

  return Array.from(values)
}
