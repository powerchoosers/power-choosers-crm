import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, requireUser } from '@/lib/supabase'
import { buildOwnerScopeValues } from '@/lib/owner-scope'
import { buildAudienceLead, buildAudienceProfile, buildAudienceProfileBlock, type AudienceProfile } from '@/lib/contact-persona'

// Simple LRU Cache for talk track deduplication
class TalkTrackCache {
  private cache: Map<string, { talkTrack: string; timestamp: number }>
  private maxSize: number
  private ttlMs: number

  constructor(maxSize = 500, ttlMs = 7 * 24 * 60 * 60 * 1000) { // 7 days TTL
    this.cache = new Map()
    this.maxSize = maxSize
    this.ttlMs = ttlMs
  }

  private cleanExpired() {
    const now = Date.now()
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttlMs) {
        this.cache.delete(key)
      }
    }
  }

  add(talkTrack: string) {
    this.cleanExpired()
    
    const hash = this.hashTalkTrack(talkTrack)
    this.cache.set(hash, { talkTrack, timestamp: Date.now() })

    // LRU eviction if cache is too large
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }
  }

  isTooSimilar(talkTrack: string, threshold = 0.50): boolean {
    this.cleanExpired()
    
    const tokens = this.tokenize(talkTrack)
    if (tokens.size === 0) return false

    for (const cached of this.cache.values()) {
      const similarity = this.calculateSimilarity(tokens, this.tokenize(cached.talkTrack))
      if (similarity >= threshold) {
        return true
      }
    }

    return false
  }

  private hashTalkTrack(talkTrack: string): string {
    let hash = 0
    const text = talkTrack.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    for (let i = 0; i < text.length; i++) {
      hash = Math.imul(31, hash) + text.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash).toString(36)
  }

  private tokenize(text: string): Set<string> {
    const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'you', 'that', 'this', 'with', 'from', 'have', 'has', 'what', 'your', 'about', 'just', 'been', 'usually', 'when', 'like', 'some', 'they', 'their', 'there', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'but', 'not', 'out', 'how', 'any', 'get', 'got'])
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map(token => token.trim())
        .filter(token => token.length > 2 && !STOP_WORDS.has(token))
    )
  }

  private calculateSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
    if (tokensA.size === 0 || tokensB.size === 0) return 0

    const intersection = new Set([...tokensA].filter(token => tokensB.has(token)))
    const union = new Set([...tokensA, ...tokensB])

    return intersection.size / union.size
  }

  clear() {
    this.cache.clear()
  }

  size(): number {
    this.cleanExpired()
    return this.cache.size
  }
}

// Global cache instance
const talkTrackCache = new TalkTrackCache()

type BriefStatus = 'idle' | 'ready' | 'empty' | 'error'
type ResearchSourceKind = 'news' | 'web' | 'sec' | 'linkedin'

type AccountRow = {
  id: string
  name: string | null
  industry: string | null
  domain: string | null
  website?: string | null
  linkedin_url: string | null
  primaryContactId: string | null
  city: string | null
  state: string | null
  ownerId: string | null
  employees?: number | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  service_addresses?: unknown
  revenue?: string | null
  annual_usage?: string | null
  intelligence_brief_headline: string | null
  intelligence_brief_detail: string | null
  intelligence_brief_talk_track: string | null
  intelligence_brief_signal_date: string | null
  intelligence_brief_reported_at: string | null
  intelligence_brief_source_url: string | null
  intelligence_brief_confidence_level: string | null
  intelligence_brief_last_refreshed_at: string | null
  intelligence_brief_status: BriefStatus | string | null
}

type ResearchHit = {
  priority: number
  label: string
  query: string
  title: string
  url: string
  snippet: string
  publishedAt: string | null
  source: string
  sourceKind: ResearchSourceKind
}

type RankedResearchHit = ResearchHit & {
  __index: number
  __sourceTrust: number
}

type BriefResult = {
  usable_signal: boolean
  signal_headline?: string
  signal_detail?: string
  talk_track?: string
  signal_date?: string
  source_date?: string
  source_url?: string
  confidence_level?: string
  selected_priority?: number
  source_title?: string
  source_domain?: string
  reason?: string
}

type ResearchDiagnostics = {
  total: number
  bySourceKind: Record<ResearchSourceKind, number>
  topResults: Array<{
    priority: number
    label: string
    title: string
    url: string
    sourceKind: ResearchSourceKind
    source: string
  }>
}

type SignalFamily =
  | 'acquisition'
  | 'new_location'
  | 'leadership_change'
  | 'growth'
  | 'technical_load'
  | 'restructuring'
  | 'contract_win'
  | 'funding'
  | 'industry_context'

type IndustryCluster =
  | 'manufacturing'
  | 'logistics'
  | 'food_storage'
  | 'healthcare'
  | 'banking'
  | 'retail'
  | 'restaurant'
  | 'hotel_owner'
  | 'hospitality_group'
  | 'school_district'
  | 'higher_education'
  | 'residential_care'
  | 'education_nonprofit'
  | 'religious'
  | 'technology'
  | 'energy_intensive'
  | 'office_services'
  | 'multi_site'
  | 'public_sector'
  | 'unknown'

type MarketSeason = 'spring_shoulder' | 'summer_peak' | 'fall_reset' | 'winter_reliability'

type MarketGuidance = {
  marketSeason: MarketSeason
  marketLabel: string
  marketAngle: string
  marketQuestion: string
  marketOpeners: string[]
  marketFocus: string[]
}

type IdentityConfidence = 'high' | 'medium' | 'low'

type IntelligenceProfile = {
  version: 1
  industryCluster: IndustryCluster
  companyType: string
  operatingModel: string
  facilityType: string
  identityKeywords: string[]
  powerKeywords: string[]
  talkTrackGuardrails: string[]
  evidence: string[]
  confidence: IdentityConfidence
  generatedAt: string
  sourceKinds: ResearchSourceKind[]
}

type HierarchyResearchAccount = {
  id: string
  name: string
  website: string | null
  domain: string | null
  description: string | null
  city: string | null
  state: string | null
  role: 'parent' | 'subsidiary'
}

type HierarchyResearchContext = {
  organizationRole: 'standalone' | 'parent' | 'subsidiary'
  hierarchySummary: string
  parent: HierarchyResearchAccount | null
  subsidiaries: HierarchyResearchAccount[]
  relatedLinks: string[]
  relatedFacts: string[]
}

type TalkTrackContext = {
  signalFamily: SignalFamily
  signalLabel: string
  signalAngle: string
  signalOpeners: string[]
  industryCluster: IndustryCluster
  industryLabel: string
  industryAngle: string
  industryOpeners: string[]
  marketSeason: MarketSeason
  marketLabel: string
  marketAngle: string
  marketQuestion: string
  marketOpeners: string[]
  marketFocus: string[]
  openingPattern: 'observation' | 'question' | 'contrast' | 'curiosity'
  openingStyle: string
  question: string
  ercotFocus: string[]
  avoidPhrases: string[]
  seed: string
  audienceProfile?: AudienceProfile | null
}

const FALLBACK_MESSAGE = 'No recent signals found for this account. Try again later or check the source manually.'
const COOLDOWN_MS = 60 * 60 * 1000
const ACCOUNT_SELECT = 'id, name, industry, domain, linkedin_url, "primaryContactId", city, state, ownerId, employees, description, metadata, service_addresses, revenue, annual_usage, intelligence_brief_headline, intelligence_brief_detail, intelligence_brief_talk_track, intelligence_brief_signal_date, intelligence_brief_reported_at, intelligence_brief_source_url, intelligence_brief_confidence_level, intelligence_brief_last_refreshed_at, intelligence_brief_status'
const SIGNAL_KEYWORDS = [
  'acquisition',
  'acquired',
  'acquirer',
  'merger',
  'takeover',
  'buyout',
  'cfo',
  'chief financial officer',
  'coo',
  'chief operating officer',
  'vp of finance',
  'vice president of finance',
  'facilities director',
  'energy manager',
  'new location',
  'future location',
  'opening',
  'opening soon',
  'lease',
  'construction',
  'groundbreaking',
  'expansion',
  'headcount',
  'capital expenditure',
  'capex',
  'restructuring',
  'closure',
  'plant closure',
  'consolidation',
  'contract award',
  'government contract',
  'customer win',
  'funding round',
  'ipo',
]
const WEB_USER_AGENT = process.env.SEC_USER_AGENT || 'NodalPointCRM/1.0 (public-web-research)'
const SEC_LOOKBACK_DAYS = 730
const SEC_FILING_FORMS = new Set([
  '8-K',
  '8-K/A',
  '10-K',
  '10-K/A',
  '10-Q',
  '10-Q/A',
  'S-1',
  'S-1/A',
  '424B4',
  '424B5',
  'DEF 14A',
  'PRE 14A',
])
const IDENTITY_PROFILE_VERSION = 1 as const
const INDUSTRY_CLUSTER_VALUES: IndustryCluster[] = [
  'manufacturing',
  'logistics',
  'food_storage',
  'healthcare',
  'banking',
  'retail',
  'restaurant',
  'hotel_owner',
  'hospitality_group',
  'school_district',
  'higher_education',
  'residential_care',
  'education_nonprofit',
  'religious',
  'technology',
  'energy_intensive',
  'office_services',
  'multi_site',
  'public_sector',
  'unknown',
]
const BROAD_IDENTITY_CLUSTERS = new Set<IndustryCluster>([
  'unknown',
  'multi_site',
  'office_services',
  'education_nonprofit',
])

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function uniqueStrings(values: unknown[], limit = 12) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const cleaned = cleanText(value)
    const key = cleaned.toLowerCase()
    if (!cleaned || seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
    if (result.length >= limit) break
  }

  return result
}

function getAccountMetadata(account: AccountRow) {
  return account.metadata && typeof account.metadata === 'object' && !Array.isArray(account.metadata)
    ? account.metadata as Record<string, unknown>
    : {}
}

function getIdentityProfileSeedText(account: AccountRow) {
  return cleanText([
    account.name,
    account.industry,
    account.description,
    getAccountNotes(account),
    account.website,
    account.domain,
  ].filter(Boolean).join(' ')).toLowerCase()
}

function hasStrongHealthcareSignals(text: string) {
  return /(healthcare|hospital|clinic|medical|behavioral health|mental health|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|community mental health|crisis center|crisis services|early childhood intervention|surgical center|surgery center|ambulatory surgery center|patient care|specialist|wellness|doctor)/i.test(text)
}

function hasStrongDentalSignals(text: string) {
  return /(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry|multi-site dental|dental partnership organization)/i.test(text)
}

function hasStrongAutomotiveSignals(text: string) {
  return /(auto group|automotive|dealership|dealerships|car dealer|auto dealer|vehicle inventory|service bays?|service department|parts department|parts store|showrooms?|showroom|certified pre-owned|new vehicles?|used vehicles?|pre-owned|lot lighting|amg|mercedes|bmw|audi|lexus|toyota|honda|ford|chevrolet|cadillac|hyundai|kia|volkswagen|nissan|jeep|dodge|ram|gmc|subaru)/i.test(text)
}

function hasStrongDmeSignals(text: string) {
  return /(durable medical equipment|\bdme\b|home medical equipment|medical equipment|medical supplies?|equipment logistics|equipment delivery|equipment maintenance|direct-service locations?|direct service locations?|hospice dme|hospice equipment|inventory management|medical supply(?:ies)?)/i.test(text)
}

function hasStrongRestaurantSignals(text: string) {
  return /(restaurant|dining|kitchen|food service|service rushes?|grills?|fryers?|cafe|bar|eatery|banquet|event space|hospitality|hotel|resort|lodging)/i.test(text)
}

function hasStrongManufacturingSignals(text: string) {
  return /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment)/i.test(text)
}

function hasStrongLogisticsSignals(text: string) {
  return /(freight forwarder|nvo?cc|cargo|shipping|trucking|transport|logistics|warehouse|distribution|fulfillment|auto logistics|terminal|dock|yard|supply chain)/i.test(text)
}

function hasStrongOfficeServicesSignals(text: string) {
  return /(office|professional services|law|legal|consulting|accounting|marketing|real estate|staffing|agency|design|engineering|architect|executive office)/i.test(text)
}

function hasStrongSchoolSignals(text: string) {
  return /(school district|independent school district|isd\b|public school|charter school|k-12|school campus|students|classrooms|teachers|students|school\b)/i.test(text)
}

function profileConflictsWithCoreSignals(profile: IntelligenceProfile, accountText: string) {
  const profileText = cleanText([
    profile.companyType,
    profile.operatingModel,
    profile.facilityType,
    ...(profile.identityKeywords || []),
    ...(profile.powerKeywords || []),
    ...(profile.talkTrackGuardrails || []),
  ].join(' ')).toLowerCase()

  if (!profileText) return false

  const healthcareSignals = hasStrongHealthcareSignals(accountText)
  const dentalSignals = hasStrongDentalSignals(accountText)
  const dmeSignals = hasStrongDmeSignals(accountText)
  const restaurantSignals = hasStrongRestaurantSignals(accountText)
  const logisticsSignals = hasStrongLogisticsSignals(accountText)
  const officeSignals = hasStrongOfficeServicesSignals(accountText)
  const manufacturingSignals = hasStrongManufacturingSignals(accountText)
  const schoolSignals = hasStrongSchoolSignals(accountText)

  if (dmeSignals && /(hospital|neighborhood hospital|micro[-\s]?hospital|community hospital|small-format hospital|licensed hospital|clinic|medical practice|emergency room|emergency care|inpatient care|inpatient bed|acute care|short-stay rooms?|patient care)/i.test(profileText)) {
    return true
  }

  if (dentalSignals && /(hospital|neighborhood hospital|micro[-\s]?hospital|community hospital|small-format hospital|licensed hospital|emergency room|emergency care|inpatient care|inpatient bed|acute care|short-stay rooms?|guest rooms?|laundry)/i.test(profileText)) {
    return true
  }

  if (healthcareSignals && /(restaurant|dining|kitchen|hotel|hospitality|plant|industrial|warehouse|logistics|distribution)/i.test(profileText)) {
    return true
  }

  if (restaurantSignals && /(healthcare|hospital|clinic|medical|behavioral health|mental health|surgery|surgical)/i.test(profileText)) {
    return true
  }

  if (restaurantSignals && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment|warehouse|logistics|distribution)/i.test(profileText)) {
    return true
  }

  if (schoolSignals && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment|warehouse|logistics|distribution)/i.test(profileText)) {
    return true
  }

  if (schoolSignals && /(retail|store|showroom|shopping|customer-facing retail|retail group|retail footprint|roll-?up view)/i.test(profileText)) {
    return true
  }

  if (logisticsSignals && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment)/i.test(profileText)) {
    return true
  }

  if (officeSignals && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment|warehouse|logistics|distribution)/i.test(profileText)) {
    return true
  }

  if (manufacturingSignals && /(healthcare|hospital|clinic|medical|restaurant|hotel|hospitality|behavioral health|mental health)/i.test(profileText)) {
    return true
  }

  return false
}

function isBroadIdentityCluster(cluster: IndustryCluster) {
  return BROAD_IDENTITY_CLUSTERS.has(cluster)
}

function resolvePreferredIndustryCluster(baseCluster: IndustryCluster, derivedCluster: IndustryCluster) {
  if (baseCluster === derivedCluster) return baseCluster
  if (!isBroadIdentityCluster(baseCluster)) return baseCluster
  if (derivedCluster && !isBroadIdentityCluster(derivedCluster) && derivedCluster !== 'unknown') return derivedCluster
  return baseCluster !== 'unknown' ? baseCluster : derivedCluster
}

function getAccountIdentityProfile(account: AccountRow, candidate: ResearchHit | null = null): IntelligenceProfile | null {
  const raw = getAccountMetadata(account).intelligenceProfile
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const record = raw as Record<string, unknown>
  const cluster = cleanText(record.industryCluster).toLowerCase() as IndustryCluster
  if (!(INDUSTRY_CLUSTER_VALUES as string[]).includes(cluster)) return null
  const accountText = cleanText([
    getIdentityProfileSeedText(account),
    candidate?.title || '',
    candidate?.snippet || '',
  ].filter(Boolean).join(' ')).toLowerCase()
  const stableCluster = inferIndustryClusterFromSignals(account, candidate)
  const savedProfile = {
    version: IDENTITY_PROFILE_VERSION,
    industryCluster: cluster,
    companyType: cleanText(record.companyType),
    operatingModel: cleanText(record.operatingModel),
    facilityType: cleanText(record.facilityType),
    identityKeywords: uniqueStrings(Array.isArray(record.identityKeywords) ? record.identityKeywords : [], 8),
    powerKeywords: uniqueStrings(Array.isArray(record.powerKeywords) ? record.powerKeywords : [], 8),
    talkTrackGuardrails: uniqueStrings(Array.isArray(record.talkTrackGuardrails) ? record.talkTrackGuardrails : [], 8),
    evidence: uniqueStrings(Array.isArray(record.evidence) ? record.evidence : [], 4),
    confidence: 'low' as IdentityConfidence,
    generatedAt: cleanText(record.generatedAt),
    sourceKinds: uniqueStrings(Array.isArray(record.sourceKinds) ? record.sourceKinds : [], 4)
      .filter((value): value is ResearchSourceKind => ['news', 'web', 'sec', 'linkedin'].includes(value))
      .slice(0, 4),
  }

  if (profileConflictsWithCoreSignals(savedProfile, accountText)) return null
  if (cluster !== stableCluster && !isBroadIdentityCluster(stableCluster)) return null

  const confidence = cleanText(record.confidence).toLowerCase() as IdentityConfidence
  const safeConfidence: IdentityConfidence = confidence === 'high' || confidence === 'medium' || confidence === 'low'
    ? confidence
    : 'low'

  return {
    version: IDENTITY_PROFILE_VERSION,
    industryCluster: cluster,
    companyType: cleanText(record.companyType),
    operatingModel: cleanText(record.operatingModel),
    facilityType: cleanText(record.facilityType),
    identityKeywords: uniqueStrings(Array.isArray(record.identityKeywords) ? record.identityKeywords : [], 8),
    powerKeywords: uniqueStrings(Array.isArray(record.powerKeywords) ? record.powerKeywords : [], 8),
    talkTrackGuardrails: uniqueStrings(Array.isArray(record.talkTrackGuardrails) ? record.talkTrackGuardrails : [], 8),
    evidence: uniqueStrings(Array.isArray(record.evidence) ? record.evidence : [], 4),
    confidence: safeConfidence,
    generatedAt: cleanText(record.generatedAt),
    sourceKinds: uniqueStrings(Array.isArray(record.sourceKinds) ? record.sourceKinds : [], 4)
      .filter((value): value is ResearchSourceKind => ['news', 'web', 'sec', 'linkedin'].includes(value))
      .slice(0, 4),
  }
}

function buildIdentityProfileText(account: AccountRow, candidate: ResearchHit | null = null) {
  const profile = getAccountIdentityProfile(account, candidate)
  if (!profile) return ''

  return cleanText([
    profile.companyType,
    profile.operatingModel,
    profile.facilityType,
    profile.identityKeywords.join(' '),
    profile.powerKeywords.join(' '),
    profile.talkTrackGuardrails.join(' '),
  ].join(' ')).toLowerCase()
}

function selectIdentityKeywords(text: string, preferred: string[], fallback: string[], limit = 6) {
  const lower = text.toLowerCase()
  const matched = preferred.filter((keyword) => lower.includes(keyword.toLowerCase()))
  return uniqueStrings([...matched, ...fallback], limit)
}

function buildIdentityEvidence(account: AccountRow, candidates: ResearchHit[], emphasisKeywords: string[]) {
  const evidence: string[] = []
  const description = cleanText(account.description)
  const lowerKeywords = emphasisKeywords.map((keyword) => keyword.toLowerCase())

  if (description) {
    evidence.push(shortenText(description, 220))
  }

  for (const candidate of candidates.slice(0, 8)) {
    const line = cleanText(`${candidate.title}${candidate.snippet ? `. ${candidate.snippet}` : ''}`)
    if (!line) continue

    const lower = line.toLowerCase()
    if (evidence.length < 2 || lowerKeywords.some((keyword) => lower.includes(keyword))) {
      evidence.push(shortenText(line, 220))
    }

    if (evidence.length >= 4) break
  }

  return uniqueStrings(evidence, 4)
}

function getIdentitySearchHints(account: AccountRow) {
  const profile = getAccountIdentityProfile(account)
  if (!profile) return []

  return uniqueStrings([
    profile.companyType,
    profile.facilityType,
    ...profile.identityKeywords,
  ], 4).filter((value) => value.length >= 4).slice(0, 2)
}

function getAccountNotes(account: AccountRow) {
  const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : null
  const candidates = [
    metadata && 'notes' in metadata ? (metadata as Record<string, unknown>).notes : null,
    metadata && 'note' in metadata ? (metadata as Record<string, unknown>).note : null,
    metadata && 'accountNotes' in metadata ? (metadata as Record<string, unknown>).accountNotes : null,
    metadata && 'summary' in metadata ? (metadata as Record<string, unknown>).summary : null,
  ]

  return candidates.map(cleanText).filter(Boolean).join(' ').toLowerCase()
}

function isLikelyUuid(value: unknown) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

function extractHierarchyIds(metadata: unknown) {
  const safeMeta = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
  const relationships = safeMeta.relationships && typeof safeMeta.relationships === 'object' && !Array.isArray(safeMeta.relationships)
    ? safeMeta.relationships as Record<string, unknown>
    : {}
  const parentAccountId = cleanText(relationships.parentAccountId)
    || cleanText(safeMeta.parentAccountId)
    || cleanText(safeMeta.parent_company_id)
    || null
  const subsidiaryAccountIds = Array.isArray(relationships.subsidiaryAccountIds)
    ? relationships.subsidiaryAccountIds.filter(isLikelyUuid)
    : Array.isArray(safeMeta.subsidiaryAccountIds)
      ? safeMeta.subsidiaryAccountIds.filter(isLikelyUuid)
      : []

  return {
    parentAccountId,
    subsidiaryAccountIds: subsidiaryAccountIds.map((value) => String(value).trim()),
  }
}

function normalizeWebsiteCandidate(value: unknown) {
  const raw = cleanText(value)
  if (!raw) return null
  const normalized = raw.startsWith('http') ? raw : `https://${raw.replace(/^www\./i, '')}`
  try {
    const parsed = new URL(normalized)
    return parsed.toString()
  } catch (_) {
    return null
  }
}

function buildHierarchyResearchContext(
  account: AccountRow,
  relatedAccounts: Array<Partial<AccountRow> & { id: string }> = [],
): HierarchyResearchContext | null {
  const hierarchyIds = extractHierarchyIds(account.metadata)
  if (!hierarchyIds.parentAccountId && hierarchyIds.subsidiaryAccountIds.length === 0) return null

  const relatedMap = new Map(relatedAccounts.map((row) => [row.id, row]))
  const parentRow = hierarchyIds.parentAccountId ? relatedMap.get(hierarchyIds.parentAccountId) || null : null
  const subsidiaries = hierarchyIds.subsidiaryAccountIds
    .map((id) => relatedMap.get(id))
    .filter(Boolean)
    .map((row) => ({
      id: String(row?.id || ''),
      name: cleanText(row?.name) || 'Unknown subsidiary',
      website: normalizeWebsiteCandidate((row as AccountRow)?.website || (row as AccountRow)?.domain),
      domain: cleanText((row as AccountRow)?.domain) || null,
      description: cleanText((row as AccountRow)?.description) || null,
      city: cleanText((row as AccountRow)?.city) || null,
      state: cleanText((row as AccountRow)?.state) || null,
      role: 'subsidiary' as const,
    }))

  const parent = parentRow
    ? {
        id: String(parentRow.id || ''),
        name: cleanText(parentRow.name) || 'Unknown parent',
        website: normalizeWebsiteCandidate((parentRow as AccountRow).website || (parentRow as AccountRow).domain),
        domain: cleanText((parentRow as AccountRow).domain) || null,
        description: cleanText((parentRow as AccountRow).description) || null,
        city: cleanText((parentRow as AccountRow).city) || null,
        state: cleanText((parentRow as AccountRow).state) || null,
        role: 'parent' as const,
      }
    : null

  const organizationRole: HierarchyResearchContext['organizationRole'] = parent
    ? 'subsidiary'
    : subsidiaries.length > 0
      ? 'parent'
      : 'standalone'

  const relatedLinks = uniqueStrings([
    parent?.website,
    ...subsidiaries.map((item) => item.website),
  ], 6)

  const relatedFacts = uniqueStrings([
    parent ? `Parent company: ${parent.name}${parent.description ? ` - ${shortenText(parent.description, 140)}` : ''}` : null,
    ...subsidiaries.slice(0, 4).map((item) => `Subsidiary: ${item.name}${item.description ? ` - ${shortenText(item.description, 140)}` : ''}`),
  ], 6)

  return {
    organizationRole,
    hierarchySummary: [
      `Operating company: ${cleanText(account.name) || 'Unknown'}`,
      `Role: ${organizationRole}`,
      `Parent company: ${parent?.name || 'none'}`,
      `Subsidiaries: ${subsidiaries.length ? subsidiaries.map((item) => item.name).join('; ') : 'none'}`,
    ].join(' | '),
    parent,
    subsidiaries,
    relatedLinks,
    relatedFacts,
  }
}

function getVerifiedLocationCount(account: AccountRow) {
  const serviceAddresses = Array.isArray(account.service_addresses) ? account.service_addresses.length : 0
  const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata as Record<string, unknown> : null
  const meters = Array.isArray(metadata?.meters) ? metadata.meters.length : 0
  const count = Math.max(serviceAddresses, meters)
  return count > 0 ? count : null
}

function looksLikeHotelProperty(text: string) {
  return /\b(hotel|hotels|resort|resorts|motel|inn|lodging|boutique property|boutique hotel|boutique resort|guest rooms?|hilton|marriott|hyatt|best western|holiday inn|hampton inn|courtyard|residence inn|doubletree|embassy suites|fairfield inn|aloft|homewood suites|springhill suites|wyndham|sonesta|westin|radisson|omni|renaissance|four seasons|intercontinental|candlewood|drury inn|la quinta|quality inn|comfort inn|quality suites|marriott)\b/i.test(text)
}

function looksLikeHospitalityGroup(text: string, verifiedLocationCount: number | null, notes: string) {
  if (/\b(auto group|dealership|dealerships|car dealer|auto dealer|vehicle inventory|service bays?|showrooms?|used vehicles?|new vehicles?|nissan|hyundai|chevrolet|cadillac|volkswagen|mitsubishi|kia|genesis|chrysler|jeep|dodge|ram)\b/i.test(text)) {
    return false
  }

  const combined = `${text} ${notes}`
  const hospitalityTerms = /\b(hospitality|hotel|hotels|resort|resorts|motel|lodging|inn|guest rooms?|brand flag|boutique property|boutique hotel|boutique resort|hilton|marriott|hyatt|best western|holiday inn|hampton inn|courtyard|residence inn|doubletree|embassy suites|fairfield inn|aloft|homewood suites|springhill suites|wyndham|sonesta|westin|radisson|omni|renaissance|four seasons|intercontinental|candlewood|drury inn|la quinta|quality inn|comfort inn|quality suites)\b/i
  const explicitHospitalityGroupSignals = /\b(hospitality group|hotel management|portfolio of hotels|hotel portfolio|resort portfolio|full-service hospitality|branded hotel owner|hotel ownership group|hotel operator|hotel development and management|resort management company)\b/i
  const portfolioSignals = /\b(owns and operates|multiple properties|properties across|hotels across|resorts across|management company|brand portfolio|portfolio|collection|develops? and manages?|operates over \d+|manages \d+)\b/i.test(combined)

  return Boolean(
    explicitHospitalityGroupSignals.test(combined) ||
    (hospitalityTerms.test(combined) && (
      Boolean(verifiedLocationCount && verifiedLocationCount > 1) ||
      portfolioSignals
    ))
  )
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
}

function stripXml(value: string): string {
  const decoded = decodeHtmlEntities(
    String(value || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  )

  return decoded
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function countCjkCharacters(value: string) {
  return (cleanText(value).match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g) || []).length
}

function isLikelyNonEnglishText(...values: Array<string | null | undefined>) {
  const text = values.map(cleanText).filter(Boolean).join(' ')
  if (!text) return false

  const cjkCount = countCjkCharacters(text)
  if (cjkCount < 4) return false

  const latinCount = (text.match(/[A-Za-z]/g) || []).length
  if (latinCount === 0) return true

  return cjkCount / Math.max(cjkCount + latinCount, 1) >= 0.15
}

function parseRssItems(
  xml: string,
  bucket: { priority: number; label: string; query: string },
  maxItems = 3,
  defaultSource = 'Google News',
  sourceKind: ResearchSourceKind = 'news'
): ResearchHit[] {
  const items: ResearchHit[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match

  while ((match = itemRegex.exec(xml)) && items.length < maxItems) {
    const block = match[1]
    const getTag = (tag: string) => {
      const tagRegex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i')
      const tagMatch = tagRegex.exec(block)
      return tagMatch ? stripXml(tagMatch[1]) : ''
    }

    const title = getTag('title')
    const url = getTag('link')
    const description = getTag('description')
    const pubDate = getTag('pubDate')
    const source = getTag('source') || defaultSource

    if (!title || !url) continue
    if (isLikelyNonEnglishText(title, description)) continue

    const publishedAt = pubDate ? new Date(pubDate) : null
    items.push({
      priority: bucket.priority,
      label: bucket.label,
      query: bucket.query,
      title,
      url,
      snippet: description,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null,
      source,
      sourceKind,
    })
  }

  return items
}

const PRESS_RELEASE_HOSTS = new Set([
  'prnewswire.com',
  'businesswire.com',
  'globenewswire.com',
  'accessnewswire.com',
  'newsfilecorp.com',
  'einpresswire.com',
])

const AMBIGUOUS_LOCAL_NAME_WORDS = new Set([
  'data',
  'center',
  'centers',
  'service',
  'services',
  'solution',
  'solutions',
  'system',
  'systems',
  'technology',
  'technologies',
  'logistics',
  'warehouse',
  'storage',
  'group',
  'company',
  'co',
])

function isPressReleaseStyleUrl(value: string) {
  const url = cleanText(value)
  if (!url) return false

  const host = getHostname(url)
  const lower = url.toLowerCase()
  const pressReleasePath = /(newsroom|press[-_]?release|press[-_]?room|press|release|announcement|announcements|updates?|blog|stories?|media|ir\/|investors?\/)/i

  if (host && PRESS_RELEASE_HOSTS.has(host)) return true
  return pressReleasePath.test(lower)
}

function normalizeEntityToken(value: string) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenizeEntity(value: string) {
  return normalizeEntityToken(value).split(/\s+/).filter(Boolean)
}

function isAmbiguousLocalGenericName(account: AccountRow) {
  const nameTokens = tokenizeEntity(account.name || '')
  const city = normalizeEntityToken(account.city || '')

  if (!city || nameTokens.length < 2 || nameTokens.length > 3) {
    return false
  }

  return nameTokens[0] === city && nameTokens.slice(1).some((token) => AMBIGUOUS_LOCAL_NAME_WORDS.has(token))
}

function candidateMentionsAccountEntity(account: AccountRow, item: ResearchHit) {
  const accountName = normalizeEntityToken(account.name || '')
  if (!accountName) return false

  const text = normalizeEntityToken(`${item.title || ''} ${item.snippet || ''}`)
  if (!text.includes(accountName)) return false

  const legalEntityPattern = new RegExp(`\\b${escapeRegExp(accountName)}\\s+(inc|llc|lp|ltd|corp|corporation|company|co)\\b`, 'i')
  if (legalEntityPattern.test(text)) return true

  const namePattern = new RegExp(`\\b${escapeRegExp(accountName)}\\b`, 'i')
  return namePattern.test(text)
}

function isAccountRelevantCandidate(account: AccountRow, item: ResearchHit) {
  if (item.sourceKind === 'sec') return candidateMentionsAccountEntity(account, item)
  if (isCompanyWebsiteHit(account, item)) return true

  const host = getHostname(item.url)
  const rawDomain = cleanText(account.domain)
  let accountDomain = rawDomain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase()
  try {
    if (rawDomain) {
      accountDomain = new URL(rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}`).hostname.replace(/^www\./i, '').toLowerCase()
    }
  } catch (e) {
    // Use fallback string replacement if URL parsing fails
  }
  const accountLinkedInUrl = cleanText(account.linkedin_url)
  if (accountDomain && host === accountDomain) return true
  if (item.sourceKind === 'linkedin' && accountLinkedInUrl && normalizeUrlForMatch(item.url).includes(normalizeUrlForMatch(accountLinkedInUrl))) return true

  if (isAmbiguousLocalGenericName(account)) {
    const text = normalizeEntityToken(`${item.title || ''} ${item.snippet || ''}`)
    const accountName = normalizeEntityToken(account.name || '')
    const falseGenericContinuation = new RegExp(`\\b${escapeRegExp(accountName)}\\s+(center|centers|market|project|facility|facilities|campus|development)\\b`, 'i')
    if (falseGenericContinuation.test(text)) return false
    return candidateMentionsAccountEntity(account, item) && /(\binc\b|\bllc\b|\blp\b|\bltd\b|\bcorp\b|\bcorporation\b|\bcompany\b|\bco\b|planodata\.com)/i.test(text)
  }

  return candidateMentionsAccountEntity(account, item)
}

function isOfficialCompanyAnnouncement(account: AccountRow, item: ResearchHit) {
  const url = cleanText(item.url)
  if (!url) return false

  const lower = url.toLowerCase()
  const host = getHostname(url)
  if (!host) return false
  if (item.sourceKind === 'sec' || host === 'sec.gov' || host.endsWith('.sec.gov')) return true

  if (item.sourceKind === 'web' && isCompanyWebsiteHit(account, item)) {
    return /(newsroom|press[-_]?release|press[-_]?room|press|release|announcement|announcements|updates?|blog|stories?|media|ir\/|investors?\/|\/news\/)/i.test(lower)
  }

  return PRESS_RELEASE_HOSTS.has(host) || isPressReleaseStyleUrl(url)
}

function getSourceTrustRank(account: AccountRow, item: ResearchHit) {
  const url = cleanText(item.url)
  const host = getHostname(url)

  if (!host) return 0
  if (item.sourceKind === 'sec' || host === 'sec.gov' || host.endsWith('.sec.gov')) return 60

  if (isOfficialCompanyAnnouncement(account, item)) {
    if (item.sourceKind === 'web' && isCompanyWebsiteHit(account, item)) {
      return 50
    }
    return 45
  }

  if (item.sourceKind === 'linkedin' || host.includes('linkedin.com')) return 35
  if (item.sourceKind === 'news') return 30
  return 15
}

function dedupeAndSort(items: ResearchHit[], account?: AccountRow | null) {
  const seen = new Set<string>()
  return items
    .filter((item) => item.sourceKind === 'sec' || !looksLikeCommercialListingPage(item.title, item.snippet, item.snippet, item.url))
    .filter((item) => !account || isAccountRelevantCandidate(account, item))
    .slice()
    .map((item, index) => ({
      ...item,
      __index: index,
      __sourceTrust: account ? getSourceTrustRank(account, item) : 0,
    } as RankedResearchHit))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.__sourceTrust !== b.__sourceTrust) return b.__sourceTrust - a.__sourceTrust
      const left = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const right = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      if (left !== right) return right - left
      return a.__index - b.__index
    })
    .filter((item) => {
      const key = `${item.url || item.title}`.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(({ __index, __sourceTrust, ...item }) => item)
}

function toTitleCase(value: string) {
  const normalized = cleanText(value).toLowerCase()
  if (!normalized) return ''
  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'low') return 'Low'
  return ''
}

function formatDateForDb(value: string | null | undefined, fallback?: string | null) {
  const candidate = cleanText(value)
  if (candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate

  const fallbackCandidate = cleanText(fallback)
  if (fallbackCandidate) {
    const fallbackDate = new Date(fallbackCandidate)
    if (!Number.isNaN(fallbackDate.getTime())) {
      return fallbackDate.toISOString().slice(0, 10)
    }
  }

  if (!candidate) return null
  const parsed = new Date(candidate)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

async function fetchTextWithTimeout(url: string, init: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    return { response, text }
  } finally {
    clearTimeout(timeout)
  }
}

function buildSearchBuckets(account: AccountRow, includeDomainClause = false, hierarchyContext: HierarchyResearchContext | null = null) {
  const name = cleanText(account.name) || 'Unknown Company'
  const domain = cleanText(account.domain)
  const city = cleanText(account.city)
  const state = cleanText(account.state)
  const location = [city, state].filter(Boolean).join(', ')
  const industry = cleanText(account.industry)
  const identityHints = getIdentitySearchHints(account)
  const domainClause = includeDomainClause && domain ? ` site:${domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : ''

  const locationClause = location ? ` ${location}` : ''
  const texasClause = ' Texas'
  const identityClause = identityHints.length > 0
    ? ` ${identityHints.map((hint) => `"${hint}"`).join(' ')}`
    : ''
  const buckets = [
    {
      priority: 1,
      label: 'Acquisitions / M&A',
      query: `"${name}" acquisition acquired merger buyout takeover${domainClause}${locationClause}`,
    },
    {
      priority: 2,
      label: 'Texas Openings / Construction',
      query: `"${name}" (opened OR opening OR opens OR launch OR launches OR groundbreaking OR "lease signed" OR construction OR relocation OR relocating OR "new facility" OR "new site" OR "new office" OR "new branch")${identityClause}${domainClause}${texasClause}${locationClause}`,
    },
    {
      priority: 3,
      label: 'Executive Leadership Changes',
      query: `"${name}" CFO COO "VP of Finance" "Facilities Director" "Energy Manager" promoted hired${domainClause}${locationClause}`,
    },
    {
      priority: 4,
      label: 'Expansion / Capex / Headcount',
      query: `"${name}" expansion planned expansion capital expenditure capex hiring headcount growth future site${industry ? ` ${industry}` : ''}${identityClause}${domainClause}${locationClause}`,
    },
    {
      priority: 5,
      label: 'Restructuring / Closures',
      query: `"${name}" restructuring plant closure consolidation downsizing${domainClause}${locationClause}`,
    },
    {
      priority: 6,
      label: 'Contract Awards / Customer Wins',
      query: `"${name}" contract award government contract major customer win${domainClause}${locationClause}`,
    },
    {
      priority: 7,
      label: 'Funding / IPO',
      query: `"${name}" funding round IPO Series A Series B going public${domainClause}${locationClause}`,
    },
  ]

  const parentName = cleanText(hierarchyContext?.parent?.name)
  if (parentName) {
    buckets.push({
      priority: 4,
      label: 'Operating company within parent network',
      query: `"${name}" "${parentName}" expansion facilities locations operations${identityClause}${locationClause}`,
    })
  }

  for (const subsidiary of (hierarchyContext?.subsidiaries || []).slice(0, 2)) {
    const subsidiaryName = cleanText(subsidiary.name)
    if (!subsidiaryName) continue
    buckets.push({
      priority: 4,
      label: 'Parent / subsidiary operating context',
      query: `"${name}" "${subsidiaryName}" facilities locations operations${identityClause}${locationClause}`,
    })
  }

  return buckets
}

function buildLinkedInBuckets(account: AccountRow) {
  const name = cleanText(account.name) || 'Unknown Company'
  const city = cleanText(account.city)
  const state = cleanText(account.state)
  const locationClause = [city, state].filter(Boolean).join(', ')
  const locationBits = locationClause ? ` "${locationClause}"` : ''

  return [
    {
      priority: 3,
      label: 'LinkedIn Company Page',
      query: `site:linkedin.com/company "${name}"${locationBits}`,
    },
    {
      priority: 3,
      label: 'LinkedIn Posts / Updates',
      query: `site:linkedin.com/posts "${name}" acquisition merger CFO COO expansion opening construction hiring${locationBits}`,
    },
  ]
}

function buildSecBuckets(account: AccountRow) {
  const name = cleanText(account.name) || 'Unknown Company'
  const city = cleanText(account.city)
  const state = cleanText(account.state)
  const locationClause = [city, state].filter(Boolean).join(', ')
  const locationBits = locationClause ? ` "${locationClause}"` : ''

  return [
    {
      priority: 1,
      label: 'SEC Acquisitions / M&A',
      query: `site:sec.gov "${name}" acquisition merger buyout takeover${locationBits}`,
    },
    {
      priority: 2,
      label: 'SEC Texas Openings / Construction',
      query: `site:sec.gov "${name}" (opened OR opening OR opens OR launch OR launches OR groundbreaking OR "lease signed" OR construction OR relocation OR relocating OR "new facility" OR "new site" OR "new office" OR "new branch")${locationBits}`,
    },
    {
      priority: 3,
      label: 'SEC Executive Leadership Changes',
      query: `site:sec.gov "${name}" CFO COO "VP of Finance" "Facilities Director" "Energy Manager" promoted hired${locationBits}`,
    },
    {
      priority: 4,
      label: 'SEC Expansion / Capex / Headcount',
      query: `site:sec.gov "${name}" expansion capital expenditure capex hiring headcount growth future location${locationBits}`,
    },
    {
      priority: 5,
      label: 'SEC Restructuring / Closures',
      query: `site:sec.gov "${name}" restructuring plant closure consolidation downsizing${locationBits}`,
    },
    {
      priority: 6,
      label: 'SEC Contract Awards / Customer Wins',
      query: `site:sec.gov "${name}" contract award government contract major customer win${locationBits}`,
    },
    {
      priority: 7,
      label: 'SEC Funding / IPO',
      query: `site:sec.gov "${name}" funding round IPO Series A Series B going public${locationBits}`,
    },
  ]
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function isCompanyWebsiteHit(account: AccountRow, candidate: ResearchHit | null) {
  const candidateUrl = cleanText(candidate?.url)
  const accountDomain = cleanText(account.domain)
  if (!candidateUrl || !accountDomain) return false

  const candidateHost = getHostname(candidateUrl)
  const accountHost = getHostname(accountDomain.startsWith('http') ? accountDomain : `https://${accountDomain}`)
  if (!candidateHost || !accountHost) return false

  return candidateHost === accountHost || candidateHost.endsWith(`.${accountHost}`) || accountHost.endsWith(`.${candidateHost}`)
}

function buildSourceLead(account: AccountRow, candidate: ResearchHit | null) {
  const companyName = cleanText(account.name) || 'the company'
  if (!candidate) {
    return cleanText(account.domain)
      ? `I was looking at how ${companyName} runs the business.`
      : `I came across an update about ${companyName}.`
  }
  const signalAnchor = deriveSignalAnchor(account, candidate)
  const hasSpecificAnchor = signalAnchor && signalAnchor.toLowerCase() !== companyName.toLowerCase()
  const candidateText = `${candidate.title || ''} ${candidate.snippet || ''}`
  const blockedOpening = hasStrongNewLocationEvidence(candidateText) && !isTexasRelevantLocationSignal(candidateText)

  if (blockedOpening) {
    return `I came across an update about ${companyName}.`
  }

  if (candidate.sourceKind === 'web' && isCompanyWebsiteHit(account, candidate)) {
    if (isOfficialCompanyAnnouncement(account, candidate)) {
      return hasSpecificAnchor
        ? `I saw your announcement about ${signalAnchor}.`
        : `I saw your announcement about ${companyName}.`
    }
    return `I was looking at how ${companyName} runs the business.`
  }

  // Add variation based on priority to prevent repetition
  const variations = {
    linkedin: [
      hasSpecificAnchor ? `I saw a post from ${companyName} about ${signalAnchor}.` : `I was curious about the update ${companyName} posted on LinkedIn.`,
      hasSpecificAnchor ? `I caught the LinkedIn update about ${signalAnchor}.` : `I was looking at the recent activity on ${companyName}'s LinkedIn page.`,
      hasSpecificAnchor ? `I noticed ${companyName} shared an update about ${signalAnchor}.` : `I was curious about some of the recent activity from ${companyName} online.`,
    ],
    sec: [
      hasSpecificAnchor ? `I saw the note about ${signalAnchor} in a recent public filing.` : `I was reviewing some of the recent operational updates for ${companyName}.`,
      hasSpecificAnchor ? `I noticed ${companyName} mentioned ${signalAnchor} in a public report.` : `I was curious about how the recent filings for ${companyName} are landing.`,
      hasSpecificAnchor ? `I caught the update about ${signalAnchor} in one of the public filings.` : `I was looking into the recent reporting for ${companyName}.`,
    ],
    web_official: [
      hasSpecificAnchor ? `I saw the announcement about ${signalAnchor}.` : `I was curious about the update on ${companyName}'s newsroom.`,
      hasSpecificAnchor ? `I caught the recent announcement about ${signalAnchor}.` : `I was looking at the recent updates from ${companyName}.`,
      hasSpecificAnchor ? `I noticed the update about ${signalAnchor}.` : `I was curious about the news from ${companyName}.`,
    ],
    web: [
      hasSpecificAnchor ? `I saw the piece about ${signalAnchor}.` : `I was looking at ${companyName}'s current footprint.`,
      hasSpecificAnchor ? `I caught an article about ${signalAnchor}.` : `I was curious about the operational setup at ${companyName}.`,
      hasSpecificAnchor ? `I noticed the piece on ${signalAnchor}.` : `I was looking into ${companyName} online.`,
    ],
    news: [
      hasSpecificAnchor ? `I saw the update that ${companyName} ${buildEventClause(signalAnchor)}.` : `I was curious about the recent update on ${companyName}.`,
      hasSpecificAnchor ? `I caught the update that ${companyName} ${buildEventClause(signalAnchor)}.` : `I was looking at the recent reporting on ${companyName}.`,
      hasSpecificAnchor ? `I noticed the update that ${companyName} ${buildEventClause(signalAnchor)}.` : `I was curious about the news around ${companyName} lately.`,
    ],
  }

  const seed = hashString(`${account.id}${candidate.url}`)
  
  switch (candidate.sourceKind) {
    case 'linkedin':
      return variations.linkedin[seed % variations.linkedin.length]
    case 'sec':
      return variations.sec[seed % variations.sec.length]
    case 'web':
      if (isOfficialCompanyAnnouncement(account, candidate)) {
        return variations.web_official[seed % variations.web_official.length]
      }
      return variations.web[seed % variations.web.length]
    case 'news':
    default:
      return variations.news[seed % variations.news.length]
  }
}

function buildEventClause(anchor: string) {
  const text = cleanText(anchor).toLowerCase()
  if (!text) return 'announcing an update'
  if (/\b(specialist team|specialists?|clinical footprint|clinical team|physician team|doctor team)\b/.test(text)) {
    return 'is expanding its specialist team and clinical footprint'
  }
  if (/prepares? for .*opening/.test(text)) {
    return 'is preparing for an opening'
  }
  if (/^expands?\b/.test(text)) {
    return `is ${text.replace(/^expands?\b\s*/, 'expanding ')}`
  }
  if (/^adds?\b/.test(text)) {
    return `is ${text.replace(/^adds?\b\s*/, 'adding ')}`
  }
  if (/^hiring\b/.test(text)) {
    return `is ${text.replace(/^hiring\b\s*/, 'hiring ')}`
  }
  if (/^promotes?\b/.test(text)) {
    return `is ${text.replace(/^promotes?\b\s*/, 'promoting ')}`
  }
  if (/^names?\b/.test(text)) {
    return `is ${text.replace(/^names?\b\s*/, 'naming ')}`
  }
  if (/^announces?\b/.test(text)) {
    return `is ${text.replace(/^announces?\b\s*/, 'announcing ')}`
  }
  if (/^(launching|rolling out|opening|expanding|announcing|introducing|starting|adding|rolling|building|developing|producing|hiring|promoting|appointing|named)\b/.test(text)) {
    return `is ${text}`
  }
  return `is updating ${text}`
}

function buildSignalAwareLead(account: AccountRow, candidate: ResearchHit | null) {
  // Simplified version - just use buildSourceLead
  // The signal anchor approach was creating nonsensical output
  return buildSourceLead(account, candidate)
}

function buildOpeningIndustryLine(industryCluster: IndustryCluster, alreadyOpen: boolean, accountText = '') {
  const prefix = alreadyOpen
    ? 'Since the site is already live'
    : 'Since you have a new site coming online'

  switch (industryCluster) {
    case 'hotel_owner':
      return `${prefix}, the main factor is usually guest-room load, laundry, kitchen service, and HVAC landing on that hotel meter.`
    case 'hospitality_group':
      return `${prefix}, the main factor is usually how each hotel or property is carrying its own guest-room, laundry, and HVAC load.`
    case 'school_district':
      return `${prefix}, the main factor is usually how campus calendars, athletics, cafeteria load, and classroom HVAC are showing up on the bill.`
    case 'higher_education':
      return `${prefix}, the main factor is usually how residence halls, classrooms, labs, and dining load are showing up on the bill.`
    case 'residential_care':
      return `${prefix}, the main factor is usually how the 24/7 residential care spaces, counseling areas, and support programs are showing up on the bill.`
    case 'public_sector':
      return `${prefix}, the main factor is usually how administrative offices, public safety, and utility buildings are showing up on the bill.`
    case 'education_nonprofit':
      return `${prefix}, the main factor for the budget is usually how the seasonal occupancy and HVAC load are landing on the bill.`
    case 'healthcare':
      if (hasStrongDmeSignals(accountText)) {
        return `${prefix}, the main factor is usually how equipment deliveries, inventory, service turnaround, and storage are landing on that location.`
      }
      if (hasStrongDentalSignals(accountText)) {
        return `${prefix}, the main factor is usually how operatories, imaging, sterilization, patient flow, and HVAC are landing on that dental office meter.`
      }
      return `${prefix}, the critical detail is how clinical equipment, HVAC, and daily timing are showing up as peak charges on that meter.`
    case 'restaurant':
      return `${prefix}, the biggest risk is usually kitchen load and HVAC hitting during peak hours and driving up transmission fees.`
    case 'retail':
      if (hasStrongAutomotiveSignals(accountText)) {
        return `${prefix}, the main factor is usually how showroom traffic, service bays, parts, and lot lighting are landing on that dealership meter.`
      }
      return `${prefix}, the hidden cost is often lighting and HVAC load creating spikes that move the bill before you notice it.`
    case 'logistics':
      if (hasStrongDmeSignals(accountText)) {
        return `${prefix}, the main factor is usually how equipment deliveries, inventory, service turnaround, and storage are landing on that location.`
      }
      return `${prefix}, the focus is usually on whether dock activity, automation, and HVAC are creating expensive usage spikes.`
    case 'office_services':
      return `${prefix}, the concern is usually whether occupancy and HVAC are creating summer spikes that stay on the bill.`
    case 'food_storage':
      return `${prefix}, the issue is usually refrigeration and defrost cycles creating expensive usage spikes.`
    case 'manufacturing':
    case 'energy_intensive':
      return `${prefix}, the primary driver is usually which processes or equipment start-ups are creating peak transmission exposure.`
    default:
      return `${prefix}, the useful check is how the billing load actually matches the way the business is running now.`
  }
}

function hasMultiLocationEvidence(account: AccountRow, candidate: ResearchHit | null) {
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  return /\b(multi[-\s]?unit|multi[-\s]?site|multiple locations|locations across|several locations|portfolio|stores?|branches|dealerships?|restaurant group)\b/.test(text)
}

function buildBusinessSpecificFallbackLine(account: AccountRow, candidate: ResearchHit | null) {
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  const company = cleanText(account.name) || 'the dealership'

  if (/(children'?s home|foster care|adoption assistance|residential services|independent living center|counseling center|youth services|human services|group home|residential care)/.test(text)) {
    return 'For a residential care nonprofit like this, the useful check is whether the homes, counseling spaces, and support services are what is actually driving the bill.'
  }

  if (/(food production|food manufacturing|bakery|dessert|cake|cheesecake|pie|frozen food|refrigerat|freezer|cold chain|bakehouse|baking line|production kitchen)/.test(text)) {
    return 'For a food production plant like this, the useful check is whether refrigeration, ovens, and bake-line start-ups are what is actually driving the bill.'
  }

  if (/(spill control|sorbent|sorbents|spill kits|secondary containment|spill response|environmental response|drums|granulars|containment)/.test(text)) {
    return 'For a spill-control manufacturer like this, the useful check is whether mixing, packaging, warehouse climate control, and distribution activity are what is really driving the bill.'
  }

  if (/(freight forwarder|nvocc|cargo|shipping|trucking|transport|logistics|warehouse|distribution|fulfillment|auto logistics)/.test(text)) {
    return 'For a logistics business like this, the useful check is whether dock activity, office load, warehouse support space, and any terminal-adjacent facilities are what is really driving the bill.'
  }

  if (/\b(isd|independent school district|school district|public school|charter school|campus)\b/.test(text)) {
    return 'For a school district like this, the useful check is whether the campus calendar, HVAC, athletics, and classroom technology are all showing up on the bill the way they should.'
  }

  if (/\b(cooling|coolers?|heating|heaters?|hvac|evaporative|portable ac|air conditioning)\b/.test(text)) {
    return 'For a cooling and heating business like this, the useful check is whether seasonal demand and equipment usage are creating a predictable summer spike or just a choppy bill.'
  }

  if (/\b(glass|mirror|shower door|shower doors|window|windows|fabricat|showroom|installation|installer|shop floor)\b/.test(text)) {
    return 'For a shop and showroom business like this, the useful check is whether the showroom, fabrication equipment, and climate control are all showing up on the bill the way they should.'
  }

  if (hasStrongDmeSignals(text)) {
    return `For ${company}, the useful check is whether equipment deliveries, inventory, service turnaround, and storage are what is actually driving the bill.`
  }

  if (hasStrongAutomotiveSignals(text)) {
    return `For ${company}, the useful check is whether showroom traffic, service bays, parts, and lot lighting are what is actually driving the bill.`
  }

  if (/\b(wholesale|distributor|distribution|bearing|hydraulic|hydraulics|industrial hose|power transmission|fluid power)\b/.test(text)) {
    return 'For a wholesale distributor like this, the useful check is whether branch traffic, inventory turns, shop equipment, and any climate-controlled space are what is really pushing the bill.'
  }

  if (/\b(trailer|trailers|heavy haul|heavy-duty|heavy duty|gooseneck|lowboy|transportation equipment|vehicle recovery|commercial trailer|truck equipment)\b/.test(text)) {
    return 'For a trailer manufacturer like this, the useful check is whether production, welding, assembly, paint, and test work are all landing in the bill the way they should.'
  }

  if (/(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry|multi-site dental|dental partnership organization)/.test(text)) {
    return 'For a dental partnership organization like this, the useful check is whether the practices, operatories, imaging, sterilization, and patient flow are what is actually driving the bill.'
  }

  if (/\b(hotel|hotels|resort|resorts|motel|inn|lodging|guest rooms?|lobby|laundry|brand flag|hospitality property)\b/.test(text)) {
    return 'For a hotel property like this, the useful check is whether guest rooms, laundry, kitchen service, and HVAC are what is actually driving the bill.'
  }

  if (/\b(mental health|behavioral health|behavioral healthcare|idd|intellectual and developmental disabilities|developmental disabilities|community mental health|community center|crisis center|crisis hotline|outpatient adult|outpatient youth|substance use|early childhood intervention|care coordination|peer support)\b/.test(text)) {
    return 'For a behavioral health network like this, the useful check is whether the clinics, crisis services, counseling space, and administrative sites are carrying very different peak histories on their own meters.'
  }

  if (/\b(education|nonprofit|non-profit|exchange program|exchange programs|stem|scholarship|student|students|programs?)\b/.test(text)) {
    return 'For a program-based nonprofit or education organization like this, the useful check is whether classrooms, offices, events, and support spaces are what is actually driving the bill.'
  }

  if (/\b(office|professional services|consulting|accounting|law|legal|agency|design|engineering|architect)\b/.test(text)) {
    return 'For an office-style business, the useful check is usually whether occupancy, HVAC, and lease timing are really the main cost drivers.'
  }

  return ''
}

function buildFallbackIndustryLine(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext) {
  const multiLocation = hasMultiLocationEvidence(account, candidate)
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  const businessSpecificLine = buildBusinessSpecificFallbackLine(account, candidate)

  if (businessSpecificLine) {
    return businessSpecificLine
  }

  if (multiLocation) {
    if (hasStrongDmeSignals(accountText)) {
      return `For a multi-location equipment network, the useful check is whether each direct-service location is being reviewed on its own meter, because deliveries, inventory, storage, and service turnaround can hide different cost patterns by branch.`
    }
    if (context.industryCluster === 'restaurant') {
      return `For a multi-location restaurant group, the useful check is whether the stores are being looked at together, because kitchen equipment, HVAC, refrigeration, and hours can make one location look fine while another is quietly carrying the cost.`
    }
    if (context.industryCluster === 'retail') {
      if (hasStrongAutomotiveSignals(accountText)) {
        return `For a multi-location dealership group, the useful check is whether each dealership is being reviewed on its own meter, because showroom traffic, service bays, parts, and lot lighting can hide different cost patterns by location.`
      }
      return `For a multi-location retail group, the useful check is whether the stores are being reviewed together, because hours, traffic, lighting, and HVAC can hide different cost patterns by location.`
    }
  }

  if (context.industryOpeners && context.industryOpeners.length > 0) {
    return context.industryOpeners[0]
  }

  return `The useful check is whether the bill still lines up with how the business is actually being run.`
}

function buildFallbackQuestion(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext) {
  const multiLocation = hasMultiLocationEvidence(account, candidate)
  if (multiLocation) {
    if (context.industryCluster === 'restaurant' || context.industryCluster === 'retail') {
       return 'Have you compared the sites side by side, or is each one still being handled separately?'
    }
  }

  if (context.question) {
    return context.question
  }

  return 'Have you looked at whether the bill still lines up with how the business is actually being run?'
}

function isLikelyBadSourceUrl(value: string) {
  const url = cleanText(value)
  if (!url) return true

  const hostname = getHostname(url)
  if (!hostname) return true
  const lowerUrl = url.toLowerCase()

  if (
    hostname === 'support.google.com' ||
    hostname === 'accounts.google.com' ||
    hostname === 'translate.google.com' ||
    hostname === 'translate.googleusercontent.com' ||
    hostname === 'www.google.com'
  ) {
    return true
  }

  if (/\/translate\/answer\/\d+/i.test(url)) {
    return true
  }

  if (/(\/logout\b|\/log-out\b|\/login\b|\/log-in\b|\/signin\b|\/sign-in\b|\/signup\b|\/sign-up\b|\/auth\b)/i.test(lowerUrl)) {
    return true
  }

  return false
}

function normalizeUrlForMatch(value: string) {
  const raw = cleanText(value)
  if (!raw) return ''

  try {
    const url = new URL(raw)
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return raw.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()
  }
}

function findCandidateForResult(result: BriefResult, candidates: ResearchHit[]) {
  const sourceUrl = normalizeUrlForMatch(result?.source_url || '')
  if (sourceUrl) {
    const byUrl = candidates.find((item) => normalizeUrlForMatch(item.url) === sourceUrl)
    if (byUrl) return byUrl
  }

  const selectedPriority = Number(result?.selected_priority)
  if (Number.isFinite(selectedPriority)) {
    const byPriority = candidates.find((item) => item.priority === selectedPriority)
    if (byPriority) return byPriority
  }

  return candidates[0] || null
}

function buildResearchDiagnostics(candidates: ResearchHit[]): ResearchDiagnostics {
  const bySourceKind = candidates.reduce((acc, item) => {
    acc[item.sourceKind] = (acc[item.sourceKind] || 0) + 1
    return acc
  }, { news: 0, web: 0, sec: 0, linkedin: 0 } as Record<ResearchSourceKind, number>)

  return {
    total: candidates.length,
    bySourceKind,
    topResults: candidates.slice(0, 8).map((item) => ({
      priority: item.priority,
      label: item.label,
      title: item.title,
      url: item.url,
      sourceKind: item.sourceKind,
      source: item.source,
    })),
  }
}

function extractKeywordSnippet(text: string, keywords = SIGNAL_KEYWORDS) {
  const normalized = cleanText(text)
  if (!normalized) return ''

  const lower = normalized.toLowerCase()
  let bestIndex = -1
  let bestKeyword = ''

  for (const keyword of keywords) {
    const searchTerm = keyword.toLowerCase()
    const index = lower.indexOf(searchTerm)
    if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
      bestIndex = index
      bestKeyword = searchTerm
    }
  }

  if (bestIndex < 0) {
    return normalized.slice(0, 360)
  }

  const start = Math.max(0, bestIndex - 180)
  const end = Math.min(normalized.length, bestIndex + bestKeyword.length + 240)
  return normalized.slice(start, end).replace(/\s+/g, ' ').trim()
}

function hasStrongNewLocationEvidence(text: string) {
  const lower = cleanText(text).toLowerCase()
  if (!lower) return false

  const genericDirectory = /(\blocations?\b|\bour locations\b|\boffice locations\b|\bfind us\b|\bcontact us\b|\bheadquarters\b|\blocation page\b|\bbranch locator\b)/i.test(lower)
  const openingVerb = /(\bopened\b|\bopening\b|\bopens\b|\blaunch\b|\blaunches\b|\bgroundbreaking\b|\blease signed\b|\bsigned a lease\b|\bconstruction\b|\brelocation\b|\brelocating\b|\bmove[- ]?in\b|\bbuildout\b|\bnew location\b|\bnew site\b|\bnew facility\b|\bnew office\b|\bnew branch\b)/i.test(lower)
  const siteNoun = /(\blocation\b|\bsite\b|\bfacility\b|\bwarehouse\b|\bplant\b|\boffice\b|\bbranch\b|\bcampus\b|\bbuilding\b|\bhotel\b|\bresort\b|\bmotel\b|\binn\b|\blogding\b|\bboutique property\b|\bhospitality\b|\brestaurant\b|\bcafe\b|\bbar\b|\bvenue\b|\bevent space\b|\bbanquet hall\b|\bclinic\b|\bmedical practice\b)/i.test(lower)

  return openingVerb && siteNoun && !genericDirectory
}

function hasAcquisitionEvidence(text: string) {
  const lower = cleanText(text).toLowerCase()
  if (!lower) return false

  const acquisitionVerb = /(\bacquired\b|\bacquisition\b|\bmerger\b|\bmerged\b|\btakeover\b|\bbuyout\b|\bsold to\b|\bpurchased by\b|\bbeing acquired\b|\bchange in ownership\b|\bnew owner\b|\bnew ownership\b)/i.test(lower)
  const transactionContext = /(\bcompany\b|\bbusiness\b|\bbrand\b|\bchain\b|\brestaurant\b|\bstores?\b|\blocations?\b|\bgroup\b|\bcorporate structure\b|\bownership\b)/i.test(lower)

  return acquisitionVerb && transactionContext
}

function isTexasRelevantLocationSignal(text: string) {
  const lower = cleanText(text).toLowerCase()
  if (!lower) return false
  if (/\btexas\b|\bercot\b|\bretail choice\b|\bderegulated\b|\bcompetitive market\b|\bchoose (?:their|your) electricity provider\b|\bopen market\b/.test(lower)) {
    return true
  }
  return false
}

function isAlreadyOpenLocationSignal(text: string) {
  const lower = cleanText(text).toLowerCase()
  if (!lower) return false
  return /\b(opened|now open|already open|has opened|have opened|is open|opened in|opened at|serving customers|began serving|begins serving|started serving)\b/.test(lower)
}

function isFutureOpenLocationSignal(text: string) {
  const lower = cleanText(text).toLowerCase()
  if (!lower) return false
  return /\b(will open|plans? to open|scheduled to open|set to open|coming soon|opening soon|to open|expected to open|is set to open)\b/.test(lower)
}

function hasLeadershipChangeEvidence(text: string) {
  const lower = cleanText(text).toLowerCase()
  if (!lower) return false

  const leadershipRole = /(\bcfo\b|chief financial officer|\bcoo\b|chief operating officer|vp of finance|vice president of finance|facilities director|facility director|energy manager|\bceo\b|chief executive officer|\bpresident\b|controller|director of operations|general manager)/i.test(lower)
  const changeVerb = /(\bappointed\b|\bnamed\b|\bjoins\b|\bjoined\b|\bhired\b|\bpromoted\b|\bpromotion\b|\bnewly appointed\b|\btakes over\b|\bsucceeds\b|\bsteps down\b|\bretires\b|\bretired\b|\bleadership change\b|\bnew (?:cfo|coo|ceo|president|controller|director|manager|leader)\b)/i.test(lower)

  if (/\bthird[-\s]?generation\b/i.test(lower) && !changeVerb) {
    return false
  }

  return leadershipRole && changeVerb
}

function detectMultiSiteScale(account: AccountRow, candidate: ResearchHit | null): { isMultiSite: boolean; locationCount: number | null; regions: string[] } {
  const notes = getAccountNotes(account)
  const text = `${account.name || ''} ${account.industry || ''} ${account.description || ''} ${notes} ${candidate?.title || ''} ${candidate?.snippet || ''}`
  const lower = text.toLowerCase()
  
  // Extract location count if mentioned
  const locationMatch = /(\d+)\s*(?:schools?|locations?|sites?|campuses|stores?|branches?|dealerships?|facilities|restaurants?|units?|buildings?)/i.exec(text)
  const locationCount = locationMatch ? parseInt(locationMatch[1], 10) : null
  
  // Extract regions/states mentioned
  const statePattern = /(texas|california|florida|new york|ohio|louisiana|georgia|illinois|pennsylvania|north carolina|michigan|virginia|washington|arizona|massachusetts|tennessee|indiana|missouri|maryland|wisconsin|colorado|minnesota|south carolina|alabama|kentucky|oregon|oklahoma|connecticut|iowa|mississippi|arkansas|kansas|utah|nevada|new mexico|west virginia|nebraska|idaho|hawaii|maine|new hampshire|rhode island|montana|delaware|south dakota|north dakota|alaska|vermont|wyoming)/gi
  const states = text.match(statePattern) || []
  const uniqueStates = Array.from(new Set(states.map(s => s.toLowerCase())))
  
  const isMultiSite = (locationCount !== null && locationCount >= 10) || 
                      uniqueStates.length >= 2 ||
      /\b(multi[-\s]?site|portfolio|network|(?<!supply\s)chain|across \d+ (?:states?|regions?)|nationwide)\b/i.test(lower)
  
  return {
    isMultiSite,
    locationCount,
    regions: uniqueStates,
  }
}

function buildStructuredIdentityProfile(
  account: AccountRow,
  candidates: ResearchHit[],
  hierarchyContext: HierarchyResearchContext | null = null,
  hierarchyWebsiteHits: ResearchHit[] = [],
): IntelligenceProfile | null {
  const savedProfile = getAccountIdentityProfile(account)
  const researchText = candidates
    .slice(0, 8)
    .map((candidate) => `${candidate.title} ${candidate.snippet}`)
    .join(' ')
  const hierarchyText = cleanText([
    hierarchyContext?.hierarchySummary || '',
    ...(hierarchyContext?.relatedFacts || []),
    ...hierarchyWebsiteHits.slice(0, 4).map((candidate) => `${candidate.title} ${candidate.snippet}`),
  ].join(' '))
  const synthesizedAccount: AccountRow = {
    ...account,
    description: cleanText(`${account.description || ''} ${researchText} ${hierarchyText}`),
  }
  const primaryCandidate = candidates[0] || null
  const baseCluster = inferIndustryClusterFromSignals(account, null)
  const derivedCluster = inferIndustryClusterFromSignals(synthesizedAccount, primaryCandidate)
  const cluster = resolvePreferredIndustryCluster(baseCluster, derivedCluster)
  const multiSiteInfo = detectMultiSiteScale(synthesizedAccount, primaryCandidate)
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${getAccountNotes(account)} ${researchText} ${hierarchyText} ${buildIdentityProfileText(account, primaryCandidate)}`).toLowerCase()

  if (!text && !savedProfile) return null
  if (!text && savedProfile) return savedProfile

  const hasHospitalSignals = /(hospital|neighborhood hospital|micro[-\s]?hospital|community hospital|small-format hospital|licensed hospital|emergency room|emergency care|inpatient care|inpatient bed|acute care)/i.test(text)
  const isBehavioralHealth = /(mental health|behavioral health|behavioral healthcare|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|developmental disabilities|community center|community mental health|crisis center|crisis hotline|substance use|recovery program|peer support|care coordination|licensed therapy|early childhood intervention|trauma-informed)/i.test(text)
  const isSeniorLiving = /(senior living|assisted living|memory care|skilled nursing|retirement living|continuum of care|nursing home|alzheimer'?s? care|independent living cottages?|apartments?)/i.test(text)
  const isDentalPractice = hasStrongDentalSignals(text)
  const isDmeProvider = hasStrongDmeSignals(text)
  const isBloodCenter = /(blood center|bloodcare|blood bank|blood donation|blood products|blood components|transfusion|donor center|mobile blood drives?|blood collection|blood processing|specialized laboratory testing)/i.test(text)
  const isFoodProduction = /(food production|food manufacturing|food manufacturer|food processing|food processing facilities|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|foodservice|production facilities)/i.test(text)
  const isAutoGroup = hasStrongAutomotiveSignals(text)
  const isFreightForwarder = /\b(freight forwarder|nvo?cc|auto logistics|shipping|cargo|international transport|oversized cargo|roro|flat rack)\b/i.test(text)
  const isHotelGroup = /\b(hospitality group|hotel management|portfolio of hotels|hotel portfolio|hotel owner|resort portfolio|branded hotel owner)\b/i.test(text)
  const isHotelProperty = /\b(hotel|resort|motel|inn|guest rooms?|lodging)\b/i.test(text)
  const isPublicSector = /\b(city of|county|municipal|public facilities|utility infrastructure|public safety|government entity)\b/i.test(text)

  let companyType = cleanText(account.industry) || 'commercial account'
  let operatingModel = multiSiteInfo.isMultiSite ? 'multi-site portfolio' : 'single-site operator'
  let facilityType = 'commercial facility'
  let identityKeywords: string[] = []
  let powerKeywords: string[] = []
  let talkTrackGuardrails: string[] = []

  switch (cluster) {
    case 'healthcare':
      if (isDmeProvider) {
        companyType = multiSiteInfo.isMultiSite ? 'durable medical equipment network' : 'durable medical equipment provider'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site DME distribution network' : 'direct-service equipment support site'
        facilityType = 'distribution / service location'
        identityKeywords = selectIdentityKeywords(text, ['durable medical equipment', 'medical supplies', 'hospice DME', 'equipment logistics', 'direct-service locations', 'inventory management'], ['durable medical equipment', 'medical supplies', 'equipment logistics'])
        powerKeywords = selectIdentityKeywords(text, ['warehouse climate control', 'inventory storage', 'equipment maintenance', '24/7 distribution', 'delivery turnaround', 'vehicle/route load'], ['warehouse climate control', 'inventory storage', 'equipment maintenance'])
        talkTrackGuardrails = ['No hospital language', 'No clinic language', 'No emergency department language', 'No inpatient language', 'No patient-room language']
        break
      }

      if (isDentalPractice) {
        companyType = multiSiteInfo.isMultiSite ? 'dental partnership organization' : 'dental practice'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site dental practice network with centralized support' : 'single dental office'
        facilityType = 'dental practice / office'
        identityKeywords = selectIdentityKeywords(text, ['dental partnership organization', 'dental practice', 'practice acquisition', 'doctor partners', 'multi-site practices', 'centralized support'], ['dental practice', 'doctor partners', 'operatories'])
        powerKeywords = selectIdentityKeywords(text, ['operatories', 'imaging', 'sterilization', 'patient flow', 'hygiene schedule', 'hvac'], ['operatories', 'imaging', 'sterilization'])
        talkTrackGuardrails = ['No hospital language', 'No emergency department language', 'No inpatient language', 'No hotel language', 'No restaurant language']
        break
      }

      if (isBloodCenter) {
        companyType = multiSiteInfo.isMultiSite ? 'blood center and clinical lab network' : 'blood center'
        operatingModel = multiSiteInfo.isMultiSite ? 'regional donor collection and lab network' : 'clinical blood-service facility'
        facilityType = 'donor center / laboratory'
        identityKeywords = selectIdentityKeywords(text, ['blood center', 'bloodcare', 'donor center', 'blood products', 'lab processing', 'refrigerated storage', 'hospital supply'], ['blood center', 'donor collection', 'lab processing'])
        powerKeywords = selectIdentityKeywords(text, ['refrigerated storage', 'lab processing', 'blood processing', 'cold storage', 'mobile blood drives', 'hvac'], ['refrigerated storage', 'lab processing', 'HVAC'])
        talkTrackGuardrails = ['No logistics language', 'No warehouse-only language', 'No dock-door language']
        break
      }

      if (isBehavioralHealth) {
        companyType = multiSiteInfo.isMultiSite ? 'behavioral health network' : 'behavioral health provider'
        operatingModel = multiSiteInfo.isMultiSite ? 'distributed community-care network' : 'community-care facility'
        facilityType = 'clinic / crisis center / support building'
        identityKeywords = selectIdentityKeywords(text, ['behavioral health', 'mental health', 'crisis services', 'counseling', 'care coordination', 'community programs'], ['behavioral health', 'community care', 'crisis services'])
        powerKeywords = selectIdentityKeywords(text, ['hvac', 'clinical space', 'support buildings', 'crisis center', 'counseling center'], ['HVAC', 'clinical space', 'support buildings'])
        talkTrackGuardrails = ['No senior-living language', 'No hotel language', 'No restaurant language', 'No manufacturing language']
        break
      }

      if (isSeniorLiving) {
        companyType = multiSiteInfo.isMultiSite ? 'senior care campus network' : 'senior living community'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site senior-care portfolio' : '24-hour residential care community'
        facilityType = 'senior living / nursing facility'
        identityKeywords = selectIdentityKeywords(text, ['senior living', 'assisted living', 'memory care', 'skilled nursing', 'retirement living', 'continuum of care'], ['senior living', 'memory care', 'skilled nursing'])
        powerKeywords = selectIdentityKeywords(text, ['laundry', 'dining', 'hvac', 'patient rooms', 'common areas'], ['HVAC', 'common areas', 'dining'])
        talkTrackGuardrails = ['No hotel language', 'No school language']
        break
      }

      if (hasHospitalSignals) {
        companyType = multiSiteInfo.isMultiSite ? 'neighborhood hospital operator' : 'hospital operator'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site hospital network with health-system partnerships' : 'licensed hospital site'
        facilityType = 'hospital'
        identityKeywords = selectIdentityKeywords(text, ['neighborhood hospital', 'small-format hospital', 'emergency care', 'inpatient services', 'diagnostic care', 'health system partnerships', 'micro-hospital'], ['neighborhood hospital', 'emergency care', 'inpatient services'])
        powerKeywords = selectIdentityKeywords(text, ['emergency department', 'imaging', 'short-stay rooms', 'inpatient rooms', 'lab work', 'hvac'], ['emergency department', 'imaging', 'lab work', 'HVAC'])
        talkTrackGuardrails = ['No hotel language', 'No guest-room language', 'No laundry language', 'No banquet or event-venue language', 'No restaurant language']
        break
      }

      companyType = multiSiteInfo.isMultiSite ? 'clinical care network' : 'medical practice'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-site clinical network' : 'daytime clinical facility'
      facilityType = 'clinic / medical office'
      identityKeywords = selectIdentityKeywords(text, ['medical practice', 'clinic', 'patient care', 'diagnostic imaging', 'specialists', 'treatment rooms'], ['medical practice', 'clinic', 'patient care'])
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'treatment rooms', 'imaging', 'lighting', 'patient hours'], ['HVAC', 'patient hours', 'treatment rooms'])
      talkTrackGuardrails = ['No hotel language', 'No hospital-inpatient language unless source confirms it', 'No restaurant language', 'No manufacturing language']
      break

    case 'manufacturing':
      if (isFoodProduction) {
        companyType = multiSiteInfo.isMultiSite ? 'food production network' : 'food manufacturer'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site production network' : 'production facility'
        facilityType = 'production plant'
        identityKeywords = selectIdentityKeywords(text, ['food production', 'food manufacturing', 'food processing', 'usda-approved', 'custom proteins', 'soups', 'sauces', 'foodservice'], ['food production', 'food processing', 'USDA production'])
        powerKeywords = selectIdentityKeywords(text, ['refrigeration', 'cooking', 'packaging', 'sanitation', 'freezer', 'cold chain'], ['refrigeration', 'packaging', 'sanitation'])
        talkTrackGuardrails = ['No warehouse-group language', 'No dock-only language']
        break
      }

      companyType = multiSiteInfo.isMultiSite ? 'industrial manufacturing network' : 'industrial manufacturer'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-site production footprint' : 'production facility'
      facilityType = 'plant / production facility'
      identityKeywords = selectIdentityKeywords(text, ['manufacturing', 'industrial', 'production', 'fabrication', 'chemical', 'packaging'], ['manufacturing', 'production', 'industrial'])
      powerKeywords = selectIdentityKeywords(text, ['production lines', 'process equipment', 'hvac', 'compressed air', 'start-up sequence'], ['production lines', 'process equipment', 'HVAC'])
      talkTrackGuardrails = ['No retail language', 'No office-only language']
      break

    case 'logistics':
      if (isDmeProvider) {
        companyType = multiSiteInfo.isMultiSite ? 'medical equipment distribution network' : 'durable medical equipment provider'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site DME distribution and service network' : 'direct-service equipment support site'
        facilityType = 'distribution / service location'
        identityKeywords = selectIdentityKeywords(text, ['durable medical equipment', 'medical supplies', 'hospice DME', 'equipment logistics', 'direct-service locations', 'inventory management'], ['durable medical equipment', 'medical supplies', 'equipment logistics'])
        powerKeywords = selectIdentityKeywords(text, ['warehouse climate control', 'inventory storage', 'equipment maintenance', '24/7 distribution', 'delivery turnaround'], ['warehouse climate control', 'inventory storage', 'equipment maintenance'])
        talkTrackGuardrails = ['No clinic language', 'No hospital language', 'No emergency department language', 'No inpatient language']
        break
      }

      companyType = isFreightForwarder ? 'freight forwarder and logistics operator' : (multiSiteInfo.isMultiSite ? 'distribution network' : 'distribution and logistics operator')
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-site logistics network' : 'distribution support site'
      facilityType = isFreightForwarder ? 'logistics office / yard' : 'warehouse / distribution facility'
      identityKeywords = selectIdentityKeywords(text, ['distribution', 'logistics', 'warehouse', 'freight forwarder', 'shipping', 'cargo', 'supply chain', 'nvocc'], ['distribution', 'logistics', isFreightForwarder ? 'freight forwarding' : 'warehouse'])
      powerKeywords = selectIdentityKeywords(text, ['dock activity', 'material handling', 'hvac', 'yard lighting', 'cold storage'], ['dock activity', 'material handling', 'HVAC'])
      talkTrackGuardrails = isFreightForwarder ? ['No manufacturing language', 'No plant language'] : ['No manufacturing language']
      break

    case 'food_storage':
      companyType = multiSiteInfo.isMultiSite ? 'cold-storage network' : 'cold-storage operator'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-site cold-storage footprint' : 'refrigerated storage facility'
      facilityType = 'cold storage / warehouse'
      identityKeywords = selectIdentityKeywords(text, ['cold storage', 'refrigerated storage', 'freezer', 'dairy', 'produce', 'meat', 'grocery'], ['cold storage', 'refrigerated storage', 'freezer'])
      powerKeywords = selectIdentityKeywords(text, ['refrigeration', 'freezer', 'dock activity', 'hvac'], ['refrigeration', 'freezer', 'HVAC'])
      talkTrackGuardrails = ['No manufacturing language unless source confirms production']
      break

    case 'retail':
      if (isAutoGroup) {
        companyType = multiSiteInfo.isMultiSite ? 'auto dealership group' : 'auto dealership'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site dealership portfolio' : 'dealership property'
        facilityType = 'showroom / service bay / lot'
        identityKeywords = selectIdentityKeywords(text, ['dealership', 'auto group', 'showroom', 'service bays', 'vehicle inventory'], ['auto dealership', 'showroom', 'service bays'])
        powerKeywords = selectIdentityKeywords(text, ['lot lighting', 'showroom', 'service bays', 'hvac'], ['lot lighting', 'showroom HVAC', 'service bays'])
        talkTrackGuardrails = ['No hotel language', 'No hospitality language']
        break
      }

      companyType = multiSiteInfo.isMultiSite ? 'retail store network' : 'retail business'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-store footprint' : 'customer-facing retail site'
      facilityType = 'store / showroom'
      identityKeywords = selectIdentityKeywords(text, ['retail', 'store', 'shopping', 'showroom', 'franchise'], ['retail', 'store', 'showroom'])
      powerKeywords = selectIdentityKeywords(text, ['lighting', 'hvac', 'refrigeration', 'comfort'], ['lighting', 'HVAC', 'comfort'])
      talkTrackGuardrails = ['No industrial language']
      break

    case 'restaurant':
      companyType = multiSiteInfo.isMultiSite ? 'restaurant group' : 'restaurant'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-location dining footprint' : 'single restaurant site'
      facilityType = 'restaurant / dining facility'
      identityKeywords = selectIdentityKeywords(text, ['restaurant', 'dining', 'grill', 'cafe', 'bar', 'eatery'], ['restaurant', 'dining', 'kitchen'])
      powerKeywords = selectIdentityKeywords(text, ['kitchen', 'refrigeration', 'hvac', 'service rushes'], ['kitchen', 'refrigeration', 'HVAC'])
      talkTrackGuardrails = ['No hotel language unless lodging is core to the business']
      break

    case 'hotel_owner':
      companyType = 'hotel owner'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-property hotel ownership' : 'single hotel property'
      facilityType = 'hotel'
      identityKeywords = selectIdentityKeywords(text, ['hotel', 'guest rooms', 'lodging', 'brand flag', 'laundry'], ['hotel', 'guest rooms', 'lodging'])
      powerKeywords = selectIdentityKeywords(text, ['guest rooms', 'laundry', 'kitchen', 'hvac'], ['guest rooms', 'laundry', 'HVAC'])
      talkTrackGuardrails = ['No event-venue language unless the source explicitly says banquet or convention space']
      break

    case 'hospitality_group':
      companyType = isHotelGroup ? 'hospitality group' : 'hotel portfolio operator'
      operatingModel = 'multi-property hospitality portfolio'
      facilityType = 'hotels / resorts'
      identityKeywords = selectIdentityKeywords(text, ['hospitality group', 'hotel portfolio', 'multiple properties', 'resorts', 'hotels'], ['hospitality group', 'hotel portfolio', 'multiple properties'])
      powerKeywords = selectIdentityKeywords(text, ['guest rooms', 'laundry', 'kitchen', 'hvac'], ['guest rooms', 'laundry', 'HVAC'])
      talkTrackGuardrails = ['No event-venue language unless source confirms it']
      break

    case 'school_district':
      companyType = 'school district'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-campus public-school system' : 'public-school campus'
      facilityType = 'school campus'
      identityKeywords = selectIdentityKeywords(text, ['school district', 'campus', 'students', 'classrooms', 'chromebooks', 'athletics', 'cafeterias'], ['school district', 'campuses', 'classroom technology'])
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'classroom technology', 'cafeterias', 'athletics', 'lighting'], ['HVAC', 'classroom technology', 'cafeterias'])
      talkTrackGuardrails = ['No factory language', 'No shift or production language']
      break

    case 'higher_education':
      companyType = 'college or university'
      operatingModel = multiSiteInfo.isMultiSite ? 'campus network' : 'single campus'
      facilityType = 'campus / academic buildings'
      identityKeywords = selectIdentityKeywords(text, ['college', 'university', 'campus', 'student housing', 'dorm', 'labs'], ['college', 'campus', 'academic buildings'])
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'labs', 'student housing', 'classrooms'], ['HVAC', 'labs', 'student housing'])
      talkTrackGuardrails = ['No school-district language']
      break

    case 'residential_care':
      companyType = /(children'?s home|foster care|youth services)/i.test(text) ? 'children and family residential-care campus' : 'residential-care organization'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-program care campus' : 'residential-care campus'
      facilityType = 'residential-care facility'
      identityKeywords = selectIdentityKeywords(text, ['children\'s home', 'residential services', 'counseling center', 'independent living', 'group home', 'youth services'], ['residential care', 'counseling', 'support services'])
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'residential wings', 'common areas', 'counseling space', 'kitchen'], ['HVAC', 'common areas', 'counseling space'])
      talkTrackGuardrails = ['No school-district language', 'No hotel language']
      break

    case 'public_sector':
      companyType = isPublicSector ? 'municipal facility portfolio' : 'public-sector organization'
      operatingModel = multiSiteInfo.isMultiSite ? 'public-facility portfolio' : 'public facility'
      facilityType = 'municipal / administrative facility'
      identityKeywords = selectIdentityKeywords(text, ['city of', 'county', 'municipal', 'public safety', 'utility infrastructure', 'public facilities'], ['municipal facilities', 'public safety', 'utility infrastructure'])
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'water infrastructure', 'public safety', 'administrative buildings'], ['HVAC', 'public safety', 'administrative buildings'])
      talkTrackGuardrails = ['No non-profit language']
      break

    case 'banking':
      companyType = multiSiteInfo.isMultiSite ? 'branch banking network' : 'financial-services office'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-branch financial footprint' : 'office-based financial services'
      facilityType = multiSiteInfo.isMultiSite ? 'branches / offices' : 'office'
      identityKeywords = selectIdentityKeywords(text, ['bank', 'credit union', 'financial services', 'branches', 'wealth management'], ['financial services', 'branches', 'banking'])
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'lighting', 'branch operations', 'it equipment'], ['HVAC', 'lighting', 'IT equipment'])
      talkTrackGuardrails = ['No healthcare language']
      break

    case 'religious':
      companyType = 'religious organization'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-building worship campus' : 'worship facility'
      facilityType = 'church / worship campus'
      identityKeywords = selectIdentityKeywords(text, ['church', 'ministry', 'parish', 'worship', 'congregation', 'sanctuary'], ['worship campus', 'sanctuary', 'ministry'])
      powerKeywords = selectIdentityKeywords(text, ['sanctuary', 'classrooms', 'hvac', 'fellowship hall'], ['HVAC', 'sanctuary', 'classrooms'])
      talkTrackGuardrails = ['No school-district language', 'No factory language']
      break

    case 'technology':
      companyType = /(data center)/i.test(text) ? 'data-center or digital infrastructure operator' : 'technology business'
      operatingModel = multiSiteInfo.isMultiSite ? 'distributed technology footprint' : 'technology facility'
      facilityType = /(data center)/i.test(text) ? 'data center' : 'office / technical facility'
      identityKeywords = selectIdentityKeywords(text, ['technology', 'software', 'saas', 'data center', 'cloud', 'digital infrastructure'], ['technology', /(data center)/i.test(text) ? 'data center' : 'software'])
      powerKeywords = selectIdentityKeywords(text, ['servers', 'cooling', 'ups', 'technical load', 'hvac'], ['technical load', 'cooling', 'HVAC'])
      talkTrackGuardrails = ['No hospitality language']
      break

    case 'energy_intensive':
      companyType = 'energy-intensive industrial operator'
      operatingModel = multiSiteInfo.isMultiSite ? 'industrial site portfolio' : 'industrial facility'
      facilityType = 'plant / heavy industrial site'
      identityKeywords = selectIdentityKeywords(text, ['oil', 'gas', 'refinery', 'cement', 'mining', 'industrial gas'], ['industrial operations', 'heavy process', 'plant'])
      powerKeywords = selectIdentityKeywords(text, ['process equipment', 'motors', 'hvac', 'compressors'], ['process equipment', 'motors', 'compressors'])
      talkTrackGuardrails = ['No office-only language']
      break

    case 'office_services':
      companyType = 'professional services business'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-office footprint' : 'office-based business'
      facilityType = 'office'
      identityKeywords = selectIdentityKeywords(text, ['services', 'professional services', 'administration', 'headquarters', 'office'], ['office', 'professional services', 'administration'])
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'lighting', 'it equipment'], ['HVAC', 'lighting', 'IT equipment'])
      talkTrackGuardrails = ['No heavy-industrial language']
      break

    case 'multi_site':
      companyType = 'multi-site operating portfolio'
      operatingModel = 'distributed portfolio'
      facilityType = 'multi-site portfolio'
      identityKeywords = selectIdentityKeywords(text, ['portfolio', 'network', 'multiple locations', 'multi-site', 'nationwide'], ['multi-site', 'portfolio', 'network'])
      powerKeywords = selectIdentityKeywords(text, ['portfolio comparison', 'meter history', 'hvac'], ['portfolio comparison', 'meter history', 'HVAC'])
      talkTrackGuardrails = ['Keep liabilities meter-specific']
      break

    default:
      companyType = cleanText(account.industry) || 'commercial account'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-site portfolio' : 'commercial facility'
      facilityType = multiSiteInfo.isMultiSite ? 'portfolio of sites' : 'commercial facility'
      identityKeywords = selectIdentityKeywords(text, [cleanText(account.industry), cleanText(account.name)], [cleanText(account.industry) || 'commercial account'], 4)
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'lighting', 'operations'], ['HVAC', 'operations'], 4)
      talkTrackGuardrails = ['Use plain language', 'Avoid unrelated industry labels']
      break
  }

  const confidenceSignals = identityKeywords.filter((keyword) => text.includes(keyword.toLowerCase())).length +
    powerKeywords.filter((keyword) => text.includes(keyword.toLowerCase())).length
  const confidence: IdentityConfidence = cluster === 'unknown'
    ? 'low'
    : confidenceSignals >= 5
      ? 'high'
      : (candidates.length > 0 || cleanText(account.description))
        ? 'medium'
        : 'low'

  return {
    version: IDENTITY_PROFILE_VERSION,
    industryCluster: cluster,
    companyType,
    operatingModel,
    facilityType,
    identityKeywords,
    powerKeywords,
    talkTrackGuardrails,
    evidence: buildIdentityEvidence(account, candidates, [...identityKeywords, ...powerKeywords]),
    confidence,
    generatedAt: new Date().toISOString(),
    sourceKinds: uniqueStrings(candidates.map((candidate) => candidate.sourceKind), 4)
      .filter((value): value is ResearchSourceKind => ['news', 'web', 'sec', 'linkedin'].includes(value))
      .slice(0, 4),
  }
}

function inferSignalPriority(text: string, fallbackPriority: number) {
  const lower = cleanText(text).toLowerCase()
  
  // Filter out religious content first
  if (/(rosh hashanah|yom kippur|passover|hanukkah|easter|christmas|prayer|sermon|worship service|spiritual|faith|blessing)/.test(lower)) {
    return fallbackPriority
  }
  
  if (/(acquir|merger|takeover|buyout)/.test(lower)) return 1
  if (hasStrongNewLocationEvidence(lower)) return 2
  if (hasLeadershipChangeEvidence(lower)) return 3
  if (/(expansion|capital expenditure|capex|headcount|growth|future site|buildout|build-out|initiative|program|launching)/.test(lower)) return 4
  if (/(restructuring|closure|consolidation|downsizing|layoff|shutdown)/.test(lower)) return 5
  if (/(contract award|government contract|customer win|major customer|new customer)/.test(lower)) return 6
  if (/(funding round|series [abcde]|ipo|initial public offering|going public)/.test(lower)) return 7
  return fallbackPriority
}

const TALK_TRACK_GENERIC_PATTERNS = [
  /autopilot/i,
  /site\s*by\s*site/i,
  /load profile/i,
  /energy load/i,
  /operating footprint/i,
  /industry angle/i,
  /from an industry angle/i,
  /structured in a way/i,
  /current setup/i,
  /electricity side starts behaving differently/i,
  /one location at a time/i,
  /doesn't always match/i,
  /most companies/i,
  /rate looks fine/i,
  /worth a quick look/i,
  /the part i would want to understand/i,
  /before the spending picks up again/i,
  /cost review/i,
  /business update is one thing/i,
  /practical question is what it changes on the power side/i,
  /new leader usually/i,
  /filing tied to/i,
  /responsible for electricity/i,
  /support ticket/i,
  /i was looking at/i,
  /i was looking into the setup/i,
  /i took a look at/i,
  /utility side/i,
  /(?:i saw (?:a|the) note|the note about)/i,
  /for sale/i,
  /pre[-\s]?owned/i,
  /\binventory\b/i,
  /cars?,\s*trucks?,\s*&?\s*suvs?/i,
  /dealership/i,
  /forensic signal/i,
  /forensic driver/i,
  /thermal liability/i,
  /artificial liability/i,
  /peak demand charges/i,
  /transmission side/i,
  /correlation/i,
  /came across .*website/i,
  /headcount or capex/i,
  /^(that|this|it)\s+(makes|is|was|would|can|usually|tends)\b/i,
]

const TALK_TRACK_SIGNAL_KEYWORDS: Record<SignalFamily, string[]> = {
  acquisition: ['acquisition', 'acquired', 'merger', 'buyout', 'takeover', 'deal', 'inherited'],
  new_location: ['new location', 'new site', 'facility', 'construction', 'lease', 'opening', 'meter', 'buildout', 'ramp-up'],
  leadership_change: ['cfo', 'coo', 'finance', 'facilities', 'energy manager', 'leadership', 'new leader'],
  growth: ['expansion', 'capex', 'headcount', 'growth', 'ramp', 'capacity', 'hiring'],
  restructuring: ['restructuring', 'closure', 'consolidation', 'downsizing', 'shutdown', 'footprint'],
  contract_win: ['contract', 'customer', 'project', 'new work', 'win', 'deal', 'load'],
  funding: ['funding', 'series', 'ipo', 'capital', 'raise', 'investor'],
  technical_load: ['technical', 'load', 'electrification', 'heat pump', 'ev charging', 'data center', 'server', 'compute', 'ai'],
  industry_context: ['budget', 'load', 'site', 'agreement', 'cost', 'Texas'],
}

const TALK_TRACK_INDUSTRY_KEYWORDS: Record<IndustryCluster, string[]> = {
  manufacturing: ['process', 'equipment', 'shift', 'peak', 'load', 'production', 'startup'],
  logistics: ['dock', 'automation', 'hvac', 'throughput', 'occupancy', 'warehouse', '24/7'],
  food_storage: ['refrigeration', 'freezer', 'defrost', 'cooler', 'temperature', 'compressor'],
  healthcare: ['occupancy', 'hvac', 'backup', 'reliability', '24/7', 'clinical', 'lab', 'blood', 'donor', 'storage'],
  banking: ['branch', 'occupancy', 'hvac', 'it', 'atms', 'portfolio', 'hours'],
  retail: ['store', 'seasonal', 'traffic', 'lighting', 'hvac', 'refrigeration', 'multi-site'],
  restaurant: ['kitchen', 'hvac', 'refrigeration', 'prep', 'hours', 'multi-unit', 'equipment'],
  hotel_owner: ['hotel', 'guest rooms', 'lobby', 'laundry', 'kitchen', 'hvac', 'property'],
  hospitality_group: ['portfolio', 'hotels', 'properties', 'management company', 'hospitality group', 'multi-property'],
  school_district: ['campus', 'calendar', 'athletics', 'cafeteria', 'classroom', 'student', 'school'],
  higher_education: ['campus', 'student housing', 'residence hall', 'research', 'dorm', 'university', 'college'],
  residential_care: ['residential', 'counseling', 'independent living', 'foster care', 'adoption', 'house', 'program'],
  education_nonprofit: ['campus', 'occupancy', 'events', 'hvac', 'controls', 'building', 'schedule'],
  religious: ['worship', 'sanctuary', 'events', 'hvac', 'weekend', 'seasonal', 'occupancy'],
  technology: ['cooling', 'server', 'fit-out', 'occupancy', 'equipment', 'space', 'data'],
  energy_intensive: ['transmission fees', 'process', 'motor', 'equipment', 'peak', 'load', 'maintenance'],
  office_services: ['occupancy', 'lease', 'hvac', 'conference', 'equipment', 'hours', 'space'],
  multi_site: ['portfolio', 'site', 'occupancy', 'hours', 'equipment', 'load', 'meter'],
  public_sector: ['public safety', 'utility infrastructure', 'administrative', 'municipal', 'critical services', 'budget', 'civic'],
  unknown: ['usage', 'occupancy', 'equipment', 'load'],
}

const TALK_TRACK_INDUSTRY_LABELS: Record<IndustryCluster, string[]> = {
  manufacturing: ['manufacturing', 'industrial', 'factory', 'plant'],
  logistics: ['logistics', 'warehouse', 'distribution', 'fulfillment'],
  food_storage: ['cold storage', 'refrigeration', 'freezer', 'food storage'],
  healthcare: ['healthcare', 'hospital', 'clinic', 'medical', 'senior living', 'assisted living', 'nursing'],
  banking: ['bank', 'banking', 'credit union', 'financial services'],
  retail: ['retail', 'store', 'shopping', 'showroom'],
  restaurant: ['restaurant', 'restaurants', 'hospitality', 'dining', 'cafe', 'food service', 'venue', 'wedding', 'event space', 'lodging', 'hotel', 'motel'],
  hotel_owner: ['hotel', 'hotels', 'resort', 'resorts', 'motel', 'inn', 'lodging', 'guest rooms', 'brand flag'],
  hospitality_group: ['hospitality group', 'hotel management', 'portfolio of hotels', 'management company', 'multiple properties', 'brands'],
  school_district: ['school district', 'isd', 'independent school district', 'public school', 'k-12', 'campus'],
  higher_education: ['college', 'university', 'higher education', 'community college', 'campus'],
  residential_care: ["children's home", 'foster care', 'adoption', 'residential services', 'independent living', 'counseling center', 'residential care'],
  education_nonprofit: ['school', 'education', 'campus', 'nonprofit', 'university', 'college'],
  religious: ['church', 'synagogue', 'mosque', 'temple', 'congregation', 'parish', 'worship', 'ministry'],
  technology: ['technology', 'tech', 'software', 'saas', 'data center'],
  energy_intensive: ['energy-intensive', 'heavy site', 'industrial gas', 'refinery', 'mining', 'quarry'],
  office_services: ['office', 'professional services', 'consulting', 'legal', 'accounting'],
  multi_site: ['multi-site', 'portfolio', 'branch', 'chain'],
  public_sector: ['city', 'municipal', 'government', 'public sector', 'civic', 'utility'],
  unknown: [],
}

function hashString(value: string) {
  let hash = 0
  const text = cleanText(value)
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function simplifyTalkTrackLanguage(value: string) {
  return cleanText(value)
    .replace(/\bforensic signal\b/gi, 'thing to watch')
    .replace(/\bforensic driver\b/gi, 'thing to watch')
    .replace(/\bforensic check\b/gi, 'check')
    .replace(/\bforensic question\b/gi, 'question')
    .replace(/\bforensic audit\b/gi, 'review')
    .replace(/\bthermal liability\b/gi, 'cooling and door activity')
    .replace(/\bstructural inefficiency\b/gi, 'bill issue')
    .replace(/\bdemand profile\b/gi, 'usage pattern')
    .replace(/\b4CP exposure\b/gi, 'summer peak-hour exposure')
    .replace(/\b4CP\b/gi, 'summer peak hours')
    .replace(/\bcoincident peak\b/gi, 'summer peak')
    .replace(/\bload factor\b/gi, 'usage pattern')
    .replace(/\bbase load\b/gi, 'steady usage')
    .replace(/\bdemand ratchets\b/gi, 'peak charges that stick on the bill')
    .replace(/\bdemand ratchet\b/gi, 'peak charge that sticks on the bill')
    .replace(/\bbilling floors\b/gi, 'peak charges on the bill')
    .replace(/\bbilling floor\b/gi, 'peak charge on the bill')
    .replace(/\blocked-in peak charges\b/gi, 'peak charges that stick on the bill')
    .replace(/\blocked-in peak charge\b/gi, 'peak charge that sticks on the bill')
    .replace(/\bpeak demand charges\b/gi, 'peak charges on the bill')
    .replace(/\bpeak demand charge\b/gi, 'peak charge on the bill')
    .replace(/\bpeak exposure\b/gi, 'peak-charge exposure')
    .replace(/\bdemand peak\b/gi, 'usage spike')
    .replace(/\bartificial liability\b/gi, 'charge that may not match how the site runs now')
    .replace(/\btransmission side of the bill\b/gi, 'charges tied to when the site uses the most power')
    .replace(/\btransmission side\b/gi, 'peak-timing side')
    .replace(/\bcorrelation\b/gi, 'connection')
    .replace(/\bbranch operations\b/gi, 'multi-site operations')
    .replace(/\bbranch IT loads\b/gi, 'site-level office and equipment usage')
    .replace(/\ba peak charges\b/gi, 'a peak charge')
    .replace(/\ba stealth peak charges\b/gi, 'a hidden peak charge')
    .replace(/\btriggering a peak charges\b/gi, 'triggering a peak charge')
}

function pickVariant<T>(items: T[], seed: string) {
  if (!items.length) return null
  return items[hashString(seed) % items.length]
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shortenText(value: string, maxLength = 90) {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

function lowercaseFirst(value: string) {
  const text = cleanText(value)
  if (!text) return ''
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function stripTrailingQuestionMark(value: string) {
  return cleanText(value).replace(/\?+$/, '').trim()
}

function tokenizeTalkTrack(value: string) {
  const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'you', 'that', 'this', 'with', 'from', 'have', 'has', 'what', 'your', 'about', 'just', 'been', 'usually', 'when', 'like', 'some', 'they', 'their', 'there', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'but', 'not', 'out', 'how', 'any', 'get', 'got'])
  return Array.from(
    new Set(
      cleanText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  )
}

function talkTrackSimilarity(left: string, right: string) {
  const leftTokens = tokenizeTalkTrack(left)
  const rightTokens = tokenizeTalkTrack(right)
  if (!leftTokens.length || !rightTokens.length) return 0

  const rightSet = new Set(rightTokens)
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  if (!union) return 0
  return overlap / union
}

function talkTrackIsTooSimilarToPrevious(current: string, previous: string) {
  const currentText = cleanText(current)
  const previousText = cleanText(previous)
  if (!currentText || !previousText) return false
  if (currentText.toLowerCase() === previousText.toLowerCase()) return true
  return talkTrackSimilarity(currentText, previousText) >= 0.58
}

function deriveSignalAnchor(account: AccountRow, candidate: ResearchHit | null) {
  const title = cleanText(candidate?.title)
  const companyName = cleanText(account.name)

  if (!title) {
    return companyName || 'this account'
  }

  if (isLikelyNonEnglishText(title)) {
    return companyName || 'this account'
  }

  if (looksLikeCommercialListingPage(title, candidate?.snippet || '', candidate?.snippet || '', candidate?.url || '')) {
    return companyName || 'this account'
  }

  if (countMatchingPatterns(title, LOW_QUALITY_LISTING_PATTERNS) >= 2) {
    return companyName || 'this account'
  }

  // Clean common news site suffixes and separators
  let cleanedTitle = title
    .replace(/\s+[|:\-–—]\s+.*$/, '') // Strip everything after a separator near the end
    .replace(/\s+(Bloomberg|Reuters|CNBC|Forbes|Wall Street Journal|WSJ|Business Wire|PR Newswire|LinkedIn|Google News).*$/i, '')
    .trim()

  // Try to extract a clean signal anchor by removing company name prefix or suffix
  if (companyName) {
    const escapedName = escapeRegExp(companyName)
    // Try removing from start
    let stripped = cleanedTitle.replace(new RegExp(`^${escapedName}[\\s\\-:–—|,]+`, 'i'), '')
    // If nothing changed, try removing from end
    if (stripped === cleanedTitle) {
      stripped = cleanedTitle.replace(new RegExp(`[\\s\\-:–—|,]+${escapedName}$`, 'i'), '')
    }
    
    const cleaned = cleanText(stripped)
    // If we extracted something reasonably long, use it
    if (cleaned && cleaned.length >= 8) {
      const shortened = shortenText(cleaned, 110)
      if (isUsefulSignalAnchor(shortened)) {
        return shortened
      }
    }
  }

  // If we have a decent cleaned title (even with company name in it), check if it's useful
  if (cleanedTitle && cleanedTitle.length >= 10 && isUsefulSignalAnchor(cleanedTitle)) {
    return shortenText(cleanedTitle, 110)
  }

  // Final fallback
  return companyName || 'this account'
}

function isUsefulSignalAnchor(value: string) {
  const text = cleanText(value)
  if (!text) return false
  if (/^(deals|news|updates?|press|latest)\s*[:\-]/i.test(text)) return false
  if (/\b(the business press|newswire|google news|linkedin|sec|announcement|report)\b/i.test(text)) return false
  if (/[|]/.test(text)) return false
  if (/\b(rosh hashanah|yom kippur|passover|hanukkah|easter|christmas)\b/i.test(text)) return false
  if (/\b(we have work to do|opinion|editorial|commentary|letter to the editor)\b/i.test(text)) return false
  const wordCount = text.split(/\s+/).length
  if (wordCount > 12 || wordCount < 3) return false
  return true
}

function inferIndustryClusterFromSignals(account: AccountRow, candidate: ResearchHit | null): IndustryCluster {
  const notes = getAccountNotes(account)
  const text = cleanText(`${account.industry || ''} ${account.name || ''} ${account.description || ''} ${notes} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  const verifiedLocationCount = getVerifiedLocationCount(account)
  if (!text) return 'unknown'
  // Move multi_site to bottom of priority list to favor industry-specific guidance
  // if (/(multi[-\s]?site|portfolio|branch(?:es)?|chain|group|holdings)/.test(text)) return 'multi_site'
  if (/(defense|space|aerospace|rocket|aviation|aircraft|missile|orbital|satellite)/.test(text)) return 'manufacturing'
  if (/(oil|gas|energy|mining|quarry|cement|refinery|industrial gas|midstream|upstream|downstream)/.test(text)) return 'energy_intensive'
  if (/(blood center|bloodcare|blood bank|blood donation|blood products|blood components|transfusion|donor center|mobile blood drives?|blood collection|blood processing|specialized laboratory testing)/.test(text)) return 'healthcare'
  if (/(food production|food manufacturing|food manufacturer|food processing|food processing facilities|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|restaurant chains?|foodservice|co[-\s]?manufacturing|production facilities)/.test(text)) return 'manufacturing'
  if (/(durable medical equipment|\bdme\b|home medical equipment|medical equipment|medical supplies?|equipment logistics|equipment delivery|equipment maintenance|direct-service locations?|direct service locations?|hospice dme|hospice equipment|inventory management|medical supply(?:ies)?)/.test(text)) return 'logistics'
  if (/(building materials|lumber|wholesale distribution|specialty building materials|distributor|distribution center|distribution centers|distribution network|logistics|warehouse|distribution|fulfillment|freight|nvo?cc|trucking|supply chain|transport|shipping|cargo|auto logistics|freight forwarder)/.test(text)) return 'logistics'
  if (/(manufactur|industrial|fabricat|machine|plastics?|chemical|metal|steel|packag|production|component|construction|epc|builder|contractor)/.test(text) && !/(freight forwarder|nvo?cc|logistics|warehouse|distribution|fulfillment|trucking|transport|shipping|cargo|auto logistics)/.test(text)) return 'manufacturing'
  const hotelProperty = looksLikeHotelProperty(text)
  const hospitalityGroup = looksLikeHospitalityGroup(text, verifiedLocationCount, notes)
  if (hospitalityGroup) return 'hospitality_group'
  if (hotelProperty && (verifiedLocationCount === null || verifiedLocationCount <= 1)) return 'hotel_owner'
  if (/(healthcare|hospital|clinic|medical|senior living|assisted living|nursing|alzheimer'?s?|memory care|retirement living|continuum of care|skilled nursing|pharma|pharmacy)/.test(text)) return 'healthcare'
  if (/(restaurant|dining|cafe|grill|bar\b|pub\b|eatery|hospitality|hotel|lodging|venue|wedding|event space|banquet)/.test(text)) return hotelProperty ? 'hotel_owner' : 'restaurant'
  if (/(retail|store|shopping|franchise|dealer|showroom|convenience|recreation|fitness|gym|entertainment|amusement|automotive|auto)/.test(text)) return 'retail'
  if (/(bank|credit union|financial|wealth|insurance|lending)/.test(text)) return 'banking'
  if (/(cold storage|refrigerat|freezer|food (?:storage|process|production|distribut|wholesale)|beverage (?:storage|process|production|distribut|wholesale)|grocery|produce|dairy|meat|bakery)/.test(text)) return 'food_storage'
  if (/(church|synagogue|mosque|temple|congregation|parish|worship|ministry|religious|faith)/.test(text)) return 'religious'
  if (/(primary\/secondary education|school district|independent school district|isd|public school|charter school|k-12|school board|high school|middle school|elementary school|\bschools?\b)/.test(text)) return 'school_district'
  if (/(college|university|higher education|community college|student housing|dorm|residence hall|campus ministry)/.test(text)) return 'higher_education'
  if (/(children'?s home|foster care|adoption assistance|residential services|independent living center|counseling center|youth services|human services|group home|residential care)/.test(text)) return 'residential_care'
  if (/(municipal|government|city|county|public sector|civic|public works|public safety|utility infrastructure)/.test(text)) return 'public_sector'
  if (/(school|education|university|college|nonprofit|foundation|charity)/.test(text)) return 'education_nonprofit'
  if (/(technology|software|saas|data center|it services|cloud|digital)/.test(text)) return 'technology'
  if (/(office|professional services|law|legal|consulting|accounting|marketing|real estate|staffing|agency|design|engineering|architect)/.test(text)) return 'office_services'
  if (/\b(multi[-\s]?site|portfolio|branch(?:es)?|(?<!supply\s)chain|holdings)\b/i.test(text)) return 'multi_site'
  return 'unknown'
}

function inferIndustryCluster(account: AccountRow, candidate: ResearchHit | null): IndustryCluster {
  const savedProfile = getAccountIdentityProfile(account, candidate)
  if (savedProfile?.industryCluster) {
    return savedProfile.industryCluster
  }

  return inferIndustryClusterFromSignals(account, candidate)
}

function inferSignalFamily(candidate: ResearchHit | null, isFallbackMode = false): SignalFamily {
  if (isFallbackMode || !candidate) return 'industry_context'

  const text = `${candidate.title || ''} ${candidate.snippet || ''}`
  const inferredPriority = inferSignalPriority(text, 9)
  const priority = inferredPriority === 9 ? candidate.priority : inferredPriority

  if (priority === 2 && !isTexasRelevantLocationSignal(text)) {
    if (/(specialist team|specialists?|clinical footprint|clinical team|physician|ophthalmology|retina|medical practice|practice expansion|staff expansion|hiring)/i.test(text)) {
      return 'growth'
    }
    return 'industry_context'
  }

  if (priority === 1 && !hasAcquisitionEvidence(text)) {
    return 'industry_context'
  }

  if (priority === 3 && !hasLeadershipChangeEvidence(text)) {
    return 'industry_context'
  }

  if (priority === 4) {
    if (/(heat pump|electrification|decarbonization|ev charging|charging station|data center|server|ai compute|bitcoin|mining|technical testing|lab|pilot plant|research|prototype|fabrication)/i.test(text)) {
      return 'technical_load'
    }
    return 'growth'
  }

  switch (priority) {
    case 1:
      return 'acquisition'
    case 2:
      return 'new_location'
    case 3:
      return 'leadership_change'
    case 4:
      return 'growth' // Fallback for priority 4 if the regex above didn't catch technical_load
    case 5:
      return 'restructuring'
    case 6:
      return 'contract_win'
    case 7:
      return 'funding'
    default:
      return 'industry_context'
  }
}

function buildSignalGuidance(signalFamily: SignalFamily, account: AccountRow, candidate: ResearchHit | null) {
  const companyName = cleanText(account.name) || 'the company'
  const signalAnchor = deriveSignalAnchor(account, candidate)
  const location = [cleanText(account.city), cleanText(account.state)].filter(Boolean).join(', ')
  const texasLocation = location || 'Texas'
  const sourceLead = buildSourceLead(account, candidate)
  const candidateText = `${candidate?.title || ''} ${candidate?.snippet || ''}`
  const text = `${candidate?.title || ''} ${candidate?.snippet || ''}`.toLowerCase()
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${getAccountNotes(account)}`).toLowerCase()
  const alreadyOpen = isAlreadyOpenLocationSignal(candidateText)
  const futureOpen = isFutureOpenLocationSignal(candidateText)
  const accountLooksLikeOperatingHospital = /(acute care hospital|medical\/surgical beds|intensive care unit|women[’']?s center|emergency room|operating rooms?|medical imaging|hospital district|owned by|operated by)/i.test(accountText)
  const openingIndustryLine = buildOpeningIndustryLine(
    inferIndustryCluster(account, candidate),
    alreadyOpen,
    cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${getAccountNotes(account)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase(),
  )

  switch (signalFamily) {
    case 'acquisition':
      return {
        label: 'Acquisition / being acquired',
        angle: 'Inherited agreements, duplicate meters, hidden load, and who owns the cleanup.',
        question: 'Have you already looked at what got inherited on the electricity side, or is that still being sorted out?',
        openers: [
          sourceLead,
          `The report on ${companyName} is the kind of thing that usually makes me ask what got inherited on the power side.`,
          `When ownership changes, the electricity setup is often the piece nobody fully cleans up right away.`,
        ],
        focus: ['inherited contracts', 'duplicate sites or meters', 'utility cleanup after the deal'],
      }
    case 'new_location':
      if (accountLooksLikeOperatingHospital && futureOpen && !alreadyOpen) {
        return {
          label: 'Hospital operations',
          angle: 'Emergency care, surgery, imaging, and 24/7 HVAC shaping the load at an existing hospital.',
          question: 'Which parts of the hospital are carrying the biggest usage spikes right now?',
          openers: [
            sourceLead,
            `North Texas Medical Center is already an operating hospital in Gainesville, so the useful question is which parts of the building are driving the load today rather than treating it like a coming-soon project.`,
            `With emergency care, surgery, imaging, lab work, and HVAC all under one roof, the bigger question is which areas are carrying the heaviest usage.`,
          ],
          focus: ['emergency care', 'surgery', 'imaging', 'lab work', 'HVAC', 'existing hospital load'],
        }
      }

      const isHospitalityOpening = /\b(hotel|resort|lodging|motel|inn|boutique property|hospitality|guest rooms|event space|banquet|caravan court)\b/i.test(text)
      if (isHospitalityOpening) {
        return {
          label: 'Hospitality opening',
          angle: 'New hotel capacity, guest-room load, kitchens, laundry, and HVAC all landing before opening day.',
          question: alreadyOpen
            ? 'Has the power side been lined up for the property now that it is live?'
            : 'Are you getting the hotel power plan lined up now, or is that still in development?',
          openers: [
            sourceLead,
            `A new hotel is a different kind of load because guest rooms, kitchens, laundry, and HVAC all start shaping the bill before opening day.`,
            `With a 24/7 property, I would want to know whether the power plan is being lined up now or still waiting on the buildout.`,
          ],
          focus: ['hotel opening', 'guest-room load', 'kitchens', 'laundry', 'HVAC', '24/7 operations'],
        }
      }

      return {
        label: 'New location / facility / construction',
        angle: 'New meter timing, lease timing, construction power, and ramp-up risk.',
        question: alreadyOpen
          ? 'Has anyone looked at whether the new site is actually set up the way it should be now that it is live?'
          : 'Are you planning the electricity piece for the new site now, or is that still early?',
        openers: [
          sourceLead,
          openingIndustryLine,
          futureOpen
            ? `If the site is still coming, the electricity piece usually needs to be handled before move-in, not after.`
            : alreadyOpen
              ? `I would want to know whether the meter, billing, and operating load were already lined up when the site opened.`
              : `The part I’d want to sanity-check first is whether the new meter and ramp-up are being planned ahead of time.`,
        ],
        focus: ['new meter timing', 'lease or buildout timing', 'ramp-up load'],
      }
    case 'leadership_change':
      return {
        label: 'Leadership change',
        angle: 'Fresh eyes on a setup someone else inherited, especially from finance or facilities.',
        question: 'Has the new leader had a chance to review the electricity side yet, or is it still on the list?',
        openers: [
          sourceLead,
          `When a new CFO or facilities lead comes in, the utility setup is usually one of the first things that should get a clean look.`,
          `Fresh eyes tend to surface questions the old team never had time to ask.`,
        ],
        focus: ['fresh-eyes review', 'budget authority', 'facility ownership'],
      }
    case 'growth':
      const isDentalGrowth = /(dental|dentist|dentistry|dso\b|dpo\b|practice acquisition|practice expansion|operatories?|imaging|sterilization|hygienist|hygiene|orthodont|oral surgery)/i.test(text)
      if (isDentalGrowth) {
        return {
          label: 'Dental practice growth',
          angle: 'Practice acquisition, operatories, imaging, sterilization, and patient flow adding load across the office network.',
          question: 'Has anyone checked which practices are driving the biggest spikes on their own meters as the network grows?',
          openers: [
            `For a dental partnership organization, the thing I would watch is whether the busier offices are quietly changing the load pattern across the network.`,
            `When a practice adds more locations, patient flow and sterilization usually change before the budget line does.`,
            `With a growing practice network, the useful question is which offices are carrying the heaviest load and whether the power side has kept up.`,
          ],
          focus: ['practice acquisition', 'operatories', 'imaging', 'sterilization', 'patient flow', 'multi-site consistency'],
        }
      }

      const isMedicalGrowth = /(ophthalmology|retina|medical practice|clinic|physician|specialist|surgical|diagnostic imaging|clinical footprint|eye care)/i.test(text)
      if (isMedicalGrowth) {
        return {
          label: 'Clinical growth',
          angle: 'Specialist hiring, patient volume, and imaging or surgical equipment adding load across the clinic network.',
          question: 'Has anyone checked whether the busier locations are starting to change the load pattern on the power side?',
          openers: [
            `For a specialty medical practice, the thing I would watch is whether the busier clinics are quietly changing the load pattern across the network.`,
            `When a practice adds specialists, the patient flow and imaging footprint usually change before the budget line does.`,
            `With 15 locations, the useful question is which sites are carrying the heaviest clinical load and whether the power side has kept up.`,
          ],
          focus: ['specialist hiring', 'patient volume', 'diagnostic imaging', 'surgical equipment', 'multi-site consistency'],
        }
      }
      return {
        label: 'Growth / capex / headcount',
        angle: 'Growing load, added equipment, and budget creep before the bills catch up.',
        question: 'Has anyone checked what part of the operation is driving the extra usage as it grows?',
        openers: [
          sourceLead,
          `When headcount or capex starts moving, the electricity side usually changes before anyone notices it in the budget.`,
          `The thing I’d want to understand is what part of the operation is driving the extra usage.`,
        ],
        focus: ['load growth', 'equipment additions', 'budget creep'],
      }
    case 'technical_load':
      return {
        label: 'Technical Load / Electrification',
        angle: 'New technical equipment, testing cycles, and the shift from gas to electric creating demand ratchets.',
        question: 'Has anyone audited whether this new technical load is triggering demand ratchets during testing or peak windows?',
        openers: [
          sourceLead,
          `Deploying new technical load like this usually changes the load factor faster than the billing structure can keep up with.`,
          `The forensic question is whether the testing or deployment schedule is creating peaks that the current contract wasn't built for.`,
          `Moving processes over to the electric side is a good move, but it usually creates a hidden liability on the billing floor.`,
        ],
        focus: ['electrification risk', 'technical testing spikes', 'demand ratchets', 'load factor shift', 'billing floor impact'],
      }
    case 'restructuring':
      return {
        label: 'Restructuring / closure / consolidation',
        angle: 'Unused meters, leftover contracts, and cleanup after a closure or consolidation.',
        question: 'Have you looked at whether any old meters or contracts still need cleanup after the change?',
        openers: [
          sourceLead,
          `When a company closes or merges sites, the power side can keep carrying costs that no longer make sense.`,
          `That is usually the point where I want to know whether any old meters or contracts still need cleanup.`,
        ],
        focus: ['stranded capacity', 'unused sites', 'meter cleanup', 'contract cleanup'],
      }
    case 'contract_win':
      return {
        label: 'Contract win / customer growth',
        angle: 'New work changing the load and the way the site runs.',
        question: 'Has the power side been checked against the new work yet?',
        openers: [
          sourceLead,
          `A new contract or major customer usually changes the load story faster than people expect.`,
          `That is the kind of change that can make the existing electricity setup feel out of sync pretty quickly.`,
        ],
        focus: ['new load', 'operating changes', 'customer-driven growth'],
      }
    case 'funding':
      return {
        label: 'Funding / IPO',
        angle: 'Fresh capital, tighter cost scrutiny, and the next growth phase.',
        question: 'Has the electricity side been mapped against the growth plan, or is that still getting sorted out?',
        openers: [
          sourceLead,
          `Fresh capital usually means new space, new equipment, or both, and the power plan needs to be thought through before the next round of spending starts.`,
          `That is the kind of moment where I want to understand how the growth is being handled on the power side.`,
        ],
        focus: ['cost scrutiny', 'growth planning', 'budget visibility', 'facility expansion', 'equipment additions'],
      }
    case 'industry_context':
    default:
      // Instead of generic template, this will be replaced with AI-generated content
      // The AI generation happens in buildManualTalkTrack when signalFamily is 'industry_context'
      return {
        label: 'Industry context',
        angle: 'How this kind of business actually uses electricity.',
        question: '', // Will be AI-generated
        openers: [], // Will be AI-generated
        focus: ['budget visibility', 'operating fit', 'ERCOT exposure'],
      }
  }
}

function buildIndustryGuidance(industryCluster: IndustryCluster, account: AccountRow, candidate: ResearchHit | null) {
  const companyName = cleanText(account.name) || 'the company'
  const industryLabel = cleanText(account.industry) || companyName
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  const multiSiteInfo = detectMultiSiteScale(account, candidate)

  switch (industryCluster) {
    case 'multi_site':
      if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount >= 10) {
        const locationDesc = multiSiteInfo.locationCount >= 100
          ? `${multiSiteInfo.locationCount}+ sites`
          : `${multiSiteInfo.locationCount} sites`
        const regionDesc = multiSiteInfo.regions.length > 1
          ? ` across ${multiSiteInfo.regions.length} states`
          : ''
        const acquisitionHeavy = /\b(acquisition|acquisitions|acquired|acquired through|rolled up|rollup|distribution|building materials|wholesale|lumber)\b/.test(text)

        return {
          label: acquisitionHeavy ? 'Acquisition-led network' : 'Multi-site portfolio',
          angle: acquisitionHeavy
            ? `Acquisition-led branch network across ${locationDesc}${regionDesc}, with each meter carrying its own peak history.`
            : `Portfolio-level comparison of locked-in peak charges across ${locationDesc}${regionDesc}.`,
          question: acquisitionHeavy
            ? `With ${locationDesc}${regionDesc}, are the acquired branches being checked one by one for their own locked-in peak charge?`
            : `With ${locationDesc}${regionDesc}, are you comparing which sites have their own locked-in peak charge, or is the portfolio view still too blended?`,
          openers: acquisitionHeavy
            ? [
                `For a network like this, the useful question is which acquired branches or yards are carrying their own locked-in peak charge.`,
                `Acquisition-heavy footprints tend to hide different peak histories in each branch, even when the company looks unified on paper.`,
                `The thing I would watch is whether the newest locations are being checked against their own meter history instead of averaged into the portfolio.`,
              ]
            : [
                `For a portfolio like this, the useful question is which sites have their own locked-in peak charge and which ones do not.`,
                `Large multi-site footprints tend to hide peak history because each meter can behave differently even inside the same company.`,
                `The thing I would watch is whether one site is carrying a peak history that should really be handled on its own meter.`,
              ],
          focus: acquisitionHeavy
            ? ['acquired branches', 'meter history', 'portfolio comparison', 'locked-in peak charges', 'site-level review']
            : ['billing floors', 'locked-in peak charges', 'portfolio comparison', 'budget erosion', 'hidden spikes'],
        }
      }

      return {
        label: 'Multi-site portfolio',
        angle: 'Portfolio-level comparison of locked-in peak charges across multiple sites.',
        question: 'Are you comparing the sites one by one, or is everything still being handled as one bucket?',
        openers: [
          'For a multi-site portfolio like this, the useful question is which sites have their own locked-in peak charge and which ones do not.',
          'Large multi-site footprints tend to hide peak history because each meter can behave differently even inside the same company.',
          'The thing I would watch is whether one site is carrying a peak history that should really be handled on its own meter.',
        ],
        focus: ['billing floors', 'locked-in peak charges', 'portfolio comparison', 'budget erosion', 'hidden spikes'],
      }
    case 'manufacturing':
      if (/(food production|food manufacturing|food manufacturer|food processing|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|bakery|dessert|cake|cheesecake|pie|frozen food|refrigerat|freezer|cold chain|bakehouse|baking line|production kitchen)/.test(text)) {
        const foodMultiSite = detectMultiSiteScale(account, candidate)

        if (foodMultiSite.isMultiSite && foodMultiSite.locationCount && foodMultiSite.locationCount >= 3) {
          const locationDesc = foodMultiSite.locationCount >= 10
            ? `${foodMultiSite.locationCount}+ production sites`
            : `${foodMultiSite.locationCount} production sites`
          const regionDesc = foodMultiSite.regions.length > 1
            ? ` across ${foodMultiSite.regions.length} states`
            : ''

          return {
            label: 'Food production network',
            angle: `Production-site comparison across ${locationDesc}${regionDesc}, with refrigeration, cooking, packaging, and sanitation each creating different power patterns.`,
            question: `With ${locationDesc}${regionDesc}, are you comparing the production sites separately to see which plants create the biggest usage spikes, or is that getting blended into the group total?`,
            openers: [
              `Food production groups with ${locationDesc} usually need to separate refrigeration, cooking, packaging, and sanitation because each plant can hit the meter differently.`,
              `With that kind of footprint${regionDesc}, one USDA production site can create a much bigger usage spike than the others.`,
              `The useful check is whether the protein, soup, sauce, or packaging lines are creating the highest usage moments at any one plant.`,
            ],
            focus: ['refrigeration', 'cooking lines', 'packaging', 'sanitation', 'production cycles', 'portfolio management'],
          }
        }

        return {
          label: 'Food production',
          angle: 'Refrigeration, cooking, packaging, sanitation, and production timing creating the highest usage moments.',
          question: 'Have you mapped which refrigeration, cooking, packaging, or sanitation cycles are creating the biggest usage spikes on the bill?',
          openers: [
            `Food production is different because refrigeration, cooking, packaging, and sanitation can all hit the meter during the same production windows.`,
            `The part I would watch is whether cooling, cooking, or packaging cycles are creating the highest usage moments on the meter.`,
            `For a food plant, the power side usually comes down to which production lines create the spikes, not the average usage.`,
          ],
          focus: ['refrigeration', 'cooking', 'packaging', 'sanitation', 'production timing', 'peak charges'],
        }
      }

      if (/(spill control|sorbent|sorbents|spill kits|secondary containment|spill response|environmental response|drums|granulars|containment)/.test(text)) {
        const spillMultiSite = detectMultiSiteScale(account, candidate)

        if (spillMultiSite.isMultiSite && spillMultiSite.locationCount && spillMultiSite.locationCount >= 3) {
          const locationDesc = spillMultiSite.locationCount >= 10
            ? `${spillMultiSite.locationCount}+ facilities`
            : `${spillMultiSite.locationCount} facilities`
          const regionDesc = spillMultiSite.regions.length > 1
            ? ` across ${spillMultiSite.regions.length} states`
            : ''

          return {
            label: 'Environmental products network',
            angle: `Portfolio-level electricity management across ${locationDesc}${regionDesc}.`,
            question: `With ${locationDesc}${regionDesc}, are you tracking which plant or warehouse is creating the peaks, or is it all blended together?`,
            openers: [
              `Environmental products businesses like this usually have a hidden blind spot in how mixing, packaging, and warehouse support are showing up on the bill.`,
              `With that kind of footprint${regionDesc}, one facility's climate control or packaging load can set a billing floor that sticks around.`,
              `The forensic check I'd want to run is whether any of those ${locationDesc} are carrying a demand ratchet from warehouse climate control or production support load.`,
            ],
            focus: ['mixing', 'packaging', 'warehouse climate control', 'distribution', 'billing floors', 'demand ratchets'],
          }
        }

        return {
          label: 'Environmental products manufacturing',
          angle: 'Mixing, packaging, warehouse climate control, and distribution support driving the billing floor.',
          question: 'Have you looked at which part of the operation is creating the peaks, or is that still buried in the bill?',
          openers: [
            `For a spill-control manufacturer, the power side is usually about mixing, packaging, warehouse climate control, and how the product moves out the door.`,
            `The thing I would watch is whether the support load is setting a billing floor that is bigger than it looks on paper.`,
            `For CEP, the useful question is which part of the plant or warehouse is actually driving the peaks, not the average bill.`,
          ],
          focus: ['mixing', 'packaging', 'warehouse climate control', 'distribution', 'billing floors', 'demand ratchets'],
        }
      }

      const manufacturingMultiSite = detectMultiSiteScale(account, candidate)
      
      if (manufacturingMultiSite.isMultiSite && manufacturingMultiSite.locationCount && manufacturingMultiSite.locationCount >= 3) {
        const locationDesc = manufacturingMultiSite.locationCount >= 10 
          ? `${manufacturingMultiSite.locationCount}+ facilities`
          : `${manufacturingMultiSite.locationCount} facilities`
        const regionDesc = manufacturingMultiSite.regions.length > 1 
          ? ` across ${manufacturingMultiSite.regions.length} states`
          : ''
          
        return {
          label: 'Manufacturing network',
          angle: `Portfolio-level electricity management across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you reviewing each site on its own meter, or is the roll-up view making it hard to see where the biggest charges are coming from?`,
          openers: [
            `Manufacturing groups with ${locationDesc} usually have a visibility problem, where one site's bill looks very different from the rest even though the portfolio summary looks fine.`,
            `With that kind of footprint${regionDesc}, a spike at one plant can set a local billing floor that stays on the books for a year.`,
            `The useful check is whether any of those ${locationDesc} are carrying a peak charge that sticks on that site's bill longer than the operation justifies.`,
          ],
          focus: ['portfolio visibility', 'meter-specific peak charges', 'multi-site coordination', 'billing floors', 'site-level review'],
        }
      }
      
      return {
        label: 'Manufacturing / industrial',
        angle: 'Machine startup timing and production ramps creating usage spikes that can stay on the bill.',
        question: 'Have you mapped which equipment starts at the same time and whether that timing is creating peak charges that stay on the bill?',
        openers: [
          `In a manufacturing setup like yours, the thing to watch is whether several machines start at once and create the highest usage moment of the month.`,
          `If your production lines ramp up simultaneously, that one usage spike can stay on the bill long after the shift ends.`,
          `The useful check is whether equipment timing is creating a peak charge that may not match normal production.`,
        ],
        focus: ['startup sequences', 'production ramps', 'shift-driven peaks', 'billing floors', 'demand ratchets', 'transmission liability'],
      }
    case 'logistics':
      const logisticsMultiSite = detectMultiSiteScale(account, candidate)
      const logisticsAcquisitionHeavy = /\b(acquisition|acquisitions|acquired|rollup|distribution|building materials|wholesale|lumber|yards?|branches?)\b/i.test(text)

      if (hasStrongDmeSignals(text)) {
        if (logisticsMultiSite.isMultiSite && logisticsMultiSite.locationCount && logisticsMultiSite.locationCount >= 3) {
          const locationDesc = logisticsMultiSite.locationCount >= 10
            ? `${logisticsMultiSite.locationCount}+ direct-service locations`
            : `${logisticsMultiSite.locationCount} direct-service locations`
          const regionDesc = logisticsMultiSite.regions.length > 1
            ? ` across ${logisticsMultiSite.regions.length} states`
            : ''

          return {
            label: 'Equipment support network',
            angle: `Location-by-location comparison of equipment deliveries, inventory, and service turnaround across ${locationDesc}${regionDesc}.`,
            question: `With ${locationDesc}${regionDesc}, are you comparing which locations are carrying the most equipment and storage load, or is that still getting blended together?`,
            openers: [
              `Equipment support networks like this usually need a location-by-location view because deliveries, inventory, and turnaround can differ a lot by branch.`,
              `With that kind of footprint${regionDesc}, one direct-service location can carry a very different load even when the company looks uniform on paper.`,
              `The question I'd want answered is which locations are carrying the heaviest equipment and storage load.`,
            ],
            focus: ['equipment deliveries', 'inventory', 'service turnaround', 'storage', 'branch-level review', 'meter-level exposure'],
          }
        }

        return {
          label: 'Equipment support provider',
          angle: 'Equipment deliveries, inventory, service turnaround, and storage creating the highest usage moments at the support location.',
          question: 'Have you looked at whether deliveries, inventory, or service turnaround are what create the biggest spikes on the bill?',
          openers: [
            'Equipment support businesses are different because the load comes from inventory, handling, and turnaround rather than patient rooms or clinic space.',
            'The part I would watch is whether storage, delivery timing, or equipment processing is creating the biggest usage moments.',
            'For an equipment support provider, the power side usually comes down to which part of the support operation is really driving the charge.',
          ],
          focus: ['equipment deliveries', 'inventory', 'service turnaround', 'storage', 'distribution support'],
        }
      }
      
      if (logisticsMultiSite.isMultiSite && logisticsMultiSite.locationCount && logisticsMultiSite.locationCount >= 3) {
        const locationDesc = logisticsMultiSite.locationCount >= 10 
          ? `${logisticsMultiSite.locationCount}+ distribution centers`
          : `${logisticsMultiSite.locationCount} distribution centers`
        const regionDesc = logisticsMultiSite.regions.length > 1 
          ? ` across ${logisticsMultiSite.regions.length} states`
          : ''
          
        return logisticsAcquisitionHeavy
          ? {
              label: 'Distribution network',
              angle: `Acquisition-led distribution portfolio across ${locationDesc}${regionDesc}, with each branch carrying its own locked-in peak charge.`,
              question: `With ${locationDesc}${regionDesc}, are the acquired branches being checked one by one for their own locked-in peak charge?`,
              openers: [
                `Distribution networks like this usually hide different peak histories in each acquired branch or yard.`,
                `When a company grows by acquisition, the main question is whether the new locations have been reviewed on their own meters or just blended into the portfolio.`,
                `The part I would watch is whether one branch's summer spike is still sitting on that branch's meter instead of being cleaned up.`,
              ],
              focus: ['acquired branches', 'meter history', 'locked-in peak charges', 'portfolio comparison', 'branch-level review'],
            }
          : {
              label: 'Logistics network',
              angle: `Portfolio-level electricity management across ${locationDesc}${regionDesc}.`,
              question: `With ${locationDesc}${regionDesc}, are you checking which sites have peak charges that stick on their own bills, or is that getting lost in the roll-up view?`,
              openers: [
                `Logistics groups with ${locationDesc} usually have different locked-in peak charges hiding in each specific facility's bill.`,
                `With that kind of footprint${regionDesc}, one warehouse's summer peak can leave its own peak charge sitting on that meter.`,
                `The useful check is whether a few sites are creating the highest charges while the group total makes everything look normal.`,
              ],
              focus: ['portfolio visibility', 'meter-specific peak charges', 'warehouse coordination', 'billing floors', '24/7 load'],
            }
      }
      
      return {
        label: 'Logistics / warehouse / distribution',
        angle: 'Dock doors, automation, and HVAC creating expensive usage spikes during busy windows.',
        question: 'Have you looked at whether dock activity and HVAC are lining up at the same time and creating peak charges on the bill?',
        openers: [
          `In high-volume logistics, the thing to watch is whether dock doors, automation, and HVAC all hit the meter at the same time.`,
          `If automation or dock cycles spike during high-heat hours, that one window can leave a peak charge on the bill for months.`,
          `A lot of warehouse groups focus on total usage, but the real issue is often the timing of dock work and climate control.`,
        ],
        focus: ['thermal liability', 'dock door timing', 'automation peaks', 'HVAC load', 'demand ratchets', 'billing floors'],
      }
    case 'food_storage':
      return {
        label: 'Food / cold storage',
        angle: 'Refrigeration load, freezer power, and defrost cycles drive cost through demand ratchets.',
        question: 'Have you looked at which cooling systems are causing your spikes, and whether you are carrying a locked-in peak charge?',
        openers: [
          `Cold storage is different because refrigeration never really turns off.`,
          `When the load is tied to freezers, coolers, and defrost cycles, a small miss can show up quickly as a 12-month locked-in peak charge.`,
          `The real cost driver in food storage is usually the peaks created by the refrigeration cycles themselves.`,
        ],
        focus: ['refrigeration', 'freezer load', 'summer peaks', 'temperature-sensitive load', 'defrost cycles', 'demand ratchets'],
      }
    case 'school_district':
      if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount >= 10) {
        const locationDesc = multiSiteInfo.locationCount >= 100
          ? `${multiSiteInfo.locationCount}+ campuses`
          : `${multiSiteInfo.locationCount} campuses`
        const regionDesc = multiSiteInfo.regions.length > 1
          ? ` across ${multiSiteInfo.regions.length} states`
          : ''

        return {
          label: 'School district network',
          angle: `District-wide comparison of locked-in peak charges across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you comparing which campuses have their own locked-in peak charge, or is everything still being handled as one bucket?`,
          openers: [
            `For a district with ${locationDesc}${regionDesc}, the useful question is which campuses have their own locked-in peak charge and which ones do not.`,
            `School districts usually have a mix of old buildings, new buildings, and heavy summer HVAC, so each campus can carry its own peak history.`,
            `The campus calendar, athletics, and classroom technology all matter here because they change how each campus uses power.`,
          ],
          focus: ['campus calendar', 'HVAC', 'athletics', 'classroom technology', 'billing floors', 'district budget'],
        }
      }

      return {
        label: 'School district',
        angle: 'Campus calendar, HVAC, athletics, and classroom technology driving locked-in peak charges at the meter level.',
        question: 'Has anyone checked whether the summer cooling load or school calendar left this campus with a locked-in peak charge?',
        openers: [
          `School districts have a different pattern than a normal office because the calendar, athletics, cafeterias, and device charging all push the bill in different directions.`,
          `The thing I would watch is whether one hot campus month is still showing up as a locked-in peak charge long after school is back in session.`,
          `For a district, the power side is usually about campus timing and HVAC more than anything else.`,
        ],
        focus: ['campus calendar', 'summer HVAC', 'athletics', 'cafeterias', 'device charging', 'district budget'],
      }
    case 'higher_education':
      if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount >= 3) {
        const locationDesc = multiSiteInfo.locationCount >= 10
          ? `${multiSiteInfo.locationCount}+ buildings`
          : `${multiSiteInfo.locationCount} buildings`
        const regionDesc = multiSiteInfo.regions.length > 1
          ? ` across ${multiSiteInfo.regions.length} states`
          : ''

        return {
          label: 'Higher education network',
          angle: `Campus-by-campus comparison of locked-in peak charges across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are the residence halls, labs, and dining spaces being checked meter by meter, or still handled as one campus story?`,
          openers: [
            `For a college or university with ${locationDesc}${regionDesc}, the useful question is which buildings have their own locked-in peak charge.`,
            `Higher-ed footprints tend to hide peaks because residence halls, labs, and dining do not all move at the same time.`,
            `The thing I would watch is whether one building has a peak history that is still sitting on that meter.`,
          ],
          focus: ['campus load', 'student housing', 'labs', 'occupancy swings', 'billing floors', 'dining'],
        }
      }

      return {
        label: 'Higher education',
        angle: 'Campus load, student housing, labs, and occupancy swings driving the billing floor.',
        question: 'Has anyone looked at which buildings are setting the peak, or are the residence halls and labs all getting lumped together?',
        openers: [
          `Colleges and universities usually have a very different load profile because residence halls, classrooms, labs, and dining all peak on different schedules.`,
          `The part I would watch is whether student housing or lab spaces are setting the billing floor for the whole campus.`,
          `For a campus like this, the useful question is which buildings are really carrying the load, not just the average bill.`,
        ],
        focus: ['campus load', 'student housing', 'labs', 'occupancy swings', 'billing floors', 'dining'],
      }
    case 'residential_care':
      if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount >= 3) {
        const locationDesc = multiSiteInfo.locationCount >= 10
          ? `${multiSiteInfo.locationCount}+ programs`
          : `${multiSiteInfo.locationCount} programs`
        const regionDesc = multiSiteInfo.regions.length > 1
          ? ` across ${multiSiteInfo.regions.length} states`
          : ''

        return {
          label: 'Residential care network',
          angle: `Campus and program-level comparison of locked-in peak charges across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you tracking which homes or programs have their own locked-in peak charge, or is it all still being handled together?`,
          openers: [
            `For a residential care campus like this, the useful question is whether the homes, counseling spaces, and support services are carrying their own locked-in peak charges.`,
            `With that kind of footprint${regionDesc}, each residential building can have its own peak history on the meter.`,
            `The part I would want to understand is which program spaces are carrying the heaviest load on the power side.`,
          ],
          focus: ['residential care', 'counseling spaces', 'program load', 'billing floors', 'budget protection'],
        }
      }

      return {
        label: 'Residential care',
        angle: '24/7 homes, counseling spaces, and support programs leaving their own locked-in peak charges on the meter.',
        question: 'Have you looked at which residential buildings or program spaces left this site with a locked-in peak charge?',
        openers: [
          `Residential care facilities are different because the homes, counseling spaces, and support services keep the load on longer than a normal office.`,
          `The thing I would watch is whether the 24/7 care load left a locked-in peak charge that stays in place all year.`,
          `For a children’s home or residential campus, the useful question is which parts of the property are actually driving the peaks.`,
        ],
        focus: ['residential care', 'counseling spaces', '24/7 load', 'billing floors', 'program support'],
      }
    case 'hotel_owner':
      const hotelMultiSite = detectMultiSiteScale(account, candidate)

      if (hotelMultiSite.isMultiSite && hotelMultiSite.locationCount && hotelMultiSite.locationCount >= 3) {
        const locationDesc = hotelMultiSite.locationCount >= 10
          ? `${hotelMultiSite.locationCount}+ hotels`
          : `${hotelMultiSite.locationCount} hotels`
        const regionDesc = hotelMultiSite.regions.length > 1
          ? ` across ${hotelMultiSite.regions.length} states`
          : ''

        return {
          label: 'Hotel portfolio',
          angle: `Property-by-property comparison of guest-room, laundry, and HVAC load across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you checking each hotel on its own meter, or is the portfolio still being treated like one property?`,
          openers: [
            `For a hotel portfolio like this, the useful question is which property has its own locked-in peak charge.`,
            `Even within the same brand, each hotel can carry a different peak history because the guest rooms, laundry, and HVAC are not identical.`,
            `The thing I would watch is whether one property is still carrying a summer spike on its own meter.`,
          ],
          focus: ['property comparison', 'guest rooms', 'laundry', 'HVAC', 'portfolio view', 'locked-in peak charges'],
        }
      }

      return {
        label: 'Hotel property',
        angle: 'Guest rooms, laundry, kitchen service, and HVAC driving the load on a single hotel meter.',
        question: 'Have you looked at whether the room load or laundry is what is actually driving the peak on that hotel meter?',
        openers: [
          `A single hotel property is different from an event space because the guest rooms, laundry, kitchen, and HVAC all keep the meter busy in a steady way.`,
          `The thing I would watch is whether the hotel load is setting a locked-in peak charge on that meter from the hotter months.`,
          `For a branded hotel owner, the useful question is which part of the property is actually driving the peak, not the average usage.`,
        ],
        focus: ['guest rooms', 'laundry', 'kitchen service', 'HVAC', 'hotel meter', 'locked-in peak charges'],
      }
    case 'healthcare':
      const healthcareMultiSite = detectMultiSiteScale(account, candidate)
      const hasHospitalSignals = /(hospital|neighborhood hospital|micro[-\s]?hospital|community hospital|small-format hospital|licensed hospital|emergency room|emergency care|inpatient care|inpatient bed|acute care)/i.test(text)
      const isClinic = /(clinic|practice|eye|vision|optics|dental|dentist|optometry|ophthalmology|retina|medical practice|surgical center|outpatient|diagnostic imaging|imaging center|ortho|orthopedic|pediatric|wellness|doctor)/i.test(text) && !hasHospitalSignals
      const isBehavioralHealth = /(mental health|behavioral health|behavioral healthcare|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|developmental disabilities|community center|community mental health|crisis center|crisis hotline|substance use|recovery program|peer support|care coordination|licensed therapy|early childhood intervention|trauma-informed)/i.test(text)
      const isSeniorLiving = /(senior living|assisted living|memory care|skilled nursing|retirement living|continuum of care|nursing home|alzheimer'?s? care|independent living cottages?|apartments?)/i.test(text)
      const isDentalPractice = /(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry|multi-site dental|dental partnership organization)/i.test(text)
      const isBloodCenter = /(blood center|bloodcare|blood bank|blood donation|blood products|blood components|transfusion|donor center|mobile blood drives?|blood collection|blood processing|specialized laboratory testing)/i.test(text)
      const isHospitalOperator = hasHospitalSignals && !isBehavioralHealth && !isSeniorLiving && !isBloodCenter

      if (isDentalPractice) {
        const locationDesc = healthcareMultiSite.locationCount
          ? `${healthcareMultiSite.locationCount}+ practices`
          : 'a dental office'
        const regionDesc = healthcareMultiSite.regions.length > 1
          ? ` across ${healthcareMultiSite.regions.length} states`
          : ''

        if (healthcareMultiSite.isMultiSite && healthcareMultiSite.locationCount && healthcareMultiSite.locationCount >= 3) {
          return {
            label: 'Dental partnership organization',
            angle: `Practice-by-practice comparison of operatories, imaging, sterilization, patient flow, and HVAC across ${locationDesc}${regionDesc}.`,
            question: `With ${locationDesc}${regionDesc}, are you comparing the offices one by one to see which practices are hitting the bill hardest, or is that still buried in the portfolio view?`,
            openers: [
              `A dental partnership network like this can look steady in the group total while one practice is carrying a much heavier bill pattern than the rest.`,
              `When each office combines operatories, imaging, sterilization, patient flow, and HVAC, the power pattern can vary a lot from one practice to the next.`,
              `The useful check is whether the busier offices are the ones creating the biggest spikes on their own bills.`,
            ],
            focus: ['operatories', 'imaging', 'sterilization', 'patient flow', 'practice comparison', 'site-specific bill spikes'],
          }
        }

        return {
          label: 'Dental practice',
          angle: 'Operatories, imaging, sterilization, patient flow, and HVAC shaping the bill at a dental office.',
          question: 'Have you looked at whether operatories, imaging, or sterilization are what create the biggest spikes on that office meter?',
          openers: [
            `A dental practice is different from a generic clinic because operatories, imaging, sterilization, and HVAC can all hit the meter during patient hours.`,
            `The part I would want to separate is whether the operatories, imaging, or sterilization are pushing the bill hardest.`,
            `For a dental office, the useful question is which clinical areas are driving the bigger bill days, not just what the monthly total looks like.`,
          ],
          focus: ['operatories', 'imaging', 'sterilization', 'patient flow', 'HVAC', 'bill spikes'],
        }
      }

      if (isBloodCenter) {
        const locationDesc = healthcareMultiSite.locationCount
          ? `${healthcareMultiSite.locationCount}+ blood-service sites`
          : 'a regional blood-service network'

        return {
          label: 'Blood center / clinical laboratory network',
          angle: `Donor collection, lab processing, refrigerated storage, and hospital delivery support across ${locationDesc}.`,
          question: `Are you comparing the donor centers, lab space, refrigerated storage, and mobile-drive support separately to see which meters are creating the highest peak charges?`,
          openers: [
            `Blood centers are different from logistics businesses because the power profile is tied to donor collection, lab testing, refrigerated storage, and hospital supply reliability.`,
            `With ${locationDesc}, the useful question is which parts of the clinical operation are creating the biggest spikes on their own meters.`,
            `The part I would want to separate is donor collection, lab processing, and cold storage because each one can create a different power pattern.`,
          ],
          focus: ['donor collection', 'lab processing', 'refrigerated storage', 'mobile blood drives', 'hospital supply reliability', 'peak charges'],
        }
      }
      
      if (healthcareMultiSite.isMultiSite && healthcareMultiSite.locationCount && healthcareMultiSite.locationCount >= 3) {
        const siteLabel = isHospitalOperator
          ? 'hospitals'
          : isBehavioralHealth
            ? 'care sites'
            : isClinic
              ? 'clinics'
              : isSeniorLiving
                ? 'care communities'
                : 'care sites'
        const locationDesc = healthcareMultiSite.locationCount >= 10 
          ? `${healthcareMultiSite.locationCount}+ ${siteLabel}`
          : `${healthcareMultiSite.locationCount} ${siteLabel}`
        const regionDesc = healthcareMultiSite.regions.length > 1 
          ? ` across ${healthcareMultiSite.regions.length} states`
          : ''

        if (isHospitalOperator) {
          return {
            label: 'Neighborhood hospital network',
            angle: `Hospital-by-hospital comparison of emergency care, imaging, inpatient rooms, lab work, and HVAC across ${locationDesc}${regionDesc}.`,
            question: `With ${locationDesc}${regionDesc}, are you comparing the hospitals one by one to see which sites are hitting the bill hardest, or is that still buried in the portfolio view?`,
            openers: [
              `A neighborhood-hospital network like this can look steady in the group total while one hospital is carrying a much heavier bill pattern than the rest.`,
              `When each site combines emergency care, imaging, short-stay rooms, lab work, and HVAC, the power pattern can vary a lot from one hospital to the next.`,
              `The useful check is whether the busier hospitals are the ones creating the biggest spikes on their own bills.`,
            ],
            focus: ['emergency care', 'imaging', 'inpatient rooms', 'lab work', 'hospital comparison', 'site-specific bill spikes'],
          }
        }

        if (isBehavioralHealth) {
          return {
            label: 'Behavioral health network',
            angle: `Portfolio-level comparison of meter-level peak history across ${locationDesc}${regionDesc}.`,
            question: `With ${locationDesc}${regionDesc}, are you comparing the clinics, crisis sites, and admin buildings meter by meter, or is the portfolio still too blended to see where the locked-in peak charges are sitting?`,
            openers: [
              `A regional behavioral health network like this usually has very different load profiles between clinics, crisis services, and administrative sites, so the meter history matters more than the average.`,
              `With ${locationDesc}${regionDesc}, the useful check is which sites are carrying their own locked-in peak charge and which ones are not.`,
              `The part I would want to isolate is whether the crisis centers, outpatient sites, or support buildings are the ones carrying the highest billing floor on their own meters.`,
            ],
            focus: ['behavioral health network', 'crisis services', 'outpatient sites', 'administrative buildings', 'meter-level peak history', 'locked-in peak charges'],
          }
        }
          
        if (isClinic) {
          return {
            label: 'Medical Practice / Clinical Network',
            angle: `Clinic-by-clinic comparison of where the biggest usage spikes are happening across ${locationDesc}.`,
            question: `With ${locationDesc}${regionDesc}, are you comparing the clinics separately to see which meters are creating the biggest peak charges, or is it all blended together?`,
            openers: [
              `Medical networks with ${locationDesc} can look normal in the group total while one clinic is creating the biggest peak charge on its own meter.`,
              `With a clinical footprint like this, the useful check is which clinics use the most power during patient hours and which ones do not.`,
              `The question I would ask is whether newer clinics are creating usage spikes that do not match their current patient volume.`,
            ],
            focus: ['clinical peaks', 'equipment startup', 'portfolio comparison', 'peak charges', 'site-specific exposure'],
          }
        }

        return {
          label: 'Healthcare network',
          angle: `Facility-by-facility comparison of where the biggest usage spikes are happening across ${locationDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you checking which facilities create the biggest peak charges, or is the portfolio view still too blended?`,
          openers: [
            `Healthcare groups with ${locationDesc} can look fine in the group total while one facility is creating the biggest peak charge on its own meter.`,
            `With that kind of footprint${regionDesc}, the useful check is which facilities are driving the highest usage moments and which ones are not.`,
            `The question I would ask is whether any of those ${locationDesc} have a peak charge sitting on the bill that no one is watching.`,
          ],
          focus: ['portfolio comparison', 'reliability', 'peak charges', 'meter-level exposure'],
        }
      }
      
      if (isHospitalOperator) {
        return {
          label: 'Hospital / neighborhood hospital',
          angle: 'Emergency care, imaging, short-stay rooms, lab work, and round-the-clock HVAC shaping the bill at a licensed hospital site.',
          question: 'Have you looked at whether emergency care, imaging, or short-stay rooms are what create the biggest spikes on that bill?',
          openers: [
            `A small-format hospital is different from a clinic because emergency care, imaging, inpatient rooms, and HVAC can all hit the bill at the same time.`,
            `The part I would want to separate is whether the emergency department, imaging, or short-stay rooms are pushing the bill hardest.`,
            `For a neighborhood hospital, the useful question is which clinical areas are driving the bigger bill days, not just what the monthly total looks like.`,
          ],
          focus: ['emergency care', 'imaging', 'inpatient rooms', 'lab work', 'HVAC', 'bill spikes'],
        }
      }

      if (isClinic) {
        return {
          label: 'Medical Practice / Clinic',
          angle: 'Patient schedule, treatment-room equipment, lighting, and HVAC creating the highest usage moments at the clinic.',
          question: 'Have you looked at whether patient hours, treatment-room equipment, or HVAC are what create the highest spike on that meter?',
          openers: [
            `Clinical environments are different because patient comfort, treatment-room equipment, lighting, and HVAC can all hit the meter during the same business hours.`,
            `The part I would watch is whether patient hours and cooling load are creating the highest usage spike on that clinic meter.`,
            `For a medical practice, the power side usually comes down to which part of the clinic creates the biggest usage moment of the month.`,
          ],
          focus: ['patient hours', 'treatment-room equipment', 'HVAC', 'peak charges', 'clinic meter'],
        }
      }

      if (isBehavioralHealth) {
        return {
          label: 'Behavioral health / community care',
          angle: 'Different care programs and support buildings leaving different peak histories on their own meters.',
          question: 'Have you looked at whether the crisis, counseling, or administrative spaces are the ones leaving a locked-in peak charge on that meter?',
          openers: [
            `Behavioral health facilities are different because the crisis, counseling, and support programs do not all use power the same way.`,
            `The useful check is whether the site’s peak is really coming from clinical activity, support space, or simple HVAC overlap.`,
            `For a community care operation like this, the question is which part of the property is actually setting the billing floor on that meter.`,
          ],
          focus: ['behavioral health', 'crisis services', 'counseling space', 'support buildings', 'meter-level peaks', 'billing floors'],
        }
      }

      return {
        label: isSeniorLiving ? 'Healthcare / Senior Living' : 'Healthcare facility',
        angle: '24/7 reliability needs and clinical equipment creating peak charges that can stay on the bill.',
        question: 'Are you checking which systems create the highest usage moments, or is the 24/7 reliability requirement making that hard to see?',
        openers: [
          `Healthcare facilities that run around the clock can hide the highest usage moments inside the normal rhythm of patient care.`,
          `Because the building never really stops, the part I would separate is normal patient-care usage from the specific spikes that set the highest charge.`,
          `In a 24/7 environment, the useful question is which systems create the top usage moments on the meter.`,
        ],
        focus: ['patient-care usage', 'peak charges', 'reliability', 'clinical equipment', 'capacity mismatch'],
      }
    case 'banking':
      const bankingMultiSite = detectMultiSiteScale(account, candidate)
      
      if (bankingMultiSite.isMultiSite && bankingMultiSite.locationCount && bankingMultiSite.locationCount >= 5) {
        const locationDesc = bankingMultiSite.locationCount >= 20 
          ? `${bankingMultiSite.locationCount}+ branches`
          : `${bankingMultiSite.locationCount} branches`
        const regionDesc = bankingMultiSite.regions.length > 1 
          ? ` across ${bankingMultiSite.regions.length} states`
          : ''
        
        return {
          label: 'Banking / financial services network',
          angle: `Portfolio-level electricity management across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you managing electricity as a portfolio, or is each branch handling it independently?`,
          openers: [
            `Banks with ${locationDesc} usually need a portfolio view rather than managing each branch separately.`,
            `With that kind of footprint${regionDesc}, there's usually opportunity to bring consistency to how branches are contracted and how usage is tracked.`,
            `The question I'd want answered is whether your ${locationDesc} are being managed centrally or branch-by-branch.`,
          ],
          focus: ['portfolio management', 'multi-branch coordination', 'budget predictability', 'operational consistency', 'HVAC'],
        }
      }
      
      return {
        label: 'Banking / Finance',
        angle: 'Branch portfolio HVAC and IT loads driving demand ratchets during peak hours.',
        question: 'Has anyone looked at whether the branch IT loads or HVAC cycles are triggering a demand ratchet during peak hours?',
        openers: [
          `Banking footprints are interesting because the IT and HVAC load is constant, but the billing floor usually isn't.`,
          `The part I care about is whether the branch portfolio is carrying hidden demand ratchets from summer cooling peaks.`,
          `With branch operations, the load factor usually changes faster than the billing structure can keep up with.`,
        ],
        focus: ['branch portfolio', 'demand ratchets', 'IT load', 'HVAC', 'billing floors'],
      }
    case 'retail':
      const retailMultiSite = detectMultiSiteScale(account, candidate)
      const isAutoGroup = hasStrongAutomotiveSignals(text)

      if (isAutoGroup) {
        if (retailMultiSite.isMultiSite) {
          const locationDesc = retailMultiSite.locationCount
            ? (retailMultiSite.locationCount >= 50
              ? `${retailMultiSite.locationCount}+ dealerships`
              : `${retailMultiSite.locationCount} dealerships`)
            : 'multiple dealerships'
          const regionDesc = retailMultiSite.regions.length > 1
            ? ` across ${retailMultiSite.regions.length} states`
            : ''

          return {
            label: 'Auto dealership group',
            angle: `Dealership-by-dealership comparison of where the biggest charges are showing up across ${locationDesc}${regionDesc}.`,
            question: `With ${locationDesc}${regionDesc}, are you comparing each dealership on its own meter, or is the group view making it hard to see which locations are carrying the bigger charges?`,
            openers: [
              `Auto groups with ${locationDesc} usually need a dealership-by-dealership view, because showroom traffic, service bays, parts, and lot lighting all behave differently.`,
              `With that kind of footprint${regionDesc}, one dealership can carry a very different peak history even when the group total looks fine.`,
              `The question I'd want answered is which dealerships are carrying the biggest charges on their own meters.`,
            ],
            focus: ['dealership-by-dealership review', 'showroom lighting', 'service bays', 'parts', 'lot lighting', 'meter-level exposure'],
          }
        }

        return {
          label: 'Auto dealership',
          angle: 'Showroom lighting, service bays, parts, and lot lighting creating the biggest usage moments at the dealership.',
          question: `Have you looked at whether the showroom, service bays, parts, or lot lighting are what create the biggest spikes on ${companyName}?`,
          openers: [
            `${companyName} is different because showroom traffic, service bays, parts, and lot lighting all show up differently on the meter.`,
            `The part I would watch is whether the showroom, service department, or lot lighting is creating the biggest usage moments.`,
            `For a dealership, the power side usually comes down to which part of the site is really driving the charge.`,
          ],
          focus: ['showroom traffic', 'service bays', 'parts department', 'lot lighting', 'meter-level exposure'],
        }
      }
      
      if (retailMultiSite.isMultiSite && retailMultiSite.locationCount && retailMultiSite.locationCount >= 10) {
        const locationDesc = retailMultiSite.locationCount >= 50 
          ? `${retailMultiSite.locationCount}+ stores`
          : `${retailMultiSite.locationCount} stores`
        const regionDesc = retailMultiSite.regions.length > 1 
          ? ` across ${retailMultiSite.regions.length} states`
          : ''
        
        return {
          label: 'Retail chain',
          angle: `Portfolio-level electricity management across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you seeing peak charges that stick on specific store meters, or is the roll-up view making them hard to spot?`,
          openers: [
            `Retail chains with ${locationDesc} usually benefit from a portfolio view rather than managing each store separately.`,
            `With that kind of footprint${regionDesc}, a few locations can carry very different meter histories even when the group total looks stable.`,
            `The question I'd want answered is whether your ${locationDesc} are being managed centrally or location-by-location.`,
          ],
          focus: ['portfolio management', 'multi-store coordination', 'seasonal swings', 'demand ratchets', 'centralized procurement'],
        }
      }
      
      return {
        label: 'Retail',
        angle: 'A few store meters carrying higher peak charges while the roll-up view makes the issue easy to miss.',
        question: 'Are you seeing peak charges that stick on specific stores, or is the roll-up view hiding which meters are causing them?',
        openers: [
          `Retail operations are sensitive because one store can carry a much higher peak charge on its own meter than the rest of the group.`,
          `The issue in a retail footprint is usually not the whole portfolio bill. It is that a few stores may be carrying charges that get missed in the roll-up view.`,
          `With retail footprints, the lighting and HVAC load can make it hard to tell which meters are actually creating the biggest charges.`,
        ],
        focus: ['portfolio visibility', 'meter-level ratchets', 'site-level comparison', 'billing floors', 'occupancy swings'],
      }
    case 'restaurant':
      const restaurantMultiSite = detectMultiSiteScale(account, candidate)
      
      if (restaurantMultiSite.isMultiSite && restaurantMultiSite.locationCount && restaurantMultiSite.locationCount >= 5) {
        const locationDesc = restaurantMultiSite.locationCount >= 20 
          ? `${restaurantMultiSite.locationCount}+ locations`
          : `${restaurantMultiSite.locationCount} locations`
        const regionDesc = restaurantMultiSite.regions.length > 1 
          ? ` across ${restaurantMultiSite.regions.length} states`
          : ''
        
        return {
          label: 'Restaurant chain',
          angle: 'Coincident kitchen peaks showing up on specific site meters while the roll-up view makes the problem harder to isolate.',
          question: `With ${locationDesc}${regionDesc}, are you tracking the coincident peaks site-by-site, or is it one big bucket?`,
          openers: [
            `Restaurant groups with ${locationDesc} usually have a significant blind spot in how kitchen service rushes are setting local demand ratchets.`,
            `With that kind of footprint${regionDesc}, one unit's kitchen spike can leave a higher charge on that meter even if the rest of the group looks normal.`,
            `The diagnostic check I'd want to run is whether any of those ${locationDesc} are carrying a stealth demand ratchet from service peaks.`,
          ],
          focus: ['coincident peaks', 'service rushes', 'kitchen load', 'demand ratchets', 'portfolio visibility', 'billing floors'],
        }
      }
      
      const isHospitality = /(hospitality|hotel|lodging|venue|wedding|event space|banquet|resort)/i.test(cleanText(`${account.name} ${account.industry} ${candidate?.title || ''}`))

      if (isHospitality) {
        return {
          label: 'Hospitality / Event Venues',
          angle: '24/7 base load and lodging HVAC driving demand ratchets.',
          question: 'Are you tracking the peak exposure on that 24/7 base load, or is the lodging HVAC masking the ratchets?',
          openers: [
            `Hospitality and event venues are unique because the load never really gets to sleep, especially with on-site lodging.`,
            `With 24/7 operations, the part I care about is how the base load hides the very peaks that set your billing floor.`,
            `The power side matters here because the constant load from HVAC and lodging can quietly set a demand ratchet that lasts for months.`,
          ],
          focus: ['24/7 base load', 'lodging HVAC', 'event peaks', 'demand ratchets', 'billing floors', 'capacity mismatch'],
        }
      }

      return {
        label: 'Restaurant / Dining',
        angle: 'Kitchen coincident peaks from service rushes setting high billing floors.',
        question: 'Have you looked at whether your game-day or service rushes are setting a demand ratchet that lasts all year?',
        openers: [
          `In a high-intensity brand like this, your forensic driver is the Coincident Kitchen Peak during service rushes.`,
          `If your fryers, grills, and HVAC all peak during a rush, you're setting a demand ratchet that follows you into the slow months.`,
          `The real cost driver for restaurant groups is the peak floor set by the kitchen equipment, not the energy rate itself.`,
        ],
        focus: ['coincident peaks', 'service rushes', 'kitchen equipment', 'demand ratchets', 'billing floors', 'HVAC load'],
      }
    case 'hotel_owner':
      return {
        label: 'Hotel property',
        angle: 'Guest rooms, laundry, kitchen service, and HVAC driving the load on a single hotel meter.',
        question: 'Have you looked at whether the room load or laundry is what is actually driving the peak on that hotel meter?',
        openers: [
          `A single hotel property is different from an event space because the guest rooms, laundry, kitchen, and HVAC all keep the meter busy in a steady way.`,
          `The thing I would watch is whether the hotel load is setting a locked-in peak charge on that meter from the hotter months.`,
          `For a branded hotel owner, the useful question is which part of the property is actually driving the peak, not the average usage.`,
        ],
        focus: ['guest rooms', 'laundry', 'kitchen service', 'HVAC', 'hotel meter', 'locked-in peak charges'],
      }
    case 'hospitality_group':
      return {
        label: 'Hospitality group',
        angle: 'Property-by-property comparison of guest-room, laundry, and HVAC load across the portfolio.',
        question: 'Are you comparing each hotel on its own meter, or is the portfolio still being treated like one blended property?',
        openers: [
          `Hospitality groups usually need a property-by-property view because each hotel can carry its own peak history.`,
          `The useful question is which property is carrying the heaviest guest-room and laundry load on its own meter.`,
          `With a portfolio like this, one hotel’s summer peak should not be hidden inside the group total.`,
        ],
        focus: ['property comparison', 'guest rooms', 'laundry', 'HVAC', 'portfolio view', 'locked-in peak charges'],
      }
    case 'education_nonprofit':
      if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount >= 10) {
        const locationDesc = multiSiteInfo.locationCount >= 100
          ? `${multiSiteInfo.locationCount}+ locations`
          : `${multiSiteInfo.locationCount} locations`
        const regionDesc = multiSiteInfo.regions.length > 1 
          ? ` across ${multiSiteInfo.regions.length} states`
          : ''
        
        return {
          label: 'Education / nonprofit network',
          angle: `Forensic comparison of locked-in peak charges across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}, which campuses or programs have their own locked-in peak charge, and which ones do not?`,
          openers: [
            `For a portfolio with ${locationDesc}, the useful check is which sites have their own locked-in peak charge and which ones do not.`,
            `With that kind of footprint${regionDesc}, the budget risk is that some campuses look fine until you compare the meter history side by side.`,
            `The diagnostic check I'd want to run is whether any of those ${locationDesc} are carrying a one-time peak charge from a summer event.`,
          ],
          focus: ['billing floors', 'locked-in peak charges', 'portfolio comparison', 'budget erosion', 'hidden spikes'],
        }
      }
      
      return {
        label: 'Education / nonprofit',
        angle: 'Diagnostic check for a locked-in peak charge caused by seasonal occupancy or special event spikes.',
        question: 'Has anyone audited the bill to see if a single summer event left this site with a locked-in peak charge?',
        openers: [
          `In the non-profit sector, the stealth liability is usually a locked-in peak charge that keeps the site paying for one hot month long after the event ends.`,
          `Most campus budgets are designed for steady load, but seasonal spikes can leave a site with a peak charge for a full 12 months.`,
          `I was curious if anyone has checked the current billing floor against your actual off-peak usage.`,
        ],
        focus: ['stealth liability', 'billing floors', 'budget erosion', 'seasonal spikes', 'locked-in peak charges', 'mission fund protection'],
      }
    case 'public_sector':
      const publicSectorMultiSite = detectMultiSiteScale(account, candidate)

      if (publicSectorMultiSite.isMultiSite && publicSectorMultiSite.locationCount && publicSectorMultiSite.locationCount >= 3) {
        const locationDesc = publicSectorMultiSite.locationCount >= 10
          ? `${publicSectorMultiSite.locationCount}+ facilities`
          : `${publicSectorMultiSite.locationCount} facilities`
        const regionDesc = publicSectorMultiSite.regions.length > 1
          ? ` across ${publicSectorMultiSite.regions.length} states`
          : ''

        return {
          label: 'Public sector network',
          angle: `Municipal comparison of locked-in peak charges across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you tracking which public facilities have their own locked-in peak charge, or is it still one rolled-up view?`,
          openers: [
            `For a city portfolio like this, the real question is which public facilities have their own locked-in peak charge.`,
            `Administrative offices, public safety, and utility buildings usually behave very differently on the power side, so each site needs to be checked on its own meter history.`,
            `When a municipality has this many facilities, I want to know whether the summer peaks are being tracked by building or just buried in the consolidated bill.`,
          ],
          focus: ['public facilities', 'budget protection', 'summer cooling load', 'public safety', 'utility infrastructure', 'billing floors'],
        }
      }
      
      return {
        label: 'Public sector',
        angle: 'Mission-critical public facilities, summer cooling load, and a locked-in peak charge at the meter.',
        question: 'Have you looked at which city buildings left the highest locked-in peak charge, or is everything still sitting in one bucket?',
        openers: [
          `City facilities have a different profile because public safety, utility infrastructure, and administrative offices do not all use power the same way.`,
          `The part I would watch is whether one summer peak left a locked-in charge on a specific meter.`,
          `For a city, the power side is usually about which buildings are carrying the critical load, not just the average bill.`,
        ],
        focus: ['public safety', 'utility infrastructure', 'administrative offices', 'summer cooling', 'budget protection'],
      }
    case 'religious':
      return {
        label: 'Religious organization',
        angle: 'Sanctuary HVAC spikes and weekend peaks create stealth billing floors that erode mission funds.',
        question: 'Has anyone checked if a single hot weekend service triggered a locked-in peak charge that is currently inflating your monthly bill?',
        openers: [
          `Religious organizations are uniquely exposed to phantom demand charges because the entire week of low usage is billed against one single weekend peak.`,
          `The stealth liability in a sanctuary is that one hot Sunday service can set a billing floor for the next 11 months.`,
          `I was looking at the usage profile and I'm curious if the locked-in peak charge on the bill matches the actual sanctuary peak.`,
        ],
        focus: ['stealth liability', 'billing floors', 'mission fund erosion', 'sanctuary HVAC', 'demand ratchets', 'weekend peaks'],
      }
    case 'technology':
      return {
        label: 'Technology / data-heavy office',
        angle: 'Cooling and server spaces change the billing floor faster than the growth plan expects.',
        question: 'Have you looked at whether the server cooling or office expansion has triggered a new demand ratchet floor?',
        openers: [
          `Tech companies can add load quietly through fit-outs, cooling, and server spaces.`,
          `A lot of the cost shows up as a permanent billing floor after the growth is already live.`,
          `IT load and server cooling are the first things that change the billing floor once a footprint starts growing.`,
        ],
        focus: ['fit-outs', 'growth', 'cooling', 'office load', 'server rooms', 'demand ratchets'],
      }
    case 'energy_intensive':
      return {
        label: 'Energy-intensive industrial',
        angle: 'Transmission fee exposure, process load, large motors, and the equipment driving the peaks.',
        question: 'Have you mapped which processes or motors are creating the peaks, and whether controls or maintenance could smooth them out?',
        openers: [
          `When a site carries heavy load, transmission exposure from summer peaks can hit harder than the rate itself.`,
          `Process timing and equipment choices are what usually drive the transmission side of the bill more than the commodity.`,
          `For an energy-intensive operation, the biggest question is whether the peak demand is coming from production ramps or equipment startup.`,
        ],
        focus: ['transmission fees', 'process load', 'peak exposure', 'large motors', 'equipment', 'site practices', 'maintenance'],
      }
    case 'technology':
      return {
        label: 'Technology / Data Centers',
        angle: 'High-density compute and 24/7 cooling load creating extreme load factor sensitivity.',
        question: 'Are you guys tracking the transmission exposure on that compute load yet, or is the 24/7 cooling masking the peaks?',
        openers: [
          `Data-heavy operations have a unique liability because high-density compute usually creates a very flat base load that hides massive transmission charges.`,
          `With 24/7 uptime requirements, the part I care about is whether your load factor is being penalized by a mismatch in the billing structure.`,
          `The forensic check I'd want to run is whether your UPS and cooling cycles are triggering a demand ratchet during peak hours.`,
        ],
        focus: ['compute load factor', '24/7 cooling', 'transmission exposure', 'UPS cycles', 'billing floors'],
      }
    case 'energy_intensive':
      return {
        label: 'Energy Intensive / Heavy Industrial',
        angle: 'Extreme process peaks and raw transmission exposure driving the majority of the electricity liability.',
        question: 'Has anyone mapped the process start-up times against the ERCOT transmission windows to see if you are carrying a stealth liability?',
        openers: [
          `Heavy industrial sites are basically market-reading instruments, and the biggest liability is usually the timing of the process peaks.`,
          `The part I care about is whether your equipment start-ups are happening inside the ERCOT transmission exposure windows.`,
          `With this kind of load, the rate doesn't matter nearly as much as the transmission exposure and the demand ratchet floor.`,
        ],
        focus: ['process timing', 'transmission exposure', 'peak start-ups', 'demand ratchets', 'billing floors', 'load factor'],
      }
    case 'office_services':
      return {
        label: 'Office / Professional Services',
        angle: 'Occupancy-driven HVAC and lighting peaks setting the annual billing floor.',
        question: 'Are you guys tracking whether the summer HVAC peaks are setting a demand ratchet that sticks for the rest of the year?',
        openers: [
          `Professional office spaces have a specific liability because the cooling load during peak business hours usually sets a billing floor that hides in the budget for 11 months.`,
          `The forensic check I'd want to run is whether your occupancy peaks are triggering a demand ratchet that is dragging down the budget.`,
          `With office footprints, the power side matters because the load factor is usually much lower than the occupancy suggests.`,
        ],
        focus: ['HVAC peaks', 'occupancy drivers', 'demand ratchets', 'billing floors', 'load factor'],
      }
    case 'multi_site':
      return {
        label: 'Multi-site / portfolio',
        angle: 'Portfolio-wide review of meter-specific peak charges that can get lost in a roll-up view.',
        question: 'Has anyone mapped the portfolio meter by meter to see which sites are carrying peak charges that stick on their own bills?',
        openers: [
          `Multi-site footprints usually have a blind spot where a few site bills look very different from the portfolio summary.`,
          `The part I care about is whether any of the sites in your group are carrying peak charges that stick on those local meters.`,
          `With multiple locations, the forensic check is whether a few specific meters are setting a billing floor that you're stuck with for the rest of the year.`,
        ],
        focus: ['stealth billing floors', 'portfolio visibility', 'meter-specific peak charges', 'transmission exposure'],
      }
    case 'unknown':
    default:
      return {
        label: 'Company context',
        angle: 'Forensic audit of billing floors, transmission exposure, and peak demand liability.',
        question: 'Has anyone mapped the operation to see exactly which processes or schedules are driving the peak demand charges?',
        openers: [
          `The biggest liability in ERCOT right now is transmission exposure, where one operational spike creates a permanent demand ratchet on the bill.`,
          `I was reviewing the footprint, and the primary question is whether the billing floor is actually matched to the operational reality.`,
          `Most companies look at the rate, but the real cost creep comes from stealth demand ratchets that stay on the bill long after a peak event.`,
        ],
        focus: ['transmission exposure', 'stealth demand ratchets', 'billing floors', 'operational peaks'],
    }
  }
}

function getMarketSeason(date = new Date()): MarketSeason {
  const month = date.getMonth() + 1
  if (month >= 6 && month <= 9) return 'summer_peak'
  if (month === 10 || month === 11) return 'fall_reset'
  if (month === 12 || month <= 2) return 'winter_reliability'
  return 'spring_shoulder'
}

function buildMarketGuidance(industryCluster: IndustryCluster): MarketGuidance {
  const season = getMarketSeason()
  const lowIntensityCluster = [
    'office_services',
    'banking',
    'retail',
    'restaurant',
    'education_nonprofit',
    'school_district',
    'higher_education',
    'residential_care',
    'religious',
    'public_sector',
    'unknown',
  ].includes(industryCluster)

  if (season === 'summer_peak') {
    return lowIntensityCluster
      ? {
          marketSeason: season,
          marketLabel: 'ERCOT summer volatility',
          marketAngle: 'Cooling-driven bills and budget predictability before the hottest months hit.',
          marketQuestion: 'Have you looked at how the summer stretch usually changes the bill for a business like this?',
          marketOpeners: [
            'We are heading into the hottest part of the year, and that is when a lot of Texas accounts feel the bill move even if nothing else changed.',
            'For smaller offices and service businesses, summer is usually more about budget predictability and cooling than about raw load.',
            'This is the time of year when I want to know whether the company is ready for the hotter months or still treating it as business as usual.',
          ],
          marketFocus: ['summer volatility', 'cooling load', 'budget predictability', 'billing surprise', 'comfort'],
        }
      : {
          marketSeason: season,
          marketLabel: 'ERCOT summer peak season',
          marketAngle: 'Summer volatility, transmission fees, and whether the site is ready for hotter-weather peaks.',
          marketQuestion: 'Have you looked at how the account behaves once the summer peak window shows up?',
          marketOpeners: [
            'We are moving into the ERCOT summer window, and that is when peak-hour behavior starts to matter a lot more.',
            'This is usually the time of year when a Texas account finds out whether the bill is ready for summer or just looked fine in spring.',
            'If the site has real load behind it, I would want to know how it handles the hotter months before the bills start moving.',
          ],
          marketFocus: ['summer volatility', 'transmission fees', 'peak-hour exposure', 'cooling load', 'budget risk'],
        }
  }

  if (season === 'winter_reliability') {
    return {
      marketSeason: season,
      marketLabel: 'ERCOT winter reliability',
      marketAngle: 'Cold-weather exposure, morning and evening swings, and whether the bill is resilient enough for a snap.',
      marketQuestion: 'Have you looked at how the account holds up when winter weather pushes usage around?',
      marketOpeners: [
        'Winter is when a lot of Texas accounts find out whether the bill is actually steady or just looked steady.',
        'The question in the cold months is usually more about reliability and exposure than about one big load number.',
        'If a cold snap hits, I would want to know what part of the bill or building gets stressed first.',
      ],
      marketFocus: ['winter reliability', 'cold-snap exposure', 'morning/evening volatility', 'heating load', 'budget risk'],
    }
  }

  if (season === 'fall_reset') {
    return {
      marketSeason: season,
      marketLabel: 'Fall planning window',
      marketAngle: 'Budget reset, year-end planning, and whether the bill still makes sense before winter.',
      marketQuestion: 'Have you looked at whether this is the right time to reset the budget or leave it alone?',
      marketOpeners: [
        'Fall is usually when companies decide whether the bill deserves another look before year-end.',
        'That is often the quiet window to clean up the power side before winter or the next contract cycle shows up.',
        'For a lot of accounts, the bigger question now is whether they want to lock in the budget story before the next season changes it.',
      ],
      marketFocus: ['budget reset', 'year-end planning', 'winter prep', 'renewal timing', 'cost visibility'],
    }
  }

  return {
    marketSeason: season,
    marketLabel: 'Spring shoulder season',
    marketAngle: 'Pre-summer positioning, budget cleanup, and whether the account is ready before ERCOT gets hotter.',
    marketQuestion: 'Have you looked at whether the account is set up for summer, or is that still ahead?',
    marketOpeners: lowIntensityCluster
      ? [
          'We are in the shoulder season, which is usually the best time to get ahead of summer instead of reacting to it.',
          'For smaller offices and service businesses, this is less about a heavy-load conversation and more about budget predictability and cooling.',
          'The question I would want answered now is whether the account is ready for the hotter months or still getting by on old assumptions.',
        ]
      : [
          'We are in the shoulder season, which is usually the best time to get ahead of ERCOT summer exposure instead of reacting to it.',
          'This is when a lot of Texas companies decide whether they want to look at the power side before the hotter months create noise.',
          'If the site has meaningful usage, this is the window to line up the budget before summer gets here.',
        ],
    marketFocus: lowIntensityCluster
      ? ['summer volatility', 'budget predictability', 'cooling load', 'comfort', 'billing clarity']
      : ['summer volatility', 'pre-summer planning', 'ERCOT exposure', 'budget visibility', 'cooling load'],
  }
}

function buildTalkTrackContext(
  account: AccountRow,
  candidate: ResearchHit | null,
  isFallbackMode: boolean,
  audienceProfile: AudienceProfile | null = null,
): TalkTrackContext {
  const seed = [account.id, candidate?.url || candidate?.title || '', isFallbackMode ? 'fallback' : 'signal'].join('|')
  const signalFamily = inferSignalFamily(candidate, isFallbackMode)
  const industryCluster = inferIndustryCluster(account, candidate)
  const signalGuidance = buildSignalGuidance(signalFamily, account, candidate)
  const industryGuidance = buildIndustryGuidance(industryCluster, account, candidate)
  const marketGuidance = buildMarketGuidance(industryCluster)
  const simplifyList = (items: string[]) => items.map(simplifyTalkTrackLanguage).filter(Boolean)
  const openingPattern = pickVariant(['observation', 'contrast', 'curiosity'] as const, seed) || 'observation'
  const openingStyleMap: Record<TalkTrackContext['openingPattern'], string> = {
    observation: 'Observation-led opening that names the event first.',
    question: 'Question-led opening that moves quickly into curiosity.',
    contrast: 'Contrast the event with the electricity side before asking.',
    curiosity: 'Curiosity-led opening that explains what you want to understand.',
  }

  return {
    signalFamily,
    signalLabel: signalGuidance.label,
    signalAngle: simplifyTalkTrackLanguage(signalGuidance.angle),
    signalOpeners: simplifyList(signalGuidance.openers),
    industryCluster,
    industryLabel: industryGuidance.label,
    industryAngle: simplifyTalkTrackLanguage(industryGuidance.angle),
    industryOpeners: simplifyList(industryGuidance.openers),
    marketSeason: marketGuidance.marketSeason,
    marketLabel: marketGuidance.marketLabel,
    marketAngle: simplifyTalkTrackLanguage(marketGuidance.marketAngle),
    marketQuestion: simplifyTalkTrackLanguage(marketGuidance.marketQuestion),
    marketOpeners: simplifyList(marketGuidance.marketOpeners),
    marketFocus: simplifyList(marketGuidance.marketFocus),
    openingPattern,
    openingStyle: openingStyleMap[openingPattern],
    question: simplifyTalkTrackLanguage(signalGuidance.question || industryGuidance.question),
    ercotFocus: Array.from(new Set(simplifyList([...signalGuidance.focus, ...industryGuidance.focus]))),
    avoidPhrases: [
      'autopilot',
      'site by site',
      'load profile',
      'energy load',
      'operating footprint',
      'industry angle',
      'from an industry angle',
      'current setup',
      'electricity side starts behaving differently',
      'structured in a way that does not match',
      'one location at a time',
      'most companies',
      'rate looks fine',
      'the note about',
      'i saw the note',
      'saw the note',
      'i was looking at',
      'i took a look at',
      'utility side',
      'responsible for electricity',
      'support ticket',
      'for sale',
      'pre-owned',
      'inventory',
      'cars, trucks, & suvs',
      'dealership',
    ],
    seed,
    audienceProfile,
  }
}

async function generateAITalkTrack(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext): Promise<string | null> {
  const companyName = cleanText(account.name) || 'the company'
  const industry = cleanText(account.industry) || 'business'
  const city = cleanText(account.city) || ''
  const state = cleanText(account.state) || ''
  const location = [city, state].filter(Boolean).join(', ') || 'Texas'
  const identityProfile = getAccountIdentityProfile(account, candidate)
  
  const multiSiteInfo = detectMultiSiteScale(account, candidate)
  const multiSiteContext = multiSiteInfo.isMultiSite && multiSiteInfo.locationCount
    ? `This is a multi-site organization with ${multiSiteInfo.locationCount} locations${multiSiteInfo.regions.length > 1 ? ` across ${multiSiteInfo.regions.length} states` : ''}.`
    : ''
  
  const employeesContext = account.employees ? `- Employee Size: ${account.employees}` : ''
  const revenueContext = account.revenue ? `- Revenue: ${account.revenue}` : ''
  const descriptionContext = account.description ? `- Description: ${account.description}` : ''
  const usageContext = account.annual_usage ? `- Annual Usage: ${account.annual_usage} kWh` : ''
  const identityContext = identityProfile
    ? [
        'IDENTITY PROFILE:',
        `- Company Type: ${identityProfile.companyType}`,
        `- Operating Model: ${identityProfile.operatingModel}`,
        `- Facility Type: ${identityProfile.facilityType}`,
        `- Identity Keywords: ${identityProfile.identityKeywords.join(', ') || 'n/a'}`,
        `- Power Keywords: ${identityProfile.powerKeywords.join(', ') || 'n/a'}`,
        `- Guardrails: ${identityProfile.talkTrackGuardrails.join('; ') || 'n/a'}`,
      ].join('\n')
    : ''
  const audienceProfileBlock = buildAudienceProfileBlock(context.audienceProfile)
  const audienceRule = context.audienceProfile
    ? `- AUDIENCE PROFILE: ${context.audienceProfile.contactName || context.audienceProfile.contactFirstName || 'the contact'} is the person you are writing to. Use their first name once if it helps the opener and use their title to frame what they care about. If the audience profile came from a sequence contact, that person wins over a decision-maker card.\n`
    : ''
  const sequencePriorityRule = '- If the account has both a sequence contact and a decision-maker card, the sequence contact wins. Do not blend two different people into one talk track.'
  const dentalContext = /(dental|dentist|dentistry|dental partnership organization|dso\b|dpo\b|operatories?|imaging|sterilization|hygienist|hygiene|orthodont|oral surgery)/i.test(cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`))
    ? '- For dental groups, use practice and office language: operatories, imaging, sterilization, hygiene cadence, patient flow, and front-desk timing. Do not use hospital, emergency department, inpatient, or short-stay-room language unless the source explicitly confirms a hospital or surgery-center setting.\n'
    : ''
  
  const behavioralHealthContext = /(mental health|behavioral health|behavioral healthcare|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|developmental disabilities|community center|community mental health|crisis center|crisis hotline|substance use|recovery program|peer support|care coordination|licensed therapy|early childhood intervention|trauma-informed)/i.test(cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`))
    ? '- For behavioral health, IDD, and community-care networks, use distributed care language like clinics, crisis services, counseling, care coordination, community programs, and administrative sites. Do not use senior-living, lodging, or hospital-inpatient language unless the source explicitly says those settings exist.\n'
    : ''

  const prompt = `You are a plainspoken energy analyst and strategist. You are crafting a talk track opener for a peer-to-peer conversation with a C-level executive or operations lead.

VOICE:
- Conversational, peer-to-peer, and undeniably expert. 
- Avoid "broker-speak" or sounding like you're selling a service. 
- Sound like someone who is looking at a diagnostic report and has identified a specific anomaly or liability.
- Do not use "I came across your website" or "I was looking at the operational footprint."
- Use "I was curious about..." or "I noticed a detail in the recent [Source] update regarding..."

COMPANY CONTEXT:
- Company: ${companyName}
- Industry: ${industry}
- Location: ${location}
${[employeesContext, revenueContext, descriptionContext, usageContext, multiSiteContext].filter(Boolean).join('\n')}

SIGNAL CONTEXT:
${candidate ? `- Headline: ${candidate.title}\n- Snippet: ${candidate.snippet}\n- Source: ${candidate.source}` : 'No specific news signal found. Use general business context.'}

MARKET CONTEXT:
- Market angle: ${context.marketAngle}
- Season: ${context.marketLabel}

${identityContext}

${audienceProfileBlock ? `AUDIENCE PROFILE:\n${audienceProfileBlock}\n` : ''}

REQUIREMENTS:
1. THE OPENER: If a SIGNAL CONTEXT is provided, the first sentence MUST name the specific event OR the specific operational detail mentioned (e.g., "I caught the update about the new Haslet campus expansion" or "I was curious about the technical load mentioned in your recent facility update").
2. THE PIVOT (TECHNICAL DEPTH): Look closely at the SIGNAL CONTEXT snippet. If it mentions specific operational terms (e.g., "broadcast load," "fabrication line," "sanctuary load," "24/7 automation"), you MUST use these terms. Do not revert to a generic industry template if specific details are available.
3. BUSINESS PAIN POINT: Connect the technical detail directly to a bill issue:
   - Electrification shift: The risk of adding electric equipment and changing usage faster than the bill structure catches up.
   - One-time peak charges that stick: A single spike can leave a higher peak charge on the bill for months.
   - Transmission exposure: Hidden charges tied to pulling power during the highest ERCOT grid peaks. (Never say "4CP").
   - Usage mismatch: When the operating schedule changes but the bill structure still reflects the old pattern.
4. NO BUILDING CONTROLS: Do not mention building controls, scheduling, or "managing the load." Focus on the liability in the bill itself.
5. THE QUESTION: End with ONE specific, easy-to-answer question about their operations (e.g., "Has anyone looked at whether the testing schedule created a peak charge that is still sitting on the bill?" or "Are you guys tracking the transmission exposure on that technical load yet?").
6. NON-PROFIT / COMMUNITY: For non-profits, religious groups, or schools, use mission-aligned language like "serving the community" or "supporting your mission" instead of generic business terms.
${audienceRule}${sequencePriorityRule}
${dentalContext}${behavioralHealthContext}
   - For school districts specifically, talk about campus calendars, athletics, cafeterias, classroom technology, and summer HVAC. Do not use factory language like shifts, production, or startup unless the source explicitly says that.
   - For healthcare accounts, distinguish between 24/7 facilities (hospitals, senior living) and daytime operations (clinics, medical practices). Do not use "24/7," "never sleeps," or "always-on" for clinics or outpatient sites unless the source explicitly confirms it. Instead, focus on operating peaks, equipment synchronization, and patient volume cycles. Use clinical language like patient care, imaging, surgical units, and labs.
   - For dental groups, speak in practice and office language: operatories, imaging, sterilization, hygiene cadence, patient flow, and front-desk timing. Do not use hospital, emergency department, inpatient, or short-stay-room language unless the source explicitly confirms a hospital or surgery-center setting.
   - For hospital operators and neighborhood-hospital networks, use hospital language like emergency departments, inpatient rooms, imaging, lab work, and health-system partnerships. Never use hotel, guest-room, laundry, lodging, banquet, or hospitality language for hospitals.
   - For multi-site care organizations, keep the comparison portfolio-wide but the liability meter-specific. Say each site can carry its own locked-in peak charge rather than implying one site changes every other site.
   - For a single hotel property or branded hotel owner, use hotel-property language like guest rooms, laundry, lobby, kitchen service, and HVAC. Do not talk like it is an event venue unless the source explicitly says convention space, banquet space, or event space is the main business.
7. NO REPETITION: Do not repeat the core question or the opening observation.
8. LENGTH: 2-3 sentences max. 50-80 words.
9. FORBIDDEN PHRASES: "trim waste", "budget predictability", "save money", "improve efficiency", "how the business runs today", "looking at the setup", "staple", "long-standing", "fixture", "current setup", "autopilot", "site by site", "I was looking at the operational footprint", "I came across your website", "I came across [company]'s website", "headcount or capex", "rate", "rates", "pricing", "savings", "lower cost", "better price", "consultation", "help you".
10. CLEAR AUTHORITY: Never sound like you are selling a service. Sound like you noticed something specific about how the company operates. Use plain English instead of insider jargon. Prefer phrases like "peak charge that sticks on the bill," "steady usage," and "usage pattern" over "demand ratchet," "base load," and "load factor." Never say "forensic signal," "forensic driver," "Thermal Liability," or "artificial liability."
11. NO BROKER-SPEAK: Never use phrases like "I can help you save," "we look at energy differently," or "I want to be a resource." Lead with the concrete business observation immediately.
12. MULTI-SITE: If the organization has multiple locations, you MUST compare the sites as a portfolio, but keep the charge itself site-specific. Say that each ESID or meter can carry its own locked-in peak charge, and avoid saying one location changes the ratchet for every location.
13. IDENTITY PROFILE: If an identity profile is provided, treat it as the source of truth for what kind of company this is unless the signal text directly contradicts it. Do not use language blocked by the guardrails.

Generate a plain-English, peer-to-peer opener for ${companyName}:`

  try {
    const openrouterKey = process.env.OPENROUTER_API_KEY
    if (!openrouterKey) {
      console.warn('[Intelligence Brief] OPENROUTER_API_KEY not set, skipping AI talk track generation')
      return null
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://powerchoosers.com',
        'X-Title': 'Power Choosers CRM',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      console.warn('[Intelligence Brief] AI talk track generation failed:', response.status, response.statusText)
      return null
    }

    const data = await response.json()
    const talkTrack = simplifyTalkTrackLanguage(cleanText(data?.choices?.[0]?.message?.content || ''))
    
    if (!talkTrack) {
      console.warn('[Intelligence Brief] AI talk track generation returned empty content')
      return null
    }

    // Validate the AI-generated talk track
    const wordCount = talkTrack.split(/\s+/).filter(Boolean).length
    if (wordCount < 30 || wordCount > 120) {
      console.warn('[Intelligence Brief] AI talk track word count out of range:', wordCount)
      return null
    }

    // Check for forbidden phrases
    const forbiddenPatterns = [
      /current setup/i,
      /how the business runs today/i,
      /whether the bill matches/i,
      /autopilot/i,
      /site by site/i,
      /load profile/i,
      /energy load/i,
      /operating footprint/i,
      /industry angle/i,
      /utility side/i,
      /responsible for electricity/i,
      /i was looking at/i,
      /i took a look at/i,
      /staple/i,
      /long-standing/i,
    ]
    
    if (forbiddenPatterns.some(pattern => pattern.test(talkTrack))) {
      console.warn('[Intelligence Brief] AI talk track contains forbidden phrases')
      return null
    }

    return talkTrack
  } catch (error) {
    console.error('[Intelligence Brief] AI talk track generation error:', error)
    return null
  }
}

function talkTrackNeedsRewrite(talkTrack: string, context: TalkTrackContext, account?: AccountRow, candidate: ResearchHit | null = null) {
  const text = cleanText(talkTrack)
  if (!text) return true
  if (isLikelyNonEnglishText(text)) return true

  const lower = text.toLowerCase()
  const accountText = account
    ? cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
    : ''
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const firstSentence = cleanText(text.split(/[.!?]+/)[0] || '')
  const genericHits = TALK_TRACK_GENERIC_PATTERNS.filter((pattern) => pattern.test(lower)).length
  const sentenceCount = text.split(/[.!?]+/).map(cleanText).filter(Boolean).length
  const mentionsSignal = TALK_TRACK_SIGNAL_KEYWORDS[context.signalFamily].some((keyword) => lower.includes(keyword.toLowerCase()))
  const mentionsIndustry = TALK_TRACK_INDUSTRY_KEYWORDS[context.industryCluster].some((keyword) => lower.includes(keyword.toLowerCase()))
  const mentionsMarket = context.marketFocus.some((phrase) => lower.includes(phrase.toLowerCase()))
  const mentionsAtLeastOneFocus = context.ercotFocus.some((phrase) => lower.includes(phrase.toLowerCase()))
  const genericOpening = /^(that|this|it)\s+(makes|is|was|would|can|usually|tends)\b/i.test(firstSentence)
  const unsupportedLeadershipAngle = context.signalFamily !== 'leadership_change' &&
    /\b(new leader|new cfo|new coo|new ceo|new president|new facilities director|new energy manager)\b/i.test(lower)
  const unsupportedAcquisitionAngle = context.signalFamily !== 'acquisition' &&
    /\b(ownership changes|ownership change|got inherited|what got inherited|inherited on the electricity side)\b/i.test(lower)
  const unsupportedFootprintAngle = context.signalFamily !== 'restructuring' &&
    /\b(footprint change|stranded power costs|unused meters|leftover contracts|meter cleanup|contract cleanup)\b/i.test(lower)
  const repeatedQuestionEcho = /\b(proactively|autopilot|current setup|electricity setup|how the business runs today)\b[\s\S]{0,140}\b(proactively|autopilot|current setup|electricity setup|how the business runs today)\b/i.test(lower)
  const filingJargon = /\b(sec filing|public filing|recent filing|filing)\b/i.test(lower)
  const footprintOpener = /reviewing the operational footprint|operational footprint for|reviewing the company profile|company profile for/i.test(lower)
  const incompleteReportOpener = /^i\s+(?:saw|noticed|came across)\s+(?:a|the)?\s*(?:report|article|news item|piece|update|post online)\s+(?:about|on)\s+[^.!?]{2,80}\.\s*(?:that|this|it)\s+(?:is|was|would|can|usually|tends|makes)\b/i.test(text)
  const healthcareRestaurantJargon = context.industryCluster === 'healthcare' &&
    /\b(coincident kitchen peak|service rushes?|game[-\s]?day|fryers?|grills?|restaurant|restaurant brand|kitchen peak)\b/i.test(lower)
  const healthcareHospitalityJargon = context.industryCluster === 'healthcare' &&
    /\b(lodging hvac|guest rooms?|hotel|motel|resort|banquet|event venue|wedding venue)\b/i.test(lower)
  const healthcareBankingJargon = context.industryCluster === 'healthcare' &&
    /\b(branch operations|branch portfolio|branch it loads?|atms?)\b/i.test(lower)
  const schoolManufacturingJargon = context.industryCluster === 'school_district' &&
    /\b(shift(?:s)?|production|startup|bake line|machine startup|factory)\b/i.test(lower)
  const residentialRestaurantJargon = context.industryCluster === 'residential_care' &&
    /\b(coincident kitchen peak|service rushes?|fryers?|grills?|restaurant)\b/i.test(lower)
  const hotelEventSpaceJargon = context.industryCluster === 'hotel_owner' &&
    /\b(event space|banquet space|banquet hall|wedding venue|concert venue|conference venue|game[-\s]?day)\b/i.test(lower)
  const accountIsHealthcare = /\b(healthcare|hospital|clinic|medical|medical practice|acupunctur|functional wellness|doctor|dental|ophthalmology|retina|therapy|patient|wellness care)\b/i.test(accountText)
  const accountIsDental = /\b(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry)\b/i.test(accountText)
  const accountIsDme = hasStrongDmeSignals(accountText)
  const accountIsRestaurant = hasStrongRestaurantSignals(accountText)
  const accountIsLogistics = hasStrongLogisticsSignals(accountText)
  const accountIsOfficeServices = hasStrongOfficeServicesSignals(accountText)
  const accountIsSchool = hasStrongSchoolSignals(accountText)
  const accountHealthcareHotelJargon = accountIsHealthcare &&
    /\b(hotel load|hotel meter|guest rooms?|room load|laundry|lodging|motel|resort|hotel property|blended property|property-by-property)\b/i.test(lower)
  const accountDentalHospitalJargon = accountIsDental &&
    /\b(hospital|hospitality|emergency department|emergency room|inpatient|short-stay rooms?|acute care|guest rooms?|laundry|lodging|banquet|event venue|clinic)\b/i.test(lower)
  const accountDmeHospitalJargon = accountIsDme &&
    /\b(hospital|hospitality|clinic|medical practice|patient rooms?|patient care|emergency department|emergency room|inpatient|short-stay rooms?|acute care|guest rooms?|laundry|lodging|banquet|event venue)\b/i.test(lower)
  const accountSchoolManufacturingJargon = accountIsSchool &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution|shift(?:s)?|bake line)\b/i.test(lower)
  const accountSchoolRetailJargon = accountIsSchool &&
    /\b(retail footprint|roll-?up view|store meters?|store-level|stores?|customer-facing retail|retail group|showroom)\b/i.test(lower)
  const accountIsAutomotive = hasStrongAutomotiveSignals(accountText)
  const accountAutomotiveHotelJargon = accountIsAutomotive &&
    /\b(hotel|hotels|hotel's|guest rooms?|room load|laundry|lodging|motel|resort|hotel property|blended property)\b/i.test(lower)
  const accountAutomotiveRetailJargon = accountIsAutomotive &&
    /\b(retail footprint|roll-?up view|store meters?|store-level|stores?|customer-facing retail|retail group)\b/i.test(lower)
  const accountIsFoodProduction = /\b(food production|food manufacturing|food manufacturer|food processing|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|restaurant chains?|foodservice)\b/i.test(accountText)
  const accountFoodLogisticsJargon = accountIsFoodProduction &&
    /\b(warehouse groups?|dock activity|dock work|dock doors?|high-volume logistics|logistics groups?|automation and hvac|warehouse's summer peak)\b/i.test(lower)
  const accountDmeMedicalAllowance = accountIsDme &&
    /\b(dme|durable medical equipment|medical equipment|equipment|inventory|delivery|storage|turnaround)\b/i.test(lower)
  const accountRestaurantManufacturingJargon = accountIsRestaurant &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution)\b/i.test(lower)
  const accountLogisticsManufacturingJargon = accountIsLogistics &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|process equipment|assembly)\b/i.test(lower)
  const accountOfficeIndustrialJargon = accountIsOfficeServices &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution|dock activity|dock doors?|terminal throughput)\b/i.test(lower)
  const unexplainedJargon = /\b(load factor|base load|demand ratchet|demand ratchets|forensic signal|forensic driver|thermal liability|artificial liability|peak demand charges|transmission side|correlation)\b/i.test(lower)
  const matchedAngleBuckets = [mentionsSignal, mentionsIndustry, mentionsMarket].filter(Boolean).length
  const marketFeelsBoltedOn = mentionsMarket && (mentionsSignal || mentionsIndustry) && sentenceCount > 3
  const mismatchedIndustryLabel = (Object.entries(TALK_TRACK_INDUSTRY_LABELS) as Array<[IndustryCluster, string[]]>).some(([cluster, labels]) => {
    if (cluster === context.industryCluster) return false
    return labels.some((label) => lower.includes(label.toLowerCase()))
  })
  const overstuffed = matchedAngleBuckets > 2 || sentenceCount > 4 || marketFeelsBoltedOn

  return genericHits > 0 || genericOpening || unsupportedLeadershipAngle || unsupportedAcquisitionAngle || unsupportedFootprintAngle || repeatedQuestionEcho || filingJargon || footprintOpener || incompleteReportOpener || healthcareRestaurantJargon || healthcareHospitalityJargon || healthcareBankingJargon || schoolManufacturingJargon || accountSchoolManufacturingJargon || accountSchoolRetailJargon || residentialRestaurantJargon || hotelEventSpaceJargon || accountHealthcareHotelJargon || accountDentalHospitalJargon || accountDmeHospitalJargon || accountAutomotiveHotelJargon || accountAutomotiveRetailJargon || accountFoodLogisticsJargon || accountRestaurantManufacturingJargon || accountLogisticsManufacturingJargon || accountOfficeIndustrialJargon || unexplainedJargon || sentenceCount < 2 || wordCount < 25 || overstuffed || (mismatchedIndustryLabel && !accountDmeMedicalAllowance)
}

function buildManualTalkTrack(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext, attempt = 0) {
  const companyName = cleanText(account.name) || 'the company'
  const sourceLead = buildSourceLead(account, candidate)
  const audienceLead = buildAudienceLead(context.audienceProfile)
  const fallbackIndustryLine = buildFallbackIndustryLine(account, candidate, context)
  const fallbackQuestion = buildFallbackQuestion(account, candidate, context)
  const candidateText = `${candidate?.title || ''} ${candidate?.snippet || ''}`
  const alreadyOpen = isAlreadyOpenLocationSignal(candidateText)
  const openingIndustryLine = buildOpeningIndustryLine(
    context.industryCluster,
    alreadyOpen,
    cleanText(`${account.name || ''} ${account.industry || ''} ${account.description || ''} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase(),
  )
  const multiSiteInfo = detectMultiSiteScale(account, candidate)
  const variantSeed = `${context.seed}|${attempt}`
  const openerBySignal: Record<SignalFamily, string[]> = {
    acquisition: [sourceLead],
    new_location: [sourceLead],
    leadership_change: [sourceLead],
    growth: [sourceLead],
    restructuring: [sourceLead],
    contract_win: [sourceLead],
    funding: [sourceLead],
    technical_load: [sourceLead],
    industry_context: [
      sourceLead,
    ],
  }

  const opener = audienceLead || pickVariant(openerBySignal[context.signalFamily], variantSeed) || openerBySignal[context.signalFamily][0]
  const signalLineBySignal: Record<SignalFamily, string[]> = {
    acquisition: [
      `After an acquisition, somebody usually has to sort out what got inherited on the power side.`,
      `When ownership changes, the electricity setup is often the piece nobody fully cleans up right away.`,
    ],
    new_location: [
      openingIndustryLine,
      alreadyOpen
        ? `If the site is already live, the power piece should already match how it is being used now.`
        : `For a new site, the electricity setup should already be in place before it goes live.`,
    ],
    leadership_change: [
      `A new leader usually means the power setup gets a fresh look, or should.`,
      `Fresh eyes tend to surface questions the old team never had time to ask.`,
    ],
    growth: [
      `When a business is growing, that usually changes the bill before anyone notices it in operations.`,
      `Usually when headcount or capex starts moving, the bill moves with it.`,
    ],
    restructuring: [
      `During a footprint change, stranded power costs often show up if nobody cleans them up.`,
      `When a site gets consolidated or closed, the first question is whether the power costs were cleaned up too.`,
    ],
    contract_win: [
      `A major contract win can change the load faster than people expect.`,
      `A new customer or project can change how the site runs pretty fast.`,
    ],
    funding: [
      `After a funding round, somebody usually needs to map the new money against the facility plan.`,
      `Fresh capital can turn into new space, new equipment, or both.`,
    ],
    technical_load: [
      `Adding equipment like this can change the usage pattern faster than the bill setup catches up.`,
      `Moving processes over to the electric side can create peak charges that stay on the bill if the timing is not checked.`,
    ],
    industry_context: [
      fallbackIndustryLine,
    ],
  }

  const industryLine = pickVariant(context.industryOpeners, variantSeed) || context.industryOpeners[0]
  const signalLine = pickVariant(signalLineBySignal[context.signalFamily], variantSeed) || signalLineBySignal[context.signalFamily][0]
  const marketLine = pickVariant(context.marketOpeners, variantSeed) || context.marketOpeners[0]
  
  const lowIntensityCluster = [
    'office_services',
    'banking',
    'retail',
    'restaurant',
    'education_nonprofit',
    'school_district',
    'higher_education',
    'residential_care',
    'religious',
    'public_sector',
    'unknown',
  ].includes(context.industryCluster)
  const shouldUseMarketLine = context.marketSeason !== 'spring_shoulder' && (lowIntensityCluster || context.signalFamily === 'industry_context')
  
  const forensicObservation = context.signalFamily === 'industry_context'
    ? (shouldUseMarketLine ? marketLine : industryLine)
    : signalLine
    
  const question = context.signalFamily === 'industry_context' ? fallbackQuestion : context.question

  // Create a more cohesive flow
  let fullTrack = ''
  
  if (context.signalFamily === 'industry_context') {
    // Lead with the forensic observation directly, then the source, then the question
    // This feels more peer-to-peer than "I saw your website"
    const observationalOpenerOptions = multiSiteInfo.isMultiSite
      ? [
          `I was curious how ${companyName} is comparing electricity across those locations.`,
          `I wanted to understand whether a few ${companyName} locations are carrying more of the bill than the rest.`,
          `I was curious how ${companyName} is keeping track of the higher-cost locations.`,
        ]
      : [
          `I caught the update about ${companyName} online.`,
          `I was curious what is driving the bill at ${companyName}.`,
          `I was curious about what is driving the bill at ${companyName}.`,
        ]
    const observationalOpener = observationalOpenerOptions[hashString(variantSeed) % observationalOpenerOptions.length]

    fullTrack = `${observationalOpener} ${forensicObservation} ${question}`
  } else {
    // Signal-led flow
    fullTrack = `${opener} ${forensicObservation} ${question}`
  }

  return simplifyTalkTrackLanguage(fullTrack.replace(/\s+/g, ' ').trim())
}

function extractHtmlAttribute(tag: string, attribute: string) {
  const match = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)
  return match ? decodeHtmlEntities(match[1]) : ''
}

function extractMetaContent(html: string, names: string[]) {
  for (const name of names) {
    const metaRegex = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i')
    const match = metaRegex.exec(html)
    if (!match) continue
    const content = extractHtmlAttribute(match[0], 'content')
    if (content) return cleanText(content)
  }
  return ''
}

function extractTitle(html: string) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match ? stripXml(match[1]) : ''
}

function extractTimeDatetime(html: string) {
  const match = /<time\b[^>]*datetime\s*=\s*["']([^"']+)["'][^>]*>/i.exec(html)
  return match ? cleanText(decodeHtmlEntities(match[1])) : ''
}

function extractDateFromUrl(url: string) {
  const raw = cleanText(url)
  if (!raw) return ''

  const patterns = [
    /(?:^|[\/_-])(20\d{2})[\/_-](0[1-9]|1[0-2])[\/_-](0[1-9]|[12]\d|3[01])(?:[\/?#._-]|$)/,
    /(?:^|[\/_-])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[\/?#._-]|$)/,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(raw)
    if (!match) continue
    const year = match[1]
    const month = match[2]
    const day = match[3]
    const parsed = new Date(`${year}-${month}-${day}T12:00:00Z`)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }

  return ''
}

function extractBodyText(html: string) {
  return cleanText(
    String(html || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
}

const LOW_QUALITY_LISTING_PATTERNS = [
  /for sale/i,
  /inventory/i,
  /pre[-\s]?owned/i,
  /\bused\b/i,
  /cars?,\s*trucks?,\s*&?\s*suvs?/i,
  /\bvehicles?\b/i,
  /dealership/i,
  /browse inventory/i,
  /view inventory/i,
  /search inventory/i,
  /\bshop\b/i,
  /catalog/i,
  /online store/i,
  /\bprice\b/i,
  /\bmileage\b/i,
  /new and used/i,
  /showroom/i,
  /product listing/i,
  /\bproducts?\b/i,
]

const OFFICIAL_ANNOUNCEMENT_PATTERNS = [
  /newsroom/i,
  /press[-\s]?release/i,
  /announcement/i,
  /announcements/i,
  /investor/i,
  /media/i,
  /news/i,
  /blog/i,
  /story/i,
  /release/i,
]

function countMatchingPatterns(value: string, patterns: RegExp[]) {
  const text = cleanText(value)
  if (!text) return 0
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0)
}

function looksLikeCommercialListingPage(title: string, snippet: string, bodyText: string, url: string) {
  const combined = [title, snippet, bodyText, url].join(' ')
  const lower = combined.toLowerCase()
  const listingHits = countMatchingPatterns(combined, LOW_QUALITY_LISTING_PATTERNS)
  const officialHits = countMatchingPatterns(combined, OFFICIAL_ANNOUNCEMENT_PATTERNS)

  if (officialHits > 0) return false
  if (/\/(inventory|vehicle|vehicles|cars|trucks|suvs|used-cars|new-cars|pre-owned|shop|store|catalog)\b/i.test(lower)) return true
  return listingHits >= 2
}

function extractPagePreview(html: string, fallbackTitle: string, url: string, sourceKind: ResearchSourceKind) {
  const title = cleanText(
    extractMetaContent(html, ['og:title', 'twitter:title']) ||
    extractTitle(html) ||
    fallbackTitle ||
    url
  )
  const description = cleanText(
    extractMetaContent(html, ['og:description', 'description', 'twitter:description'])
  )
  const publishedAtRaw = cleanText(
    extractMetaContent(html, ['article:published_time', 'article:modified_time', 'og:updated_time', 'pubdate', 'date']) ||
    extractTimeDatetime(html) ||
    extractDateFromUrl(url)
  )

  const bodyText = extractBodyText(html)
  if (sourceKind === 'linkedin' && /(sign in|join linkedin|authwall|create account)/i.test(bodyText)) {
    return null
  }

  if (sourceKind !== 'sec' && isLikelyNonEnglishText(title, description, bodyText)) {
    return null
  }

  if (sourceKind !== 'sec' && looksLikeCommercialListingPage(title, description, bodyText, url)) {
    return null
  }

  const snippet = extractKeywordSnippet(bodyText) || description || bodyText.slice(0, 420) || title

  let publishedAt: string | null = null
  if (publishedAtRaw) {
    const parsed = new Date(publishedAtRaw)
    if (!Number.isNaN(parsed.getTime())) {
      publishedAt = parsed.toISOString()
    }
  }

  return {
    title,
    snippet,
    publishedAt,
    source: getHostname(url) || 'web',
  }
}

async function fetchBingRssHits(
  buckets: Array<{ priority: number; label: string; query: string }>,
  sourceKind: ResearchSourceKind,
  maxItemsPerBucket = 4,
  account?: AccountRow,
) {
  const headers = { 'User-Agent': WEB_USER_AGENT }

  const results = await Promise.all(buckets.map(async (bucket) => {
    const searchUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(bucket.query)}&mkt=en-US&setlang=en-US`
    try {
      const { response, text } = await fetchTextWithTimeout(searchUrl, { headers }, 10000)
      if (!response.ok || !text) return [] as ResearchHit[]
      return parseRssItems(text, bucket, maxItemsPerBucket, 'Bing', sourceKind)
    } catch (error) {
      console.warn('[Intelligence Brief] Bing RSS search failed for bucket:', bucket.label, error)
      return [] as ResearchHit[]
    }
  }))

  return dedupeAndSort(results.flat(), account)
}

async function fetchBingNewsHits(
  buckets: Array<{ priority: number; label: string; query: string }>,
  sourceKind: ResearchSourceKind,
  maxItemsPerBucket = 4,
  account?: AccountRow,
) {
  const headers = { 'User-Agent': WEB_USER_AGENT }

  const results = await Promise.all(buckets.map(async (bucket) => {
    const searchUrl = `https://www.bing.com/news/search?format=rss&q=${encodeURIComponent(bucket.query)}&mkt=en-US&setlang=en-US`
    try {
      const { response, text } = await fetchTextWithTimeout(searchUrl, { headers }, 10000)
      if (!response.ok || !text) return [] as ResearchHit[]
      return parseRssItems(text, bucket, maxItemsPerBucket, 'Bing News', sourceKind)
    } catch (error) {
      console.warn('[Intelligence Brief] Bing News RSS search failed for bucket:', bucket.label, error)
      return [] as ResearchHit[]
    }
  }))

  return dedupeAndSort(results.flat(), account)
}

async function fetchPageHit(url: string, bucket: { priority: number; label: string; query: string }, sourceKind: ResearchSourceKind, titleFallback: string) {
  const headers = {
    'User-Agent': sourceKind === 'sec' ? WEB_USER_AGENT : WEB_USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
  }

  const { response, text } = await fetchTextWithTimeout(url, { headers }, 12000)
  if (!response.ok || !text) return null

  const preview = extractPagePreview(text, titleFallback, response.url || url, sourceKind)
  if (!preview) return null

  return {
    priority: bucket.priority,
    label: bucket.label,
    query: bucket.query,
    title: preview.title,
    url: response.url || url,
    snippet: preview.snippet,
    publishedAt: preview.publishedAt,
    source: preview.source,
    sourceKind,
  } satisfies ResearchHit
}

type SecTickerEntry = {
  cik: string
  ticker: string
  title: string
}

let secTickerCache: Promise<SecTickerEntry[]> | null = null

function normalizeEntityName(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(the|incorporated|inc|corporation|corp|company|co|limited|ltd|llc|lp|holdings?|group)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreEntityMatch(left: string, right: string) {
  if (!left || !right) return 0
  if (left === right) return 100
  if (left.includes(right) || right.includes(left)) return 85

  const leftTokens = new Set(left.split(' ').filter(Boolean))
  const rightTokens = right.split(' ').filter(Boolean)
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length
  if (overlap >= 3) return 70 + overlap * 4
  if (overlap === 2) return 60
  if (overlap === 1) return 35
  return 0
}

async function loadSecCompanyTickers() {
  if (!secTickerCache) {
    secTickerCache = (async () => {
      const { response, text } = await fetchTextWithTimeout('https://www.sec.gov/files/company_tickers.json', {
        headers: { 'User-Agent': WEB_USER_AGENT },
      }, 15000)

      if (!response.ok || !text) {
        return []
      }

      const parsed = JSON.parse(text)
      const entries = Array.isArray(parsed) ? parsed : Object.values(parsed)
      return entries
        .map((entry: any) => ({
          cik: String(entry?.cik_str ?? entry?.cik ?? '').trim().padStart(10, '0'),
          ticker: cleanText(entry?.ticker),
          title: cleanText(entry?.title || entry?.name),
        }))
        .filter((entry: SecTickerEntry) => entry.cik && entry.title)
    })().catch((error) => {
      console.warn('[Intelligence Brief] SEC ticker lookup failed:', error)
      return []
    })
  }

  return secTickerCache
}

function findBestSecMatch(account: AccountRow, entries: SecTickerEntry[]) {
  const accountName = normalizeEntityName(account.name || '')
  if (!accountName) return null

  const ranked = entries
    .map((entry) => ({
      entry,
      score: scoreEntityMatch(accountName, normalizeEntityName(entry.title)),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best || best.score < 60) return null
  return best.entry
}

function buildSecFilingUrl(cik: string, accessionNumber: string, primaryDocument?: string | null) {
  const normalizedCik = String(Number(cik)).trim()
  const accessionPath = String(accessionNumber || '').replace(/-/g, '')
  if (!normalizedCik || !accessionPath) return ''
  if (!primaryDocument) {
    return `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${accessionPath}/${accessionPath}-index.html`
  }
  return `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${accessionPath}/${primaryDocument}`
}

async function fetchSecFilingHits(account: AccountRow) {
  const tickers = await loadSecCompanyTickers()
  const match = findBestSecMatch(account, tickers)
  if (!match) return [] as ResearchHit[]

  const { response, text } = await fetchTextWithTimeout(`https://data.sec.gov/submissions/CIK${match.cik}.json`, {
    headers: { 'User-Agent': WEB_USER_AGENT },
  }, 15000)

  if (!response.ok || !text) return [] as ResearchHit[]

  let payload: any
  try {
    payload = JSON.parse(text)
  } catch (error) {
    console.warn('[Intelligence Brief] SEC submissions JSON parse failed:', error)
    return [] as ResearchHit[]
  }
  const recent = payload?.filings?.recent
  if (!recent?.form?.length) return [] as ResearchHit[]

  const cutoffMs = Date.now() - (SEC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const filings = recent.form
    .map((form: string, index: number) => ({
      form: String(form || '').toUpperCase(),
      filingDate: recent.filingDate?.[index] || '',
      accessionNumber: recent.accessionNumber?.[index] || '',
      primaryDocument: recent.primaryDocument?.[index] || '',
      primaryDocDescription: recent.primaryDocDescription?.[index] || '',
      reportDate: recent.reportDate?.[index] || '',
    }))
    .filter((filing: any) => SEC_FILING_FORMS.has(filing.form) && filing.filingDate)
    .filter((filing: any) => {
      const parsed = new Date(filing.filingDate)
      return !Number.isNaN(parsed.getTime()) && parsed.getTime() >= cutoffMs
    })
    .sort((a: any, b: any) => String(b.filingDate).localeCompare(String(a.filingDate)))
    .slice(0, 5)

  const candidates = await Promise.all(filings.map(async (filing: any) => {
    try {
      const filingUrl = buildSecFilingUrl(match.cik, filing.accessionNumber, filing.primaryDocument)
      if (!filingUrl) return null

      const bucket = {
        priority: inferSignalPriority(`${filing.form} ${filing.primaryDocDescription || ''} ${filing.primaryDocument || ''}`, 1),
        label: `SEC ${filing.form}`,
        query: `SEC filing ${match.title}`,
      }

      const hit = await fetchPageHit(filingUrl, bucket, 'sec', `${filing.form} filing`)
      if (!hit) return null

      const combinedText = `${hit.title} ${hit.snippet} ${filing.primaryDocDescription || ''}`
      return {
        ...hit,
        priority: inferSignalPriority(combinedText, hit.priority),
        title: `${filing.form} filing - ${match.title}`,
        snippet: hit.snippet || filing.primaryDocDescription || '',
        source: 'SEC EDGAR',
      } satisfies ResearchHit
    } catch (error) {
      console.warn('[Intelligence Brief] SEC filing fetch failed:', error)
      return null
    }
  }))

  return dedupeAndSort(candidates.filter(Boolean) as ResearchHit[], account)
}

async function fetchSecSearchHits(account: AccountRow) {
  return fetchBingRssHits(buildSecBuckets(account).slice(0, 4), 'sec', 3, account)
}

async function fetchLinkedInHits(account: AccountRow) {
  const hits: ResearchHit[] = []
  const directLinkedInUrl = cleanText(account.linkedin_url)

  if (directLinkedInUrl) {
    try {
      const directBucket = {
        priority: 3,
        label: 'LinkedIn Company Page',
        query: directLinkedInUrl,
      }
      const directHit = await fetchPageHit(directLinkedInUrl, directBucket, 'linkedin', `${account.name || 'LinkedIn'} page`)
      if (directHit) {
        hits.push(directHit)
      }
    } catch (error) {
      console.warn('[Intelligence Brief] LinkedIn direct page fetch failed:', error)
    }
  }

  const searchHits = await fetchBingRssHits(buildLinkedInBuckets(account), 'linkedin', 3, account)
  hits.push(...searchHits)
  return dedupeAndSort(hits, account)
}

async function fetchGeneralWebHits(account: AccountRow, hierarchyContext: HierarchyResearchContext | null = null) {
  return fetchBingRssHits(buildSearchBuckets(account, true, hierarchyContext), 'web', 4, account)
}

async function fetchHierarchyWebsiteHits(hierarchyContext: HierarchyResearchContext | null) {
  if (!hierarchyContext) return [] as ResearchHit[]

  const targets = [
    hierarchyContext.parent ? {
      url: hierarchyContext.parent.website,
      label: 'Parent company website',
      title: `${hierarchyContext.parent.name} website`,
      query: `${hierarchyContext.parent.name} parent company`,
    } : null,
    ...hierarchyContext.subsidiaries.slice(0, 3).map((item) => ({
      url: item.website,
      label: 'Subsidiary website',
      title: `${item.name} website`,
      query: `${item.name} subsidiary company`,
    })),
  ]
    .filter((item): item is { url: string | null; label: string; title: string; query: string } => Boolean(item?.url))

  const hits = await Promise.all(targets.map(async (target) => {
    try {
      return await fetchPageHit(
        target.url || '',
        { priority: 8, label: target.label, query: target.query },
        'web',
        target.title,
      )
    } catch (error) {
      console.warn('[Intelligence Brief] Related website fetch failed:', target.url, error)
      return null
    }
  }))

  return hits.filter(Boolean) as ResearchHit[]
}

async function collectResearchCandidates(account: AccountRow, hierarchyContext: HierarchyResearchContext | null = null) {
  const buckets = buildSearchBuckets(account, false, hierarchyContext)
  const settled = (await Promise.allSettled([
    (async () => {
      const rssResults = await Promise.all(buckets.map(async (bucket) => {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(bucket.query)}&hl=en-US&gl=US&ceid=US:en`
        try {
          const { response, text } = await fetchTextWithTimeout(url, { headers: { 'User-Agent': WEB_USER_AGENT } }, 12000)
          if (!response.ok || !text) return [] as ResearchHit[]
          return parseRssItems(text, bucket, 3, 'Google News', 'news')
        } catch (error) {
          console.warn('[Intelligence Brief] RSS fetch failed for bucket:', bucket.label, error)
          return [] as ResearchHit[]
        }
      }))
      return dedupeAndSort(rssResults.flat(), account)
    })(),
    fetchBingNewsHits(buckets, 'news', 4, account),
    fetchGeneralWebHits(account, hierarchyContext),
    fetchLinkedInHits(account),
    fetchSecSearchHits(account),
    fetchSecFilingHits(account),
  ])) as PromiseSettledResult<ResearchHit[]>[]

  const [newsHits, bingNewsHits, webHits, linkedInHits, secSearchHits, secFilingHits] = settled.map((result: PromiseSettledResult<ResearchHit[]>) => (
    result.status === 'fulfilled' ? result.value : []
  )) as [ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[]]

  return dedupeAndSort([...newsHits, ...bingNewsHits, ...webHits, ...linkedInHits, ...secSearchHits, ...secFilingHits], account)
}

function serializeAccount(account: AccountRow) {
  return {
    id: account.id,
    intelligenceBriefHeadline: account.intelligence_brief_headline || null,
    intelligenceBriefDetail: account.intelligence_brief_detail || null,
    intelligenceBriefTalkTrack: account.intelligence_brief_talk_track || null,
    intelligenceBriefSignalDate: account.intelligence_brief_signal_date || null,
    intelligenceBriefReportedAt: account.intelligence_brief_reported_at || null,
    intelligenceBriefSourceUrl: account.intelligence_brief_source_url || null,
    intelligenceBriefConfidenceLevel: account.intelligence_brief_confidence_level || null,
    intelligenceBriefLastRefreshedAt: account.intelligence_brief_last_refreshed_at || null,
    intelligenceBriefStatus: (account.intelligence_brief_status || 'idle') as BriefStatus,
  }
}

function validateBriefResult(result: BriefResult, candidate: ResearchHit | null, account: AccountRow) {
  const usable = Boolean(result?.usable_signal)
  const headline = cleanText(result?.signal_headline)
  const detail = cleanText(result?.signal_detail)
  const talkTrack = simplifyTalkTrackLanguage(cleanText(result?.talk_track))
  const candidateUrl = cleanText(candidate?.url)
  const resultUrl = cleanText(result?.source_url)
  const sourceUrl = !isLikelyBadSourceUrl(candidateUrl)
    ? candidateUrl
    : !isLikelyBadSourceUrl(resultUrl)
      ? resultUrl
      : ''
  const signalDate = formatDateForDb(result?.signal_date, candidate?.publishedAt || null)
  const sourceDate = formatDateForDb(result?.source_date, candidate?.publishedAt || null)
  const confidence = toTitleCase(cleanText(result?.confidence_level))

  if (!usable || !headline || !detail || !talkTrack || !sourceUrl || !signalDate) {
    return null
  }

  if (isLikelyNonEnglishText(headline, detail, talkTrack, sourceUrl, result?.source_title || '', result?.source_domain || '')) {
    return null
  }

  const sourceHost = getHostname(sourceUrl)
  const sourceIsSec = sourceHost === 'sec.gov' || sourceHost.endsWith('.sec.gov')
  const candidateText = `${candidate?.title || ''} ${candidate?.snippet || ''}`
  const outputText = `${headline} ${detail} ${talkTrack}`
  if (/\b(sec filing|filing tied|filing about|recent filing|public filing)\b/i.test(talkTrack) && !sourceIsSec) {
    return null
  }
  if (/\b(acquisition|acquired|merger|buyout|takeover|ownership change|new owner|new ownership|inherited)\b/i.test(outputText) && !hasAcquisitionEvidence(candidateText)) {
    return null
  }
  if (candidate?.priority === 2 && !isTexasRelevantLocationSignal(`${candidate?.title || ''} ${candidate?.snippet || ''} ${detail} ${talkTrack}`)) {
    return null
  }
  if (!isTexasRelevantLocationSignal(`${candidate?.title || ''} ${candidate?.snippet || ''} ${detail}`) && /\b(move-?in|new site|new location|new store|opening soon|opening|launching|launches)\b/i.test(talkTrack)) {
    return null
  }

  // Validate talk track length (20-200 words)
  const talkTrackWordCount = talkTrack.split(/\s+/).filter(Boolean).length
  if (talkTrackWordCount < 20 || talkTrackWordCount > 200) {
    return null
  }

  // Boost confidence for high-quality official sources
  let finalConfidence = confidence || 'Medium'
  if (candidate && isOfficialCompanyAnnouncement(account, candidate)) {
    if (finalConfidence === 'Low') finalConfidence = 'Medium'
    if (finalConfidence === 'Medium') finalConfidence = 'High'
  }

  return {
    signal_headline: headline,
    signal_detail: detail,
    talk_track: talkTrack,
    signal_date: signalDate,
    source_date: sourceDate,
    source_url: sourceUrl,
    confidence_level: finalConfidence,
    selected_priority: candidate?.priority ?? result?.selected_priority ?? 0,
    source_title: candidate?.title || result?.source_title || '',
    source_domain: candidate?.source || result?.source_domain || '',
  }
}

function buildRescueBrief(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext): NonNullable<ReturnType<typeof validateBriefResult>> | null {
  const companyName = cleanText(account.name) || 'the company'
  const signalAnchor = deriveSignalAnchor(account, candidate)
  const sourceUrl = candidate?.url && !isLikelyBadSourceUrl(candidate.url)
    ? candidate.url
    : cleanText(account.domain)
      ? `https://${cleanText(account.domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '')}`
      : ''

  if (!sourceUrl) return null

  const signalDate = formatDateForDb(candidate?.publishedAt || null, candidate?.publishedAt || null) || new Date().toISOString().slice(0, 10)
  const sourceDate = formatDateForDb(candidate?.publishedAt || null, candidate?.publishedAt || null) || signalDate
  const snippet = isLikelyNonEnglishText(candidate?.snippet || '') ? '' : cleanText(candidate?.snippet || '')
  const headline = (isLikelyNonEnglishText(candidate?.title || '') ? '' : cleanText(candidate?.title || '')) || `${companyName} update`
  const detailParts = [
    snippet || `I saw an update about ${companyName}.`,
  ]
  const talkTrack = buildManualTalkTrack(account, candidate, context, 0)

  return {
    signal_headline: shortenText(headline, 120),
    signal_detail: detailParts.join(' '),
    talk_track: talkTrack,
    signal_date: signalDate,
    source_date: sourceDate,
    source_url: sourceUrl,
    confidence_level: candidate?.sourceKind === 'sec' ? 'Medium' : 'Low',
    selected_priority: candidate?.priority ?? 9,
    source_title: candidate?.title || '',
    source_domain: candidate?.source || '',
  }
}

async function fetchCompanyWebsiteInfo(account: AccountRow): Promise<ResearchHit | null> {
  const domain = cleanText(account.domain)
  if (!domain) return null

  try {
    const url = domain.startsWith('http') ? domain : `https://${domain}`
    const bucket = {
      priority: 8,
      label: 'Company Website',
      query: `${account.name} company information`,
    }
    
    const hit = await fetchPageHit(url, bucket, 'web', `${account.name} website`)
    return hit
  } catch (error) {
    console.warn('[Intelligence Brief] Company website fetch failed:', error)
    return null
  }
}

function buildCompanyProfileFallbackHit(account: AccountRow): ResearchHit | null {
  const domain = cleanText(account.domain)
  const description = cleanText(account.description)

  if (!domain && !description) return null

  const url = domain
    ? (domain.startsWith('http') ? domain : `https://${domain.replace(/^www\./i, '')}`)
    : ''

  return {
    priority: 8,
    label: 'Company Profile',
    query: `${cleanText(account.name) || 'company'} profile`,
    title: `${cleanText(account.name) || 'Company'} profile`,
    url,
    snippet: description || `Public company information for ${cleanText(account.name) || 'this business'}.`,
    publishedAt: new Date().toISOString().slice(0, 10),
    source: domain ? getHostname(url) || domain.replace(/^https?:\/\//i, '') : 'company profile',
    sourceKind: 'web',
  }
}

async function fetchIndustryTrends(account: AccountRow): Promise<ResearchHit[]> {
  const industry = cleanText(account.industry)
  if (!industry) return []

  const trendBuckets = [
    {
      priority: 9,
      label: 'Industry Trends',
      query: `${industry} Texas ERCOT commercial energy demand expansion facilities hiring transmission`,
    },
  ]

  try {
    return await fetchBingNewsHits(trendBuckets, 'news', 3, account)
  } catch (error) {
    console.warn('[Intelligence Brief] Industry trends fetch failed:', error)
    return []
  }
}

async function runOpenRouterResearch(
  account: AccountRow,
  candidates: ResearchHit[],
  isFallbackMode = false,
  hierarchyContext: HierarchyResearchContext | null = null,
  hierarchyWebsiteHits: ResearchHit[] = [],
  audienceProfile: AudienceProfile | null = null,
) {
  const openRouterKey = process.env.OPEN_ROUTER_API_KEY
  if (!openRouterKey) {
    throw new Error('OPEN_ROUTER_API_KEY is not configured')
  }

  const selectedCandidates = candidates.slice(0, 16)
  const primaryCandidate = selectedCandidates[0] || null
  const talkTrackContext = buildTalkTrackContext(account, primaryCandidate, isFallbackMode, audienceProfile)
  const talkTrackContextJson = JSON.stringify(talkTrackContext, null, 2)
  const identityProfile = getAccountIdentityProfile(account, primaryCandidate)
  const researchPayload = {
    current_date: new Date().toISOString().slice(0, 10),
    account: {
      name: account.name || '',
      industry: account.industry || '',
      domain: account.domain || '',
      linkedin_url: account.linkedin_url || '',
      city: account.city || '',
      state: account.state || '',
      employees: account.employees || null,
      revenue: account.revenue || '',
      description: account.description || '',
      annual_usage: account.annual_usage || '',
    },
    audience_profile: audienceProfile ? {
      source: audienceProfile.source,
      source_label: audienceProfile.sourceLabel,
      name: audienceProfile.contactName,
      first_name: audienceProfile.contactFirstName,
      title: audienceProfile.contactTitle,
      company_name: audienceProfile.companyName,
      industry: audienceProfile.industry,
      role_family: audienceProfile.roleFamily,
      role_summary: audienceProfile.roleSummary,
      care_abouts: audienceProfile.careAbouts,
      opener_hint: audienceProfile.openerHint,
      question_hint: audienceProfile.questionHint,
      background_signals: audienceProfile.backgroundSignals,
      evidence: audienceProfile.evidence,
      guardrails: audienceProfile.guardrails,
      linked_in_url: audienceProfile.linkedInUrl,
    } : null,
    identity_profile: identityProfile ? {
      industry_cluster: identityProfile.industryCluster,
      company_type: identityProfile.companyType,
      operating_model: identityProfile.operatingModel,
      facility_type: identityProfile.facilityType,
      identity_keywords: identityProfile.identityKeywords,
      power_keywords: identityProfile.powerKeywords,
      talk_track_guardrails: identityProfile.talkTrackGuardrails,
      confidence: identityProfile.confidence,
      evidence: identityProfile.evidence,
    } : null,
    hierarchy_context: hierarchyContext ? {
      organization_role: hierarchyContext.organizationRole,
      hierarchy_summary: hierarchyContext.hierarchySummary,
      parent: hierarchyContext.parent ? {
        name: hierarchyContext.parent.name,
        website: hierarchyContext.parent.website,
        description: hierarchyContext.parent.description,
        city: hierarchyContext.parent.city,
        state: hierarchyContext.parent.state,
      } : null,
      subsidiaries: hierarchyContext.subsidiaries.slice(0, 6).map((item) => ({
        name: item.name,
        website: item.website,
        description: item.description,
        city: item.city,
        state: item.state,
      })),
      related_links: hierarchyContext.relatedLinks,
      related_facts: hierarchyContext.relatedFacts,
    } : null,
    priorities: [
      '1. Recent acquisitions or being acquired (last 24 months)',
      '2. New facility openings, lease signings, or construction announcements in Texas',
      '3. Executive leadership changes — new CFO, COO, VP of Finance, Facilities Director, or Energy Manager',
      '4. Announced expansions, capital expenditure projects, or headcount growth',
      '5. Restructurings, plant closures, or consolidations that would change energy load',
      '6. Public contract awards, government contracts, or major new customer wins',
      '7. Funding rounds or IPO activity for private companies',
    ],
    talk_track_context: talkTrackContext,
    research_results: selectedCandidates.map((item) => ({
      priority: item.priority,
      bucket: item.label,
      title: isLikelyNonEnglishText(item.title) ? `${cleanText(account.name) || 'Company'} update` : item.title,
      url: item.url,
      snippet: isLikelyNonEnglishText(item.snippet) ? '' : item.snippet,
      published_at: item.publishedAt,
      source: item.source,
      source_kind: item.sourceKind,
      source_trust: getSourceTrustRank(account, item),
      official_source: isOfficialCompanyAnnouncement(account, item),
    })),
    related_entity_research: hierarchyWebsiteHits.slice(0, 6).map((item) => ({
      label: item.label,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      source: item.source,
    })),
  }
  const audienceProfileBlock = buildAudienceProfileBlock(audienceProfile)

  const basePrompt = `You are writing an Intelligence Brief for Nodal Point, a Texas commercial energy broker.

Use ONLY the research payload below. It may include Google News, broad web search, LinkedIn company pages/posts, SEC filings, and official company pages. Do not invent facts. Do not mention that you searched or mention LinkedIn, Google, RSS, SEC, or any source platform in the final output.
If a research result has "official_source": true, treat it as the source of record and prefer its date over a republished article when both are available for the same event.`

  const newsSignalPrompt = `${basePrompt}

Decision rules:
- Pick ONE signal only.
- Use the highest-priority signal supported by the research results.
- If the payload includes an identity_profile block, use it as the operating identity guardrail for the account unless the research clearly proves it wrong.
- If an audience_profile block is present, use it as the human lens for the talk track. Use the person's first name once if it improves the opener, and use the title to decide what they actually care about. Treat LinkedIn/about/work-history clues as internal only.
- If the payload includes a hierarchy_context block, use it to understand the parent/subsidiary structure and related websites, but keep the operating company as the center of the brief unless the account itself is the parent.
- Related parent/subsidiary websites are context, not automatic signals. Do not turn a parent-only article into the operating company's headline unless the operating company is clearly named or the account itself is the parent entity.
- If related_entity_research is present, use it to validate what the company actually is and how the linked businesses describe themselves. It is support context, not a free pass to invent a parent-level event.
- If a SEC filing, official company page, company newsroom page, or press-release wire result confirms the same event, prefer it over a republished news story or generic web snippet.
- If both a republished article and an original company announcement are available, use the original announcement date when you can verify it from the source. Do not invent an earlier date.
- Only use an acquisition/ownership signal when the source explicitly says the business was acquired, sold, merged, or taken over. Company history pages and family-origin stories are not acquisition signals.
- Only use a leadership-change signal when the source names a real person or role change. If you cannot name who changed roles and roughly when it happened, do not use the leadership angle.
- Compare the current date to the source date. If the source says a location is already open, already moved in, or already serving customers, write it that way. If it is still upcoming, keep it future tense.
- For new-location signals, only use the opening as a sales angle if the location is in Texas or the source clearly says the area is deregulated / competitive. If it is outside Texas and not clearly a deregulated market, do not use the move-in angle.
- If it is an out-of-state opening, do not use new_location at all. Fall back to industry_context or a different signal.
- For hotel, resort, restaurant, venue, or clinic openings, stay on the opening itself. Do not pivot into side hires like chef appointments unless the hire is the actual signal. Name the property and the city in the first sentence if you can.
- If there is no clear, usable signal, set "usable_signal" to false and leave the other fields empty.
- Signal Detail must be 2 to 4 sentences.
- Talk Track must be UNIQUE to the specific signal found. Do NOT use generic templates.
- Talk Track should sound like a real person who actually researched this company, not a script.
- Talk Track must be 2-4 short sentences maximum. Use conversational language.
- If the signal comes from a filing, translate it into plain English. Do not assume the rep knows SEC jargon. Say "public company report" or explain what changed in everyday words.
- Do not use the word "filing" in the talk track unless there is no clearer way to say it.
- Do not use ownership-change language unless the source clearly shows a real transaction. A family history page is not an acquisition.
- When a location is already open, write in the past tense or present perfect. Do not talk as if the move is still pending.
- If the opening is outside Texas, do not build the talk track around move-in timing or new-site planning. Use a different angle.
- Talk Track should make the prospect THINK about their specific situation, not pitch at them.
- Use plain language. Avoid corporate fluff.
- Pick ONE dominant angle per talk track. Do not stack signal + market + industry in the same response.
- Load is one angle, not the default angle. Use it only when the account is operationally heavy or the research result clearly points to load, production, refrigeration, or 24/7 usage.
- For office, dental, medical, retail, restaurant, and other low-intensity accounts, prefer budget predictability, seasonal volatility, comfort, lease timing, billing clarity, or ERCOT price exposure.
- For dental groups, use practice and office language: operatories, imaging, sterilization, hygiene cadence, patient flow, and front-desk timing. Do not use hospital, emergency department, inpatient, or short-stay-room language unless the source explicitly confirms a hospital or surgery-center setting.
- Use the market season fields in talk_track_context to decide whether summer volatility, winter reliability, or a shoulder-season budget reset is the better lead. Keep the market note to one short clause or one short sentence.
- Use human source language in the opener, but complete the thought. Do not write "I saw a report about [company]" and then move on. Name the actual event in the same sentence, like "I saw the report that Lambda is moving into Aligned's DFW-04 data center in Plano."
- If you cannot name the actual event, do not force a news-style opener. Use a plain website or company update opener instead.
- Write in English only. If any source text is not English, ignore it and do not echo it back.
- Confidence Level must be exactly High, Medium, or Low.
- Source URL must be one of the supplied URLs.
- Signal Date should be the event or article date in YYYY-MM-DD if available; otherwise use the closest approximate date from the research results.
- Source Date should be the publication date of the report, article, post, filing, or company announcement in YYYY-MM-DD if available; otherwise use the closest approximate published date from the research results.
- Use the talk_track_context block below as the real sales angle. It already tells you the signal family, the ERCOT angle, the operating context, the opening style, and the question to ask.
- Start with a direct observation about the event and why it matters for operations. Do not open like a support ticket or ask if the person is "responsible" for electricity.
- Rotate the first sentence shape. Do not always open the same way.
- Make the talk track specific to the signal and the industry, not just the company name.
- Do not mention an industry that is not the account's actual industry. If you use an industry reference, it must match the account.
- Respect the identity profile keywords and guardrails. If the identity profile says hospital operator, do not drift into hotel or hospitality language. If it says food manufacturer, do not drift into warehouse language.
- If an audience profile is present, do not blend a decision-maker card and a sequence contact into one voice. The sequence contact wins when there is a mismatch.
- Respect the hierarchy context. If the account is a subsidiary, write the brief around the subsidiary's actual business and use the parent only to orient the reader. If the account is a parent company, it is fine to mention the portfolio or network, but keep the talk track meter-specific and location-aware.
- If the company description or source text names specific products or services, use those exact nouns in the first sentence when they matter. Do not replace them with generic words like "operation" or "footprint."
- Do not imply the electricity agreement creates demand spikes. Spikes come from how the site is being used; contract structure only changes how those spikes show up on the bill.
- Do not echo page titles, inventory copy, catalog language, or storefront language back into the talk track.
- Avoid the phrases listed in talk_track_context. If the response starts sounding generic, rewrite it.
- If market context is secondary, keep it to one short clause or leave it out.
- If an audience profile is present, make the talk track feel aimed at that person, not just the company. Mention the first name once if it sounds natural and helps the opening.

Talk Track angle selection (choose ONE based on the actual signal):

IF SIGNAL = New location/facility/expansion:
- Focus on timing and planning ahead, not reactive decisions
- Question: Are they thinking about the electricity setup NOW or waiting until they move in?
- Example: "I saw the report that your new location in [city] opened. Most companies wait until they're in the building to think about the electricity setup, and by then they're reacting instead of planning. Is the power side already lined up, or is that still getting sorted out?"

IF SIGNAL = Acquisition/merger/being acquired:
- Focus on inherited agreements and hidden exposure
- Question: Do they know what they're inheriting on the electricity side?
- Example: "I saw [company] was acquired by [acquirer]. Usually when that happens, the electricity agreements get inherited without much review, and sometimes there's exposure nobody caught. Have you guys looked at what you're actually taking on, or is that still being sorted out?"

IF SIGNAL = Leadership change (CFO, COO, Facilities Director):
- Focus on inherited problems and fresh-eyes review
- The talk track MUST name the person and role from the source. If the source does not name them, this is not a leadership signal.
- Question: Is the new person aware of what they inherited?
- Example: "I saw [name] just joined as CFO. Usually when someone new comes in, they inherit the electricity setup without realizing what's actually in there. Has [name] had a chance to review that side yet, or is it still on the list?"

IF SIGNAL = Funding round/IPO/capital raise:
- Focus on budget scrutiny and cost visibility before scaling
- Question: Are they tightening up costs before the next growth phase?
- Example: "I saw you guys just closed a Series B. If that capital is going toward a new facility or a bigger production ramp, the thing I'd want to understand is how the power side is being mapped against that buildout. Has that been reviewed yet, or is it still getting sorted out?"

IF SIGNAL = Contract win/new customer/major project:
- Focus on load increase and whether current agreement can handle it
- Question: Will the power plan handle the new load without surprises?
- Example: "I saw you landed the [customer/project] contract. That's going to change your load pretty significantly. Have you looked at whether the power plan can handle that without creating surprises, or is that still down the road?"

IF SIGNAL = Restructuring/closure/consolidation:
- Focus on stranded costs and agreement flexibility
- Question: Are they stuck paying for capacity they no longer need?
- Example: "I saw you're consolidating the [location] facility. Usually when that happens, companies get stuck paying for electricity capacity they don't need anymore. Have you looked at whether you can adjust that, or are you locked in?"

IF SIGNAL = Hiring/headcount growth:
- Focus on operational changes creating cost creep
- Question: Is the electricity side keeping up with the operational changes?
- Example: "I saw you're hiring pretty aggressively right now. Usually when headcount moves like that, the electricity side starts behaving differently than it used to, but nobody notices until the bills start creeping up. Has that been pretty stable for you guys, or are you seeing some movement?"

IF SIGNAL = Technology adoption/digital transformation:
- Focus on new equipment load and whether agreement accounts for it
- Question: Did they factor in the electricity impact of new tech?
- Example: "I saw you're rolling out [technology/system]. Most companies focus on the tech side but don't think about what that does to the electricity load until it's already running. Did you guys factor that in upfront, or is it still being figured out?"

IF SIGNAL = Industry trend (no specific company news):
- Focus on whether they're ahead of or behind the trend
- Question: Are they thinking about this proactively or waiting?
- Example: "I've been seeing a lot of [industry] companies dealing with [trend]. Some are getting ahead of it, some are waiting to see what happens. Where are you guys on that — already thinking about it, or is it not urgent yet?"

CRITICAL RULES:
- Do NOT reuse the same angle for different signals
- Do NOT use generic phrases like "structured in a way that doesn't match"
- Each talk track should feel like it was written specifically for THIS signal
- The question should be directly tied to the signal found
- Make it sound like you actually read the news and are curious about their specific situation
- Do NOT pitch Nodal Point. Do NOT explain value. Just get them thinking.`

  const fallbackPrompt = `${basePrompt}

FALLBACK MODE: No recent news signals were found. Generate an intelligence brief based on company website information and industry context.

Decision rules:
- ALWAYS set "usable_signal" to true in fallback mode.
- Create a headline that positions the company within their industry context.
- Signal Detail should describe: company overview (what they do, where they operate, how they use power), any hiring/growth indicators from their website, and relevant industry trends affecting their sector.
- Talk Track must be UNIQUE based on what you learned about the company. Do NOT use templates.
- Talk Track should sound like you actually researched this specific company.
- Talk Track should be 2-4 short sentences maximum. Use conversational language.
- If the source is a filing, translate it into plain English. Do not use SEC jargon unless it makes the sentence clearer.
- Do not use the word "filing" in the talk track unless there is no clearer way to say it.
- Do not use ownership-change language unless the source clearly shows a real transaction. A family history page is not an acquisition.
- When a location is already open, write in the past tense or present perfect. Do not talk as if the move is still pending.
- If the opening is outside Texas, do not build the talk track around move-in timing or new-site planning. Use a different angle.
- If the source is just the company website, do not pretend it is a news event or a footprint change. Use a real business fact from the site and one plain electricity angle.
- For hotel, resort, restaurant, venue, or clinic openings, stay on the opening itself. Do not pivot into side hires like chef appointments unless the hire is the actual signal. Name the property and the city in the first sentence if you can.
- Use plain language. Avoid corporate fluff.
- If the company description or source text names specific products or services, use those exact nouns in the first sentence when they matter. Do not replace them with generic words like "operation" or "footprint."
- Pick ONE dominant angle per talk track. Do not stack market + industry + load all at once.
- Load is one angle, not the default angle. Use it only when the company is operationally heavy or the site clearly depends on production, refrigeration, or 24/7 usage.
- For office, dental, medical, retail, restaurant, and other low-intensity accounts, lead with budget predictability, seasonal volatility, comfort, lease timing, billing clarity, or ERCOT price exposure.
- For dental groups, use practice and office language: operatories, imaging, sterilization, hygiene cadence, patient flow, and front-desk timing. Do not use hospital, emergency department, inpatient, or short-stay-room language unless the source explicitly confirms a hospital or surgery-center setting.
- Use the market season fields in talk_track_context to decide whether summer volatility, winter reliability, or a shoulder-season budget reset should lead. Keep the market note brief if you use it.
- Use human source language in the opener, but complete the thought. Do not write "I saw a report about [company]" and then move on. For website-only fallback, name the actual business fact from the site instead of saying you found the website.
- If the sentence cannot name the event clearly, do not use a report-style opener.
- Write in English only. If any source text is not English, ignore it and do not echo it back.
- If the company site has an announcement or news page, treat that as the original source and use its publish date when available.
- Use short sentences and contractions. Sound plainspoken, not polished.
- Prefer "bill" or "power side" over "utility side".
- Confidence Level should be "Medium" for fallback briefs.
- Source URL should be the company website or the most relevant industry trend article.
- Signal Date should be today's date in YYYY-MM-DD format.
- Source Date should be today's date in YYYY-MM-DD format if you used the company website or trend article, or the page's publish date if the source includes one.
- Use the talk_track_context block below as the real sales angle. If there is no fresh news, lean harder on how the business actually uses power day to day.
- If an audience_profile block is present, use it as the human lens. Keep the first name or title tied to the business question instead of generic company language.
- Start with a direct observation about the business and why it matters for the power side. Do not open like a support ticket or ask if the person is "responsible" for electricity.
- Rotate the first sentence shape. Do not always open with the same setup.
- Make it sound like a plainspoken Texas commercial electricity rep who has done the homework on the business, not a generic broker script.
- Do not mention an industry that is not the account's actual industry. If you use an industry reference, it must match the account.
- Do not imply the electricity agreement creates demand spikes. Spikes come from usage, scheduling, and equipment; the contract only affects the cost exposure.
- Do not echo page titles, inventory copy, catalog language, or storefront language back into the talk track.
- Avoid the phrases listed in talk_track_context. If the response starts sounding generic, rewrite it.
- If market context is secondary, keep it to one short clause or leave it out.

Talk Track angle selection for fallback mode (choose based on what you found):

IF COMPANY = Multi-location/multi-site:
- Focus on whether they look at electricity site-by-site or portfolio-wide
- Example: "I noticed you've got locations across [region]. Most multi-site companies end up looking at electricity one location at a time, which is fine, but sometimes that leaves leverage on the table. Do you guys tend to look at that site by site, or more at the company level?"

IF COMPANY = Actively hiring/growing team:
- Focus on operational changes and whether electricity setup is keeping up
- Example: "I saw you're actively hiring right now. Usually when headcount is moving like that, the electricity side starts behaving differently, but nobody notices until costs start creeping up. Has that been pretty stable for you guys, or are you seeing some movement?"

IF COMPANY = Long-established (20+ years):
- Focus on whether they've reviewed the bill recently or it's just been running
- Example: "I noticed you've been around for [X] years in [city]. Most established companies have electricity agreements that have just been rolling over without much review. When's the last time you guys actually looked at the bill, or has it just been running?"

IF COMPANY = Industry facing digital transformation:
- Focus on new technology load and whether they've thought about electricity impact
- Example: "I've been seeing a lot of [industry] companies adopting [technology trend]. Most are focused on the tech side but don't think about what that does to the electricity load until it's already running. Have you guys factored that in, or is it still being figured out?"

IF COMPANY = Manufacturing/industrial:
- Focus on where the demand spikes are coming from and whether site practices or hardware could smooth them out
- Example: "I work with a lot of [industry] companies in Texas. What's interesting is, even when the rate looks fine, the real issue is usually which processes, schedules, or equipment are creating the demand spikes, and whether there are operational or hardware changes that could smooth them out. Have you guys looked at that side yet, or not really?"

IF COMPANY = Service business (dental, medical, professional services):
- Focus on whether they think about facility costs as much as they help clients
- Example: "I noticed you help clients with [service]. I'm curious — do you feel like your own facility costs are just as dialed in as the work you do for clients, or is that side kind of a different story?"

IF COMPANY = Retail/customer-facing:
- Focus on seasonal swings and budget predictability
- Example: "I work with a lot of retail companies in Texas. Usually the electricity bills swing pretty significantly with the seasons, and sometimes that creates budget surprises. Has that been pretty predictable for you guys, or does it move around more than you'd like?"

IF COMPANY = Small business (under 20 employees):
- Focus on whether anyone is actually reviewing the bills or it's just autopay
- Example: "Most companies your size have electricity on autopay and nobody's really looking at whether the setup makes sense anymore. When's the last time someone actually reviewed that, or has it just been running?"

CRITICAL RULES:
- Do NOT use the same angle for every fallback brief
- Each talk track should feel specific to THIS company and THIS industry
- The question should be directly tied to what you learned about them
- Make it sound like you actually looked at their website and thought about their situation
- Do NOT pitch Nodal Point. Do NOT explain value. Just get them curious about their own situation.
- Vary your language - don't repeat the same phrases across different briefs`

  const prompt = isFallbackMode ? fallbackPrompt : newsSignalPrompt

  const fullPrompt = `${prompt}

Return JSON only with this shape:
{
  "usable_signal": true,
  "signal_headline": "",
  "signal_detail": "",
  "talk_track": "",
  "signal_date": "YYYY-MM-DD",
  "source_date": "YYYY-MM-DD",
  "source_url": "",
  "confidence_level": "High|Medium|Low",
  "selected_priority": 1,
  "source_title": "",
  "source_domain": ""
}

TALK_TRACK_CONTEXT:
${talkTrackContextJson}

${audienceProfileBlock ? `AUDIENCE_PROFILE:\n${audienceProfileBlock}\n` : ''}

RESEARCH PAYLOAD:
${JSON.stringify(researchPayload, null, 2)}`

  const { response, text } = await fetchTextWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterKey}`,
      'HTTP-Referer': process.env.API_BASE_URL || 'https://nodalpoint.io',
      'X-Title': 'Nodal Point Intelligence Brief',
    },
    body: JSON.stringify({
      model: '~google/gemini-flash-latest',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: fullPrompt },
        { role: 'user', content: 'Generate the account intelligence brief now.' },
      ],
      temperature: isFallbackMode ? 0.3 : 0.2,
      max_tokens: 900,
    }),
  }, 25000)

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status} ${text.slice(0, 300)}`)
  }

  const raw = text?.trim()
  if (!raw) {
    throw new Error('OpenRouter returned an empty response')
  }

  let responseBody: any = null
  try {
    responseBody = JSON.parse(raw)
  } catch {
    throw new Error('Could not parse OpenRouter wrapper response as JSON')
  }

  const rawContent = cleanText(responseBody?.choices?.[0]?.message?.content)
  if (!rawContent) {
    throw new Error('OpenRouter returned an empty model response')
  }

  let parsed: BriefResult | null = null
  try {
    parsed = JSON.parse(rawContent) as BriefResult
  } catch {
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1].trim()) as BriefResult
    }
  }

  if (!parsed) {
    throw new Error('Could not parse OpenRouter model response as JSON')
  }

  const bestCandidate = findCandidateForResult(parsed, selectedCandidates)
  const validated = validateBriefResult(parsed, bestCandidate, account)
  return validated
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // GET endpoint for cache stats (admin only)
    if (req.method === 'GET') {
      const auth = await requireUser(req)
      if (!auth.user) {
        return res.status(401).json({ ok: false, message: 'Unauthorized' })
      }

      // Only allow admins to view cache stats
      if (auth.role !== 'admin' && auth.role !== 'super_admin') {
        return res.status(403).json({ ok: false, message: 'Forbidden' })
      }

      return res.status(200).json({
        ok: true,
        cache: {
          size: talkTrackCache.size(),
          maxSize: 500,
          ttlDays: 7,
        },
      })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, message: 'Method not allowed' })
    }

    const auth = await requireUser(req)
    if (!auth.user) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' })
    }

    const accountIdRaw = Array.isArray(req.query.accountId) ? req.query.accountId[0] : req.query.accountId
    const accountId = cleanText(accountIdRaw)

    if (!accountId) {
      return res.status(400).json({ ok: false, message: 'Missing account ID' })
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select(ACCOUNT_SELECT)
      .eq('id', accountId)
      .maybeSingle()

    if (accountError) {
      console.error('[Intelligence Brief] Account fetch failed:', accountError)
      return res.status(200).json({ ok: false, message: FALLBACK_MESSAGE, detail: accountError.message })
    }

    if (!account) {
      return res.status(404).json({ ok: false, message: 'Account not found' })
    }

    const { data: primaryContact } = account.primaryContactId
      ? await supabaseAdmin
        .from('contacts')
        .select('id, firstName, lastName, name, title, email, linkedinUrl, notes, metadata, accountId')
        .eq('id', account.primaryContactId)
        .maybeSingle()
      : { data: null }
    const audienceProfile = buildAudienceProfile(
      primaryContact ? {
        id: primaryContact.id,
        contactId: primaryContact.id,
        name: primaryContact.name || [primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' '),
        firstName: primaryContact.firstName,
        lastName: primaryContact.lastName,
        title: primaryContact.title,
        email: primaryContact.email,
        linkedinUrl: primaryContact.linkedinUrl,
        notes: primaryContact.notes,
        metadata: primaryContact.metadata,
        accountId: primaryContact.accountId,
      } : null,
      {
        name: account.name,
        industry: account.industry,
        description: account.description,
      },
      'account_primary',
    )

    const privileged = auth.isAdmin || auth.role === 'dev'
    const ownerScopeValues = buildOwnerScopeValues(auth.user)
    const accountOwner = cleanText(account.ownerId).toLowerCase()
    const allowed = privileged || !accountOwner || ownerScopeValues.map((value) => value.toLowerCase()).includes(accountOwner)

    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'You do not have access to refresh this account' })
    }

    const lastRefreshAt = account.intelligence_brief_last_refreshed_at
    if (lastRefreshAt && !privileged) {
      const age = Date.now() - new Date(lastRefreshAt).getTime()
      if (Number.isFinite(age) && age < COOLDOWN_MS) {
        const retryAfterMinutes = Math.max(1, Math.ceil((COOLDOWN_MS - age) / (60 * 1000)))
        return res.status(429).json({
          ok: false,
          message: `This account was refreshed recently. Try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`,
          retryAfterMinutes,
          account: serializeAccount(account),
        })
      }
    }

    const hierarchyIds = extractHierarchyIds(account.metadata)
    const relatedIds = [
      hierarchyIds.parentAccountId,
      ...hierarchyIds.subsidiaryAccountIds,
    ].filter(isLikelyUuid)
    const { data: relatedAccounts } = relatedIds.length > 0
      ? await supabaseAdmin
        .from('accounts')
        .select('id, name, domain, website, description, city, state')
        .in('id', relatedIds)
      : { data: [] }
    const hierarchyContext = buildHierarchyResearchContext(account as AccountRow, (relatedAccounts || []) as Array<Partial<AccountRow> & { id: string }>)
    const hierarchyWebsiteHits = await fetchHierarchyWebsiteHits(hierarchyContext)

    const candidateResults = await collectResearchCandidates(account as AccountRow, hierarchyContext)
    const identityProfile = buildStructuredIdentityProfile(account as AccountRow, candidateResults, hierarchyContext, hierarchyWebsiteHits)
    const briefingAccount: AccountRow = identityProfile
      ? {
          ...(account as AccountRow),
          metadata: {
            ...getAccountMetadata(account as AccountRow),
            intelligenceProfile: identityProfile,
          },
        }
      : account as AccountRow
    const diagnostics = buildResearchDiagnostics(candidateResults)
    console.info('[Intelligence Brief] Research candidates collected:', {
      accountId,
      accountName: briefingAccount.name,
      total: diagnostics.total,
      bySourceKind: diagnostics.bySourceKind,
    })

    let outcomeStatus: BriefStatus = 'empty'
    let validated: ReturnType<typeof validateBriefResult> = null
    let generatedBrief: ReturnType<typeof validateBriefResult> = null
    let usedFallback = false
    let rescueCandidates = candidateResults

    if (candidateResults.length > 0) {
      try {
        generatedBrief = await runOpenRouterResearch(briefingAccount, candidateResults, false, hierarchyContext, hierarchyWebsiteHits, audienceProfile)
        if (generatedBrief) {
          outcomeStatus = 'ready'
          validated = generatedBrief
        } else {
          outcomeStatus = 'empty'
        }
      } catch (error) {
        console.error('[Intelligence Brief] OpenRouter research failed:', error)
        outcomeStatus = 'error'
      }
    }

    // Fallback mode: If no news signals found or OpenRouter returned empty, try generating from company website + industry trends
    if (!validated && (candidateResults.length === 0 || outcomeStatus === 'empty')) {
      console.info('[Intelligence Brief] Entering fallback mode - fetching company website and industry trends')
      
      try {
        const fallbackCandidates: ResearchHit[] = []
        
        // Fetch company website
        const websiteInfo = await fetchCompanyWebsiteInfo(briefingAccount)
        if (websiteInfo) {
          fallbackCandidates.push(websiteInfo)
        }
        
        if (fallbackCandidates.length === 0) {
          const profileFallback = buildCompanyProfileFallbackHit(briefingAccount)
          if (profileFallback) {
            fallbackCandidates.push(profileFallback)
          }
        }
        
        // Fetch industry trends
        const industryTrends = await fetchIndustryTrends(briefingAccount)
        fallbackCandidates.push(...industryTrends)
        
        if (fallbackCandidates.length > 0) {
          console.info('[Intelligence Brief] Fallback candidates collected:', {
            accountId,
            accountName: account.name,
            fallbackTotal: fallbackCandidates.length,
          })

          rescueCandidates = dedupeAndSort([...candidateResults, ...fallbackCandidates], account)
          
          generatedBrief = await runOpenRouterResearch(briefingAccount, fallbackCandidates, true, hierarchyContext, hierarchyWebsiteHits, audienceProfile)
          if (generatedBrief) {
            outcomeStatus = 'ready'
            validated = generatedBrief
            usedFallback = true
          }
        }
      } catch (error) {
        console.error('[Intelligence Brief] Fallback mode failed:', error)
        outcomeStatus = 'error'
      }
    }

    if (!validated && rescueCandidates.length > 0) {
      const rescueCandidate = rescueCandidates[0]
      const rescueContext = buildTalkTrackContext(briefingAccount, rescueCandidate, false, audienceProfile)
      const rescueBrief = buildRescueBrief(briefingAccount, rescueCandidate, rescueContext)
      if (rescueBrief) {
        validated = rescueBrief
        generatedBrief = rescueBrief
        outcomeStatus = 'ready'
        console.info('[Intelligence Brief] Using deterministic rescue brief:', {
          accountId,
          accountName: briefingAccount.name,
          candidateTitle: rescueCandidate.title,
          sourceKind: rescueCandidate.sourceKind,
        })
      }
    }

    if (!validated) {
      outcomeStatus = 'empty'
      
      // Even with no signals, generate an AI talk track based on company context
      console.info('[Intelligence Brief] No signals found, generating AI talk track from company context:', {
        accountId,
        accountName: briefingAccount.name,
        industry: briefingAccount.industry,
      })
      
      const fallbackContext = buildTalkTrackContext(briefingAccount, null, true, audienceProfile)
      const aiTalkTrack = await generateAITalkTrack(briefingAccount, null, fallbackContext)
      
      if (aiTalkTrack) {
        // Create a minimal brief with just the AI talk track
        const industryLabel = cleanText(briefingAccount.industry) || 'this business'
        validated = {
          signal_headline: 'Industry Context',
          signal_detail: `No recent news signals found. Generated talk track based on ${industryLabel} industry patterns and electricity usage.`,
          talk_track: aiTalkTrack,
          signal_date: new Date().toISOString().slice(0, 10),
          source_date: new Date().toISOString().slice(0, 10),
          source_url: briefingAccount.domain ? `https://${cleanText(briefingAccount.domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '',
          confidence_level: 'Low',
          selected_priority: 9,
          source_title: 'Industry Context',
          source_domain: briefingAccount.domain || '',
        }
        outcomeStatus = 'ready'
        usedFallback = true
        console.info('[Intelligence Brief] Successfully generated AI talk track for empty signal case:', {
          accountId,
          talkTrackLength: aiTalkTrack.length,
        })
      } else {
        // AI generation failed, use manual template as last resort
        console.warn('[Intelligence Brief] AI talk track generation failed, using manual template fallback:', {
          accountId,
          accountName: briefingAccount.name,
        })
        
        const manualTalkTrack = buildManualTalkTrack(briefingAccount, null, fallbackContext, 0)
        const industryLabel = cleanText(briefingAccount.industry) || 'this business'
        
        validated = {
          signal_headline: 'Industry Context',
          signal_detail: `No recent news signals found. Generated talk track based on ${industryLabel} industry patterns and electricity usage.`,
          talk_track: manualTalkTrack,
          signal_date: new Date().toISOString().slice(0, 10),
          source_date: new Date().toISOString().slice(0, 10),
          source_url: briefingAccount.domain ? `https://${cleanText(briefingAccount.domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '',
          confidence_level: 'Low',
          selected_priority: 9,
          source_title: 'Industry Context',
          source_domain: briefingAccount.domain || '',
        }
        outcomeStatus = 'ready'
        usedFallback = true
        console.info('[Intelligence Brief] Using manual template fallback for empty signal case')
      }
    }

    const shouldKeepFallbackContext = usedFallback
    const talkTrackCandidate = shouldKeepFallbackContext
      ? null
      : generatedBrief
        ? findCandidateForResult(generatedBrief as BriefResult, rescueCandidates)
        : rescueCandidates[0] || null
    const talkTrackRewriteContext = buildTalkTrackContext(briefingAccount, talkTrackCandidate, false, audienceProfile)
    const previousTalkTrack = cleanText(briefingAccount.intelligence_brief_talk_track || '')
    if (validated) {
      const shouldRewrite = talkTrackNeedsRewrite(validated.talk_track || '', talkTrackRewriteContext, briefingAccount, talkTrackCandidate) ||
        (previousTalkTrack && talkTrackIsTooSimilarToPrevious(validated.talk_track || '', previousTalkTrack)) ||
        talkTrackCache.isTooSimilar(validated.talk_track || '')

      if (shouldRewrite) {
        let rewrittenTalkTrack: string | null = null
        
        // Always try AI generation first for rewrites
        rewrittenTalkTrack = await generateAITalkTrack(briefingAccount, talkTrackCandidate, talkTrackRewriteContext)
        
        // Validate AI-generated talk track
        if (rewrittenTalkTrack) {
          if (talkTrackNeedsRewrite(rewrittenTalkTrack, talkTrackRewriteContext, briefingAccount, talkTrackCandidate) ||
              (previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenTalkTrack)) {
            console.warn('[Intelligence Brief] AI-generated talk track failed validation, falling back to manual')
            rewrittenTalkTrack = null
          }
        }
        
        // Fall back to manual generation if AI failed or not applicable
        if (!rewrittenTalkTrack) {
          rewrittenTalkTrack = buildManualTalkTrack(briefingAccount, talkTrackCandidate, talkTrackRewriteContext, 0)

          // Check against cache and previous talk track
          if ((previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenTalkTrack)) {
            rewrittenTalkTrack = buildManualTalkTrack(briefingAccount, talkTrackCandidate, talkTrackRewriteContext, 1)
          }

          if ((previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenTalkTrack)) {
            rewrittenTalkTrack = buildManualTalkTrack(briefingAccount, talkTrackCandidate, talkTrackRewriteContext, 2)
          }
        }

        validated = {
          ...validated,
          talk_track: rewrittenTalkTrack,
        }
      }

      validated = {
        ...validated,
        talk_track: simplifyTalkTrackLanguage(validated.talk_track || ''),
      }

      // Add to cache after successful generation
      if (validated.talk_track) {
        talkTrackCache.add(validated.talk_track)
      }
    }

    const updatePayload: Record<string, unknown> = {
      intelligence_brief_status: outcomeStatus,
      intelligence_brief_last_refreshed_at: new Date().toISOString(),
    }

    if (identityProfile) {
      updatePayload.metadata = briefingAccount.metadata
    }

    if (validated) {
      updatePayload.intelligence_brief_headline = validated.signal_headline
      updatePayload.intelligence_brief_detail = validated.signal_detail
      updatePayload.intelligence_brief_talk_track = validated.talk_track
      updatePayload.intelligence_brief_signal_date = validated.signal_date
      updatePayload.intelligence_brief_reported_at = formatDateForDb(validated.source_date, talkTrackCandidate?.publishedAt || null)
      updatePayload.intelligence_brief_source_url = validated.source_url
      updatePayload.intelligence_brief_confidence_level = validated.confidence_level
    }

    const { data: updatedAccount, error: updateError } = await supabaseAdmin
      .from('accounts')
      .update(updatePayload)
      .eq('id', accountId)
      .select(ACCOUNT_SELECT)
      .single()

    if (updateError) {
      console.error('[Intelligence Brief] Account update failed:', updateError)
      return res.status(200).json({ ok: false, message: FALLBACK_MESSAGE, detail: updateError.message, account: serializeAccount(account) })
    }

    const serialized = serializeAccount(updatedAccount as AccountRow)

    if (validated) {
      return res.status(200).json({
        ok: true,
        message: usedFallback 
          ? 'Intelligence brief generated from company profile and industry context.' 
          : 'Intelligence brief refreshed.',
        brief: validated,
        account: serialized,
        diagnostics,
        usedFallback,
      })
    }

    return res.status(200).json({
      ok: false,
      message: FALLBACK_MESSAGE,
      account: serialized,
      diagnostics,
    })
  } catch (error) {
    console.error('[Intelligence Brief] Unexpected handler failure:', error)
    return res.status(200).json({
      ok: false,
      message: FALLBACK_MESSAGE,
    })
  }
}
