export interface IntelligenceBriefLike {
  intelligenceBriefHeadline?: string | null
  intelligenceBriefDetail?: string | null
  intelligenceBriefTalkTrack?: string | null
  intelligenceBriefSignalDate?: string | null
  intelligenceBriefReportedAt?: string | null
  intelligenceBriefConfidenceLevel?: string | null
  intelligenceBriefStatus?: string | null
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function hasUsableBrief(account: IntelligenceBriefLike | null | undefined): boolean {
  if (!account) return false
  const status = cleanText(account.intelligenceBriefStatus).toLowerCase()
  if (status && ['empty', 'error', 'idle'].includes(status)) return false

  const headline = cleanText(account.intelligenceBriefHeadline)
  const detail = cleanText(account.intelligenceBriefDetail)
  const talkTrack = cleanText(account.intelligenceBriefTalkTrack)
  const confidence = cleanText(account.intelligenceBriefConfidenceLevel).toLowerCase()

  if (!headline || !detail || !talkTrack) return false
  if (confidence === 'low') return false
  return true
}

export function buildIntelligenceBriefContext(account: IntelligenceBriefLike | null | undefined): string {
  if (!hasUsableBrief(account)) return ''

  const headline = cleanText(account?.intelligenceBriefHeadline)
  const detail = cleanText(account?.intelligenceBriefDetail)
  const talkTrack = cleanText(account?.intelligenceBriefTalkTrack)
  const signalDate = cleanText(account?.intelligenceBriefSignalDate)
  const reportedAt = cleanText(account?.intelligenceBriefReportedAt)
  const confidence = cleanText(account?.intelligenceBriefConfidenceLevel)

  const lines = [
    'INTELLIGENCE BRIEF (supporting context only, use one fact at most):',
    headline ? `- Signal Headline: ${headline}` : null,
    detail ? `- Signal Detail: ${detail}` : null,
    talkTrack ? `- Talk Track: ${talkTrack}` : null,
    signalDate ? `- Signal Date: ${signalDate}` : null,
    reportedAt ? `- Reported At: ${reportedAt}` : null,
    confidence ? `- Confidence: ${confidence}` : null,
  ].filter(Boolean)

  return lines.join('\n')
}

