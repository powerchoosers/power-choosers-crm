const seenInboxToastIds = new Set<string>()

export function consumeInboxToastId(id?: string | null) {
  const key = String(id || '').trim()
  if (!key) return true
  if (seenInboxToastIds.has(key)) return false
  seenInboxToastIds.add(key)
  return true
}

export function markInboxToastIdSeen(id?: string | null) {
  const key = String(id || '').trim()
  if (!key) return
  seenInboxToastIds.add(key)
}
