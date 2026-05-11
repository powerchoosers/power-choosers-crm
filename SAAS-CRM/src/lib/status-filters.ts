function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeStatusToken(value: unknown): string {
  if (value == null) return ''

  return String(value)
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase()
}

function parseContractEndDate(raw: unknown): Date | null {
  if (raw == null) return null

  const value = String(raw).trim()
  if (!value) return null

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const parsed = new Date(year, month - 1, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const mdyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdyMatch) {
    const month = Number(mdyMatch[1])
    const day = Number(mdyMatch[2])
    const year = Number(mdyMatch[3])
    const parsed = new Date(year, month - 1, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const fallback = new Date(value)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

function expandStatusTokens(values: unknown[], aliases: Record<string, string[]> = {}): string[] {
  const tokens = new Set<string>()

  for (const value of values) {
    const normalized = normalizeStatusToken(value)
    if (!normalized) continue

    const mapped = aliases[normalized] ?? [normalized]
    mapped.forEach((token) => {
      const expanded = normalizeStatusToken(token)
      if (expanded) tokens.add(expanded)
    })
  }

  return [...tokens]
}

export function buildStatusIlikeClauses(values: unknown[], aliases: Record<string, string[]> = {}): string[] {
  return expandStatusTokens(values, aliases).map((token) => `status.ilike.${token.toLowerCase()}`)
}

export function buildAccountStatusClauses(values: unknown[], today = getLocalDateString()): string[] {
  const clauses: string[] = []
  const push = (clause: string) => {
    if (!clauses.includes(clause)) clauses.push(clause)
  }

  for (const value of values) {
    const normalized = normalizeStatusToken(value)
    if (!normalized) continue

    switch (normalized) {
      case 'ACTIVE_LOAD':
        push(`and(status.ilike.active,contract_end_date.gte.${today})`)
        push(`and(status.ilike.active_load,contract_end_date.gte.${today})`)
        break
      case 'CUSTOMER':
        push('status.ilike.customer')
        break
      case 'PROSPECT':
        push('status.ilike.prospect')
        break
      case 'CHURNED':
        push('status.ilike.churned')
        break
      default:
        push(`status.ilike.${normalized.toLowerCase()}`)
        break
    }
  }

  return clauses
}

export function isCustomerStatus(value: unknown): boolean {
  return normalizeStatusToken(value) === 'CUSTOMER'
}

export function isContractActive(raw: unknown, reference = new Date()): boolean {
  const endDate = parseContractEndDate(raw)
  if (!endDate) return false

  const today = new Date(reference)
  today.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)
  return endDate >= today
}

export function isContractExpired(raw: unknown, reference = new Date()): boolean {
  const endDate = parseContractEndDate(raw)
  if (!endDate) return false

  const today = new Date(reference)
  today.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)
  return endDate < today
}

export function isActiveLoadAccount(
  account: { status?: unknown; contractEnd?: unknown; contract_end_date?: unknown },
  reference = new Date()
): boolean {
  const normalized = normalizeStatusToken(account.status)
  if (normalized !== 'ACTIVE' && normalized !== 'ACTIVE_LOAD') return false

  return isContractActive(account.contractEnd ?? account.contract_end_date, reference)
}

export function statusMatchesFilter(
  rowValue: unknown,
  filterValue: unknown,
  aliases: Record<string, string[]> = {}
): boolean {
  const rowToken = normalizeStatusToken(rowValue)
  if (!rowToken) return false

  const filterTokens = Array.isArray(filterValue) ? filterValue : [filterValue]
  const acceptable = new Set(expandStatusTokens(filterTokens, aliases))
  return acceptable.has(rowToken)
}
