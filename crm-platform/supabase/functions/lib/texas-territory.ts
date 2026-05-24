import { TEXAS_TDU_BY_CITY, TEXAS_TDU_CITY_KEYS } from './texas-tdu-map.ts'

export const TEXAS_UTILITY_TERRITORIES = {
  ONCOR: 'Oncor',
  CENTERPOINT: 'CenterPoint',
  AEP_TEXAS: 'AEP Texas',
  TNMP: 'TNMP',
  LPL: 'LP&L',
} as const

const TEXAS_REGULATED_TERRITORIES = {
  austin: {
    utility: 'Austin Energy',
    marketContext: 'regulated municipal utility territory',
  },
  brownsville: {
    utility: 'Brownsville Public Utilities Board',
    marketContext: 'regulated municipal utility territory',
  },
  amarillo: {
    utility: 'Southwestern Public Service (Xcel Energy)',
    marketContext: 'regulated non-opt-in utility territory',
  },
  'el paso': {
    utility: 'El Paso Electric',
    marketContext: 'regulated non-opt-in utility territory',
  },
  'san antonio': {
    utility: 'CPS Energy',
    marketContext: 'regulated municipal utility territory',
  },
} as const

export type TexasUtilityTerritory = typeof TEXAS_UTILITY_TERRITORIES[keyof typeof TEXAS_UTILITY_TERRITORIES]

export type TexasEnergyContext = {
  isTexas: boolean
  isRegulated: boolean
  cityKey: string
  tduCandidates: string[]
  tduDisplay: string
  utilityTerritory: string
  marketContext: string
  regulatedUtility: string
  isAmbiguous: boolean
}

const TEXAS_SERVICE_CITY_KEYS = [...new Set([
  ...TEXAS_TDU_CITY_KEYS,
  ...Object.keys(TEXAS_REGULATED_TERRITORIES),
])].sort((a, b) => b.length - a.length)

export function normalizeCityKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isTexasState(value: unknown): boolean {
  const text = normalizeCityKey(value)
  return text === 'tx' || text === 'texas'
}

function normalizeLocationSearch(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/&/g, 'and')
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsWholePhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeLocationSearch(text)
  const normalizedPhrase = normalizeLocationSearch(phrase)
  if (!normalizedText || !normalizedPhrase) return false
  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(^|\\s)${escaped}(?=$|\\s)`).test(normalizedText)
}

function looksTexasish(value: unknown): boolean {
  const text = normalizeLocationSearch(value)
  return containsWholePhrase(text, 'tx') || containsWholePhrase(text, 'texas')
}

function findCityKeyInText(value: unknown): string {
  const text = normalizeLocationSearch(value)
  if (!text) return ''

  for (const key of TEXAS_SERVICE_CITY_KEYS) {
    if (containsWholePhrase(text, key)) {
      return key
    }
  }

  return ''
}

export function resolveTexasRegulatedTerritory(city?: unknown, state?: unknown, rawLocation?: unknown) {
  const cityKey = normalizeCityKey(city) || findCityKeyInText(rawLocation)
  if (!cityKey) return null
  const territory = TEXAS_REGULATED_TERRITORIES[cityKey as keyof typeof TEXAS_REGULATED_TERRITORIES]
  if (territory) return territory
  return null
}

export function resolveTexasTduCandidates(city?: unknown, state?: unknown, rawLocation?: unknown): string[] {
  const cityKey = normalizeCityKey(city) || findCityKeyInText(rawLocation)
  if (!cityKey) return []
  if (resolveTexasRegulatedTerritory(city, state, rawLocation)) return []

  const texasish = isTexasState(state) || looksTexasish(rawLocation) || !!TEXAS_TDU_BY_CITY[cityKey]
  if (!texasish) return []

  const candidates = TEXAS_TDU_BY_CITY[cityKey]
  return candidates ? [...candidates] : []
}

export function resolveTexasTduDisplay(city?: unknown, state?: unknown, rawLocation?: unknown): string {
  const regulatedTerritory = resolveTexasRegulatedTerritory(city, state, rawLocation)
  if (regulatedTerritory) return regulatedTerritory.utility

  const cityKey = normalizeCityKey(city) || findCityKeyInText(rawLocation)
  if (!cityKey && !isTexasState(state) && !looksTexasish(rawLocation)) return ''

  const candidates = resolveTexasTduCandidates(city, state, rawLocation)
  if (candidates.length === 0) return 'Texas/ERCOT'
  if (candidates.length === 1) return candidates[0]
  return candidates.join(' / ')
}

export function resolveTexasUtilityTerritory(city?: unknown, state?: unknown, rawLocation?: unknown): string {
  const regulatedTerritory = resolveTexasRegulatedTerritory(city, state, rawLocation)
  if (regulatedTerritory) return regulatedTerritory.utility

  const candidates = resolveTexasTduCandidates(city, state, rawLocation)
  const cityKey = normalizeCityKey(city) || findCityKeyInText(rawLocation)
  if (!cityKey && !isTexasState(state) && !looksTexasish(rawLocation)) return ''
  if (candidates.length === 1) return candidates[0]
  return 'Texas/ERCOT'
}

export function getTexasEnergyContext(city?: unknown, state?: unknown, rawLocation?: unknown): TexasEnergyContext {
  const cityKey = normalizeCityKey(city) || findCityKeyInText(rawLocation)
  const regulatedTerritory = resolveTexasRegulatedTerritory(city, state, rawLocation)
  const isTexas = isTexasState(state) || looksTexasish(rawLocation) || !!(cityKey && (TEXAS_TDU_BY_CITY[cityKey] || regulatedTerritory))
  const tduCandidates = regulatedTerritory ? [] : resolveTexasTduCandidates(city, state, rawLocation)
  const utilityTerritory = resolveTexasUtilityTerritory(city, state, rawLocation)
  const tduDisplay = resolveTexasTduDisplay(city, state, rawLocation)
  const marketContext = !isTexas
    ? 'nationwide deregulated market'
    : regulatedTerritory
      ? regulatedTerritory.marketContext
      : (utilityTerritory && utilityTerritory !== 'Texas/ERCOT' ? `Texas/ERCOT (${utilityTerritory})` : 'Texas/ERCOT')

  return {
    isTexas,
    isRegulated: Boolean(regulatedTerritory),
    cityKey,
    tduCandidates,
    tduDisplay,
    utilityTerritory,
    marketContext,
    regulatedUtility: regulatedTerritory?.utility || '',
    isAmbiguous: tduCandidates.length > 1,
  }
}
