const VOICEMAIL_ANSWERED_BY_VALUES = new Set([
  'machine_start',
  'machine_end_beep',
  'machine_end_silence',
  'machine_end_other',
])

export function normalizeAnsweredBy(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function isVoicemailAnsweredBy(value: unknown): boolean {
  return VOICEMAIL_ANSWERED_BY_VALUES.has(normalizeAnsweredBy(value))
}
