export type CallContextRecord = {
  id?: string | null
  timestamp?: string | null
  direction?: string | null
  status?: string | null
  duration?: number | string | null
  transcript?: string | null
  summary?: string | null
  aiInsights?: unknown
}

export type UsableCallContextEntry = {
  id: string
  timestamp: string
  localTime: string
  relativeTimeHint: string
  direction: string
  status: string
  durationSeconds: number
  summary: string
  transcriptSnippet: string
  insightsSummary: string
}

const NOISE_PATTERNS = [
  /no answer/i,
  /left (?:a )?voicemail/i,
  /voicemail/i,
  /extension/i,
  /press \d/i,
  /directory/i,
  /menu options/i,
  /if you know your party's extension/i,
  /thank you for calling/i,
  /please hold/i,
  /call may be recorded/i,
  /wrong number/i,
  /busy signal/i,
  /disconnected/i,
  /not available/i,
  /no response/i,
  /could not connect/i,
  /phone number/i,
  /call dropped/i,
]

const HUMAN_PATTERNS = [
  /\bmy name is\b/i,
  /\bthis is\b/i,
  /\bI'm calling\b/i,
  /\bI was calling\b/i,
  /\bcan you\b/i,
  /\bcan i help you\b/i,
  /\bwhat can I help you\b/i,
  /\bwho's this\b/i,
  /\bmay I ask who's speaking\b/i,
  /\bwe're not looking\b/i,
  /\bI appreciate the call\b/i,
  /\bthank you\b/i,
]

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripTranscriptNoise(value: string) {
  return cleanWhitespace(
    value
      .replace(/\[(?:noise|music|ring|hes|foreign|unk)\]/gi, ' ')
      .replace(/\s*\[\s*\]/g, ' ')
  )
}

function hasHumanSignal(value: string) {
  return HUMAN_PATTERNS.some((pattern) => pattern.test(value))
}

function isNoiseHeavySegment(value: string) {
  const text = cleanWhitespace(value)
  if (!text) return true

  const lower = text.toLowerCase()
  const startsLikeMenu = /^(thank you for calling|for |to |please |if you know your party|press \d|please hold|menu options)/i.test(text)
  const menuKeywordCount = (lower.match(/\b(press|directory|menu|extension|operator|please hold|try to connect)\b/g) || []).length
  const noiseSignalCount = NOISE_PATTERNS.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0)

  // Treat short menu-like snippets as noise unless they also look like a real person exchange.
  if ((startsLikeMenu || menuKeywordCount >= 2 || noiseSignalCount >= 2) && !hasHumanSignal(text)) {
    return true
  }
  return false
}

function extractHumanConversationSnippet(rawTranscript: string, maxChars = 500) {
  const transcript = stripTranscriptNoise(rawTranscript)
  if (!transcript) return ''

  const segments = transcript
    .split(/[.?!]\s+/)
    .map((segment) => cleanWhitespace(segment))
    .filter(Boolean)

  if (!segments.length) return transcript.slice(0, maxChars)

  const humanCandidateIndexes = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => hasHumanSignal(segment) && !isNoiseHeavySegment(segment) && segment.length > 20)
    .map(({ index }) => index)

  // On transferred calls, later segments are often the real conversation with the target contact.
  let startIndex = humanCandidateIndexes.length ? humanCandidateIndexes[humanCandidateIndexes.length - 1] : -1
  if (startIndex < 0) {
    startIndex = segments.findIndex((segment) => !isNoiseHeavySegment(segment) && segment.length > 20)
  }
  if (startIndex < 0) {
    startIndex = 0
  }

  const conversation = cleanWhitespace(segments.slice(startIndex).join('. '))
  return (conversation || transcript).slice(0, maxChars)
}

function normalizeAiInsights(raw: unknown): string {
  if (!raw) return ''
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (parsed && typeof parsed === 'object' && typeof (parsed as { summary?: unknown }).summary === 'string') {
      return cleanWhitespace(String((parsed as { summary: string }).summary))
    }
  } catch {
    return ''
  }
  return ''
}

export function parseCallInsightsSummary(raw: unknown): string {
  return normalizeAiInsights(raw)
}

export function isUsableCallContext(record: CallContextRecord): boolean {
  const transcript = extractHumanConversationSnippet(String(record.transcript || ''))
  const summary = cleanWhitespace(String(record.summary || ''))
  const insights = normalizeAiInsights(record.aiInsights)
  const combined = cleanWhitespace([transcript, summary, insights].filter(Boolean).join(' '))
  if (!combined) return false

  const includesHumanSignal = hasHumanSignal(combined)
  const hasNoiseSignal = NOISE_PATTERNS.some((pattern) => pattern.test(combined))
  if (hasNoiseSignal && !includesHumanSignal) return false

  const tokenCount = combined.split(/\s+/).filter(Boolean).length
  if (tokenCount < 8 && !includesHumanSignal) return false

  return true
}

function getTzYmd(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value || '1970'
  const month = parts.find((p) => p.type === 'month')?.value || '01'
  const day = parts.find((p) => p.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

function dayDiffInTz(callDate: Date, now: Date, timeZone: string): number {
  const callYmd = getTzYmd(callDate, timeZone)
  const nowYmd = getTzYmd(now, timeZone)
  const callUtc = new Date(`${callYmd}T00:00:00Z`).getTime()
  const nowUtc = new Date(`${nowYmd}T00:00:00Z`).getTime()
  return Math.round((nowUtc - callUtc) / (1000 * 60 * 60 * 24))
}

function getRelativeTimeHint(callDate: Date, now = new Date(), timeZone = 'America/Chicago'): string {
  const dayDiff = dayDiffInTz(callDate, now, timeZone)
  if (dayDiff <= 0) {
    const hourStr = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(callDate)
    const hour = Number(hourStr)
    if (!Number.isNaN(hour) && hour < 12) return 'earlier this morning'
    if (!Number.isNaN(hour) && hour < 17) return 'earlier this afternoon'
    return 'earlier today'
  }
  if (dayDiff === 1) return 'yesterday'
  if (dayDiff <= 3) return `${dayDiff} days ago`
  if (dayDiff <= 7) return 'earlier this week'
  if (dayDiff <= 14) return 'about a week ago'
  return 'earlier this month'
}

function formatLocalCallTime(date: Date, timeZone = 'America/Chicago'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  }).format(date)
}

export function buildUsableCallContextEntries(
  calls: CallContextRecord[],
  limit = 5,
  timeZone = 'America/Chicago'
): UsableCallContextEntry[] {
  return (calls || [])
    .filter((call) => isUsableCallContext(call))
    .map((call) => {
      const timestamp = String(call.timestamp || '')
      const date = timestamp ? new Date(timestamp) : null
      const validDate = date && !Number.isNaN(date.getTime()) ? date : null
      const transcript = extractHumanConversationSnippet(String(call.transcript || ''))
      const summary = cleanWhitespace(String(call.summary || ''))
      const insightsSummary = normalizeAiInsights(call.aiInsights)
      const transcriptSnippet = transcript ? transcript.slice(0, 500) : (summary || insightsSummary).slice(0, 500)

      return {
        id: String(call.id || ''),
        timestamp,
        localTime: validDate ? formatLocalCallTime(validDate, timeZone) : 'Unknown time',
        relativeTimeHint: validDate ? getRelativeTimeHint(validDate, new Date(), timeZone) : 'recently',
        direction: String(call.direction || ''),
        status: String(call.status || ''),
        durationSeconds: typeof call.duration === 'number' ? call.duration : 0,
        summary,
        transcriptSnippet,
        insightsSummary,
      }
    })
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, limit)
}

export function buildUsableCallContextBlock(calls: CallContextRecord[], limit = 5) {
  const entries = buildUsableCallContextEntries(calls, limit)
  if (!entries.length) return ''

  const lines: string[] = ['RECENT CALL HISTORY (usable transmission log only):']
  entries.forEach((entry, idx) => {
    const type = entry.direction || 'call'
    lines.push(`  ${type.toUpperCase()} ${idx + 1} (${entry.localTime})`)
    lines.push(`  Timing Cue: ${entry.relativeTimeHint}`)
    lines.push(`  Summary: ${entry.summary || entry.insightsSummary || 'No summary available.'}`)
    if (entry.transcriptSnippet) {
      lines.push(`  Transcript Snippet: ${entry.transcriptSnippet}`)
    }
  })
  return lines.join('\n')
}
