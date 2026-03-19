export interface ForensicNoteSource {
  label: string
  notes?: string | null
}

export interface ForensicNoteEntry {
  sourceLabel: string
  timestamp: string | null
  content: string
  showSourceLabel: boolean
  sourceIndex: number
  entryIndex: number
}

function splitForensicEntries(notes: string) {
  const normalized = notes.trim()
  if (!normalized) return []

  // Timestamped terminal notes are split into entries. Plain descriptions stay as one block.
  const hasTimestampedEntries = /\[[0-9]{4}-[0-9]{2}-[0-9]{2}[^\]]*?\]/.test(normalized)
  if (!hasTimestampedEntries) return [normalized]

  return normalized
    .split(/\n\s*\n(?=\[[0-9]{4}-[0-9]{2}-[0-9]{2}[^\]]*?\])/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseForensicEntry(entry: string) {
  const match = entry.match(/^\[(.*?)\]\s*([\s\S]*)$/)
  if (!match) {
    return {
      timestamp: null,
      content: entry.trim(),
    }
  }

  return {
    timestamp: match[1]?.trim() || null,
    content: (match[2] || '').trim(),
  }
}

export function buildForensicNoteEntries(sources: ForensicNoteSource[]) {
  const entries: ForensicNoteEntry[] = []
  const dedupe = new Set<string>()

  sources.forEach((source, sourceIndex) => {
    const notes = source.notes?.trim()
    if (!notes) return

    splitForensicEntries(notes).forEach((entry, entryIndex) => {
      const parsed = parseForensicEntry(entry)
      if (!parsed.content) return
      const normalizedContent = parsed.content.replace(/\s+/g, ' ').trim().toLowerCase()
      const dedupeKey = `${parsed.timestamp || 'no-ts'}::${normalizedContent}`
      if (dedupe.has(dedupeKey)) return
      dedupe.add(dedupeKey)

      entries.push({
        sourceLabel: source.label,
        timestamp: parsed.timestamp,
        content: parsed.content,
        showSourceLabel: Boolean(parsed.timestamp),
        sourceIndex,
        entryIndex,
      })
    })
  })

  return entries.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      const byTimestamp = a.timestamp.localeCompare(b.timestamp)
      if (byTimestamp !== 0) return byTimestamp
    } else if (a.timestamp) {
      return -1
    } else if (b.timestamp) {
      return 1
    }

    if (a.sourceIndex !== b.sourceIndex) {
      return a.sourceIndex - b.sourceIndex
    }

    return a.entryIndex - b.entryIndex
  })
}

export function formatForensicNoteClipboard(entries: ForensicNoteEntry[]) {
  return entries
    .map((entry) => {
      const label = entry.showSourceLabel ? entry.sourceLabel : ''
      const timestampLine = entry.timestamp ? `[${entry.timestamp}]` : ''
      return [label, timestampLine, entry.content].filter(Boolean).join('\n')
    })
    .join('\n\n')
}
