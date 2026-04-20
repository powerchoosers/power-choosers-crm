const VOICEMAIL_ANSWERED_BY_VALUES = new Set([
  'machine_start',
  'machine_end_beep',
  'machine_end_silence',
  'machine_end_other',
])

const HUMAN_ANSWERED_BY_VALUES = new Set([
  'human',
])

const UNKNOWN_ANSWERED_BY_VALUES = new Set([
  'unknown',
])

type VoiceCallLike = {
  status?: unknown
  duration?: unknown
  metadata?: {
    answeredBy?: unknown
  } | null
}

export function normalizeAnsweredBy(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function isVoicemailAnsweredBy(value: unknown): boolean {
  return VOICEMAIL_ANSWERED_BY_VALUES.has(normalizeAnsweredBy(value))
}

export function isHumanAnsweredBy(value: unknown): boolean {
  return HUMAN_ANSWERED_BY_VALUES.has(normalizeAnsweredBy(value))
}

export function isUnknownAnsweredBy(value: unknown): boolean {
  return UNKNOWN_ANSWERED_BY_VALUES.has(normalizeAnsweredBy(value))
}

export function isHumanConnectCall(call?: VoiceCallLike | null): boolean {
  if (!call) return false

  const answeredBy = normalizeAnsweredBy(call.metadata?.answeredBy)
  if (isVoicemailAnsweredBy(answeredBy) || isUnknownAnsweredBy(answeredBy)) {
    return false
  }

  if (isHumanAnsweredBy(answeredBy)) {
    return true
  }

  const status = normalizeAnsweredBy(call.status)
  const duration = Number(call.duration ?? 0)

  // Older normal-call rows do not always carry AMD verdicts yet.
  // Treat completed calls with actual duration as connected so the dashboard
  // reflects real daily activity instead of only the newer power-dial rows.
  return status === 'completed' && duration > 0
}
