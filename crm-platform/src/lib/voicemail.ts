export type VoicemailGreeting = {
  enabled: boolean
  publicUrl: string | null
  storagePath: string | null
  fileName: string | null
  mimeType: string | null
  updatedAt: string | null
  twilioNumberSid: string | null
  twilioNumber: string | null
  twilioNumberName: string | null
}

export type TwilioNumberEntry = {
  name: string
  number: string
  sid: string | null
  selected: boolean
  voicemailGreeting: VoicemailGreeting | null
}

type NumberLike =
  | string
  | {
    number?: string | null
    phone?: string | null
    sid?: string | null
    phoneNumberSid?: string | null
    selected?: boolean
    name?: string | null
    voicemailGreeting?: unknown
    voicemail_greeting?: unknown
    voicemail?: unknown
  }
  | null
  | undefined

type SettingsLike = {
  selectedPhoneNumber?: NumberLike
  twilioNumbers?: NumberLike[]
  voicemailGreeting?: unknown
  voicemail?: unknown
}

export const VOICEMAIL_BUCKET = 'voicemail-greetings'
export const VOICEMAIL_FILE_NAME = 'greeting.wav'

export function digitsOnly(value: unknown): string {
  return (value == null ? '' : String(value)).replace(/\D/g, '')
}

export function normalizePhoneNumber(value: unknown): string | null {
  if (value == null) return null
  const str = String(value).trim()
  if (!str) return null

  const cleaned = str.replace(/\D/g, '')
  if (cleaned.length === 10) return `+1${cleaned}`
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`
  if (str.startsWith('+') && cleaned.length > 0) return `+${cleaned}`
  return null
}

export function normalizeVoicemailGreeting(value: unknown): VoicemailGreeting | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, any>
  const publicUrl = typeof raw.publicUrl === 'string'
    ? raw.publicUrl.trim()
    : typeof raw.public_url === 'string'
      ? raw.public_url.trim()
      : ''
  const storagePath = typeof raw.storagePath === 'string'
    ? raw.storagePath.trim()
    : typeof raw.storage_path === 'string'
      ? raw.storage_path.trim()
      : ''
  const fileName = typeof raw.fileName === 'string'
    ? raw.fileName.trim()
    : typeof raw.file_name === 'string'
      ? raw.file_name.trim()
      : ''
  const mimeType = typeof raw.mimeType === 'string'
    ? raw.mimeType.trim()
    : typeof raw.mime_type === 'string'
      ? raw.mime_type.trim()
      : ''
  const updatedAt = typeof raw.updatedAt === 'string'
    ? raw.updatedAt.trim()
    : typeof raw.updated_at === 'string'
      ? raw.updated_at.trim()
      : ''
  const twilioNumberSid = typeof raw.twilioNumberSid === 'string'
    ? raw.twilioNumberSid.trim()
    : typeof raw.twilio_number_sid === 'string'
      ? raw.twilio_number_sid.trim()
      : typeof raw.twilioNumberSID === 'string'
        ? raw.twilioNumberSID.trim()
        : ''
  const twilioNumber = typeof raw.twilioNumber === 'string'
    ? raw.twilioNumber.trim()
    : typeof raw.twilio_number === 'string'
      ? raw.twilio_number.trim()
      : ''
  const twilioNumberName = typeof raw.twilioNumberName === 'string'
    ? raw.twilioNumberName.trim()
    : typeof raw.twilio_number_name === 'string'
      ? raw.twilio_number_name.trim()
      : ''
  const enabledValue = raw.enabled
  const enabled = enabledValue === undefined ? true : Boolean(enabledValue)

  if (!publicUrl && !storagePath) return null

  return {
    enabled,
    publicUrl: publicUrl || null,
    storagePath: storagePath || null,
    fileName: fileName || null,
    mimeType: mimeType || null,
    updatedAt: updatedAt || null,
    twilioNumberSid: twilioNumberSid || null,
    twilioNumber: twilioNumber || null,
    twilioNumberName: twilioNumberName || null,
  }
}

export function normalizeTwilioNumberEntry(value: NumberLike): TwilioNumberEntry | null {
  if (!value) return null

  if (typeof value === 'string') {
    const number = normalizePhoneNumber(value)
    if (!number) return null
    return {
      name: 'Primary',
      number,
      sid: null,
      selected: false,
      voicemailGreeting: null,
    }
  }

  if (typeof value !== 'object') return null

  const raw = value as Record<string, any>
  const numberRaw = typeof raw.number === 'string'
    ? raw.number
    : typeof raw.phone === 'string'
      ? raw.phone
      : typeof raw.phoneNumber === 'string'
        ? raw.phoneNumber
        : ''
  const number = typeof numberRaw === 'string' ? numberRaw.trim() : ''
  if (!number) return null

  const sid = typeof raw.sid === 'string'
    ? raw.sid.trim()
    : typeof raw.phoneNumberSid === 'string'
      ? raw.phoneNumberSid.trim()
      : typeof raw.phone_number_sid === 'string'
        ? raw.phone_number_sid.trim()
        : null

  const name = typeof raw.name === 'string' ? raw.name.trim() : 'Primary'
  const selected = Boolean(raw.selected || false)
  const voicemailGreeting = normalizeVoicemailGreeting(
    raw.voicemailGreeting || raw.voicemail_greeting || raw.voicemail || null
  )

  return {
    name: name || 'Primary',
    number,
    sid: sid || null,
    selected,
    voicemailGreeting,
  }
}

export function normalizeTwilioNumberEntries(value: unknown): TwilioNumberEntry[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => normalizeTwilioNumberEntry(entry))
    .filter((entry): entry is TwilioNumberEntry => Boolean(entry))
}

export function getTwilioNumberEntries(settings: SettingsLike | null | undefined): TwilioNumberEntry[] {
  if (!settings || typeof settings !== 'object') return []
  return normalizeTwilioNumberEntries(settings.twilioNumbers)
}

export function getSelectedTwilioNumberEntry(settings: SettingsLike | null | undefined): TwilioNumberEntry | null {
  const entries = getTwilioNumberEntries(settings)
  if (!entries.length) return null

  const selectedPhoneNumber = normalizePhoneNumber(
    typeof settings?.selectedPhoneNumber === 'string'
      ? settings.selectedPhoneNumber
      : typeof settings?.selectedPhoneNumber === 'object' && settings.selectedPhoneNumber?.number
        ? settings.selectedPhoneNumber.number
        : ''
  )

  if (selectedPhoneNumber) {
    const selectedByNumber = entries.find((entry) => normalizePhoneNumber(entry.number) === selectedPhoneNumber)
    if (selectedByNumber) return selectedByNumber
  }

  const selectedByFlag = entries.find((entry) => entry.selected)
  if (selectedByFlag) return selectedByFlag

  return entries[0] || null
}

export function getTwilioNumberEntryForIdentifier(settings: SettingsLike | null | undefined, identifier: unknown): TwilioNumberEntry | null {
  const entries = getTwilioNumberEntries(settings)
  if (!entries.length) return null

  const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : ''
  const identifierDigits = digitsOnly(identifier)

  if (!normalizedIdentifier && !identifierDigits) {
    return getSelectedTwilioNumberEntry(settings)
  }

  return (
    entries.find((entry) => {
      if (entry.sid && normalizedIdentifier && entry.sid === normalizedIdentifier) return true

      const entryNormalized = normalizePhoneNumber(entry.number)
      const normalizedInput = normalizePhoneNumber(normalizedIdentifier)
      if (entryNormalized && normalizedInput && entryNormalized === normalizedInput) return true

      const entryDigits = digitsOnly(entry.number)
      if (identifierDigits && entryDigits === identifierDigits) return true

      return false
    }) || null
  )
}

export function voicemailGreetingMatchesIdentifier(greeting: VoicemailGreeting | null | undefined, identifier: unknown): boolean {
  if (!greeting) return false

  const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : ''
  const identifierDigits = digitsOnly(identifier)
  if (!normalizedIdentifier && !identifierDigits) return false

  if (greeting.twilioNumberSid && normalizedIdentifier && greeting.twilioNumberSid === normalizedIdentifier) {
    return true
  }

  const greetingNumber = normalizePhoneNumber(greeting.twilioNumber)
  const identifierNumber = normalizePhoneNumber(normalizedIdentifier)
  if (greetingNumber && identifierNumber && greetingNumber === identifierNumber) {
    return true
  }

  if (identifierDigits) {
    if (greetingNumber && digitsOnly(greetingNumber) === identifierDigits) return true
    if (greeting.twilioNumber && digitsOnly(greeting.twilioNumber) === identifierDigits) return true
  }

  return false
}

export function getVoicemailGreeting(settings: SettingsLike | null | undefined): VoicemailGreeting | null {
  if (!settings || typeof settings !== 'object') return null
  const selectedEntry = getSelectedTwilioNumberEntry(settings)
  if (selectedEntry) {
    const selectedGreeting = getVoicemailGreetingForTwilioNumber(settings, selectedEntry.sid || selectedEntry.number)
    if (selectedGreeting) return selectedGreeting
  }

  const legacyGreeting = normalizeVoicemailGreeting(settings.voicemailGreeting || settings.voicemail || null)
  if (!legacyGreeting) return null

  const entries = getTwilioNumberEntries(settings)
  if (!entries.length || entries.length === 1) {
    return legacyGreeting
  }

  return null
}

export function getVoicemailGreetingForTwilioNumber(settings: SettingsLike | null | undefined, identifier: unknown): VoicemailGreeting | null {
  if (!settings || typeof settings !== 'object') return getVoicemailGreeting(settings)

  const matchingEntry = getTwilioNumberEntryForIdentifier(settings, identifier)
  const entries = getTwilioNumberEntries(settings)
  const selectedEntry = getSelectedTwilioNumberEntry(settings)
  const selectedPhoneNumber = normalizePhoneNumber(
    typeof settings?.selectedPhoneNumber === 'string'
      ? settings.selectedPhoneNumber
      : typeof settings?.selectedPhoneNumber === 'object' && settings.selectedPhoneNumber?.number
        ? settings.selectedPhoneNumber.number
        : ''
  )
  const matchingEntryNumber = normalizePhoneNumber(matchingEntry?.number)
  const selectedEntryNumber = normalizePhoneNumber(selectedEntry?.number)

  const entryGreeting = normalizeVoicemailGreeting(matchingEntry?.voicemailGreeting || null)
  if (entryGreeting) return entryGreeting

  const legacyGreeting = normalizeVoicemailGreeting(settings.voicemailGreeting || settings.voicemail || null)
  if (!legacyGreeting) return null

  if (voicemailGreetingMatchesIdentifier(legacyGreeting, identifier)) {
    return legacyGreeting
  }

  if (matchingEntry && selectedEntryNumber && matchingEntryNumber && matchingEntryNumber === selectedEntryNumber) {
    return legacyGreeting
  }

  if (matchingEntry && selectedPhoneNumber && matchingEntryNumber && matchingEntryNumber === selectedPhoneNumber) {
    return legacyGreeting
  }

  if (!entries.length || entries.length === 1) {
    return legacyGreeting
  }

  return null
}

export function extractNormalizedUserNumbers(settings: SettingsLike | null | undefined): string[] {
  if (!settings || typeof settings !== 'object') return []

  const numbers: string[] = []

  const selectedEntry = getSelectedTwilioNumberEntry(settings)
  if (selectedEntry?.number) numbers.push(selectedEntry.number)

  getTwilioNumberEntries(settings).forEach((entry) => {
    if (entry.number) numbers.push(entry.number)
  })

  return numbers
    .map((num) => normalizePhoneNumber(num) || num)
    .map((num) => digitsOnly(num))
    .filter(Boolean)
}

export function resolveUserForBusinessNumber(users: any[] | null | undefined, businessNumber: unknown) {
  const normalizedBusiness = digitsOnly(businessNumber)
  if (!normalizedBusiness) return null

  return (users || []).find((user) => {
    const userNumbers = extractNormalizedUserNumbers(user?.settings || {})
    return userNumbers.some((num) => num === normalizedBusiness)
  }) || null
}

export function buildVoicemailStoragePath(identifier: string) {
  const safeIdentifier = String(identifier || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')

  return `twilio-numbers/${safeIdentifier || 'unknown'}/${VOICEMAIL_FILE_NAME}`
}
