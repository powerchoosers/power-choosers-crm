export type ExtensionTwilioNumber = {
  name: string
  number: string
  selected?: boolean
}

export type ExtensionProfile = {
  email: string | null
  name: string | null
  firstName: string | null
  lastName: string | null
  jobTitle: string | null
  hostedPhotoUrl: string | null
  city: string | null
  state: string | null
  website: string | null
  twilioNumbers: ExtensionTwilioNumber[]
  selectedPhoneNumber: string | null
  bridgeToMobile: boolean
}

export type ExtensionAuth = {
  accessToken: string
  refreshToken: string | null
  email: string | null
  userId: string | null
  fullName: string | null
  firstName: string | null
  lastName: string | null
  appOrigin: string | null
  connectedAt: string
  profile: ExtensionProfile | null
  bootstrapStatus: string | null
}

export type PageSnapshot = {
  url: string
  origin: string
  title: string
  selectedText: string
  description: string
  headings: string[]
  emails: string[]
  phones: string[]
  capturedAt: string
}

export type MatchAccount = {
  id: string
  name: string
  domain: string | null
  industry: string | null
  city: string | null
  state: string | null
  phone: string | null
  logoUrl: string | null
  description: string | null
  website: string | null
  score: number
  reason: string
}

export type MatchContact = {
  id: string
  accountId: string | null
  accountName: string | null
  accountDomain: string | null
  name: string
  photoUrl: string | null
  email: string | null
  title: string | null
  phone: string | null
  mobile: string | null
  workPhone: string | null
  companyPhone: string | null
  otherPhone: string | null
  directPhone: string | null
  city: string | null
  state: string | null
  score: number
  reason: string
}

export type MatchResult = {
  account: MatchAccount | null
  contact: MatchContact | null
  accounts: MatchAccount[]
  contacts: MatchContact[]
  summary: string
  matchedAt: string
}

export type RecentCall = {
  id: string
  callSid: string
  to: string
  from: string
  status: string
  duration: number
  timestamp: string
  callTime: string
  outcome: string
  accountId: string
  accountName: string
  contactId: string
  contactName: string
  direction: string
  recordingUrl: string
  agentEmail: string
}

export type CallState = {
  enabled: boolean
  state: 'idle' | 'initializing' | 'ready' | 'incoming' | 'dialing' | 'connected' | 'ended' | 'error'
  deviceReady: boolean
  muted: boolean
  startedAt: string | null
  durationSec: number
  activeCallSid: string | null
  incomingFrom: string | null
  incomingDisplay: string | null
  incomingContactId: string | null
  incomingAccountId: string | null
  incomingContactName: string | null
  incomingAccountName: string | null
  lineStatus: string | null
  lastError: string | null
}

export type NoteEntry = {
  id: string
  text: string
  createdAt: string
  source: 'manual' | 'ai' | 'call' | 'system'
  targetType: 'contact' | 'account' | 'page' | 'call' | 'unknown'
  targetId: string | null
  title: string | null
  savedToCrm: boolean
}

export type ChatEntry = {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type ExtensionState = {
  auth: ExtensionAuth | null
  page: PageSnapshot | null
  pageStatus: 'idle' | 'capturing' | 'matched' | 'unmatched' | 'ingesting'
  match: MatchResult | null
  accountContacts: MatchContact[]
  call: CallState
  notes: NoteEntry[]
  chat: ChatEntry[]
  recentCalls: RecentCall[]
  lastUpdatedAt: string | null
}

export const STATE_KEY = 'nodal-point-extension-state'
export const DEFAULT_NOTE_LIMIT = 20
export const DEFAULT_CHAT_LIMIT = 12
export const DEFAULT_CALL_LIMIT = 5

export function defaultCallState(): CallState {
  return {
    enabled: false,
    state: 'idle',
    deviceReady: false,
    muted: false,
    startedAt: null,
    durationSec: 0,
    activeCallSid: null,
    incomingFrom: null,
    incomingDisplay: null,
    incomingContactId: null,
    incomingAccountId: null,
    incomingContactName: null,
    incomingAccountName: null,
    lineStatus: null,
    lastError: null,
  }
}

export function defaultState(): ExtensionState {
  return {
    auth: null,
    page: null,
    pageStatus: 'idle',
    match: null,
    accountContacts: [],
    call: defaultCallState(),
    notes: [],
    chat: [],
    recentCalls: [],
    lastUpdatedAt: null,
  }
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

export function trimText(value: unknown): string {
  return String(value ?? '').trim()
}

export function normalizeOrigin(value: string | null | undefined): string | null {
  const raw = trimText(value)
  if (!raw) return null
  try {
    const parsed = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
    return parsed.origin
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

export function extractDomain(value: string | null | undefined): string | null {
  const raw = trimText(value)
  if (!raw) return null
  let normal = raw.toLowerCase()
  try {
    if (normal.includes('://')) {
      normal = new URL(normal).hostname
    }
  } catch {
    normal = normal.replace(/^https?:\/\//, '')
  }
  normal = normal.replace(/^www\./, '')
  normal = normal.split('/')[0].split(':')[0].trim()
  return normal || null
}

export function normalizeDigits(value: string | null | undefined): string {
  return trimText(value).replace(/\D/g, '')
}

export function formatPhone(value: string | null | undefined): string | null {
  const digits = normalizeDigits(value)
  const ten = digits.length > 10 ? digits.slice(-10) : digits
  if (ten.length === 10) {
    return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
  }
  return digits || null
}

export function normalizeTwilioPhone(value: string | null | undefined): string | null {
  const raw = trimText(value)
  if (!raw) return null

  const digits = normalizeDigits(raw)
  if (raw.startsWith('+')) {
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    return digits.length >= 10 ? `+${digits}` : null
  }

  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function extractPhoneCandidates(text: string | null | undefined): string[] {
  const source = trimText(text)
  if (!source) return []
  const regex = /(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}/g
  const matches: string[] = []
  let found: RegExpExecArray | null
  while ((found = regex.exec(source)) !== null) {
    const digits = normalizeDigits(found[0])
    if (digits.length >= 10) {
      matches.push(digits.length > 10 ? digits.slice(-10) : digits)
    }
  }
  return unique(matches.filter(Boolean))
}

export function extractEmailCandidates(text: string | null | undefined): string[] {
  const source = trimText(text)
  if (!source) return []
  const regex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const matches = source.match(regex) ?? []
  return unique(matches.map((item) => item.toLowerCase().trim()).filter(Boolean))
}

function cleanUrl(value: unknown): string {
  return trimText(value)
}

function resolveNestedPhotoUrl(record: Record<string, unknown>): string {
  const directKeys = [
    'photoUrl',
    'photo_url',
    'avatarUrl',
    'avatar_url',
    'profilePhotoUrl',
    'profile_photo_url',
    'hostedPhotoUrl',
    'hosted_photo_url',
    'imageUrl',
    'image_url',
  ]

  for (const key of directKeys) {
    const url = cleanUrl(record[key])
    if (url) return url
  }

  const nestedKeys = ['metadata', 'general', 'contact', 'original_apollo_data']
  for (const key of nestedKeys) {
    const nested = record[key]
    if (nested && typeof nested === 'object') {
      const url = resolveNestedPhotoUrl(nested as Record<string, unknown>)
      if (url) return url
    }
  }

  return ''
}

export function resolveContactPhotoUrl(...sources: unknown[]): string {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const url = resolveNestedPhotoUrl(source as Record<string, unknown>)
    if (url) return url
  }
  return ''
}

export function tokenizeSearchText(value: string | null | undefined, maxTokens = 8): string[] {
  return unique(
    trimText(value)
      .toLowerCase()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[()"'“”‘’.,;:!?/\\[\]{}<>]+/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .slice(0, maxTokens)
  )
}

export function inferNameParts(value: string | null | undefined): {
  firstName: string | null
  lastName: string | null
  fullName: string | null
} {
  const raw = trimText(value)
  if (!raw) return { firstName: null, lastName: null, fullName: null }
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null, fullName: null }
  if (parts.length === 1) {
    const token = parts[0]
    return {
      firstName: token.charAt(0).toUpperCase() + token.slice(1).toLowerCase(),
      lastName: null,
      fullName: token.charAt(0).toUpperCase() + token.slice(1).toLowerCase(),
    }
  }
  const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  const lastName = parts.slice(1).join(' ')
  const resolvedLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase()
  return {
    firstName,
    lastName: resolvedLastName,
    fullName: `${firstName} ${resolvedLastName}`.trim(),
  }
}

export function normalizeTwilioNumbers(raw: unknown): ExtensionTwilioNumber[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (!entry) return null
      if (typeof entry === 'string') {
        const number = normalizeTwilioPhone(entry)
        if (!number) return null
        return { name: 'Primary', number }
      }
      if (typeof entry === 'object') {
        const candidate = entry as Record<string, unknown>
        const number = normalizeTwilioPhone(String(candidate.number ?? candidate.phone ?? ''))
        if (!number) return null
        return {
          name: trimText(candidate.name ?? 'Primary') || 'Primary',
          number,
        }
      }
      return null
    })
    .filter((item): item is ExtensionTwilioNumber => !!item)
}

export function normalizeAuthPayload(payload: any, appOrigin?: string | null): ExtensionAuth | null {
  const source = payload?.currentSession && typeof payload.currentSession === 'object'
    ? payload.currentSession
    : payload

  const accessToken = trimText(source?.access_token ?? source?.accessToken ?? source?.token)
  if (!accessToken) return null

  const user = source?.user ?? payload?.user ?? {}
  const metadata = user?.user_metadata ?? user?.userMetadata ?? payload?.user_metadata ?? {}
  const email = trimText(user?.email ?? payload?.email ?? source?.email) || null
  const userId = trimText(user?.id ?? payload?.userId ?? source?.userId) || null
  const fullNameRaw = trimText(metadata?.full_name ?? metadata?.fullName ?? payload?.fullName ?? user?.full_name ?? user?.fullName)
  const inferred = inferNameParts(fullNameRaw || email)
  const profilePayload = payload?.profile && typeof payload.profile === 'object' ? payload.profile : null

  return {
    accessToken,
    refreshToken: trimText(source?.refresh_token ?? source?.refreshToken) || null,
    email,
    userId,
    fullName: fullNameRaw || inferred.fullName,
    firstName: trimText(payload?.firstName ?? inferred.firstName) || null,
    lastName: trimText(payload?.lastName ?? inferred.lastName) || null,
    appOrigin: normalizeOrigin(appOrigin ?? payload?.appOrigin ?? null),
    connectedAt: new Date().toISOString(),
    profile: profilePayload
      ? {
          email,
          name: trimText(profilePayload.name ?? fullNameRaw ?? inferred.fullName) || null,
          firstName: trimText(profilePayload.firstName ?? inferred.firstName) || null,
          lastName: trimText(profilePayload.lastName ?? inferred.lastName) || null,
          jobTitle: trimText(profilePayload.jobTitle ?? payload?.jobTitle) || null,
          hostedPhotoUrl: trimText(profilePayload.hostedPhotoUrl ?? payload?.hostedPhotoUrl) || null,
          city: trimText(profilePayload.city ?? payload?.city) || null,
          state: trimText(profilePayload.state ?? payload?.state) || null,
          website: trimText(profilePayload.website ?? payload?.website) || null,
          twilioNumbers: normalizeTwilioNumbers(profilePayload.twilioNumbers ?? payload?.twilioNumbers),
          selectedPhoneNumber: trimText(profilePayload.selectedPhoneNumber ?? payload?.selectedPhoneNumber) || null,
          bridgeToMobile: Boolean(profilePayload.bridgeToMobile ?? payload?.bridgeToMobile ?? false),
        }
      : null,
    bootstrapStatus: trimText(payload?.bootstrapStatus) || null,
  }
}

export function resolveCallerId(auth: ExtensionAuth | null): string | null {
  // 1. Explicit top-level selection
  const selected = normalizeTwilioPhone(auth?.profile?.selectedPhoneNumber)
  if (selected) return selected

  // 2. Scan array for 'selected' flag (more robust for index-based selection)
  const numbers = auth?.profile?.twilioNumbers
  if (Array.isArray(numbers) && numbers.length > 0) {
    const marked = numbers.find((entry) => entry && entry.selected === true && normalizeTwilioPhone(entry.number))
    if (marked) return normalizeTwilioPhone(marked.number)

    // 3. Fallback to first valid number
    const first = numbers.find((entry) => entry && normalizeTwilioPhone(entry.number))
    if (first) return normalizeTwilioPhone(first.number)
  }
  return null
}

export function buildPageContext(page: PageSnapshot | null): string {
  if (!page) return 'No page snapshot is currently loaded.'
  const pieces: string[] = [
    `Title: ${page.title}`,
    `URL: ${page.url}`,
    page.description ? `Description: ${page.description}` : '',
    page.selectedText ? `Selected text: ${page.selectedText}` : '',
    page.headings.length ? `Headings: ${page.headings.slice(0, 6).join(' | ')}` : '',
    page.emails.length ? `Emails: ${page.emails.join(' | ')}` : '',
    page.phones.length ? `Phones: ${page.phones.join(' | ')}` : '',
  ]
  return pieces.filter(Boolean).join('\n')
}

export function buildMatchContext(match: MatchResult | null): string {
  if (!match) return 'No CRM record has been matched yet.'
  const lines: string[] = [match.summary]
  if (match.contact) {
    lines.push(`Contact: ${match.contact.name}`)
    if (match.contact.title) lines.push(`Title: ${match.contact.title}`)
    if (match.contact.accountName) lines.push(`Account: ${match.contact.accountName}`)
  }
  if (match.account) {
    lines.push(`Account: ${match.account.name}`)
    if (match.account.industry) lines.push(`Industry: ${match.account.industry}`)
    if (match.account.city || match.account.state) lines.push(`Location: ${[match.account.city, match.account.state].filter(Boolean).join(', ')}`)
  }
  return lines.filter(Boolean).join('\n')
}

export function buildCallContext(call: CallState): string {
  const lines: string[] = [
    `Enabled: ${call.enabled ? 'yes' : 'no'}`,
    `State: ${call.state}`,
    `Device ready: ${call.deviceReady ? 'yes' : 'no'}`,
    `Muted: ${call.muted ? 'yes' : 'no'}`,
  ]
  if (call.incomingFrom) lines.push(`Incoming from: ${call.incomingFrom}`)
  if (call.incomingDisplay) lines.push(`Incoming display: ${call.incomingDisplay}`)
  if (call.activeCallSid) lines.push(`Call SID: ${call.activeCallSid}`)
  if (call.lineStatus) lines.push(`Line status: ${call.lineStatus}`)
  if (call.lastError) lines.push(`Last error: ${call.lastError}`)
  return lines.join('\n')
}

export function buildContextPrompt(args: {
  page: PageSnapshot | null
  match: MatchResult | null
  call: CallState
  noteDraft: string
  focus: 'summary' | 'recap' | 'chat'
}): string {
  const segments = [
    'You are the Nodal Point browser extension assistant.',
    'Be concise, factual, and operational. Do not pad the answer.',
    '',
    'PAGE CONTEXT',
    buildPageContext(args.page),
    '',
    'CRM MATCH',
    buildMatchContext(args.match),
    '',
    'CALL CONTEXT',
    buildCallContext(args.call),
    '',
    args.noteDraft.trim() ? `CURRENT NOTE DRAFT\n${args.noteDraft.trim()}` : 'CURRENT NOTE DRAFT\nNo note draft yet.',
  ]

  if (args.focus === 'summary') {
    segments.push(
      '',
      'TASK',
      'Summarize the page for CRM logging in 3 bullets, then add one direct next action.'
    )
  } else if (args.focus === 'recap') {
    segments.push(
      '',
      'TASK',
      'Write a short call recap suitable for a follow-up task. Include outcome, objection, and next step if available.'
    )
  } else {
    segments.push(
      '',
      'TASK',
      'Answer the user question using the page, CRM match, and call context above. If the data is missing, say so plainly.'
    )
  }

  return segments.join('\n')
}

export function buildTransmissionNoteBody(args: {
  note: string
  page: PageSnapshot | null
  match: MatchResult | null
  auth: ExtensionAuth | null
}) {
  const lines = [
    args.note.trim(),
    '',
    '---',
    `Captured: ${new Date().toLocaleString()}`,
    args.page ? `Page: ${args.page.title}` : 'Page: Unknown',
    args.page ? `URL: ${args.page.url}` : 'URL: Unknown',
    args.page?.selectedText ? `Selected: ${args.page.selectedText}` : '',
    args.match?.contact ? `Contact: ${args.match.contact.name}${args.match.contact.title ? ` • ${args.match.contact.title}` : ''}` : '',
    args.match?.account ? `Account: ${args.match.account.name}${args.match.account.industry ? ` • ${args.match.account.industry}` : ''}` : '',
    args.auth?.fullName ? `Saved by: ${args.auth.fullName}` : '',
  ]

  return lines.filter(Boolean).join('\n')
}

export function buildTransmissionTaskTitle(page: PageSnapshot | null, match: MatchResult | null): string {
  const subject = match?.contact?.name || match?.account?.name || page?.title || 'Transmission Log'
  return `Transmission Log: ${subject}`
}

export function buildRecentActivityLabel(call: RecentCall): string {
  const name = call.contactName || call.accountName || call.to || call.from || 'Unknown call'
  const outcome = call.outcome || call.status || 'Call'
  return `${name} • ${outcome}`
}

export function formatElapsed(startedAt: string | null, now = Date.now()): string {
  if (!startedAt) return '00:00'
  const started = new Date(startedAt).getTime()
  if (!Number.isFinite(started)) return '00:00'
  const total = Math.max(0, Math.floor((now - started) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
