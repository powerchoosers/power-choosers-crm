import { normalizeEmail } from '@/lib/owner-display'

type OwnerScopeUser = {
  id?: string | null
  email?: string | null
}

const OWNER_EMAIL_ALIASES: Record<string, string[]> = {
  'nodalpoint.io': ['getnodalpoint.com'],
  'getnodalpoint.com': ['nodalpoint.io'],
}

function addEmailAliases(values: Set<string>, email?: string | null) {
  const normalized = normalizeEmail(email)
  if (!normalized) return

  values.add(normalized)

  const [localPart = '', domain = ''] = normalized.split('@')
  const aliases = OWNER_EMAIL_ALIASES[domain] || []
  for (const aliasDomain of aliases) {
    if (localPart && aliasDomain) {
      values.add(`${localPart}@${aliasDomain}`)
    }
  }
}

export function buildOwnerScopeValues(user?: OwnerScopeUser | null) {
  const values = new Set<string>()

  if (user?.id) {
    const id = String(user.id).trim()
    if (id) values.add(id)
  }

  addEmailAliases(values, user?.email)

  const rawEmail = String(user?.email || '').trim().toLowerCase()
  if (rawEmail) {
    values.add(rawEmail)
    addEmailAliases(values, rawEmail)
  }

  return Array.from(values)
}
