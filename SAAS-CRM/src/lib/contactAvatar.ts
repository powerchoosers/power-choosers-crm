type UnknownRecord = Record<string, unknown>

function cleanUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed
}

function fromRecord(record: UnknownRecord): string {
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
      const url = fromRecord(nested as UnknownRecord)
      if (url) return url
    }
  }

  return ''
}

export function resolveContactPhotoUrl(...sources: unknown[]): string {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const url = fromRecord(source as UnknownRecord)
    if (url) return url
  }
  return ''
}

