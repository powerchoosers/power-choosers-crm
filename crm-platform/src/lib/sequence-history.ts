type SequenceHistoryRow = {
  id?: string | null
  scheduled_at?: string | null
  created_at?: string | null
  step_type?: string | null
  status?: string | null
  metadata?: Record<string, any> | null
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeWhitespace(value: string): string {
  return cleanText(value).replace(/\s+/g, ' ')
}

function stripHtml(value: string): string {
  return normalizeWhitespace(value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
}

function firstSentence(value: string): string {
  const cleaned = normalizeWhitespace(value)
  if (!cleaned) return ''
  const match = cleaned.match(/^(.+?[.!?])(?:\s|$)/)
  return normalizeWhitespace(match?.[1] || cleaned.slice(0, 180))
}

function summarizeBody(row: SequenceHistoryRow): string {
  const meta = row.metadata || {}
  const rawBody = cleanText(meta.body) || cleanText(meta.aiBody) || cleanText(meta.generatedBody) || cleanText(meta.text)
  if (!rawBody) return ''
  const plain = stripHtml(rawBody)
  return firstSentence(plain || rawBody)
}

function getStageLabel(row: SequenceHistoryRow): string {
  const meta = row.metadata || {}
  return cleanText(meta.label)
    || cleanText(meta.sequenceLabel)
    || cleanText(meta.subject)
    || cleanText(meta.aiSubject)
    || cleanText(meta.sequenceStage)
    || cleanText(meta.replyStage)
    || cleanText(row.step_type)
    || 'prior touch'
}

function getSubjectLabel(row: SequenceHistoryRow): string {
  const meta = row.metadata || {}
  return cleanText(meta.subject) || cleanText(meta.aiSubject) || ''
}

function getDateLabel(row: SequenceHistoryRow): string {
  const raw = cleanText(row.scheduled_at) || cleanText(row.created_at)
  if (!raw) return ''
  return raw.slice(0, 10)
}

export function buildSequenceHistoryBlock(rows: SequenceHistoryRow[] | null | undefined): string {
  const items = Array.isArray(rows) ? rows.filter(Boolean).slice(0, 3) : []
  if (!items.length) return ''

  const lines = items.map((row) => {
    const bits = [
      getDateLabel(row) ? `[${getDateLabel(row)}]` : null,
      getStageLabel(row),
      getSubjectLabel(row) ? `subject: ${getSubjectLabel(row)}` : null,
      summarizeBody(row) ? `angle: ${summarizeBody(row)}` : null,
    ].filter(Boolean)
    return `- ${bits.join(' | ')}`
  })

  return [
    'PRIOR SEQUENCE TOUCHES:',
    ...lines,
    'Use this history to stay adjacent to the last angle, not repeat it word for word.',
  ].join('\n')
}
