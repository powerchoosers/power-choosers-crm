export interface ForensicNoteSource {
  label: string
  notes?: string | null
}

export interface ForensicNoteEntry {
  sourceLabel: string
  timestamp: string | null
  content: string
  sourceIndex: number
  entryIndex: number
}

function splitForensicEntries(notes: string) {
  return notes
    .split(/\n\s*\n/)
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

  sources.forEach((source, sourceIndex) => {
    const notes = source.notes?.trim()
    if (!notes) return

    splitForensicEntries(notes).forEach((entry, entryIndex) => {
      const parsed = parseForensicEntry(entry)
      if (!parsed.content) return

      entries.push({
        sourceLabel: source.label,
        timestamp: parsed.timestamp,
        content: parsed.content,
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
      const label = entry.sourceLabel
      const timestampLine = entry.timestamp ? `[${entry.timestamp}]` : ''
      return [label, timestampLine, entry.content].filter(Boolean).join('\n')
    })
    .join('\n\n')
}
