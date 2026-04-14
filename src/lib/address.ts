export interface ParsedAddressParts {
  street: string
  city: string
  state: string
  zip: string
}

const US_STATE_BY_NAME: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
}

function cleanText(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeStateToken(value: string): string {
  const trimmed = cleanText(value).replace(/\./g, '')
  if (!trimmed) return ''

  const upper = trimmed.toUpperCase()
  if (/^[A-Z]{2}$/.test(upper)) return upper

  const normalizedKey = trimmed.toLowerCase()
  return US_STATE_BY_NAME[normalizedKey] || trimmed
}

function parseStateZipChunk(value: string): { state: string; zip: string } {
  const trimmed = cleanText(value)
  if (!trimmed) return { state: '', zip: '' }

  const match = trimmed.match(/^([A-Za-z. ]+?)(?:,\s*|\s+)(\d{5}(?:-\d{4})?)$/)
  if (match) {
    return {
      state: normalizeStateToken(match[1]),
      zip: cleanText(match[2]),
    }
  }

  const justState = trimmed.match(/^([A-Za-z. ]+)$/)
  if (justState) {
    return {
      state: normalizeStateToken(justState[1]),
      zip: '',
    }
  }

  return { state: normalizeStateToken(trimmed), zip: '' }
}

export function parseAddressParts(input?: string | null): ParsedAddressParts {
  if (!input) return { street: '', city: '', state: '', zip: '' }

  const trimmed = cleanText(input)
  if (!trimmed) return { street: '', city: '', state: '', zip: '' }

  const streetCityStateZip = trimmed.match(/^(.+?),\s*([^,]+?),\s*([A-Za-z. ]+?)(?:,\s*|\s+)(\d{5}(?:-\d{4})?)$/)
  if (streetCityStateZip) {
    return {
      street: cleanText(streetCityStateZip[1]),
      city: cleanText(streetCityStateZip[2]),
      state: normalizeStateToken(streetCityStateZip[3]),
      zip: cleanText(streetCityStateZip[4]),
    }
  }

  const cityStateZip = trimmed.match(/^([^,]+?),\s*([A-Za-z. ]+?)(?:,\s*|\s+)(\d{5}(?:-\d{4})?)$/)
  if (cityStateZip) {
    return {
      street: '',
      city: cleanText(cityStateZip[1]),
      state: normalizeStateToken(cityStateZip[2]),
      zip: cleanText(cityStateZip[3]),
    }
  }

  const parts = trimmed.split(',').map((part) => cleanText(part)).filter(Boolean)
  if (parts.length >= 4) {
    const street = parts.slice(0, parts.length - 3).join(', ')
    const city = parts[parts.length - 3] || ''
    const stateZip = parseStateZipChunk([parts[parts.length - 2], parts[parts.length - 1]].filter(Boolean).join(' '))
    return {
      street: cleanText(street),
      city: cleanText(city),
      state: stateZip.state,
      zip: stateZip.zip,
    }
  }

  if (parts.length === 3) {
    const [street, city, stateZipRaw] = parts
    const stateZip = parseStateZipChunk(stateZipRaw)
    return {
      street: cleanText(street),
      city: cleanText(city),
      state: stateZip.state,
      zip: stateZip.zip,
    }
  }

  if (parts.length === 2) {
    const [city, stateZipRaw] = parts
    const stateZip = parseStateZipChunk(stateZipRaw)
    return {
      street: '',
      city: cleanText(city),
      state: stateZip.state,
      zip: stateZip.zip,
    }
  }

  return { street: trimmed, city: '', state: '', zip: '' }
}

export function formatCityStateZip(city: string, state: string, zip: string): string {
  const cityText = cleanText(city)
  const stateText = normalizeStateToken(state)
  const zipText = cleanText(zip)

  return [cityText, [stateText, zipText].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}
