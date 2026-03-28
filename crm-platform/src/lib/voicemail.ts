export type VoicemailGreeting = {
  enabled: boolean
  publicUrl: string | null
  storagePath: string | null
  fileName: string | null
  mimeType: string | null
  updatedAt: string | null
}

type NumberLike = string | { number?: string | null } | null | undefined

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
  }
}

export function getVoicemailGreeting(settings: SettingsLike | null | undefined): VoicemailGreeting | null {
  if (!settings || typeof settings !== 'object') return null
  return normalizeVoicemailGreeting(settings.voicemailGreeting || settings.voicemail || null)
}

export function extractNormalizedUserNumbers(settings: SettingsLike | null | undefined): string[] {
  if (!settings || typeof settings !== 'object') return []

  const numbers: string[] = []

  if (settings.selectedPhoneNumber) {
    if (typeof settings.selectedPhoneNumber === 'string') {
      numbers.push(settings.selectedPhoneNumber)
    } else if (typeof settings.selectedPhoneNumber === 'object' && settings.selectedPhoneNumber.number) {
      numbers.push(settings.selectedPhoneNumber.number)
    }
  }

  if (Array.isArray(settings.twilioNumbers)) {
    settings.twilioNumbers.forEach((entry) => {
      if (!entry) return
      if (typeof entry === 'string') {
        numbers.push(entry)
        return
      }
      if (typeof entry === 'object' && entry.number) {
        numbers.push(entry.number)
      }
    })
  }

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

export function buildVoicemailStoragePath(userId: string) {
  return `users/${userId}/${VOICEMAIL_FILE_NAME}`
}

