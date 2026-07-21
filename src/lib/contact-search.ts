export interface SearchableContactIdentity {
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  title?: string | null
}

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesMaskedValue(searchWord: string, storedValue: string): boolean {
  if (!searchWord || !storedValue) return false
  if (storedValue.includes(searchWord)) return true

  if (storedValue.includes('*')) {
    const pattern = storedValue
      .split(/\*+/)
      .map(escapeRegExp)
      .join('.*')
    return new RegExp(`^${pattern}$`, 'i').test(searchWord)
  }

  const initialOnly = storedValue.length === 1 || /^[a-z]\.$/i.test(storedValue)
  return initialOnly && searchWord.length >= 2 && storedValue[0] === searchWord[0]
}

export function matchesContactSearch(contact: SearchableContactIdentity, searchTerm: string): boolean {
  const words = normalize(searchTerm).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true

  const name = normalize(contact.name)
  const firstName = normalize(contact.firstName)
  const lastName = normalize(contact.lastName)
  const title = normalize(contact.title)

  return words.every((word) =>
    name.includes(word) ||
    firstName.includes(word) ||
    title.includes(word) ||
    matchesMaskedValue(word, lastName)
  )
}
