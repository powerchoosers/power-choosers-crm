import { TEXAS_TDU_BY_CITY, TEXAS_TDU_CITY_KEYS } from './texas-tdu-map'

export const TEXAS_UTILITY_TERRITORIES = {
  ONCOR: 'Oncor',
  CENTERPOINT: 'CenterPoint',
  AEP_TEXAS: 'AEP Texas',
  TNMP: 'TNMP',
  LPL: 'LP&L',
} as const

export type TexasUtilityTerritory = typeof TEXAS_UTILITY_TERRITORIES[keyof typeof TEXAS_UTILITY_TERRITORIES]

export type TexasEnergyContext = {
  isTexas: boolean
  cityKey: string
  tduCandidates: string[]
  tduDisplay: string
  utilityTerritory: string
  marketContext: string
  isAmbiguous: boolean
}

const TEXAS_TDU_SEARCH_KEYS = [...TEXAS_TDU_CITY_KEYS].sort((a, b) => b.length - a.length)

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

function looksTexasish(value: unknown): boolean {
  const text = normalizeCityKey(value)
  return /\b(tx|texas)\b/.test(text)
}

function findCityKeyInText(value: unknown): string {
  const text = normalizeCityKey(value)
  if (!text) return ''

  for (const key of TEXAS_TDU_SEARCH_KEYS) {
    if (text === key) return key
    if (text.includes(` ${key} `) || text.startsWith(`${key} `) || text.endsWith(` ${key}`)) {
      return key
    }
  }

  return ''
}

export function resolveTexasTduCandidates(city?: unknown, state?: unknown, rawLocation?: unknown): string[] {
  const cityKey = normalizeCityKey(city) || findCityKeyInText(rawLocation)
  const texasish = isTexasState(state) || looksTexasish(rawLocation) || !!(cityKey && TEXAS_TDU_BY_CITY[cityKey])
  if (!texasish) return []

  if (!cityKey) return []

  const candidates = TEXAS_TDU_BY_CITY[cityKey]
  return candidates ? [...candidates] : []
}

export function resolveTexasTduDisplay(city?: unknown, state?: unknown, rawLocation?: unknown): string {
  const candidates = resolveTexasTduCandidates(city, state, rawLocation)
  if (!isTexasState(state) && !looksTexasish(rawLocation)) return ''
  if (candidates.length === 0) return 'Texas/ERCOT'
  if (candidates.length === 1) return candidates[0]
  return candidates.join(' / ')
}

export function resolveTexasUtilityTerritory(city?: unknown, state?: unknown, rawLocation?: unknown): string {
  const candidates = resolveTexasTduCandidates(city, state, rawLocation)
  if (!isTexasState(state) && !looksTexasish(rawLocation)) return ''
  if (candidates.length === 1) return candidates[0]
  return 'Texas/ERCOT'
}

export function getTexasEnergyContext(city?: unknown, state?: unknown, rawLocation?: unknown): TexasEnergyContext {
  const cityKey = normalizeCityKey(city) || findCityKeyInText(rawLocation)
  const isTexas = isTexasState(state) || looksTexasish(rawLocation) || !!(cityKey && TEXAS_TDU_BY_CITY[cityKey])
  const tduCandidates = resolveTexasTduCandidates(city, state, rawLocation)
  const utilityTerritory = resolveTexasUtilityTerritory(city, state, rawLocation)
  const tduDisplay = resolveTexasTduDisplay(city, state, rawLocation)
  const marketContext = isTexas
    ? (utilityTerritory && utilityTerritory !== 'Texas/ERCOT' ? `Texas/ERCOT (${utilityTerritory})` : 'Texas/ERCOT')
    : 'nationwide deregulated market'

  return {
    isTexas,
    cityKey,
    tduCandidates,
    tduDisplay,
    utilityTerritory,
    marketContext,
    isAmbiguous: tduCandidates.length > 1,
  }
}
