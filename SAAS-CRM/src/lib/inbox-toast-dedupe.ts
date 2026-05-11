const STORAGE_KEY = 'np_inbox_toast_seen_v1'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function loadSeenIds(): Map<string, number> {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as Array<[string, number]>
    const now = Date.now()
    return new Map(parsed.filter(([, ts]) => now - ts < TTL_MS))
  } catch {
    return new Map()
  }
}

function saveSeenIds(map: Map<string, number>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())))
  } catch {
    // ignore quota errors
  }
}

const seenInboxToastIds = loadSeenIds()

export function consumeInboxToastId(id?: string | null) {
  const key = String(id || '').trim()
  if (!key) return true
  if (seenInboxToastIds.has(key)) return false
  seenInboxToastIds.set(key, Date.now())
  saveSeenIds(seenInboxToastIds)
  return true
}

export function markInboxToastIdSeen(id?: string | null) {
  const key = String(id || '').trim()
  if (!key) return
  seenInboxToastIds.set(key, Date.now())
  saveSeenIds(seenInboxToastIds)
}
