export interface IntelligenceBriefLike {
  intelligenceBriefHeadline?: string | null
  intelligenceBriefDetail?: string | null
  intelligenceBriefOpener?: string | null
  intelligenceBriefTalkTrack?: string | null
  intelligenceBriefSignalDate?: string | null
  intelligenceBriefReportedAt?: string | null
  intelligenceBriefConfidenceLevel?: string | null
  intelligenceBriefStatus?: string | null
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function splitIntelligenceBriefSections(
  openerValue?: string | null,
  talkTrackValue?: string | null,
): { opener: string; talkTrack: string } {
  const opener = cleanText(openerValue)
  const talkTrack = cleanText(talkTrackValue)

  if (opener && talkTrack) {
    return { opener, talkTrack }
  }

  const source = talkTrack || opener
  if (!source) {
    return { opener: '', talkTrack: '' }
  }

  const segments = source
    .split(/(?<=[.!?])\s+/)
    .map(cleanText)
    .filter(Boolean)

  if (segments.length <= 1) {
    return {
      opener: opener || segments[0] || source,
      talkTrack: talkTrack || '',
    }
  }

  return {
    opener: opener || segments.shift() || '',
    talkTrack: talkTrack || segments.join(' '),
  }
}

function hasUsableBrief(account: IntelligenceBriefLike | null | undefined): boolean {
  if (!account) return false
  const status = cleanText(account.intelligenceBriefStatus).toLowerCase()
  if (status && ['empty', 'error', 'idle'].includes(status)) return false

  const headline = cleanText(account.intelligenceBriefHeadline)
  const detail = cleanText(account.intelligenceBriefDetail)
  const opener = cleanText(account.intelligenceBriefOpener)
  const talkTrack = cleanText(account.intelligenceBriefTalkTrack)
  const confidence = cleanText(account.intelligenceBriefConfidenceLevel).toLowerCase()

  if (!headline || !detail || (!opener && !talkTrack)) return false
  if (confidence === 'low') return false
  if (opener && opener.length < 4) return false
  return true
}

export function buildIntelligenceBriefContext(account: IntelligenceBriefLike | null | undefined): string {
  if (!hasUsableBrief(account)) return ''

  const headline = cleanText(account?.intelligenceBriefHeadline)
  const detail = cleanText(account?.intelligenceBriefDetail)
  const sections = splitIntelligenceBriefSections(
    account?.intelligenceBriefOpener,
    account?.intelligenceBriefTalkTrack,
  )
  const opener = cleanText(sections.opener)
  const talkTrack = cleanText(sections.talkTrack)
  const signalDate = cleanText(account?.intelligenceBriefSignalDate)
  const reportedAt = cleanText(account?.intelligenceBriefReportedAt)
  const confidence = cleanText(account?.intelligenceBriefConfidenceLevel)

  const lines = [
    'INTELLIGENCE BRIEF (primary research anchor when confidence is Medium or High):',
    headline ? `- Signal Headline: ${headline}` : null,
    detail ? `- Signal Detail: ${detail}` : null,
    opener ? `- Opener: ${opener}` : null,
    talkTrack ? `- Talk Track: ${talkTrack}` : null,
    signalDate ? `- Signal Date: ${signalDate}` : null,
    reportedAt ? `- Reported At: ${reportedAt}` : null,
    confidence ? `- Confidence: ${confidence}` : null,
    '- Use the opener as the first sentence when it is specific and credible, then use the talk track for the main reason for the note. Do not copy either one word-for-word.',
  ].filter(Boolean)

  return lines.join('\n')
}
