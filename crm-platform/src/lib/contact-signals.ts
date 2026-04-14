export type ContactSignalKind = 'email' | 'phone'

export interface ContactSignalEntry {
  kind: ContactSignalKind
  value: string
  key: string
  score: number
  label?: string
  source?: string
  field?: string
  validation?: string
  derived?: boolean
}

export interface ContactSignalCollection {
  emails: ContactSignalEntry[]
  phones: ContactSignalEntry[]
}

export interface ContactAdditionalPhone {
  number: string
  type?: string
  signalScore?: number
  signalLabel?: string
  signalSource?: string
  signalKind?: 'phone'
  signalDerived?: boolean
}

const EMAIL_SIGNAL_FALLBACKS: Record<string, number> = {
  valid: 96,
  'accept all': 88,
  catch_all: 78,
  catchall: 78,
  risky: 58,
  unknown: 60,
  invalid: 18,
}

function clampScore(score: number) {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function normalizeSignalScore(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clampScore(raw)
  }

  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  const parsed = Number.parseFloat(trimmed.replace('%', ''))
  if (Number.isFinite(parsed)) {
    return clampScore(parsed)
  }

  const lowered = trimmed.toLowerCase()
  if (lowered in EMAIL_SIGNAL_FALLBACKS) {
    return EMAIL_SIGNAL_FALLBACKS[lowered as keyof typeof EMAIL_SIGNAL_FALLBACKS]
  }

  return null
}

function validationScore(raw: unknown): number {
  if (typeof raw !== 'string') return 60
  const lowered = raw.trim().toLowerCase()
  if (!lowered) return 60
  if (lowered.includes('invalid')) return 18
  if (lowered.includes('risky')) return 58
  if (lowered.includes('accept all')) return 88
  if (lowered.includes('catch')) return 78
  if (lowered.includes('valid')) return 96
  return 60
}

function normalizeEmailKey(value: string) {
  return value.trim().toLowerCase()
}

function normalizePhoneKey(value: string) {
  return value.replace(/\D/g, '')
}

function countOccurrences(values: string[], key: string) {
  return values.filter((value) => value === key).length
}

function derivePhoneScore(args: {
  value: string
  field: string
  duplicates: number
  sourceScore?: number | null
}) {
  if (args.sourceScore != null) return clampScore(args.sourceScore)

  const digits = normalizePhoneKey(args.value)
  let score = 50

  if (/mobile/i.test(args.field)) score += 24
  else if (/contact phone/i.test(args.field)) score += 18
  else if (/company phone/i.test(args.field)) score += 8

  if (digits.length >= 10 && digits.length <= 11) score += 16
  else if (digits.length > 11) score -= 18
  else if (digits.length > 0 && digits.length < 10) score -= 26

  if (args.duplicates > 1) {
    score += Math.min(args.duplicates - 1, 3) * 6
  }

  if (/^(\d)\1+$/.test(digits)) score -= 20
  if (digits.length >= 15) score -= 12

  return clampScore(score)
}

function parseSourceScore(source: unknown) {
  const score = normalizeSignalScore(source)
  return score == null ? null : score
}

function buildSignalEntry(args: {
  kind: ContactSignalKind
  field: string
  value: unknown
  label?: string
  source?: unknown
  validation?: unknown
  duplicates?: number
}): ContactSignalEntry | null {
  const rawValue = typeof args.value === 'string' ? args.value.trim() : String(args.value ?? '').trim()
  if (!rawValue) return null

  const sourceScore = parseSourceScore(args.source)
  const validation = typeof args.validation === 'string' ? args.validation.trim() : ''

  if (args.kind === 'email') {
    const score = sourceScore ?? validationScore(validation)
    return {
      kind: 'email' as const,
      value: rawValue,
      key: normalizeEmailKey(rawValue),
      score,
      label: args.label,
      source: args.field,
      field: args.field,
      validation: validation || undefined,
      derived: sourceScore == null,
    } as ContactSignalEntry
  }

  const score = derivePhoneScore({
    value: rawValue,
    field: args.field,
    duplicates: args.duplicates ?? 1,
    sourceScore,
  })

  return {
    kind: 'phone' as const,
    value: rawValue,
    key: normalizePhoneKey(rawValue),
    score,
    label: args.label,
    source: args.field,
    field: args.field,
    validation: validation || undefined,
    derived: sourceScore == null,
  } as ContactSignalEntry
}

function sortSignals<T extends ContactSignalEntry>(entries: T[]) {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.value.localeCompare(b.value)
  })
}

export function buildImportCommunicationSignals(row: Record<string, unknown>): ContactSignalCollection {
  const emailSources = [
    { field: 'Email 1', label: 'Email 1', validation: 'Email 1 Validation', score: 'Email 1 Total AI' },
    { field: 'Email 2', label: 'Email 2', validation: 'Email 2 Validation', score: 'Email 2 Total AI' },
    { field: 'Personal Email', label: 'Personal Email', validation: 'Personal Email Validation', score: 'Personal Email Total AI' },
  ]

  const phoneSources = [
    { field: 'Contact Phone 1', label: 'Contact Phone 1' },
    { field: 'Company Phone 1', label: 'Company Phone 1' },
    { field: 'Contact Phone 2', label: 'Contact Phone 2' },
    { field: 'Company Phone 2', label: 'Company Phone 2' },
    { field: 'Contact Phone 3', label: 'Contact Phone 3' },
    { field: 'Company Phone 3', label: 'Company Phone 3' },
    { field: 'Contact Mobile Phone', label: 'Contact Mobile Phone', score: 'Contact Mobile Phone 1 Total AI' },
    { field: 'Contact Mobile Phone 2', label: 'Contact Mobile Phone 2', score: 'Contact Mobile Phone 2 Total AI' },
    { field: 'Contact Mobile Phone 3', label: 'Contact Mobile Phone 3', score: 'Contact Mobile Phone 3 Total AI' },
  ]

  const rawPhoneValues = phoneSources
    .map((config) => String(row[config.field] ?? '').trim())
    .filter(Boolean)
    .map((value) => normalizePhoneKey(value))

  const emailEntries = emailSources
    .map((config) => buildSignalEntry({
      kind: 'email',
      field: config.field,
      label: config.label,
      value: row[config.field],
      validation: row[config.validation],
      source: row[config.score],
    }))
    .filter((entry): entry is ContactSignalEntry => !!entry)

  const phoneEntries = phoneSources
    .map((config) => {
      const rawValue = String(row[config.field] ?? '').trim()
      if (!rawValue) return null
      const duplicates = countOccurrences(rawPhoneValues, normalizePhoneKey(rawValue))
      const sourceScore = config.score ? row[config.score] : undefined
      const signal = buildSignalEntry({
        kind: 'phone',
        field: config.field,
        label: config.label,
        value: rawValue,
        source: sourceScore,
        duplicates,
      })
      return signal
    })
    .filter((entry): entry is ContactSignalEntry => !!entry)

  return {
    emails: sortSignals(emailEntries),
    phones: sortSignals(phoneEntries),
  }
}

export function pickBestSignal(entries?: ContactSignalEntry[] | null) {
  if (!entries || entries.length === 0) return null
  return sortSignals(entries)[0] ?? null
}

export function getSignalForValue(
  collection: ContactSignalCollection | null | undefined,
  value: string | null | undefined,
  kind?: ContactSignalKind
) {
  if (!collection || !value) return null

  const key = kind === 'phone' ? normalizePhoneKey(value) : normalizeEmailKey(value)
  const candidates = kind === 'phone'
    ? collection.phones
    : kind === 'email'
      ? collection.emails
      : [...collection.emails, ...collection.phones]

  return candidates.find((entry) => entry.key === key) ?? null
}

export function formatSignalPercent(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score)) return '--'
  return `${clampScore(score)}%`
}

export function getSignalTone(score: number | null | undefined) {
  const safeScore = score == null ? 0 : clampScore(score)

  if (safeScore >= 90) {
    return {
      textClass: 'text-emerald-400',
      fillClass: 'bg-emerald-500',
      trackClass: 'border-emerald-500/20',
    }
  }

  if (safeScore >= 75) {
    return {
      textClass: 'text-sky-400',
      fillClass: 'bg-[#002FA7]',
      trackClass: 'border-[#002FA7]/20',
    }
  }

  if (safeScore >= 55) {
    return {
      textClass: 'text-amber-400',
      fillClass: 'bg-amber-400',
      trackClass: 'border-amber-400/20',
    }
  }

  return {
    textClass: 'text-rose-400',
    fillClass: 'bg-rose-500',
    trackClass: 'border-rose-500/20',
  }
}
