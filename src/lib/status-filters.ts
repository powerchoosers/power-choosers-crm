const ACCOUNT_STATUS_ALIASES: Record<string, string[]> = {
  ACTIVE: ['ACTIVE_LOAD', 'ACTIVE'],
  ACTIVE_LOAD: ['ACTIVE_LOAD', 'ACTIVE'],
}

export function normalizeStatusToken(value: unknown): string {
  if (value == null) return ''

  return String(value)
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase()
}

function expandStatusTokens(values: unknown[], aliases: Record<string, string[]> = ACCOUNT_STATUS_ALIASES): string[] {
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

export function buildStatusIlikeClauses(values: unknown[], aliases: Record<string, string[]> = ACCOUNT_STATUS_ALIASES): string[] {
  return expandStatusTokens(values, aliases).map((token) => `status.ilike.${token.toLowerCase()}`)
}

export function statusMatchesFilter(
  rowValue: unknown,
  filterValue: unknown,
  aliases: Record<string, string[]> = ACCOUNT_STATUS_ALIASES
): boolean {
  const rowToken = normalizeStatusToken(rowValue)
  if (!rowToken) return false

  const filterTokens = Array.isArray(filterValue) ? filterValue : [filterValue]
  const acceptable = new Set(expandStatusTokens(filterTokens, aliases))
  return acceptable.has(rowToken)
}
