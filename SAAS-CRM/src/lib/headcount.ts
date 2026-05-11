export type ParsedHeadcount = {
  value: number | null
  label: string
  min: number | null
  max: number | null
  raw: string
  isRange: boolean
}

type MetadataLike = Record<string, any> | null | undefined

const EMPTY_HEADCOUNT: ParsedHeadcount = {
  value: null,
  label: '',
  min: null,
  max: null,
  raw: '',
  isRange: false,
}

function compactInteger(value: number) {
  return Math.round(value).toLocaleString('en-US')
}

function normalizeHeadcountText(value: unknown) {
  return String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/\b(employees?|staff|people|headcount|company)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function multiplierForToken(token: string) {
  const unit = token.trim().toLowerCase().match(/[kmb]\s*$/)?.[0]?.trim()
  if (unit === 'k') return 1_000
  if (unit === 'm') return 1_000_000
  if (unit === 'b') return 1_000_000_000
  return 1
}

function parseNumericToken(token: string, fallbackMultiplier = 1) {
  const cleaned = token.trim().toLowerCase().replace(/,/g, '')
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/)
  if (!match) return null

  const base = Number(match[1])
  if (!Number.isFinite(base)) return null

  const explicitMultiplier = match[2] ? multiplierForToken(match[2]) : fallbackMultiplier
  return Math.round(base * explicitMultiplier)
}

function buildParsedHeadcount(raw: string, value: number | null, label: string, min: number | null, max: number | null, isRange: boolean): ParsedHeadcount {
  return {
    value,
    label,
    min,
    max,
    raw,
    isRange,
  }
}

export function parseHeadcount(input: unknown): ParsedHeadcount {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return EMPTY_HEADCOUNT
    const value = Math.round(input)
    return buildParsedHeadcount(String(input), value, compactInteger(value), value, value, false)
  }

  const raw = String(input ?? '').trim()
  if (!raw) return EMPTY_HEADCOUNT

  const normalized = normalizeHeadcountText(raw)
  if (!normalized) return EMPTY_HEADCOUNT

  const rangeMatch = normalized.match(/(\d[\d,]*(?:\.\d+)?\s*[kmb]?)\s*(?:-|to)\s*(\d[\d,]*(?:\.\d+)?\s*[kmb]?)/i)
  if (rangeMatch) {
    const [, leftToken, rightToken] = rangeMatch
    const rightMultiplier = multiplierForToken(rightToken)
    const min = parseNumericToken(leftToken, rightMultiplier)
    const max = parseNumericToken(rightToken)

    if (min !== null && max !== null) {
      const lower = Math.min(min, max)
      const upper = Math.max(min, max)
      const value = Math.floor((lower + upper) / 2)
      return buildParsedHeadcount(raw, value, `${compactInteger(lower)}-${compactInteger(upper)}`, lower, upper, true)
    }
  }

  const plusMatch = normalized.match(/^(\d[\d,]*(?:\.\d+)?\s*[kmb]?)\s*\+$/i)
  if (plusMatch) {
    const min = parseNumericToken(plusMatch[1])
    if (min !== null) {
      return buildParsedHeadcount(raw, min, `${compactInteger(min)}+`, min, null, true)
    }
  }

  const exactMatch = normalized.match(/^(\d[\d,]*(?:\.\d+)?\s*[kmb]?)$/i)
  if (exactMatch) {
    const value = parseNumericToken(exactMatch[1])
    if (value !== null) {
      return buildParsedHeadcount(raw, value, compactInteger(value), value, value, false)
    }
  }

  return EMPTY_HEADCOUNT
}

function firstText(values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

export function headcountMetadata(parsed: ParsedHeadcount, source?: string) {
  const metadata: Record<string, string | number> = {}

  if (parsed.raw) metadata.headcount_raw = parsed.raw
  if (parsed.label) metadata.headcount_label = parsed.label
  if (parsed.min !== null) metadata.headcount_min = parsed.min
  if (parsed.max !== null) metadata.headcount_max = parsed.max
  if (source && parsed.value !== null) metadata.headcount_source = source

  return metadata
}

export function findHeadcountInput(primary: unknown, metadata?: MetadataLike) {
  const sourceFields = metadata?.source_company_fields
  const apolloRaw = metadata?.apollo_raw_data

  return firstText([
    primary,
    metadata?.headcount_raw,
    metadata?.headcount_label,
    metadata?.employee_count,
    metadata?.employee_count_range,
    metadata?.headcount_range,
    sourceFields?.company_staff_count,
    sourceFields?.company_employee_count,
    sourceFields?.company_staff_count_range,
    sourceFields?.headcount,
    apolloRaw?.employees,
    apolloRaw?.employee_count,
    apolloRaw?.organization_num_employees,
  ])
}

export function formatHeadcountLabel(value: unknown, metadata?: MetadataLike) {
  const labelFromMetadata = firstText([
    metadata?.headcount_label,
    metadata?.headcount_range,
    metadata?.employee_count_range,
  ])

  if (labelFromMetadata) {
    const parsedLabel = parseHeadcount(labelFromMetadata)
    return parsedLabel.label || labelFromMetadata
  }

  const parsed = parseHeadcount(findHeadcountInput(value, metadata))
  return parsed.label
}

export function parseHeadcountValue(value: unknown, metadata?: MetadataLike) {
  return parseHeadcount(findHeadcountInput(value, metadata)).value
}
