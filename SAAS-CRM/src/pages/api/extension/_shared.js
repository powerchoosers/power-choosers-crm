export function trimText(value) {
  return String(value ?? '').trim()
}

export function normalizeOrigin(value) {
  const raw = trimText(value)
  if (!raw) return null
  try {
    const parsed = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
    return parsed.origin
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

export function normalizeDigits(value) {
  return trimText(value).replace(/\D/g, '')
}

export function unique(items) {
  return Array.from(new Set(items))
}

export function extractDomain(value) {
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

export function extractPhoneCandidates(text) {
  const source = trimText(text)
  if (!source) return []

  const regex = /(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}/g
  const matches = []

  let found
  while ((found = regex.exec(source)) !== null) {
    const digits = normalizeDigits(found[0])
    if (digits.length >= 10) {
      matches.push(digits.length > 10 ? digits.slice(-10) : digits)
    }
  }

  return unique(matches.filter(Boolean))
}

export function extractEmailCandidates(text) {
  const source = trimText(text)
  if (!source) return []

  const regex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const matches = source.match(regex) ?? []
  return unique(matches.map((item) => item.toLowerCase().trim()).filter(Boolean))
}

export function tokenizeSearchText(value, maxTokens = 8) {
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

export function inferNameParts(value) {
  const raw = trimText(value)
  if (!raw) return { firstName: null, lastName: null, fullName: null }

  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null, fullName: null }

  if (parts.length === 1) {
    const token = parts[0]
    const name = token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
    return { firstName: name, lastName: null, fullName: name }
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

