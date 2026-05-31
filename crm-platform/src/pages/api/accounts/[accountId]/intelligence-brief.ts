import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, requireUser } from '@/lib/supabase'
import { buildOwnerScopeValues } from '@/lib/owner-scope'
import { buildAudienceProfile, buildAudienceProfileBlock, type AudienceProfile } from '@/lib/contact-persona'
import { splitIntelligenceBriefSections } from '@/lib/intelligence-brief-context'
import { GoogleGenerativeAI } from '@google/generative-ai'

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
  intelligence_brief_opener: string | null
  intelligence_brief_talk_track: string | null
  intelligence_brief_signal_date: string | null
  intelligence_brief_reported_at: string | null
  intelligence_brief_source_url: string | null
  intelligence_brief_confidence_level: string | null
  intelligence_brief_last_refreshed_at: string | null
  intelligence_brief_status: BriefStatus | string | null
}

type MeterRow = {
  id: string
  esid: string | null
  service_address: string | null
  status: string | null
  rate: string | null
  end_date: string | null
}

/**
 * Merged site intelligence: confirmed meter addresses, ESI IDs, and research-inferred
 * locations when meter data is sparse. Used to ground the AI opener and talk track
 * with real service addresses instead of the account-level city field.
 */
type SiteContext = {
  /** Confirmed service addresses from meters table (most trusted) */
  confirmedAddresses: string[]
  /** ESI IDs from meters table */
  esids: string[]
  /** Total confirmed meter count (meters table + service_addresses field, deduplicated) */
  confirmedMeterCount: number
  /** Locations inferred from research candidates when meter count is low */
  researchInferredLocations: string[]
  /** Whether research clearly mentions more locations than we have in meters */
  researchSuggestsMoreSites: boolean
  /** Combined summary string for prompt injection */
  promptBlock: string
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
  __ageAdjustedPriority: number
}

type BriefResult = {
  usable_signal: boolean
  signal_headline?: string
  signal_detail?: string
  opener?: string | null
  talk_track?: string
  signal_date?: string
  source_date?: string | null
  source_url?: string
  confidence_level?: string
  selected_priority?: number
  source_title?: string
  source_domain?: string
  reason?: string
  angles?: {
    budgetCertainty?: { headline: string; talk_track: string }
    renewalTiming?: { headline: string; talk_track: string }
    loadFactor?: { headline: string; talk_track: string }
    demandResponse?: { headline: string; talk_track: string }
    billingOptimization?: { headline: string; talk_track: string }
    esgRenewables?: { headline: string; talk_track: string }
  }
}

type StoredBriefResult = Partial<BriefResult> & {
  opener?: string | null
}

type ContactAudienceRow = {
  id: string
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  title?: string | null
  email?: string | null
  linkedinUrl?: string | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
  accountId?: string | null
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
  | 'print_fulfillment'
  | 'public_transit'
  | 'moving_storage'
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
  briefingContext: BriefingContext
}

type BriefingContext = {
  companyIdentity: string
  signalReason: string
  structuredFacts: StructuredBriefFacts
  operationalDrivers: string[]
  forbiddenLanguage: string[]
  personaLens: string
  confidence: IdentityConfidence
  problemFrame: string
  questionFrame: string
}

type StructuredBriefFacts = {
  businessModel: string
  activities: string[]
  equipment: string[]
  customerContext: string[]
  energyDrivers: string[]
  avoidAngles: string[]
  sourceTerms: string[]
}

const FALLBACK_MESSAGE = 'No recent signals found for this account. Try again later or check the source manually.'
const COOLDOWN_MS = 60 * 60 * 1000

/** Fetch all meters for an account from the meters table */
async function fetchAccountMeters(accountId: string): Promise<MeterRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('meters')
      .select('id, esid, service_address, status, rate, end_date')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('[SiteContext] meters fetch failed:', error.message)
      return []
    }
    return (data || []) as MeterRow[]
  } catch (e) {
    console.warn('[SiteContext] meters fetch exception:', e)
    return []
  }
}

/**
 * Extract city/location mentions from research snippets.
 * Used when meter data is sparse to supplement with research-confirmed sites.
 */
function extractResearchLocations(candidates: ResearchHit[], accountCity: string | null): string[] {
  const TX_CITY = /\b([A-Z][a-z]+(?: [A-Z][a-z]+)*)(?:,\s*(?:TX|Texas))?\b/g
  const seen = new Set<string>()
  const accountCityNorm = (accountCity || '').toLowerCase().trim()
  const locs: string[] = []
  for (const c of candidates.slice(0, 10)) {
    const text = `${c.title} ${c.snippet}`
    let m: RegExpExecArray | null
    TX_CITY.lastIndex = 0
    while ((m = TX_CITY.exec(text)) !== null) {
      const loc = m[1].trim()
      const norm = loc.toLowerCase()
      // Skip generic words, the account's own city, and short noise
      if (norm.length < 4 || norm === accountCityNorm) continue
      if (/^(the|and|for|with|from|that|this|they|their|have|been|were|will|also|more|some|each|into|over|after|before|during|these|those|which|about|other|while|there|where|every|under|since|when|then|than|both|only|just|such|even|well|most|much|many|very|here|like|upon|next|able|full)$/i.test(norm)) continue
      if (!seen.has(norm)) {
        seen.add(norm)
        locs.push(loc)
      }
    }
  }
  return locs.slice(0, 8)
}

/**
 * Build a SiteContext from meters table rows, accounts.service_addresses,
 * and research candidates. Research locations fill the gap when meter data is thin.
 */
function buildSiteContext(
  meters: MeterRow[],
  serviceAddresses: unknown,
  candidates: ResearchHit[],
  account: AccountRow,
): SiteContext {
  // 1. Confirmed addresses from meters table
  const meterAddresses = meters
    .map((m) => cleanText(m.service_address || ''))
    .filter(Boolean)

  const meterEsids = meters
    .map((m) => cleanText(m.esid || ''))
    .filter(Boolean)

  // 2. Addresses from accounts.service_addresses (secondary)
  const saList = Array.isArray(serviceAddresses) ? serviceAddresses : []
  const saAddresses = saList
    .map((sa: unknown) => {
      if (typeof sa === 'string') return cleanText(sa)
      if (sa && typeof sa === 'object') {
        const r = sa as Record<string, unknown>
        return cleanText((r.address as string) || '')
      }
      return ''
    })
    .filter(Boolean)

  // Merge without duplicating — meter table is truth, SA fills gaps
  const meterAddrNorms = new Set(meterAddresses.map((a) => a.toLowerCase()))
  const extraSa = saAddresses.filter((a) => !meterAddrNorms.has(a.toLowerCase()))
  const allConfirmedAddresses = [...meterAddresses, ...extraSa]

  const confirmedMeterCount = Math.max(meters.length, saList.length, allConfirmedAddresses.length)

  // 3. Research-inferred locations (used when meter count is low ≤ 2)
  const researchLocs = confirmedMeterCount <= 2
    ? extractResearchLocations(candidates, account.city)
    : []

  // 4. Detect when research clearly mentions more sites than meters table shows
  const multiSiteResearchSignals = candidates.slice(0, 8).filter((c) => {
    const t = `${c.title} ${c.snippet}`.toLowerCase()
    return /\b(multiple locations?|several locations?|\d+ locations?|\d+ sites?|locations across|branches?|statewide|region-?wide|network of|campus(?:es)?|portfolio of)\b/.test(t)
  })
  const researchSuggestsMoreSites = multiSiteResearchSignals.length > 0 && confirmedMeterCount <= 2

  // 5. Build the prompt block
  const parts: string[] = []
  if (allConfirmedAddresses.length > 0) {
    parts.push(`Confirmed service addresses (${allConfirmedAddresses.length}):${allConfirmedAddresses.map((a, i) => `\n  ${i + 1}. ${a}`).join('')}`)
  }
  if (meterEsids.length > 0) {
    parts.push(`ESI IDs on file: ${meterEsids.join(', ')}`)
  }
  if (meters.length > 0 && meters.some((m) => m.rate)) {
    const rates = [...new Set(meters.map((m) => cleanText(m.rate || '')).filter(Boolean))]
    if (rates.length > 0) parts.push(`Rate plan(s): ${rates.join(', ')}`)
  }
  if (researchLocs.length > 0) {
    parts.push(`Research-mentioned locations: ${researchLocs.join(', ')}`)
  }
  if (researchSuggestsMoreSites) {
    const signals = multiSiteResearchSignals.map((c) => c.title).slice(0, 2).join('; ')
    parts.push(`Note: research suggests more sites exist than meters on file — ${signals}`)
  }
  if (confirmedMeterCount === 0 && researchLocs.length === 0) {
    parts.push('No confirmed service addresses or ESI IDs on file yet.')
  }

  const promptBlock = parts.length > 0
    ? `SITE & METER CONTEXT:\n${parts.join('\n')}`
    : ''

  return {
    confirmedAddresses: allConfirmedAddresses,
    esids: meterEsids,
    confirmedMeterCount,
    researchInferredLocations: researchLocs,
    researchSuggestsMoreSites,
    promptBlock,
  }
}

const ACCOUNT_SELECT = 'id, name, industry, domain, linkedin_url, "primaryContactId", city, state, ownerId, employees, description, metadata, service_addresses, revenue, annual_usage, intelligence_brief_headline, intelligence_brief_detail, intelligence_brief_opener, intelligence_brief_talk_track, intelligence_brief_signal_date, intelligence_brief_reported_at, intelligence_brief_source_url, intelligence_brief_confidence_level, intelligence_brief_last_refreshed_at, intelligence_brief_status'
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
  'print_fulfillment',
  'public_transit',
  'moving_storage',
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
  return typeof value === 'string' ? value.replace(/\\+/g, ' ').replace(/\s+/g, ' ').trim() : ''
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
    getPublicAccountDescription(account),
    getAccountNotes(account),
    account.website,
    account.domain,
  ].filter(Boolean).join(' ')).toLowerCase()
}

function stripCrmNoteLines(value: string) {
  return cleanText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (/^\[\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\]/.test(line)) return false
      if (/\b(?:main point of contact|point of contact|poc|call back|called|voicemail|left message|spoke with|do not call|dnc)\b/i.test(line)) return false
      return true
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getPublicAccountDescription(account: AccountRow) {
  return stripCrmNoteLines(cleanText(account.description))
}

function buildAudienceProfileForContact(
  contact: ContactAudienceRow | null,
  account: AccountRow,
  source: AudienceProfile['source'],
  sourceLabel?: string,
) {
  return buildAudienceProfile(
    contact ? {
      id: contact.id,
      contactId: contact.id,
      name: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' '),
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title,
      email: contact.email,
      linkedinUrl: contact.linkedinUrl,
      notes: contact.notes,
      metadata: contact.metadata,
      accountId: contact.accountId,
    } : null,
    {
      name: account.name,
      industry: account.industry,
      description: getPublicAccountDescription(account),
    },
    source,
    sourceLabel,
  )
}

function isOpenTaskStatus(value: unknown) {
  const status = cleanText(value).toLowerCase()
  return !['completed', 'complete', 'done', 'cancelled', 'canceled', 'closed'].includes(status)
}

function isActiveSequenceStatus(value: unknown) {
  const status = cleanText(value).toLowerCase()
  return !['completed', 'complete', 'done', 'cancelled', 'canceled', 'unsubscribed', 'bounced', 'failed'].includes(status)
}

async function loadContactRowsByIds(ids: string[]) {
  const contactIds = uniqueStrings(ids.filter(Boolean), 20)
  if (!contactIds.length) return new Map<string, ContactAudienceRow>()

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id, firstName, lastName, name, title, email, linkedinUrl, notes, metadata, accountId')
    .in('id', contactIds)

  if (error) {
    console.warn('[Intelligence Brief] Contact audience lookup failed:', error)
    return new Map<string, ContactAudienceRow>()
  }

  return new Map((data || []).map((row: any) => [String(row.id), row as ContactAudienceRow]))
}

async function resolveAudienceProfileForBrief(account: AccountRow): Promise<AudienceProfile | null> {
  const { data: taskRows, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('id, title, status, dueDate, contactId, accountId, metadata, createdAt')
    .eq('accountId', account.id)
    .not('contactId', 'is', null)
    .order('dueDate', { ascending: true, nullsFirst: false })
    .order('createdAt', { ascending: false })
    .limit(20)

  if (taskError) {
    console.warn('[Intelligence Brief] Task audience lookup failed:', taskError)
  }

  const openTask = (taskRows || [])
    .filter((task: any) => isOpenTaskStatus(task.status))
    .find((task: any) => cleanText(task.contactId))
  const taskContactId = cleanText(openTask?.contactId)

  const { data: accountContacts, error: accountContactsError } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('accountId', account.id)
    .limit(200)

  if (accountContactsError) {
    console.warn('[Intelligence Brief] Account contacts lookup failed:', accountContactsError)
  }

  const accountContactIds = uniqueStrings((accountContacts || []).map((row: any) => cleanText(row.id)), 200)
  const { data: sequenceRows, error: sequenceError } = accountContactIds.length
    ? await supabaseAdmin
      .from('sequence_members')
      .select('id, targetId, targetType, status, updatedAt, createdAt')
      .eq('targetType', 'contact')
      .in('targetId', accountContactIds)
      .order('updatedAt', { ascending: false, nullsFirst: false })
      .limit(50)
    : { data: [], error: null }

  if (sequenceError) {
    console.warn('[Intelligence Brief] Sequence audience lookup failed:', sequenceError)
  }

  const sequenceContactIds = uniqueStrings((sequenceRows || [])
    .filter((row: any) => isActiveSequenceStatus(row.status))
    .map((row: any) => cleanText(row.targetId)), 50)
  const candidateIds = uniqueStrings([
    taskContactId,
    cleanText(account.primaryContactId),
    ...sequenceContactIds,
  ], 60)
  const contactMap = await loadContactRowsByIds(candidateIds)

  const taskContact = taskContactId ? contactMap.get(taskContactId) || null : null
  if (taskContact?.accountId === account.id) {
    return buildAudienceProfileForContact(taskContact, account, 'protocol_task', 'Active or pending task contact')
  }

  const decisionMakerId = cleanText(account.primaryContactId)
  const decisionMaker = decisionMakerId ? contactMap.get(decisionMakerId) || null : null
  if (decisionMaker?.accountId === account.id) {
    return buildAudienceProfileForContact(decisionMaker, account, 'decision_maker_card')
  }

  const sequenceContact = sequenceContactIds
    .map((id) => contactMap.get(id))
    .find((contact) => contact?.accountId === account.id) || null
  if (sequenceContact) {
    return buildAudienceProfileForContact(sequenceContact, account, 'sequence')
  }

  return null
}

function normalizeBriefComparable(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSameAsAccountDescription(value: string, account: AccountRow) {
  const left = normalizeBriefComparable(value)
  const right = normalizeBriefComparable(getPublicAccountDescription(account))
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)))
}

function hasStrongHealthcareSignals(text: string) {
  return /(healthcare|\bhospital\b|clinic|medical|behavioral health|mental health|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|community mental health|crisis center|crisis services|early childhood intervention|surgical center|surgery center|ambulatory surgery center|patient care|\bspecialists?\b|wellness|\bdoctors?\b)/i.test(text)
}

function hasStrongBehavioralHealthSignals(text: string) {
  return /(psychiatric|psychiatry|mental health|behavioral health|behavioral healthcare|substance use|substance abuse|chemical dependency|addiction treatment|inpatient mental health|partial hospitalization|intensive outpatient|residential treatment|crisis services|counseling|therapy|trauma-informed|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|community mental health)/i.test(text)
}

function hasStrongDentalSignals(text: string) {
  return /(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry|multi-site dental|dental partnership organization)/i.test(text)
}

function hasStrongAutomotiveSignals(text: string) {
  return /\b(auto group|automotive|dealerships?|car dealer|auto dealer|vehicle inventory|service bays?|service department|parts department|parts store|certified pre-owned|new vehicles?|used vehicles?|lot lighting|amg|mercedes|bmw|audi|lexus|toyota|honda|ford|chevrolet|cadillac|hyundai|kia|volkswagen|nissan|jeep|dodge|ram|gmc|subaru)\b/i.test(text) || /\b(?:car|auto|vehicle)\s+showrooms?\b/i.test(text) || /\b(?:pre-owned\s+(?:cars?|vehicles?|trucks?))\b/i.test(text)
}

function hasStrongRetailStoreSignals(text: string) {
  return /(convenience stores?|c[-\s]?stores?|gas station|fuel stations?|travel centers?|board games?|card games?|collectibles?|gaming accessories|game store|game retailer|hobby store|tabletop games?|lifestyle (?:and )?design store|department store|luxury retail|retail store|showroom space|showrooms?|home goods|tabletop|bedding|bath|furniture|garden|fashion|apothecary|shopping|customer-facing retail|\bretailers?\b|\bhome decor\b|\bart supplies\b|\bcraft materials\b)/i.test(text)
}

function hasConvenienceStoreSignals(text: string) {
  return /(convenience stores?|c[-\s]?stores?|gas station|fuel stations?|travel centers?|fuel pumps?|coffee service|walk[-\s]?in coolers?|beer caves?|ice machines?)/i.test(text)
}

function hasGameRetailSignals(text: string) {
  return /(board games?|card games?|collectibles?|gaming accessories|game store|game retailer|hobby store|tabletop games?|trading cards?|tcg\b|miniatures?|pokemon|magic:?\s*the gathering|warhammer)/i.test(text)
}

function hasGolfClubSignals(text: string) {
  return /(golf club|country club|private club|clubhouse|golf course|pro shop|tee time|greens? crew|fairways?|cart path|irrigation|club dining|club grill)/i.test(text)
}

function hasStrongManufacturersRepSignals(text: string) {
  return /(manufacturers?('s?)?\s+rep(?:resentative)?|manufacturers?('s?)?\s+representative agency|rep firm|lighting rep|electrical rep|sales rep agency|independent sales representative|represents? manufacturers?|working with distributors|electrical contractors|engineers|architects|lighting designers)/i.test(text)
}

function hasStrongBakeryCafeSignals(text: string) {
  return /(bakery caf[eé]|bakery cafe|neighborhood bakery|bakery chain|fresh baked goods|pastries|warm breads|cakes|brewed drinks|bakery-caf[eé]|baked goods and beverages|\b(coffee|espresso|barista)\b|drive-thru coffee)/i.test(text)
}

function hasFrozenBakeryProductionSignals(text: string) {
  return /\b(grain-based|frozen bakery|industrial bakery|bakery manufacturing|bakery production|bakery products|flour mill|biscuits?|muffins?|croissants?|viennese pastries|production facilities)\b/i.test(text)
}

function hasStrongAutoPartsDistributionSignals(text: string) {
  return /(wholesale auto parts|automotive parts supplier|auto parts supplier|auto parts distributor|aftermarket collision parts|parts house|parts stores?|same[-\s]?day parts|automotive service center|auto parts distribution)/i.test(text)
}

function hasPrintFulfillmentSignals(text: string) {
  return /(direct mail|mailing company|commercial mailer|bulk mail|reprographics|document reproduction|digital imaging|print shop|print production|on[-\s]?demand printing|content management|branded storefronts?|training materials|compliance communications?|fulfillment and print|print and fulfillment|ecommerce fulfillment|e-commerce fulfillment)/i.test(text)
}

function hasPublicTransitSignals(text: string) {
  return /(public transportation|transit authority|streetcar|street car|trolley|m-line|railway|light rail|fare-free|historic trolley|operate(?:s|d)? .*trolley|restore, maintain, and operate historic trolley cars|vintage trolley)/i.test(text)
}

function hasMovingStorageSignals(text: string) {
  return /(moving (?:and|&) storage|moving storage|moving company|relocation services?|commercial moving|residential moving|household goods|storage company|warehousing and moving|supply chain solutions|van line|movers?\b)/i.test(text)
}

function hasReadyMixConcreteSignals(text: string) {
  return /(ready[-\s]?mix(?:ed)? concrete|concrete batch(?:ing)?|batch plants?|concrete plants?|aggregate products?|construction aggregates?|crushed stone|sand and gravel|volumetric mixer|mixer trucks?|concrete delivery|cementitious|asphalt and ready[-\s]?mix(?:ed)? concrete)/i.test(text)
}

function hasFiberglassConduitSignals(text: string) {
  return /(fiberglass conduit|fiberglass strut|epoxy fiberglass|phenolic conduit|flame shield|haz duct|high[-\s]?speed winding|curing ovens?|electrical and mechanical markets?|conduit system|fiberglass fittings)/i.test(text)
}

function hasFurnitureManufacturingSignals(text: string) {
  return /(manufactures?|manufacturer|manufacturing|production|assembly)\b[\s\S]{0,120}\b(educational|commercial)?\s*(furniture|desks?|tables?|chairs?|visual communication tools?|whiteboards?|classroom furniture)|\b(furniture|desks?|tables?|chairs?|visual communication tools?|whiteboards?|classroom furniture)\b[\s\S]{0,120}\b(manufactures?|manufacturer|manufacturing|production|assembly)/i.test(text)
}

function hasIndustrialSiteLogisticsSignals(text: string) {
  return /(site store management|expendable and consumable materials|petrochemical or energy plant|inventory management|warehouse management|materials and delivery tracking|transportation management|purchase order processing|electronic receiving|third party integrator|low dollar value,? high usage materials)/i.test(text)
}

function hasPalletManagementSignals(text: string) {
  return /(pallet management|pallet services?|pallet repair|pallet recycling|pallet retrieval|pallet sortation|pallet redistribution|total pallet management|reverse logistics|wood packaging|remanufactur(?:ing|ed)? pallets?)/i.test(text)
}

function hasMaterialHandlingEquipmentSignals(text: string) {
  return /(materials?\s+handling|forklifts?|fork\s*lifts?|komatsu|pallet (?:storage )?rack|racking systems?|interlake[-\s]?mecalux|aerial lifts?|jlg\b|scissor lifts?|boom lifts?|warehouse equipment|lift equipment|forklift charging|battery charging|hvls fans?)/i.test(text)
}

function hasConstructionMachinerySupportSignals(text: string) {
  return /(construction machinery|construction equipment|concrete mixers?|mortar pumps?|access equipment|aerial platforms?|scissor lifts?|tracked buggies?|dealer network|parts ordering|customer assistance|equipment support|concrete and mortar|mixers and pumps)/i.test(text)
}

function hasPlasticsDistributionSignals(text: string) {
  return /(plastics? distributor|wholesale distributor of plastic|plastic sheet|plastic sheets|plastic rod|plastic tube|plastic film|cut[-\s]?to[-\s]?size|local plastics? supplier|plastic materials distributor)/i.test(text)
}

function hasCraneSalesSupportSignals(text: string) {
  return /(crane sales|crane service|crane parts|crane support|sales and support base|tadano|mobile cranes?|rough terrain cranes?|all[-\s]?terrain cranes?|crane dealer|crane distributor)/i.test(text)
}

function hasMaritimePilotSignals(text: string) {
  return /(harbor pilots?|houston pilots?|ship pilots?|ship handlers?|(?:marine|maritime|cargo|shipping|naval|ocean-going|waterborne) vessels?|waterway|ship channel|port of houston|pilot boat|marine pilot|maritime pilots?)/i.test(text)
}

function hasStrongDmeSignals(text: string) {
  return /(durable medical equipment|\bdme\b|home medical equipment|medical equipment|medical supplies?|equipment logistics|equipment delivery|equipment maintenance|direct-service locations?|direct service locations?|hospice dme|hospice equipment|inventory management|medical supply(?:ies)?)/i.test(text)
}

function hasHomeHealthHospiceSignals(text: string) {
  return /(home health|hospice|end of life care|hospice care|home care|patient care coordination|care coordination|skilled home health|visiting nurse|nursing visits|palliative care)/i.test(text)
}

function hasStrongRestaurantSignals(text: string) {
  if (hasFrozenBakeryProductionSignals(text) && !/(restaurant|dining|food service|service rushes?|\bgrills?\b|\bfryers?\b|\bcafe\b|\bcafé\b|bakery caf[eé]|\bbar\b|eatery|banquet|event space|hospitality|\bhotel\b|\bresort\b|\blodging\b|drive-thru coffee)/i.test(text)) {
    return false
  }
  return /(restaurant|dining|kitchen|food service|service rushes?|\bgrills?\b|\bfryers?\b|\bcafe\b|\bcafé\b|bakery caf[eé]|\bbar\b|eatery|banquet|event space|hospitality|\bhotel\b|\bresort\b|\blodging\b|\b(coffee|espresso|barista)\b|drive-thru coffee)/i.test(text)
}

function hasStrongManufacturingSignals(text: string) {
  if (hasStrongBehavioralHealthSignals(text)) return false
  if (hasPrintFulfillmentSignals(text) && !/(factory automation|aerospace tooling|machining|fabricat|weld|assembly plant|industrial production)/i.test(text)) return false
  return /(manufacturing|industrial|\bplants?\b|production|\bfabricat|\bmachining\b|\bmachinery\b|\bmachine shop\b|\bmachine tools?\b|chemical|packaging|assembly|process equipment)/i.test(text)
}

function hasStrongPetrochemicalSignals(text: string) {
  return /(petrochemical|petroleum[-\s]?based|c4 hydrocarbons?|crude c4|butadiene|butene[-\s]?1|polyisobutylene|\bmtbe\b|isobutylene|raffinate|chemical products?|chemical manufacturing|processor of crude c4|petrochemical raw materials?|synthetic rubber|lubricant additives|surfactants)/i.test(text)
}

function hasStrongLogisticsSignals(text: string) {
  if (hasPublicTransitSignals(text)) return false
  if (hasPrintFulfillmentSignals(text)) return false
  if (hasMaritimePilotSignals(text)) return false
  return /(freight forwarder|nvo?cc|cargo|shipping|trucking|transport|logistics|warehouse|distribution|fulfillment|auto logistics|terminal|dock|yard|supply chain)/i.test(text)
}

function hasStrongOfficeServicesSignals(text: string) {
  return /(office|professional services|law|legal|consulting|accounting|marketing|real estate|staffing|agency|design|engineering|architect|executive office)/i.test(text)
}

function hasStrongCommercialRealEstateSignals(text: string) {
  return /(commercial real estate|real estate firm|real estate brokerage|property management|tenant representation|landlord representation|leasing|investment sales|brokerage services|asset management|development services)/i.test(text)
}

function hasStrongSchoolSignals(text: string) {
  return /(school district|independent school district|isd\b|public school|charter school|k-12|school campus|students|classrooms|teachers|school\b|academy|daycare|preschool|childcare|tutoring|learning center)/i.test(text)
}

function hasPrivateK12SchoolSignals(text: string) {
  return /\b(k-?12|k4-?12|pre[-\s]?k|primary\/secondary education|private school|college-preparatory|college preparatory|day school|selective admissions|students|classrooms|teachers|elementary|junior high|middle school|high school|school campus|school\b)\b/i.test(text)
}

function hasReligiousOrganizationSignals(text: string) {
  return /(church|synagogue|mosque|congregation|parish|worship|ministry|religious|faith)/i.test(text) || /\btemples?\b(?!\s*(?:,\s*)?(?:tx|texas)\b)/i.test(text)
}

function hasStrongAutomotiveDealerSignals(text: string) {
  return /\b(dealerships?|car dealer|auto dealer|vehicle inventory|certified pre-owned|new vehicles?|used vehicles?|lot lighting|amg|mercedes|bmw|audi|lexus|toyota|honda|ford|chevrolet|cadillac|hyundai|kia|volkswagen|nissan|jeep|dodge|ram|gmc|subaru)\b/i.test(text) || /\b(?:car|auto|vehicle)\s+showrooms?\b/i.test(text) || /\b(?:pre-owned\s+(?:cars?|vehicles?|trucks?))\b/i.test(text)
}

function hasStrongTruckDealerSignals(text: string) {
  return /(heavy[-\s]?duty commercial truck|commercial truck dealership|truck dealership|truck center|truck sales|truck service|truck parts|diesel technician training|diesel technician|freightliner|western star|mitsubishi fuso|mercedes-benz trucks|peterbilt|kenworth|mack trucks|volvo trucks|diesel bays?|body shop|technical institute)/i.test(text)
}

function hasTruckLeasingSignals(text: string) {
  return /(truck leasing|truck rental|leasing and rental|fleet leasing|full-service leasing|used truck program|used truck programs|commercial lease fleet|lease fleet|truck lease|rental fleet|fleet maintenance plans?|maintenance lease)/i.test(text)
}

function hasStrongRVDealerSignals(text: string) {
  return /(rv dealership|rv dealer|motorhome dealership|motorhomes?|motor coach|motorcoach|recreational vehicle(?:s)?|camper(?:s)?|travel trailer(?:s)?|toy hauler(?:s)?|rv service|rv parts|motorhome sales|motorhome service)/i.test(text)
}

function hasRvSupportSignals(text: string) {
  return /(rv support|rv setup|rv assembly|rv staging|rv warehousing|warehousing and setup|recreational vehicle industry|motorhome prep|dealer prep|rv warehouse|rv industry support|recreational vehicle(?:s)?(?:[\s\S]{0,50}(?:warehouse|warehous|assembly|support|setup|staging))|(?:warehouse|warehousing|assembly|support|setup|staging)[\s\S]{0,50}recreational vehicle(?:s)?)/i.test(text) || /\b(rv industry|recreational vehicle industry)\b/i.test(text)
}

function getIndefiniteArticle(word: string): string {
  const cleanWord = word.trim().toLowerCase()
  if (!cleanWord) return ''
  if (/^(a|an)\b/i.test(cleanWord)) return ''
  return ['a', 'e', 'i', 'o', 'u'].includes(cleanWord[0]) ? 'an' : 'a'
}


function profileConflictsWithCoreSignals(profile: IntelligenceProfile, accountText: string) {
  const profileText = cleanText([
    profile.companyType,
    profile.operatingModel,
    profile.facilityType,
    ...(profile.identityKeywords || []),
    ...(profile.powerKeywords || []),
  ].join(' ')).toLowerCase()

  if (!profileText) return false

  const healthcareSignals = hasStrongHealthcareSignals(accountText)
  const dentalSignals = hasStrongDentalSignals(accountText)
  const dmeSignals = hasStrongDmeSignals(accountText)
  const restaurantSignals = hasStrongRestaurantSignals(accountText)
  const retailStoreSignals = hasStrongRetailStoreSignals(accountText)
  const manufacturersRepSignals = hasStrongManufacturersRepSignals(accountText)
  const bakeryCafeSignals = hasStrongBakeryCafeSignals(accountText)
  const logisticsSignals = hasStrongLogisticsSignals(accountText)
  const palletManagementSignals = hasPalletManagementSignals(accountText)
  const printFulfillmentSignals = hasPrintFulfillmentSignals(accountText)
  const publicTransitSignals = hasPublicTransitSignals(accountText)
  const movingStorageSignals = hasMovingStorageSignals(accountText)
  const autoPartsDistributionSignals = hasStrongAutoPartsDistributionSignals(accountText)
  const officeSignals = hasStrongOfficeServicesSignals(accountText)
  const manufacturingSignals = hasStrongManufacturingSignals(accountText)
  const petrochemicalSignals = hasStrongPetrochemicalSignals(accountText)
  const schoolSignals = hasStrongSchoolSignals(accountText)

  if (hasPlasticsDistributionSignals(accountText) && /(food production|refrigeration|cooking lines?|sanitation|restaurant|bakery|manufacturing operation)/i.test(profileText)) {
    return true
  }

  if (hasReadyMixConcreteSignals(accountText) && (profile.industryCluster === 'logistics' || profile.industryCluster === 'retail' || /(logistics|warehouse|distribution|retail)/i.test(profileText))) {
    return true
  }

  if (hasFiberglassConduitSignals(accountText) && (profile.industryCluster === 'logistics' || profile.industryCluster === 'retail' || /(logistics|warehouse|distribution|retail)/i.test(profileText))) {
    return true
  }

  if (hasCraneSalesSupportSignals(accountText) && /(manufacturing operation|production lines?|startup sequence|shift-driven peaks|dealership|lot lighting)/i.test(profileText)) {
    return true
  }

  if (hasMaritimePilotSignals(accountText) && /(materials?-handling|forklift|warehouse|distribution|dock activity|logistics operator|manufacturing operation)/i.test(profileText)) {
    return true
  }

  if (dmeSignals && /\b(hospital|neighborhood hospital|micro[-\s]?hospital|community hospital|small-format hospital|licensed hospital|clinic|medical practice|emergency room|emergency care|inpatient care|inpatient bed|acute care|short-stay rooms?|patient care)\b/i.test(profileText)) {
    return true
  }

  if (dentalSignals && /\b(hospital|neighborhood hospital|micro[-\s]?hospital|community hospital|small-format hospital|licensed hospital|emergency room|emergency care|inpatient care|inpatient bed|acute care|short-stay rooms?|guest rooms?|laundry)\b/i.test(profileText)) {
    return true
  }

  if (healthcareSignals && !dmeSignals && /(restaurant|dining|kitchen|hotel|hospitality|plant|industrial|warehouse|logistics|distribution)/i.test(profileText)) {
    return true
  }

  if (restaurantSignals && /(healthcare|hospital|clinic|medical|behavioral health|mental health|surgery|surgical)/i.test(profileText)) {
    return true
  }

  if (restaurantSignals && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment|warehouse|logistics|distribution)/i.test(profileText)) {
    return true
  }

  if (retailStoreSignals && /(school|school district|manufacturing|industrial|plant|production|warehouse|logistics|distribution|cold storage|clinic|hospital)/i.test(profileText)) {
    if (profile.industryCluster === 'retail' && /(national retail and distribution network|centralized distribution)/i.test(profileText)) {
      return false
    }
    return true
  }

  if (manufacturersRepSignals && /(warehouse|logistics|distribution network|manufacturing|industrial|plant|production|dock activity|material handling|cold storage)/i.test(profileText)) {
    return true
  }

  if (bakeryCafeSignals && /(cold storage|warehouse|food production plant|manufacturing|industrial|plant|production lines?|distribution network)/i.test(profileText)) {
    return true
  }

  if (schoolSignals && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment|warehouse|logistics|distribution)/i.test(profileText)) {
    return true
  }

  if (schoolSignals && /(retail|store|showroom|shopping|customer-facing retail|retail group|retail footprint|roll-?up view|dealership|service bay|automotive)/i.test(profileText)) {
    return true
  }

  if (hasPrivateK12SchoolSignals(accountText) && (profile.industryCluster === 'religious' || /(religious organization|worship|sanctuary|church \/ worship|church campus|ministry|congregation)/i.test(profileText))) {
    return true
  }

  if (logisticsSignals && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment)/i.test(profileText)) {
    return true
  }

  if (logisticsSignals && !dmeSignals && /(healthcare|hospital|clinic|medical|behavioral health|mental health|patient care|counseling|therapy|crisis spaces?)/i.test(profileText)) {
    return true
  }

  if (palletManagementSignals) {
    const palletProfile = /(pallet management|reverse logistics|pallet retrieval|pallet repair|pallet sortation|wood packaging|managed inventory)/i.test(profileText)
    if (!palletProfile && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment|warehouse|logistics|distribution)/i.test(profileText)) {
      return true
    }
  }

  if (printFulfillmentSignals && /(manufacturing|industrial manufacturing|plant|factory|heavy industrial|dock door timing|logistics \/ warehouse|distribution and logistics)/i.test(profileText)) {
    return true
  }

  if (publicTransitSignals && /(manufacturing|industrial|warehouse|logistics|distribution|dock activity|production|plant)/i.test(profileText)) {
    return true
  }

  if (movingStorageSignals && /(manufacturing|industrial|plant|production|process equipment|machine startup)/i.test(profileText)) {
    return true
  }

  if (officeSignals && /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment|warehouse|logistics|distribution)/i.test(profileText)) {
    return true
  }

  if (petrochemicalSignals && /(logistics|warehouse|distribution network|distribution and logistics|dock activity|terminal-adjacent|no manufacturing language)/i.test(profileText)) {
    return true
  }

  if (autoPartsDistributionSignals && /(dealership|showroom|service bays?|lot lighting|vehicle inventory|auto dealer)/i.test(profileText)) {
    return true
  }

  if (manufacturingSignals && /(healthcare|hospital|clinic|medical|restaurant|hotel|hospitality|behavioral health|mental health)/i.test(profileText)) {
    return true
  }
  if (manufacturingSignals && (profile.industryCluster === 'retail' || profile.industryCluster === 'logistics') && !/(retail store|customer-facing retail|dealership|auto dealer|parts distributor|distribution network|warehouse)/i.test(accountText)) {
    return true
  }
  if (hasMaterialHandlingEquipmentSignals(accountText) && (profile.industryCluster === 'manufacturing' || /manufacturing operation|production lines?|process equipment|compressed air|startup sequence/i.test(profileText))) {
    return true
  }
  if (hasFurnitureManufacturingSignals(accountText) && (profile.industryCluster === 'retail' || /retail business|retail store|showroom-only/i.test(profileText))) {
    return true
  }
  if (/(manufactures?|manufacturer|manufacturing)\b[\s\S]{0,120}\b(cooling products?|refrigeration|chillers?|air handling units?|industrial package units?)/i.test(accountText) &&
      (profile.industryCluster === 'retail' || /retail business|retail operation|showroom/i.test(profileText))) {
    return true
  }

  if (hasStrongDentalSignals(profileText) && !hasStrongDentalSignals(accountText)) {
    return true
  }

  if (hasStrongBehavioralHealthSignals(accountText) && /(dental|dentist|dentistry|operatories|dso\b)/i.test(profileText)) {
    return true
  }

  const automotiveDealerSignals = hasStrongAutomotiveDealerSignals(accountText)
  if (automotiveDealerSignals && (profile.industryCluster === 'food_storage' || /(cold storage|refrigerat|freezer|brewery|breweries|brewing|beer|taproom|food storage)/i.test(profileText))) {
    return true
  }

  const residentialCareSignals = /(shelter|women's shelter|emergency shelter|homeless shelter|transitional housing|supportive housing|children'?s home|foster care|adoption assistance|residential services|independent living center|counseling center|youth services|human services|group home|residential care)/i.test(accountText)
  if (residentialCareSignals && (profile.industryCluster === 'healthcare' || /(clinic|hospital|medical|doctor|patient care|dental|dentist)/i.test(profileText))) {
    if (!/(shelter|residential care|group home|children'?s home|foster care|adoption|supportive housing|transitional housing)/i.test(profileText)) {
      return true
    }
  }

  return false
}

function isPhoneLikeHeadline(title: string): boolean {
  const t = cleanText(title).replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (/^[+()\-.\s\d*xextEXT]+$/.test(t) && /\d{3}/.test(t) && /\d{4}/.test(t)) return true
  if (/^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?:\s*(?:x|ext\.?)\s*\d+)?$/i.test(t)) return true
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
  const accountText = getIdentityProfileSeedText(account)
  if (/\b(municipal|city of|county government|county of|public sector|civic|public works|public safety|utility infrastructure|public facilities)\b/i.test(accountText)) {
    const confidence = cleanText(record.confidence).toLowerCase() as IdentityConfidence
    const safeConfidence: IdentityConfidence = confidence === 'high' || confidence === 'medium' || confidence === 'low'
      ? confidence
      : 'low'

    return {
      version: IDENTITY_PROFILE_VERSION,
      industryCluster: 'public_sector',
      companyType: /county/i.test(accountText) ? 'county government' : 'public-sector organization',
      operatingModel: /county/i.test(accountText) ? 'county-wide public services network' : 'municipal facility portfolio',
      facilityType: 'municipal / administrative facility',
      identityKeywords: ['county', 'municipal', 'public safety', 'utility infrastructure', 'administrative offices'],
      powerKeywords: ['administrative offices', 'public safety', 'utility infrastructure', 'HVAC'],
      talkTrackGuardrails: ['No residential-care language', 'No shelter language', 'No hotel language', 'No clinic language'],
      evidence: uniqueStrings(Array.isArray(record.evidence) ? record.evidence : [], 4),
      confidence: safeConfidence,
      generatedAt: cleanText(record.generatedAt),
      sourceKinds: uniqueStrings(Array.isArray(record.sourceKinds) ? record.sourceKinds : [], 4)
      .filter((value): value is ResearchSourceKind => ['news', 'web', 'sec', 'linkedin'].includes(value))
      .slice(0, 4),
    }
  }
  if (hasTruckLeasingSignals(accountText)) {
    const confidence = cleanText(record.confidence).toLowerCase() as IdentityConfidence
    const safeConfidence: IdentityConfidence = confidence === 'high' || confidence === 'medium' || confidence === 'low'
      ? confidence
      : 'low'

    return {
      version: IDENTITY_PROFILE_VERSION,
      industryCluster: 'logistics',
      companyType: 'truck leasing and rental network',
      operatingModel: 'multi-site truck leasing, rental, and maintenance footprint',
      facilityType: 'truck leasing / service location',
      identityKeywords: ['truck leasing', 'truck rental', 'fleet leasing', 'maintenance shops', 'used truck programs'],
      powerKeywords: ['maintenance shops', 'fleet staging', 'yard lighting', 'office load'],
      talkTrackGuardrails: ['No dealership language', 'No showroom language', 'No retail language', 'No manufacturing plant language'],
      evidence: uniqueStrings(Array.isArray(record.evidence) ? record.evidence : [], 4),
      confidence: safeConfidence,
      generatedAt: cleanText(record.generatedAt),
      sourceKinds: uniqueStrings(Array.isArray(record.sourceKinds) ? record.sourceKinds : [], 4)
        .filter((value): value is ResearchSourceKind => ['news', 'web', 'sec', 'linkedin'].includes(value))
        .slice(0, 4),
    }
  }
  const stableCluster = inferIndustryClusterFromSignals(account, null)
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
  if (cluster !== stableCluster && !isBroadIdentityCluster(stableCluster)) {
    const dmeSignals = hasStrongDmeSignals(accountText)
    const isDmeExemption = dmeSignals && cluster === 'logistics' && stableCluster === 'healthcare'
    if (!isDmeExemption) return null
  }

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
  ].join(' ')).toLowerCase()
}

function selectIdentityKeywords(text: string, preferred: string[], fallback: string[], limit = 6) {
  const lower = text.toLowerCase()
  const matched = preferred.filter((keyword) => {
    const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const startBoundary = /^\w/.test(keyword) ? '\\b' : ''
    const endBoundary = /\w$/.test(keyword) ? '\\b' : ''
    const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, 'i')
    return regex.test(lower)
  })
  return uniqueStrings([...matched, ...fallback], limit)
}

function buildIdentityEvidence(account: AccountRow, candidates: ResearchHit[], emphasisKeywords: string[]) {
  const evidence: string[] = []
  const description = getPublicAccountDescription(account)
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

function getAccountHierarchyProfile(account: AccountRow) {
  const metadata = account.metadata && typeof account.metadata === 'object' && !Array.isArray(account.metadata)
    ? account.metadata as Record<string, unknown>
    : {}
  const context = metadata.intelligenceHierarchyContext && typeof metadata.intelligenceHierarchyContext === 'object' && !Array.isArray(metadata.intelligenceHierarchyContext)
    ? metadata.intelligenceHierarchyContext as Record<string, unknown>
    : {}
  const parent = context.parent && typeof context.parent === 'object' && !Array.isArray(context.parent)
    ? context.parent as Record<string, unknown>
    : {}

  return {
    organizationRole: cleanText(context.organizationRole),
    parentName: cleanText(parent.name),
  }
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

function getAccountWebsiteRoot(account: AccountRow) {
  return normalizeWebsiteCandidate(account.website || account.domain)
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

/**
 * Domains that produce results unrelated to a commercial business signal.
 * Movie trailer sites, entertainment news, review aggregators, etc. return
 * false positives when the company name overlaps with common words (e.g.
 * "Happy Trailers" matching IGN's game/movie trailer reviews).
 */
const ENTERTAINMENT_NOISE_DOMAINS = new Set([
  'ign.com', 'imdb.com', 'rottentomatoes.com', 'metacritic.com',
  'fandango.com', 'boxofficemojo.com', 'filmafinity.com',
  'screendaily.com', 'deadline.com', 'variety.com', 'thewrap.com',
  'hollywoodreporter.com', 'indiewire.com', 'cinemablend.com',
  'comingsoon.net', 'joblo.com', 'collider.com', 'screenrant.com',
  'empireonline.com', 'slashfilm.com', 'avclub.com',
  'entertainment.ie', 'entertainmentweekly.com', 'ew.com',
  'people.com', 'usmagazine.com', 'tmz.com', 'pagesix.com',
  'gamespot.com', 'polygon.com', 'kotaku.com', 'ign.com',
  'techradar.com', 'theverge.com', 'engadget.com', 'gizmodo.com',
  'wired.com', 'pcgamer.com', 'eurogamer.net',
])

/** Returns true for domains that are purely entertainment/gaming/media noise. */
function isEntertainmentNoiseDomain(url: string): boolean {
  const host = getHostname(url)
  if (!host) return false
  const base = host.replace(/^www\./, '')
  return ENTERTAINMENT_NOISE_DOMAINS.has(base)
}

/** Returns true if this research hit title looks like an entertainment result
 * (e.g. movie trailer reviews) rather than a business news signal. */
function looksLikeEntertainmentResult(title: string, url: string): boolean {
  if (isEntertainmentNoiseDomain(url)) return true
  const t = cleanText(title).toLowerCase()
  // Patterns like "Movie Name [Trailers] - Site" or "Best of 2024 [Trailers]"
  if (/\[trailers?\]\s*[-|]/i.test(title)) return true
  if (/\b(movie|film|episode|season \d|tv show|video game|review|trailer|teaser|gameplay|walkthrough|spoiler)\b/i.test(t) &&
      /\b(ign|imdb|rotten|gamespot|polygon|verge|collider|screenrant)\b/i.test(t)) return true
  return false
}

/** Max age (ms) for a signal to count as "current news" — 18 months. */
const MAX_SIGNAL_AGE_MS = 18 * 30 * 24 * 60 * 60 * 1000

/** Penalise research hits that are older than 18 months by bumping their effective
 * priority down so they lose to fresher signals even if Bing ranked them higher. */
function getAgeAdjustedPriority(item: ResearchHit): number {
  if (isLikelyBadSourceUrl(item.url)) return item.priority + 20
  if (!item.publishedAt) return item.priority + 3 // no date → treat as low-quality
  const age = Date.now() - new Date(item.publishedAt).getTime()
  if (age > MAX_SIGNAL_AGE_MS) return item.priority + 4 // too old → deprioritise heavily
  return item.priority
}

function isStaleNewsSignal(item: ResearchHit | null) {
  if (!item?.publishedAt) return false
  if (item.sourceKind !== 'news' && item.sourceKind !== 'linkedin') return false

  const publishedTime = new Date(item.publishedAt).getTime()
  if (!Number.isFinite(publishedTime)) return false

  return Date.now() - publishedTime > MAX_SIGNAL_AGE_MS
}

function dedupeAndSort(items: ResearchHit[], account?: AccountRow | null) {
  const seen = new Set<string>()
  return items
    .filter((item) => !isLikelyBadSourceUrl(item.url))
    .filter((item) => !isStaleNewsSignal(item))
    .filter((item) => !looksLikeEntertainmentResult(item.title, item.url))
    .filter((item) => item.sourceKind === 'sec' || !looksLikeCommercialListingPage(item.title, item.snippet, item.snippet, item.url))
    .filter((item) => !account || isAccountRelevantCandidate(account, item))
    .slice()
    .map((item, index) => ({
      ...item,
      __index: index,
      __sourceTrust: account ? getSourceTrustRank(account, item) : 0,
      __ageAdjustedPriority: getAgeAdjustedPriority(item),
    } as RankedResearchHit))
    .sort((a, b) => {
      if (a.__ageAdjustedPriority !== b.__ageAdjustedPriority) return a.__ageAdjustedPriority - b.__ageAdjustedPriority
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
    .map(({ __index, __sourceTrust, __ageAdjustedPriority, ...item }) => item)
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
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  if (!candidate) {
    const businessSpecificLine = buildBusinessSpecificFallbackLine(account, candidate)
    if (businessSpecificLine) return businessSpecificLine
    return buildOpeningIndustryLine(inferIndustryCluster(account, candidate), true, accountText)
  }
  const signalAnchor = deriveSignalAnchor(account, candidate)
  const hasSpecificAnchor = signalAnchor && signalAnchor.toLowerCase() !== companyName.toLowerCase()
  const candidateText = `${candidate.title || ''} ${candidate.snippet || ''}`
  const blockedOpening = hasStrongNewLocationEvidence(candidateText) && !isTexasRelevantLocationSignal(candidateText)

  if (blockedOpening) {
    return `There’s a recent update about ${companyName} worth paying attention to.`
  }

  if (candidate.sourceKind === 'web' && isCompanyWebsiteHit(account, candidate)) {
    if (isOfficialCompanyAnnouncement(account, candidate)) {
      return hasSpecificAnchor
        ? `The announcement about ${signalAnchor} is the part that matters here.`
        : `The announcement from ${companyName} is the part that matters here.`
    }
    return `The website update from ${companyName} points to how the business is operating right now.`
  }

  // Add variation based on priority to prevent repetition
  const variations = {
    linkedin: [
      hasSpecificAnchor ? `The post about ${signalAnchor} shows what ${companyName} is working on.` : `The recent LinkedIn activity from ${companyName} is worth a look.`,
      hasSpecificAnchor ? `The LinkedIn update about ${signalAnchor} points to how ${companyName} is changing.` : `The recent activity on ${companyName}'s LinkedIn page is worth a look.`,
      hasSpecificAnchor ? `The update about ${signalAnchor} shows the direction ${companyName} is moving.` : `The recent activity from ${companyName} online is worth paying attention to.`,
    ],
    sec: [
      hasSpecificAnchor ? `The note about ${signalAnchor} in a recent public filing is worth paying attention to.` : `The recent filings for ${companyName} give a useful view of the business.`,
      hasSpecificAnchor ? `The public report about ${signalAnchor} shows what ${companyName} is focused on.` : `The recent reporting for ${companyName} is worth a look.`,
      hasSpecificAnchor ? `The filing update about ${signalAnchor} is the part that matters here.` : `The recent reporting on ${companyName} is worth understanding.`,
    ],
    web_official: [
      hasSpecificAnchor ? `The announcement about ${signalAnchor} is the part that matters here.` : `The recent updates from ${companyName}'s newsroom are worth a look.`,
      hasSpecificAnchor ? `The recent announcement about ${signalAnchor} is the key detail.` : `The recent updates from ${companyName} are worth a look.`,
      hasSpecificAnchor ? `The news about ${signalAnchor} is the part that matters here.` : `The news from ${companyName} is worth paying attention to.`,
    ],
    web: [
      hasSpecificAnchor ? `The piece about ${signalAnchor} points to how ${companyName} is operating right now.` : `The current footprint at ${companyName} is the part worth understanding.`,
      hasSpecificAnchor ? `The article about ${signalAnchor} points to how ${companyName} is operating right now.` : `The operational picture at ${companyName} is worth understanding.`,
      hasSpecificAnchor ? `The piece on ${signalAnchor} points to how ${companyName} is operating.` : `The operating picture at ${companyName} is worth understanding.`,
    ],
    news: [
      hasSpecificAnchor ? `The update that ${companyName} ${buildEventClause(signalAnchor)} is the part that matters.` : `The recent update on ${companyName} is worth paying attention to.`,
      hasSpecificAnchor ? `The report that ${companyName} ${buildEventClause(signalAnchor)} points to what is changing.` : `The recent reporting on ${companyName} is worth understanding.`,
      hasSpecificAnchor ? `The news that ${companyName} ${buildEventClause(signalAnchor)} is the key detail.` : `The news around ${companyName} is worth a look.`,
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

  if (hasGolfClubSignals(accountText)) {
    return `${prefix}, the main factor is usually how clubhouse HVAC, dining, cart charging, and course irrigation are showing up on the bill.`
  }

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
      if (hasHomeHealthHospiceSignals(accountText)) {
        return `${prefix}, the main factor is usually how care coordination, office HVAC, and phone systems are showing up on the bill.`
      }
      if (hasStrongDmeSignals(accountText)) {
        return `${prefix}, the main factor is usually how equipment deliveries, inventory, service turnaround, and storage are landing on that location.`
      }
      if (hasStrongDentalSignals(accountText)) {
        return `${prefix}, the main factor is usually how operatories, imaging, sterilization, patient flow, and HVAC are landing on that dental office meter.`
      }
      if (/\b(pharmacy|pharmacies|compounding|apothecary|chemist)\b/i.test(accountText)) {
        return `${prefix}, the main factor is usually how cleanroom HVAC, product refrigeration, and retail flow are landing on that pharmacy meter.`
      }
      return `${prefix}, the critical detail is how clinical equipment, HVAC, and daily timing are showing up as peak charges on that meter.`
    case 'restaurant':
      return `${prefix}, the biggest risk is usually kitchen load and HVAC hitting during peak hours and driving up transmission fees.`
    case 'retail':
      if (hasStrongTruckDealerSignals(accountText)) {
        return `${prefix}, the main factor is usually how service bays, body shop work, parts support, and training spaces are landing on that truck dealership meter.`
      }
      if (hasStrongRVDealerSignals(accountText) && !hasRvSupportSignals(accountText)) {
        return `${prefix}, the main factor is usually how service bays, parts support, and showroom HVAC are landing on that RV dealer meter.`
      }
      if (hasStrongAutomotiveSignals(accountText)) {
        return `${prefix}, the main factor is usually how showroom traffic, service bays, parts, and lot lighting are landing on that dealership meter.`
      }
      return `${prefix}, the hidden cost is often lighting and HVAC load creating spikes that move the bill before you notice it.`
    case 'hospitality_group':
      return `I'm curious, how do y'all check each hotel on its own meter to spot which property is pushing the bill, or is that pretty much on autopilot?`
    case 'hotel_owner':
      return `I'm curious, how do y'all tell whether guest rooms, laundry, kitchen service, or HVAC is creating the bigger spike, or is that pretty much on autopilot?`
    case 'logistics':
      if (hasTruckLeasingSignals(accountText)) {
        return `${prefix}, the main factor is usually how maintenance shops, fleet staging, yard lighting, and office load are landing on the truck leasing site.`
      }
      if (hasRvSupportSignals(accountText)) {
        return `${prefix}, the main factor is usually how setup bays, staging, inventory handling, and warehouse HVAC are landing on that RV support site.`
      }
      if (hasConstructionMachinerySupportSignals(accountText)) {
        return `${prefix}, the main factor is usually how service bays, parts areas, and equipment testing are showing up on the bill.`
      }
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
      return `${prefix}, the question is whether the bill still matches how the business is actually using power.`
  }
}

function hasMultiLocationEvidence(account: AccountRow, candidate: ResearchHit | null) {
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  return /\b(multi[-\s]?unit|multi[-\s]?site|multiple locations|locations across|several locations|portfolio|stores?|branches|dealerships?|restaurant group)\b/.test(text)
}

function buildBusinessSpecificFallbackLine(account: AccountRow, candidate: ResearchHit | null) {
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  const company = cleanText(account.name) || 'the company'

  // Infer industry cluster to prevent cross-industry regex false matches
  const cluster = inferIndustryCluster(account, candidate)

  if (hasGolfClubSignals(text)) {
    return 'Often times for a golf club, clubhouse HVAC, dining, cart charging, and course irrigation can all hit the meter in different ways because the clubhouse and course run on different schedules.'
  }

  if (cluster === 'residential_care' && /(children'?s home|foster care|adoption assistance|residential services|independent living center|counseling center|youth services|human services|group home|residential[- ]care|shelter|women's shelter|emergency shelter|homeless shelter|transitional housing|supportive housing)/.test(text)) {
    return 'Often times for a residential care nonprofit, it\'s hard to separate what the homes, counseling spaces, and support services are each adding to the bill because of how multiple meters roll up.'
  }

  // Food production check - restrict to manufacturing cluster and avoid refrigeration-only false positives for industrial/commercial accounts
  if (cluster === 'manufacturing' && (/(food production|food manufacturing|food manufacturer|food processing|bakehouse|baking line|production kitchen)/.test(text) ||
      (/(refrigerat|freezer|cold chain)/.test(text) && /\b(food|beverage|bakery|processing|poultry|meat|dairy|grocery|fruit|vegetable|snack|cookie|confectionery|brewery|distillery|winery|kitchen|meals)\b/.test(text)))) {
    return 'Often times in a food production facility, it\'s difficult to prevent refrigeration, ovens, and bake-line start-ups from hitting the meter at the exact same time because of overlapping production shifts.'
  }

  if (cluster === 'manufacturing' && /(spill control|sorbent|sorbents|spill kits|secondary containment|spill response|environmental response|drums|granulars|containment)/.test(text)) {
    return 'Often times for a specialty manufacturer, it\'s hard to prevent mixing, packaging, and warehouse climate control from running together and driving up the peak charge because of simultaneous process demands.'
  }

  // Logistics check - use word boundaries and restrict to logistics cluster
  if (cluster === 'logistics' && hasTruckLeasingSignals(text)) {
    return 'Often times for a truck leasing and rental operation, maintenance shops, fleet staging, yard lighting, and office load can all hit the meter in the same busy window.'
  }
  if (cluster === 'logistics' && /(rv support|rv setup|rv assembly|staging|warehouse support|recreational vehicle industry)/.test(text)) {
    return 'Often times for an RV support warehouse, setup bays, staging, inventory handling, and warehouse HVAC can all hit the meter in the same busy window.'
  }
  if (cluster === 'logistics' && hasTruckLeasingSignals(text)) {
    return 'Often times for a truck leasing and rental operation, maintenance shops, fleet staging, yard lighting, and office load can all hit the meter in the same busy window.'
  }
  if (cluster === 'logistics' && /(freight forwarder|nvocc|\bcargo\b|\bshipping\b|\btrucking\b|\btransport\b|\btransportation\b|\blogistics\b|\bwarehouse\b|\bdistribution\b|\bfulfillment\b|auto logistics)/.test(text)) {
    return 'Often times in a logistics operation, it\'s hard to tell whether dock activity, office load, or warehouse support is what\'s actually setting that monthly peak because the busy parts of the day overlap.'
  }

  if (cluster === 'school_district' && /\b(isd|independent school district|school district|public school|charter school|campus)\b/.test(text)) {
    return 'Often times for a school district, it\'s difficult to keep classroom HVAC and sports lighting from spiking the meter during seasonal occupancy shifts because of varying extracurricular calendars.'
  }

  if (hasConstructionMachinerySupportSignals(text)) {
    return 'Often times for a construction equipment sales and service business, it\'s hard to separate service bays, parts areas, equipment testing, and shop HVAC from a normal office load because those service windows overlap.'
  }

  if (/\b(cooling|coolers?|heating|heaters?|hvac|evaporative|portable ac|air conditioning)\b/.test(text)) {
    if (cluster === 'office_services' || cluster === 'manufacturing' || cluster === 'unknown') {
      return 'Often times in a service or contractor facility, it\'s hard to manage sudden shifts in shop equipment use and vehicle bays without hitting a peak charge because of unpredictable workflow schedules.'
    }
  }

  if (/\b(glass|mirror|shower door|shower doors|window|windows|fabricat|showroom|installation|installer|shop floor)\b/.test(text)) {
    if (cluster === 'manufacturing' || cluster === 'retail' || cluster === 'unknown') {
      return 'Often times in a shop and showroom, it\'s hard to separate fabrication and machinery start-ups from normal AC usage because of shared electrical service.'
    }
  }

  if (cluster === 'logistics' && hasStrongDmeSignals(text)) {
    return `Often times for an equipment network, it's hard to track how branch deliveries, storage, and turnaround are moving the peak on each individual meter because of fragmented billing systems.`
  }

  if (cluster === 'retail' && hasStrongAutomotiveSignals(text)) {
    return `Often times for a dealership, it's hard to prevent the service bays and showroom AC from running wide open at the exact same time because of constant customer and vehicle traffic.`
  }

  if (cluster === 'retail' && hasStrongTruckDealerSignals(text)) {
    return `Often times for a heavy-duty truck dealership, it's hard to keep service bays, body shop work, and parts support from running at the same time because those repair windows overlap.`
  }

  if (cluster === 'retail' && hasStrongRVDealerSignals(text) && !hasRvSupportSignals(text)) {
    return `Often times for an RV dealership, it's hard to keep service bays, parts support, and customer waiting areas from driving the bill at the same time because of constant service traffic.`
  }

  if (cluster === 'retail' && hasConvenienceStoreSignals(text)) {
    return `Often times for a convenience-store chain, it's hard to tell whether refrigeration, store lighting, or summer HVAC is what is really pushing the bill because every store runs a little differently.`
  }

  if (cluster === 'retail' && hasGameRetailSignals(text)) {
    return `Often times for a game and hobby retailer, it's hard to separate retail floor usage from online order and warehouse support because both can show up on the same monthly bill.`
  }

  if (cluster === 'logistics' && /\b(wholesale|distributor|distribution|bearing|hydraulic|hydraulics|industrial hose|power transmission|fluid power)\b/.test(text)) {
    return 'Often times for a wholesale distributor, it\'s difficult to separate office climate control, warehouse handling, and shop gear when they all hit the meter at once because of overlapping operating hours.'
  }

  if (cluster === 'manufacturing' && /\b(trailer|trailers|heavy haul|heavy-duty|heavy duty|gooseneck|lowboy|transportation equipment|vehicle recovery|commercial trailer|truck equipment)\b/.test(text)) {
    return 'Often times in a trailer manufacturing operation, it\'s hard to prevent welding, assembly, and heavy compressors from creating peak usage spikes because of simultaneous heavy machinery startup.'
  }

  if (cluster === 'healthcare' && /(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry|multi-site dental|dental partnership organization)/.test(text)) {
    return 'Often times in a dental clinic, it\'s difficult to manage patient-chair usage, imaging, and sterilization cycles without driving up the peak demand charge because of continuous patient scheduling.'
  }

  if (cluster === 'healthcare' && hasHomeHealthHospiceSignals(text)) {
    return 'Often times for a home health and hospice provider, office HVAC, care coordination, and phone systems can all move the bill in different ways depending on the schedule.'
  }

  if (cluster === 'healthcare' && /\b(pharmacy|pharmacies|compounding|apothecary|chemist)\b/i.test(text)) {
    return 'Often times for a specialized pharmacy, it\'s hard to run cleanroom HVAC and 24/7 refrigeration without setting a high billing floor because of strict temperature and air-quality standards.'
  }

  // Single senior-living campus — never use hospital/network framing
  if (cluster === 'healthcare' && /\b(senior living|assisted living|memory care|skilled nursing|retirement living|nursing home|alzheimer'?s?)\b/i.test(text)) {
    return 'Often times for a senior living community, it\'s difficult to balance 24/7 resident comfort with cooling cycles that spike the demand ratchet because of strict climate control requirements.'
  }

  if (cluster === 'healthcare' && /\b(healthcare|hospital|medical center|health system|acute care|behavioral health|clinic|surgery center|ambulatory|medical practice)\b/.test(text)) {
    return 'Often times for a clinical facility, it\'s hard to separate heavy medical gear and patient-care spaces from normal building cooling costs because of continuous clinical operations.'
  }

  if (cluster === 'hotel_owner' && /\b(hotel|hotels|resort|resorts|motel|inn|lodging|guest rooms?|lobby|laundry|brand flag|hospitality property)\b/.test(text)) {
    return 'Often times for a hospitality property, it\'s difficult to manage guest rooms, laundry, and kitchen load without them all peaking at the exact same time because of varying occupancy levels.'
  }

  if (cluster === 'healthcare' && /\b(mental health|behavioral health|behavioral healthcare|idd|intellectual and developmental disabilities|developmental disabilities|community mental health|community center|crisis center|crisis hotline|outpatient adult|outpatient youth|substance use|early childhood intervention|care coordination|peer support)\b/.test(text)) {
    return 'Often times for a behavioral health center, it\'s hard to keep track of how different programs and crisis spaces are driving the peak across separate meters because of irregular occupancy patterns.'
  }

  if (cluster === 'education_nonprofit' && /\b(education|nonprofit|non-profit|exchange program|exchange programs|stem|scholarship|student|students|programs?)\b/.test(text)) {
    return 'Often times for a program-based nonprofit, it\'s hard to prevent classroom cooling and special events from triggering a high billing floor for the entire year because of irregular facility schedules.'
  }

  if (cluster === 'office_services' && /\b(office|professional services|consulting|accounting|law|legal|agency|design|engineering|architect)\b/.test(text)) {
    return 'Often times in an office environment, it\'s difficult to keep day-to-day HVAC and office computing load from setting a stealth billing floor because of constant base-load operations.'
  }

  return ''
}

function buildFallbackIndustryLine(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext) {
  const multiLocation = hasMultiLocationEvidence(account, candidate)
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  const businessSpecificLine = buildBusinessSpecificFallbackLine(account, candidate)

  if (businessSpecificLine) {
    return businessSpecificLine
  }

  if (multiLocation) {
    if (hasStrongDmeSignals(accountText)) {
      return `Often times for a multi-location equipment network, each direct-service location behaves differently on its own meter because deliveries, inventory, storage, and service turnaround don't hit every branch the same way.`
    }
    if (context.industryCluster === 'restaurant') {
      return `Often times for a multi-location restaurant group, it's hard to prevent kitchen equipment, HVAC, and refrigeration from driving up the peak charge on separate store meters.`
    }
    if (hasGolfClubSignals(accountText)) {
      return `Often times for a golf club, clubhouse HVAC, dining, cart charging, and course irrigation can all push the meter in different ways because the clubhouse and course run on different schedules.`
    }
    if (context.industryCluster === 'retail') {
      const profile = getAccountIdentityProfile(account, candidate)
      const isNationalRetailDistribution = profile?.companyType === 'national retail and distribution network' || 
                                           (detectMultiSiteScale(account, candidate).isMultiSite && /(distribution|warehouse|manufacturing|headquarters|hq)/i.test(accountText))
      if (isNationalRetailDistribution) {
        return `Often times for a national retail and distribution network, distribution center cooling, store HVAC, and manufacturing process loads hit the meter during the same peak windows.`
      }
      if (hasStrongAutomotiveSignals(accountText)) {
        return `Often times for a multi-location dealership group, it's difficult to prevent service bays, parts departments, and showroom AC from running wide open at the same time.`
      }
      return `Often times for a multi-location retail group, store hours, traffic, lighting, and HVAC hide very different cost patterns by location.`
    }
  }

  if (context.industryOpeners && context.industryOpeners.length > 0) {
    const opener = context.industryOpeners.find((item) => {
      const lower = cleanText(item).toLowerCase()
      if (!lower) return false
      return !TALK_TRACK_GENERIC_PATTERNS.some((pattern) => pattern.test(lower))
    })
    if (opener) {
      if (!opener.toLowerCase().startsWith('often times')) {
        return `Often times ${opener.charAt(0).toLowerCase()}${opener.slice(1)}`
      }
      return opener
    }
  }

  switch (context.industryCluster) {
    case 'hospitality_group':
      return `Often times for a hospitality group, it's hard to keep each property's guest rooms, laundry, and HVAC from landing on the meter in the same busy window.`
    case 'hotel_owner':
      return `Often times for a hotel property, guest rooms, laundry, kitchen service, and HVAC can all stack up on the meter in the same busy window.`
    case 'school_district':
      return `Often times for a school district, campus HVAC, athletics, cafeteria load, and classroom technology can all push different meters in different ways.`
    case 'higher_education':
      return `Often times for a higher education campus, residence halls, classrooms, labs, and dining load can all stack up on the bill at different times.`
    case 'public_sector':
      return `Often times for a public sector operation, administrative offices, public safety sites, and utility buildings can all show up differently on the bill.`
    case 'healthcare':
      return `Often times for a healthcare facility, clinical equipment, HVAC, and daily timing can all create very different usage patterns.`
    case 'logistics':
      return `Often times for a distribution operation, dock activity, storage climate control, and office HVAC can all drive different bill patterns.`
    case 'manufacturing':
      return `Often times for a manufacturing operation, equipment timing, compressed air, and process loads can all hit the meter at different times.`
    case 'retail':
      return `Often times for a retail operation, store traffic, lighting, and HVAC can all push the bill in different directions.`
    case 'restaurant':
      return `Often times for a restaurant operation, kitchen timing, refrigeration, and AC can all drive different bill patterns.`
    default:
      return `Often times for ${cleanText(account.name) || 'the company'}, it's difficult to tell whether the utility meters are actually aligned with the real operational activity.`
  }
}

function buildFallbackQuestion(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext) {
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  if (hasGolfClubSignals(accountText)) {
    return `I'm curious, how do y'all tell whether clubhouse HVAC, dining, or course support is what moved the bill that month, or is that side of things pretty much on autopilot?`
  }
  const multiLocation = hasMultiLocationEvidence(account, candidate)
  if (multiLocation) {
    if (context.industryCluster === 'restaurant' || context.industryCluster === 'retail') {
       return `I'm curious, have you compared the sites side by side, or is each location pretty much handled separately?`
    }
  }

  if (context.question) {
    const question = context.question.replace(/\?+$/, '')
    const genericQuestion = TALK_TRACK_GENERIC_PATTERNS.some((pattern) => pattern.test(question.toLowerCase()))
    if (question && !genericQuestion && !question.toLowerCase().startsWith("i'm curious")) {
      return `I'm curious, ${question.charAt(0).toLowerCase()}${question.slice(1)}, or is that side of things pretty much on autopilot?`
    }
    if (question && !genericQuestion) return context.question
  }

  switch (context.industryCluster) {
    case 'hospitality_group':
      return `I'm curious, how do y'all check each hotel on its own meter to spot which property is pushing the bill, or is that side of things pretty much on autopilot?`
    case 'hotel_owner':
      return `I'm curious, how do y'all tell whether guest rooms, laundry, kitchen service, or HVAC is what moved the bill that month, or is that side of things pretty much on autopilot?`
    case 'school_district':
      return `I'm curious, how do y'all tell whether campus HVAC, athletics, or classroom technology is what moved the bill that month, or is that side of things pretty much on autopilot?`
    case 'healthcare':
      return `I'm curious, how do y'all tell whether clinical equipment, HVAC, or daily timing is what moved the bill that month, or is that side of things pretty much on autopilot?`
    case 'logistics':
      return `I'm curious, how do y'all tell whether dock activity, storage, or HVAC is what moved the bill that month, or is that side of things pretty much on autopilot?`
    case 'manufacturing':
      return `I'm curious, how do y'all tell whether equipment timing, compressed air, or process loads is what moved the bill that month, or is that side of things pretty much on autopilot?`
    case 'retail': {
      const profile = getAccountIdentityProfile(account, candidate)
      const isNationalRetailDistribution = profile?.companyType === 'national retail and distribution network' || 
                                           (detectMultiSiteScale(account, candidate).isMultiSite && /(distribution|warehouse|manufacturing|headquarters|hq)/i.test(accountText))
      if (isNationalRetailDistribution) {
        return `I'm curious, how do y'all separate the electricity bills for the central manufacturing and distribution hub from the nationwide store network, or is that side of things pretty much on autopilot?`
      }
      return `I'm curious, how do y'all tell whether traffic, lighting, or HVAC is what moved the bill that month, or is that side of things pretty much on autopilot?`
    }
    case 'restaurant':
      return `I'm curious, how do y'all tell whether kitchen timing, refrigeration, or AC is what moved the bill that month, or is that side of things pretty much on autopilot?`
    default:
      return `I'm curious, have you looked at whether the bill setup still matches how y'all use power, or is that side of things pretty much on autopilot?`
  }
}

function isLikelyBadSourceUrl(value: string) {
  const url = cleanText(value)
  if (!url) return true

  const hostname = getHostname(url)
  if (!hostname) return true
  const lowerUrl = url.toLowerCase()

  if (hostname === 'news.google.com' || hostname.endsWith('.news.google.com')) {
    return true
  }

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
  const text = `${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${notes} ${candidate?.title || ''} ${candidate?.snippet || ''}`
  const lower = text.toLowerCase()
  
  // Extract location count if mentioned (allowing commas, e.g. 1,000)
  const locationMatch = /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:schools?|locations?|sites?|campuses|stores?|branches?|dealerships?|facilities|restaurants?|units?|buildings?)/i.exec(text)
  const locationCount = locationMatch ? parseInt(locationMatch[1].replace(/,/g, ''), 10) : null
  
  // Extract regions/states mentioned
  const statePattern = /(texas|california|florida|new york|ohio|louisiana|georgia|illinois|pennsylvania|north carolina|michigan|virginia|washington|arizona|massachusetts|tennessee|indiana|missouri|maryland|wisconsin|colorado|minnesota|south carolina|alabama|kentucky|oregon|oklahoma|connecticut|iowa|mississippi|arkansas|kansas|utah|nevada|new mexico|west virginia|nebraska|idaho|hawaii|maine|new hampshire|rhode island|montana|delaware|south dakota|north dakota|alaska|vermont|wyoming)/gi
  const states = text.match(statePattern) || []
  const uniqueStates = Array.from(new Set(states.map(s => s.toLowerCase())))
  
  const isMultiSite = (locationCount !== null && locationCount >= 10) || 
                      uniqueStates.length >= 2 ||
      /\b(multi[-\s]?site|portfolio|network|(?<!supply\s)chain|across \d+ (?:u\.?s\.?\s+)?(?:states?|regions?)|nationwide)\b/i.test(lower)
  
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
  const companySpecificCandidates = candidates.filter((c) => c.label !== 'Industry Trends')
  const researchText = companySpecificCandidates
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
    description: cleanText(`${getPublicAccountDescription(account)} ${researchText} ${hierarchyText}`),
  }
  const primaryCandidate = companySpecificCandidates[0] || null
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${researchText} ${hierarchyText}`).toLowerCase()
  const isPublicSector = /\b(city of|county government|county of|municipal|public facilities|utility infrastructure|public safety|public works)\b/i.test(text)
  const baseCluster = inferIndustryClusterFromSignals(account, null)
  const derivedCluster = inferIndustryClusterFromSignals(synthesizedAccount, primaryCandidate)
  let cluster = isPublicSector ? 'public_sector' : resolvePreferredIndustryCluster(baseCluster, derivedCluster)
  if (hasTruckLeasingSignals(text) || hasStrongDmeSignals(text) || hasRvSupportSignals(text)) {
    cluster = 'logistics'
  }
  const multiSiteInfo = detectMultiSiteScale(synthesizedAccount, primaryCandidate)

  if (!text && !savedProfile) return null
  if (!text && savedProfile) return savedProfile

  const classificationText = text.replace(/hospital\s*(?:s)?\s*(?:&|and)\s*health\s*care/gi, 'healthcare')
  const hasHospitalSignals = /\b(hospital|neighborhood hospital|micro[-\s]?hospital|community hospital|small-format hospital|licensed hospital|emergency room|emergency care|inpatient care|inpatient bed|acute care)\b/i.test(classificationText)
  const isBehavioralHealth = hasStrongBehavioralHealthSignals(text)
  const isSeniorLiving = /(senior living|assisted living|memory care|skilled nursing|retirement living|continuum of care|nursing home|alzheimer'?s? care|independent living cottages?|apartments?)/i.test(text)
  const isDentalPractice = hasStrongDentalSignals(text)
  const isDmeProvider = hasStrongDmeSignals(text)
  const isBloodCenter = /(blood center|bloodcare|blood bank|blood donation|blood products|blood components|transfusion|donor center|mobile blood drives?|blood collection|blood processing|specialized laboratory testing)/i.test(text)
  const isFoodProduction = /(food production|food manufacturing|food manufacturer|food processing|food processing facilities|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|\bfoodservice\b)/i.test(text)
    && !/(fiberglass|conduit|strut|epoxy|resin|electrical|mechanical markets?|winding equipment|curing ovens?|phenolic|duct)/i.test(text)
  const isCoffeeRoaster = /\b(small-batch|custom)?\s*coffee roasting\b|\bcustom roasting\b|\broasting equipment\b|\bgreen beans\b|\bcoffee roaster\b/i.test(text)
  const isGrainBakeryManufacturer = hasFrozenBakeryProductionSignals(text)
  const isPetrochemicalProducer = hasStrongPetrochemicalSignals(text)
  const isFurnitureManufacturer = hasFurnitureManufacturingSignals(text)
  const isTruckDealer = hasStrongTruckDealerSignals(text)
  const isRVDealer = hasStrongRVDealerSignals(text) && !hasRvSupportSignals(text)
  const isAutoGroup = hasStrongAutomotiveSignals(text) && !isTruckDealer && !isRVDealer
  const isAutoPartsDistributor = hasStrongAutoPartsDistributionSignals(text)
  const isMaterialHandlingEquipment = hasMaterialHandlingEquipmentSignals(text)
  const isLifestyleRetailStore = /(lifestyle (?:and )?design store|luxury retail|apothecary|lifestyle retail|design store)/i.test(text)
  const isConvenienceStore = hasConvenienceStoreSignals(text)
  const isGameRetailer = hasGameRetailSignals(text)
  const isManufacturersRepAgency = hasStrongManufacturersRepSignals(text)
  const isBakeryCafe = hasStrongBakeryCafeSignals(text)
  const isReadyMixConcrete = hasReadyMixConcreteSignals(text)
  const isFreightForwarder = /\b(freight forwarder|nvo?cc|auto logistics|shipping|cargo|international transport|oversized cargo|roro|flat rack)\b/i.test(text)
  const isHotelGroup = /\b(hospitality group|hotel management|portfolio of hotels|hotel portfolio|hotel owner|resort portfolio|branded hotel owner)\b/i.test(text)
  const isHotelProperty = /\b(hotel|resort|motel|inn|guest rooms?|lodging)\b/i.test(text)
  const isGolfClub = hasGolfClubSignals(text)
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

      if (hasHomeHealthHospiceSignals(text)) {
        companyType = multiSiteInfo.isMultiSite ? 'home health and hospice network' : 'home health and hospice provider'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site care coordination network' : 'home-care and hospice coordination office'
        facilityType = 'home health / hospice office'
        identityKeywords = selectIdentityKeywords(text, ['home health', 'hospice', 'end of life care', 'care coordination', 'patient support', 'visiting nurses', 'palliative care'], ['home health', 'hospice', 'care coordination'])
        powerKeywords = selectIdentityKeywords(text, ['office HVAC', 'care coordination', 'phone systems', 'staff support', 'records and scheduling'], ['office HVAC', 'care coordination', 'phone systems'])
        talkTrackGuardrails = ['No hospital language', 'No clinic language', 'No emergency department language', 'No inpatient language', 'No patient-room language', 'No manufacturing language']
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
        const isPsychHospital = hasHospitalSignals || /(acute care|inpatient|beds?|residential treatment|partial hospitalization|intensive outpatient)/i.test(text)
        companyType = isPsychHospital ? 'behavioral health hospital' : (multiSiteInfo.isMultiSite ? 'behavioral health network' : 'behavioral health provider')
        operatingModel = isPsychHospital ? 'inpatient and outpatient psychiatric care facility' : (multiSiteInfo.isMultiSite ? 'distributed community-care network' : 'community-care facility')
        facilityType = isPsychHospital ? 'psychiatric hospital / treatment facility' : 'clinic / crisis center / support building'
        identityKeywords = selectIdentityKeywords(text, ['psychiatric care', 'behavioral health', 'mental health', 'substance use disorder', 'chemical dependency', 'inpatient care', 'partial hospitalization', 'intensive outpatient', 'residential treatment'], ['behavioral health', 'psychiatric care', 'treatment programs'])
        powerKeywords = selectIdentityKeywords(text, ['patient safety', 'patient comfort', 'HVAC', 'inpatient units', 'residential treatment', 'clinical space', 'support buildings'], ['patient comfort', 'HVAC', 'inpatient units'])
        talkTrackGuardrails = ['No manufacturing language', 'No emergency-room language unless source confirms ER', 'No imaging/lab language unless source confirms it', 'No restaurant language', 'No hotel language']
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
      if (isReadyMixConcrete) {
        companyType = multiSiteInfo.isMultiSite ? 'ready-mix concrete and aggregates network' : 'ready-mix concrete and aggregates supplier'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site ready-mix and aggregates footprint' : 'ready-mix production and job-site delivery operation'
        facilityType = 'ready-mix / aggregates operation'
        identityKeywords = selectIdentityKeywords(text, ['ready-mixed concrete', 'aggregates', 'crushed stone', 'sand and gravel', 'concrete delivery', 'batch plants', 'mixer trucks', 'construction materials'], ['ready-mixed concrete', 'aggregates', 'concrete delivery'])
        powerKeywords = selectIdentityKeywords(text, ['batching equipment', 'aggregate handling', 'conveyors', 'pumps', 'compressors', 'washout/reclaim systems', 'yard lighting', 'truck dispatch'], ['batching equipment', 'aggregate handling', 'truck dispatch'])
        talkTrackGuardrails = ['No generic manufacturing language', 'No retail language', 'No office-only language', 'No dock-only logistics language']
        break
      }

      if (isCoffeeRoaster) {
        companyType = 'coffee roasting operation'
        operatingModel = 'small-batch roasting and wholesale coffee supply'
        facilityType = 'coffee roasting / production facility'
        identityKeywords = selectIdentityKeywords(text, ['small-batch roasting', 'custom roasting', 'coffee roasting', 'green beans', 'wholesale coffee', 'restaurant and coffeehouse customers'], ['coffee roasting', 'green beans', 'wholesale coffee'])
        powerKeywords = selectIdentityKeywords(text, ['roasting equipment', 'cooling', 'green bean storage', 'packaging', 'HVAC'], ['roasting equipment', 'cooling', 'packaging'])
        talkTrackGuardrails = ['No restaurant language', 'No dining-room language', 'No retail-only language']
        break
      }

      if (isGrainBakeryManufacturer) {
        companyType = multiSiteInfo.isMultiSite ? 'grain-based and frozen bakery production network' : 'grain-based and frozen bakery manufacturer'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site bakery manufacturing footprint' : 'bakery production facility'
        facilityType = 'food production plant'
        identityKeywords = selectIdentityKeywords(text, ['grain-based products', 'frozen bakery products', 'flour mill', 'biscuits', 'muffins', 'bakery manufacturing'], ['grain-based products', 'frozen bakery products', 'bakery manufacturing'])
        powerKeywords = selectIdentityKeywords(text, ['mixing', 'milling', 'ovens', 'freezers', 'packaging', 'sanitation', 'HVAC'], ['mixing', 'ovens', 'freezers', 'packaging'])
        talkTrackGuardrails = ['No restaurant language', 'No retail language', 'No logistics-only language']
        break
      }

      if (hasFiberglassConduitSignals(text)) {
        companyType = 'fiberglass conduit manufacturer'
        operatingModel = 'fiberglass conduit and strut production'
        facilityType = 'fiberglass conduit production facility'
        identityKeywords = selectIdentityKeywords(text, ['fiberglass conduit', 'fiberglass strut', 'epoxy fiberglass', 'phenolic conduit', 'flame shield', 'haz duct', 'electrical and mechanical markets'], ['fiberglass conduit', 'fiberglass strut', 'electrical infrastructure products'])
        powerKeywords = selectIdentityKeywords(text, ['winding equipment', 'curing ovens', 'resin/process areas', 'finishing', 'plant HVAC'], ['winding equipment', 'curing ovens', 'finishing'])
        talkTrackGuardrails = ['No food production language', 'No restaurant language', 'No retail language', 'No office-only language']
        break
      }

      if (isFoodProduction) {
        companyType = multiSiteInfo.isMultiSite ? 'food production network' : 'food manufacturer'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site production network' : 'production facility'
        facilityType = 'production plant'
        identityKeywords = selectIdentityKeywords(text, ['food production', 'food manufacturing', 'food processing', 'usda-approved', 'custom proteins', 'soups', 'sauces', 'foodservice'], ['food production', 'food processing', 'USDA production'])
        powerKeywords = selectIdentityKeywords(text, ['refrigeration', 'cooking', 'packaging', 'sanitation', 'freezer', 'cold chain'], ['refrigeration', 'packaging', 'sanitation'])
        talkTrackGuardrails = ['No warehouse-group language', 'No dock-only language']
        break
      }

      if (isFurnitureManufacturer) {
        companyType = multiSiteInfo.isMultiSite ? 'commercial furniture manufacturing network' : 'commercial furniture manufacturer'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site furniture production and showroom footprint' : 'furniture production and showroom operation'
        facilityType = 'furniture manufacturing / showroom facility'
        identityKeywords = selectIdentityKeywords(text, ['educational furniture', 'commercial furniture', 'visual communication tools', 'classroom furniture', 'desks', 'tables', 'chairs', 'showroom'], ['commercial furniture', 'educational furniture', 'showroom'])
        powerKeywords = selectIdentityKeywords(text, ['production equipment', 'assembly areas', 'showroom lighting', 'office HVAC', 'shipping areas'], ['production equipment', 'showroom lighting', 'office HVAC'])
        talkTrackGuardrails = ['No generic retail language', 'No pure showroom language', 'No logistics-only language']
        break
      }

      if (isPetrochemicalProducer) {
        companyType = 'petrochemical manufacturer'
        operatingModel = multiSiteInfo.isMultiSite ? 'manufacturing site and terminal network' : 'chemical processing facility'
        facilityType = 'petrochemical plant / terminal'
        identityKeywords = selectIdentityKeywords(text, ['petrochemical', 'C4 hydrocarbons', 'crude C4', 'butadiene', 'butene-1', 'MTBE', 'polyisobutylene', 'chemical products', 'Houston Ship Channel', 'product terminals'], ['petrochemical manufacturing', 'C4 processing', 'chemical products'])
        powerKeywords = selectIdentityKeywords(text, ['process equipment', 'separation', 'purification', 'chemical processing', 'pumps', 'compressors', 'storage terminals', 'safety systems'], ['process equipment', 'pumps', 'compressors', 'terminal operations'])
        talkTrackGuardrails = ['Do not call this logistics', 'No dock-only language', 'No warehouse language', 'Lead with chemical processing and plant operations']
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
      if (hasRvSupportSignals(text)) {
        companyType = multiSiteInfo.isMultiSite ? 'RV support and assembly network' : 'RV support and assembly operation'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site RV setup, staging, and support footprint' : 'RV setup, staging, and support operation'
        facilityType = 'RV support warehouse / setup facility'
        identityKeywords = selectIdentityKeywords(text, ['RV industry', 'RV support', 'RV setup', 'warehousing and setup', 'assembly', 'staging', 'motorhome prep'], ['RV support', 'RV setup', 'warehouse support'])
        powerKeywords = selectIdentityKeywords(text, ['warehouse support', 'assembly bays', 'staging area', 'loading dock', 'shop HVAC', 'lighting'], ['warehouse support', 'assembly bays', 'staging area'])
        talkTrackGuardrails = ['No dealership language', 'No hotel language', 'No hospitality language', 'No manufacturing plant language', 'No logistics hauling language']
        break
      }

      if (hasPalletManagementSignals(text)) {
        companyType = multiSiteInfo.isMultiSite ? 'pallet management and reverse logistics network' : 'pallet management and reverse logistics operation'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site pallet retrieval, repair, and sortation network' : 'pallet retrieval, repair, and sortation operation'
        facilityType = 'pallet management / reverse logistics facility'
        identityKeywords = selectIdentityKeywords(
          text,
          ['pallet management', 'reverse logistics', 'pallet retrieval', 'pallet repair', 'pallet recycling', 'pallet sortation', 'wood packaging', 'managed inventory'],
          ['pallet management', 'reverse logistics', 'pallet retrieval']
        )
        powerKeywords = selectIdentityKeywords(
          text,
          ['pallet repair bays', 'sortation equipment', 'warehouse support', 'inventory cycles', 'yard lighting', 'dock activity'],
          ['repair bays', 'sortation equipment', 'warehouse support']
        )
        talkTrackGuardrails = ['No manufacturing language', 'No factory language', 'No generic logistics language unless the source confirms it']
        break
      }

      if (isManufacturersRepAgency) {
        companyType = 'manufacturers representative agency'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-state sales and specification network' : 'office and showroom sales agency'
        facilityType = 'office / showroom / training space'
        identityKeywords = selectIdentityKeywords(text, ['manufacturers representative', 'lighting', 'electrical products', 'controls', 'architects', 'engineers', 'contractors', 'distributors'], ['manufacturers representative', 'lighting and electrical products', 'sales agency'])
        powerKeywords = selectIdentityKeywords(text, ['office HVAC', 'showroom lighting', 'training space', 'controls displays', 'IT equipment'], ['showroom lighting', 'office HVAC', 'training space'])
        talkTrackGuardrails = ['No logistics language', 'No warehouse language', 'No manufacturing language', 'No dock activity language']
        break
      }

      if (isMaterialHandlingEquipment) {
        companyType = multiSiteInfo.isMultiSite ? 'materials-handling equipment and service network' : 'materials-handling equipment supplier and service company'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-location equipment sales, parts, and service footprint' : 'equipment sales, parts, and service operation'
        facilityType = 'equipment sales / parts / service facility'
        identityKeywords = selectIdentityKeywords(text, ['materials handling', 'forklifts', 'Komatsu forklifts', 'pallet storage rack', 'JLG aerial lift equipment', 'warehouse equipment', 'equipment service'], ['materials handling', 'forklifts', 'warehouse equipment'])
        powerKeywords = selectIdentityKeywords(text, ['forklift charging', 'battery charging', 'service bays', 'parts areas', 'warehouse support', 'shop HVAC', 'HVLS fans'], ['forklift charging', 'service bays', 'parts areas'])
        talkTrackGuardrails = ['No manufacturing language', 'No production-line language', 'No compressed-air/process-load language unless source confirms their own plant', 'No auto-parts branch language']
        break
      }

      if (hasConstructionMachinerySupportSignals(text)) {
        companyType = multiSiteInfo.isMultiSite ? 'construction equipment sales and service network' : 'construction equipment sales and service company'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-location equipment sales, parts, and service footprint' : 'equipment sales, parts, and service operation'
        facilityType = 'equipment sales / parts / service facility'
        identityKeywords = selectIdentityKeywords(text, ['construction machinery', 'concrete mixers', 'mortar pumps', 'access equipment', 'dealer network', 'parts ordering', 'customer assistance'], ['construction machinery', 'concrete mixers', 'access equipment'])
        powerKeywords = selectIdentityKeywords(text, ['service bays', 'parts areas', 'equipment testing', 'shop HVAC', 'support space lighting'], ['service bays', 'parts areas', 'shop HVAC'])
        talkTrackGuardrails = ['No manufacturing plant language', 'No production-line language', 'No warehouse-only language unless source confirms it', 'No process-load language unless source confirms a plant']
        break
      }

      if (isAutoPartsDistributor) {
        companyType = multiSiteInfo.isMultiSite ? 'wholesale auto-parts distribution network' : 'wholesale auto-parts supplier'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-location parts distribution network' : 'parts supply and distribution site'
        facilityType = 'parts branch / distribution center'
        identityKeywords = selectIdentityKeywords(text, ['wholesale auto parts', 'automotive parts supplier', 'aftermarket parts', 'parts stores', 'distribution centers', 'same-day parts', 'repair centers'], ['wholesale auto parts', 'parts supplier', 'distribution network'])
        powerKeywords = selectIdentityKeywords(text, ['branch traffic', 'inventory turns', 'warehouse support', 'delivery timing', 'HVAC', 'parts counter'], ['branch traffic', 'inventory turns', 'delivery timing'])
        talkTrackGuardrails = ['No dealership language', 'No showroom/service-bay language unless the source confirms it', 'No lot-lighting language']
        break
      }

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

    case 'print_fulfillment':
      companyType = multiSiteInfo.isMultiSite ? 'print and fulfillment network' : 'print and fulfillment operation'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-site print, mailing, and fulfillment footprint' : 'print, mailing, and fulfillment site'
      facilityType = 'print shop / mailing / fulfillment facility'
      identityKeywords = selectIdentityKeywords(text, ['direct mail', 'mailing', 'reprographics', 'document reproduction', 'print production', 'on-demand printing', 'content management', 'fulfillment'], ['print fulfillment', 'direct mail', 'document services'])
      powerKeywords = selectIdentityKeywords(text, ['printing equipment', 'mailing equipment', 'fulfillment area', 'warehouse support', 'office HVAC', 'IT systems'], ['printing equipment', 'mailing equipment', 'fulfillment area'])
      talkTrackGuardrails = ['No heavy manufacturing language', 'No plant language', 'No dock-only logistics language']
      break

    case 'public_transit':
      companyType = 'public transit operator'
      operatingModel = 'public-service transit and vehicle-maintenance operation'
      facilityType = 'transit operations / maintenance facility'
      identityKeywords = selectIdentityKeywords(text, ['public transportation', 'transit authority', 'trolley', 'streetcar', 'historic trolley', 'car barn', 'fare-free service'], ['public transit', 'trolley service', 'vehicle maintenance'])
      powerKeywords = selectIdentityKeywords(text, ['vehicle maintenance', 'shop equipment', 'lighting', 'HVAC', 'public-service reliability'], ['vehicle maintenance', 'shop equipment', 'lighting'])
      talkTrackGuardrails = ['No warehouse language', 'No manufacturing language', 'No dock activity language']
      break

    case 'moving_storage':
      companyType = multiSiteInfo.isMultiSite ? 'moving and storage network' : 'moving and storage company'
      operatingModel = multiSiteInfo.isMultiSite ? 'multi-location moving, storage, and dispatch footprint' : 'moving, storage, and dispatch site'
      facilityType = 'warehouse / storage / dispatch facility'
      identityKeywords = selectIdentityKeywords(text, ['commercial moving', 'residential moving', 'storage', 'relocation', 'household goods', 'supply chain solutions'], ['moving and storage', 'relocation', 'storage'])
      powerKeywords = selectIdentityKeywords(text, ['warehouse lighting', 'dock activity', 'storage HVAC', 'dispatch office', 'equipment charging'], ['warehouse lighting', 'storage HVAC', 'dispatch office'])
      talkTrackGuardrails = ['No manufacturing language', 'No process equipment language']
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
      if (isTruckDealer) {
        companyType = multiSiteInfo.isMultiSite ? 'heavy-duty truck dealership group' : 'heavy-duty truck dealership'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site truck sales, service, and parts portfolio' : 'truck sales, service, and parts operation'
        facilityType = 'truck showroom / service bay / body shop'
        identityKeywords = selectIdentityKeywords(
          text,
          ['heavy-duty truck dealership', 'truck sales', 'truck service', 'truck parts', 'Freightliner', 'Western Star', 'Mitsubishi Fuso', 'Mercedes-Benz trucks', 'diesel technician training'],
          ['heavy-duty truck dealership', 'truck service', 'truck parts', 'diesel technician training']
        )
        powerKeywords = selectIdentityKeywords(
          text,
          ['service bays', 'body shop', 'training institute', 'shop HVAC', 'lot lighting', 'customer waiting area'],
          ['service bays', 'body shop', 'training institute']
        )
        talkTrackGuardrails = ['No car dealership language', 'No passenger-auto language', 'No logistics language', 'No freight-hauling language']
        break
      }

      if (isRVDealer) {
        companyType = multiSiteInfo.isMultiSite ? 'RV dealership group' : 'RV dealership'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site RV sales, service, and parts portfolio' : 'RV sales, service, and parts operation'
        facilityType = 'RV showroom / service bay / parts center'
        identityKeywords = selectIdentityKeywords(
          text,
          ['RV dealership', 'motorhomes', 'motor coaches', 'recreational vehicles', 'motorhome sales', 'RV service', 'RV parts'],
          ['RV dealership', 'motorhome sales', 'RV service', 'RV parts']
        )
        powerKeywords = selectIdentityKeywords(
          text,
          ['service bays', 'parts center', 'customer waiting area', 'shop HVAC', 'lot lighting'],
          ['service bays', 'parts center', 'shop HVAC']
        )
        talkTrackGuardrails = ['No hotel language', 'No hospitality language', 'No passenger-car dealership language', 'No logistics language']
        break
      }

      if (isAutoGroup) {
        companyType = multiSiteInfo.isMultiSite ? 'auto dealership group' : 'auto dealership'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-site dealership portfolio' : 'dealership property'
        facilityType = 'showroom / service bay / lot'
        identityKeywords = selectIdentityKeywords(text, ['dealership', 'auto group', 'showroom', 'service bays', 'vehicle inventory'], ['auto dealership', 'showroom', 'service bays'])
        powerKeywords = selectIdentityKeywords(text, ['lot lighting', 'showroom', 'service bays', 'hvac'], ['lot lighting', 'showroom HVAC', 'service bays'])
        talkTrackGuardrails = ['No hotel language', 'No hospitality language']
        break
      }

      if (isConvenienceStore) {
        companyType = multiSiteInfo.isMultiSite ? 'convenience store chain' : 'convenience store operator'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-store convenience retail footprint' : 'customer-facing convenience store'
        facilityType = 'convenience store / fuel retail site'
        identityKeywords = selectIdentityKeywords(text, ['convenience store', 'store chain', 'fuel', 'coolers', 'coffee service', 'walk-in coolers', 'Texas', 'Oklahoma'], ['convenience store', 'store chain', 'fuel retail'])
        powerKeywords = selectIdentityKeywords(text, ['walk-in coolers', 'refrigeration', 'lighting', 'HVAC', 'fuel canopy lighting', 'ice machines'], ['refrigeration', 'lighting', 'HVAC'])
        talkTrackGuardrails = ['No industrial language', 'No process equipment language', 'No manufacturing language']
        break
      }

      if (isGameRetailer) {
        companyType = multiSiteInfo.isMultiSite ? 'game and hobby retail network' : 'game and hobby retailer'
        operatingModel = multiSiteInfo.isMultiSite ? 'retail and online order footprint' : 'retail store with online order support'
        facilityType = 'retail store / warehouse support'
        identityKeywords = selectIdentityKeywords(text, ['board games', 'card games', 'collectibles', 'gaming accessories', 'retail', 'online orders', 'warehouse'], ['board games', 'card games', 'collectibles'])
        powerKeywords = selectIdentityKeywords(text, ['store lighting', 'HVAC', 'warehouse support', 'packing area', 'office load'], ['store lighting', 'HVAC', 'warehouse support'])
        talkTrackGuardrails = ['No logistics label', 'No industrial language', 'No manufacturing language', 'Do not use throughput']
        break
      }

      if (isLifestyleRetailStore) {
        companyType = 'lifestyle and design retail store'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-building retail campus' : 'large showroom-based retail store'
        facilityType = 'showroom / retail campus'
        identityKeywords = selectIdentityKeywords(text, ['lifestyle and design store', 'showroom space', 'furniture', 'tabletop', 'bedding', 'bath', 'fashion', 'garden'], ['lifestyle retail', 'showroom space', 'design store'])
        powerKeywords = selectIdentityKeywords(text, ['showroom lighting', 'HVAC', 'large open floor plans', 'retail hours', 'multi-building campus'], ['showroom lighting', 'HVAC', 'retail hours'])
        talkTrackGuardrails = ['No school language', 'No manufacturing language', 'No logistics language']
        break
      }

      if (multiSiteInfo.isMultiSite && /(distribution|warehouse|manufacturing|headquarters|hq)/i.test(text)) {
        companyType = 'national retail and distribution network'
        operatingModel = 'multi-state store footprint with centralized distribution and manufacturing hub'
        facilityType = 'retail stores / distribution centers / corporate campus'
        identityKeywords = selectIdentityKeywords(text, ['retail network', 'distribution center', 'manufacturing hub', 'corporate headquarters', 'supply chain', 'warehouse operations'], ['retail network', 'distribution center', 'corporate campus'])
        powerKeywords = selectIdentityKeywords(text, ['store HVAC', 'distribution center cooling', 'manufacturing process loads', 'facility lighting', 'peak demand alignment', 'portfolio peak scheduling'], ['distribution center cooling', 'store HVAC', 'facility lighting'])
        talkTrackGuardrails = ['Mention distribution and corporate campus', 'No hospital language', 'No school language']
      } else {
        companyType = multiSiteInfo.isMultiSite ? 'retail store network' : 'retail business'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-store footprint' : 'customer-facing retail site'
        facilityType = 'store / showroom'
        identityKeywords = selectIdentityKeywords(text, ['retail', 'store', 'shopping', 'showroom', 'franchise'], ['retail', 'store', 'showroom'])
        powerKeywords = selectIdentityKeywords(text, ['lighting', 'hvac', 'refrigeration', 'comfort'], ['lighting', 'HVAC', 'comfort'])
        talkTrackGuardrails = ['No industrial language']
      }
      break

    case 'restaurant':
      if (isBakeryCafe) {
        companyType = multiSiteInfo.isMultiSite ? 'bakery cafe network' : 'bakery cafe'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-location bakery cafe footprint' : 'single bakery cafe'
        facilityType = 'bakery cafe / customer-facing food service'
        identityKeywords = selectIdentityKeywords(text, ['bakery cafe', 'pastries', 'warm breads', 'cakes', 'coffee', 'fresh baked goods'], ['bakery cafe', 'pastries', 'fresh baked goods'])
        powerKeywords = selectIdentityKeywords(text, ['ovens', 'proofers', 'refrigeration', 'display cases', 'HVAC', 'morning production'], ['ovens', 'refrigeration', 'display cases'])
        talkTrackGuardrails = ['No factory language', 'No food production plant language', 'No cold-storage warehouse language']
        break
      }

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
      talkTrackGuardrails = ['No hospital language', 'No clinic language', 'No emergency care language', 'No inpatient language', 'No emergency department language', 'No event-venue language unless the source explicitly says banquet or convention space']
      break

    case 'hospitality_group':
      companyType = isHotelGroup ? 'hospitality group' : 'hotel portfolio operator'
      operatingModel = 'multi-property hospitality portfolio'
      facilityType = 'hotels / resorts'
      identityKeywords = selectIdentityKeywords(text, ['hospitality group', 'hotel portfolio', 'multiple properties', 'resorts', 'hotels'], ['hospitality group', 'hotel portfolio', 'multiple properties'])
      powerKeywords = selectIdentityKeywords(text, ['guest rooms', 'laundry', 'kitchen', 'hvac'], ['guest rooms', 'laundry', 'HVAC'])
      talkTrackGuardrails = ['No hospital language', 'No clinic language', 'No emergency care language', 'No inpatient language unless source confirms it', 'No restaurant language', 'No manufacturing language']
      break

    case 'school_district':
      {
        const isPrivateSchool = /\b(private school|college-preparatory|college preparatory|day school|selective admissions|k4-?12|religious institutions?)\b/i.test(text) && !/(school district|independent school district|isd\b)/i.test(text)
        companyType = isPrivateSchool ? 'private K-12 school' : 'school district'
        operatingModel = isPrivateSchool
          ? (multiSiteInfo.isMultiSite ? 'multi-campus private-school operation' : 'private-school campus')
          : (multiSiteInfo.isMultiSite ? 'multi-campus public-school system' : 'public-school campus')
        identityKeywords = isPrivateSchool
          ? selectIdentityKeywords(text, ['private school', 'college-preparatory', 'day school', 'students', 'classrooms', 'athletics', 'cafeterias'], ['private school', 'students', 'classrooms'])
          : selectIdentityKeywords(text, ['school district', 'campus', 'students', 'classrooms', 'chromebooks', 'athletics', 'cafeterias'], ['school district', 'campuses', 'classroom technology'])
      }
      facilityType = 'school campus'
      powerKeywords = selectIdentityKeywords(text, ['hvac', 'classroom technology', 'cafeterias', 'athletics', 'lighting'], ['HVAC', 'classroom technology', 'cafeterias'])
      talkTrackGuardrails = ['No factory language', 'No shift or production language', 'No church, sanctuary, worship, or ministry language unless the account is clearly a church instead of a school']
      break

    case 'education_nonprofit':
      if (/(academy|daycare|preschool|childcare|tutoring|learning center)/i.test(text)) {
        companyType = multiSiteInfo.isMultiSite ? 'educational academy network' : 'educational academy'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-location learning-center network' : 'single learning-center site'
        facilityType = 'learning center / classrooms'
        identityKeywords = selectIdentityKeywords(text, ['academy', 'learning center', 'preschool', 'daycare', 'tutoring', 'childcare', 'education'], ['educational academy', 'childcare', 'learning center'])
        powerKeywords = selectIdentityKeywords(text, ['hvac', 'lighting', 'classroom technology', 'safety systems', 'seasonal schedule'], ['HVAC', 'classroom technology', 'lighting'])
        talkTrackGuardrails = ['No factory language', 'No retail language', 'No hotel language']
        break
      }
      {
        const isCharityOrFoundation = /(nonprofit|non-profit|charity|foundation|association|human services|community services)/i.test(text)
        companyType = isCharityOrFoundation ? 'nonprofit organization' : 'educational or nonprofit entity'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-facility program network' : 'single-facility operation'
        facilityType = 'office / program space'
        identityKeywords = selectIdentityKeywords(text, ['nonprofit', 'charity', 'foundation', 'community services', 'education', 'human services'], [isCharityOrFoundation ? 'nonprofit' : 'educational services'])
        powerKeywords = selectIdentityKeywords(text, ['hvac', 'lighting', 'office operations', 'program hours'], ['HVAC', 'lighting', 'office operations'])
        talkTrackGuardrails = ['No retail language', 'No factory language', 'No dealership language']
      }
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
      if (isManufacturersRepAgency) {
        companyType = 'manufacturers representative agency'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-state sales and specification network' : 'office and showroom sales agency'
        facilityType = 'office / showroom / training space'
        identityKeywords = selectIdentityKeywords(text, ['manufacturers representative', 'lighting', 'electrical products', 'controls', 'architects', 'engineers', 'contractors', 'distributors'], ['manufacturers representative', 'lighting and electrical products', 'sales agency'])
        powerKeywords = selectIdentityKeywords(text, ['office HVAC', 'showroom lighting', 'training space', 'controls displays', 'IT equipment'], ['showroom lighting', 'office HVAC', 'training space'])
        talkTrackGuardrails = ['No logistics language', 'No warehouse language', 'No manufacturing language', 'No dock activity language']
        break
      }

      if (hasStrongCommercialRealEstateSignals(text)) {
        companyType = multiSiteInfo.isMultiSite ? 'commercial real estate services firm' : 'commercial real estate firm'
        operatingModel = multiSiteInfo.isMultiSite ? 'multi-office brokerage and property-services footprint' : 'office-based brokerage and property-services operation'
        facilityType = 'office / brokerage / property-services workspace'
        identityKeywords = selectIdentityKeywords(text, ['commercial real estate', 'brokerage', 'leasing', 'property management', 'tenant representation', 'investment sales'], ['commercial real estate', 'brokerage', 'property services'])
        powerKeywords = selectIdentityKeywords(text, ['office HVAC', 'lighting', 'IT equipment', 'conference rooms', 'managed property review'], ['office HVAC', 'lighting', 'IT equipment'])
        talkTrackGuardrails = ['No manufacturing language', 'No warehouse language', 'No production language', 'No retail-store language']
        break
      }

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

  if (isGolfClub) {
    companyType = multiSiteInfo.isMultiSite ? 'golf club network' : 'private golf club'
    operatingModel = multiSiteInfo.isMultiSite ? 'multi-site golf club portfolio' : 'clubhouse and course operation'
    facilityType = 'golf club / clubhouse'
    identityKeywords = selectIdentityKeywords(
      text,
      ['golf club', 'country club', 'private club', 'clubhouse', 'golf course', 'pro shop', 'tee times', 'members', 'greens crew'],
      ['golf club', 'clubhouse', 'golf course'],
    )
    powerKeywords = selectIdentityKeywords(
      text,
      ['clubhouse hvac', 'dining', 'cart charging', 'course irrigation', 'pro shop lighting', 'club kitchen'],
      ['clubhouse HVAC', 'cart charging', 'course irrigation'],
    )
    talkTrackGuardrails = ['No retail language', 'No hotel language', 'No restaurant language unless the source explicitly confirms dining', 'No church/sanctuary language']
  }

  const confidenceSignals = identityKeywords.filter((keyword) => text.includes(keyword.toLowerCase())).length +
    powerKeywords.filter((keyword) => text.includes(keyword.toLowerCase())).length
  const confidence: IdentityConfidence = cluster === 'unknown'
    ? 'low'
    : confidenceSignals >= 5
      ? 'high'
      : (candidates.length > 0 || getPublicAccountDescription(account))
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
  /what most\s+[\w\s-]+leaders?\s+care about is/i,
  /what most operators need to know is/i,
  /what most operators want to know is/i,
  /the useful thing to understand about/i,
  /commercial facilities?/i,
  /commercial operation(?:s)?/i,
  /commercial account/i,
  /real operational activity/i,
  /there(?:'|')s a useful update about/i,
  /the update about .* is the part that matters here/i,
  // Additional banned patterns found in audit
  /\bcoincident peaks?\b/i,                          // jargon — say "peak charges" instead
  /\bwhen a business is growing.*changes the bill/i, // generic growth opener
  /\bwhen a site carries heavy load\b/i,             // too vague
  /\bfor most operators\b/i,                         // generic
  /\bmost operators care about\b/i,                  // too generic — should be industry-specific
  /\bthe useful check is whether the bill still lines up\b/i, // weakest fallback phrase
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
  logistics: ['dock', 'automation', 'hvac', 'activity', 'occupancy', 'warehouse', '24/7'],
  print_fulfillment: ['print', 'mailing', 'fulfillment', 'warehouse support', 'HVAC', 'equipment'],
  public_transit: ['trolley', 'streetcar', 'maintenance', 'car barn', 'public service', 'reliability'],
  moving_storage: ['warehouse', 'storage', 'moving', 'loading', 'dispatch', 'HVAC'],
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
  manufacturing: ['factory production', 'industrial plant', 'manufacturing shop', 'fabrication facility'],
  logistics: ['logistics distribution', 'freight terminal', 'cargo distribution', 'shipping hub'],
  print_fulfillment: ['printing press', 'direct mail house', 'document reproduction', 'print fulfillment'],
  public_transit: ['public transit', 'trolley system', 'streetcar barn', 'transit authority'],
  moving_storage: ['moving and storage', 'commercial moving company', 'relocation services'],
  food_storage: ['cold storage freezer', 'refrigerated warehouse', 'freezer facility', 'food storage depot'],
  healthcare: ['acute care hospital', 'medical clinic facility', 'clinical lab setup', 'outpatient facility'],
  banking: ['bank branch office', 'credit union branch', 'financial services branch'],
  retail: ['retail operation', 'retail showroom', 'customer-facing retail store', 'shopping outlet'],
  restaurant: ['restaurant kitchen', 'dining operations', 'food service venue', 'fast food outlet'],
  hotel_owner: ['hotel flag', 'guest rooms', 'resort property', 'lodging facility'],
  hospitality_group: ['hotel portfolio', 'hospitality management group', 'multi-property hospitality'],
  school_district: ['k-12 school district', 'independent school district', 'public school campus'],
  higher_education: ['university campus', 'student residence hall', 'college campus', 'dormitory building'],
  residential_care: ["children's foster home", 'residential care facility', 'independent living facility', 'counseling center space'],
  education_nonprofit: ['nonprofit building', 'education nonprofit campus', 'community center facility'],
  religious: ['worship sanctuary', 'church sanctuary', 'synagogue sanctuary', 'temple congregation'],
  technology: ['data center facility', 'server cooling room', 'tech server farm'],
  energy_intensive: ['petrochemical refinery', 'stone quarry mining', 'industrial gas plant'],
  office_services: ['professional consulting firm', 'legal office space', 'accounting office space'],
  multi_site: ['multi-site commercial portfolio', 'retail store chain', 'multi-location branch network'],
  public_sector: ['municipal facility', 'civic administration building', 'public safety station'],
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

function capitalizeSentenceStarts(value: string) {
  const text = cleanText(value)
  if (!text) return ''

  return text.replace(/(^|[.!?]\s+)(["'([{]*)([a-z])/g, (_match, boundary: string, prefix: string, letter: string) => {
    return `${boundary}${prefix}${letter.toUpperCase()}`
  })
}

function simplifyTalkTrackLanguage(value: string) {
  const result = cleanText(value)
    .replace(/\bthe useful check is whether\b/gi, 'the question is whether')
    .replace(/\bthe useful check is how\b/gi, 'the question is how')
    .replace(/\bthe useful check is\b/gi, 'the question is')
    .replace(/\bthe useful question is\b/gi, 'the question is')
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
    .replace(/\btransmission fees\b/gi, 'charges tied to when the site uses the most power')
    .replace(/\btransmission fee\b/gi, 'charge tied to when the site uses the most power')
    .replace(/\btransmission side of the bill\b/gi, 'charges tied to when the site uses the most power')
    .replace(/\btransmission side\b/gi, 'peak-timing side')
    .replace(/\bcorrelation\b/gi, 'connection')
    .replace(/\bbranch operations\b/gi, 'multi-site operations')
    .replace(/\bbranch IT loads\b/gi, 'site-level office and equipment usage')
    .replace(/\bconstant daily throughput\b/gi, 'busy parts of the day')
    .replace(/\bthroughput\b/gi, 'activity')
    .replace(/\ba peak charges\b/gi, 'a peak charge')
    .replace(/\ba stealth peak charges\b/gi, 'a hidden peak charge')
    .replace(/\btriggering a peak charges\b/gi, 'triggering a peak charge')
    .replace(/\bon the bill on the bill\b/gi, 'on the bill')
    .replace(/\bcharges on the bill making the bill move\b/gi, 'charges that can move the bill')
    .replace(/\bHVAC load making the bill move\b/gi, 'HVAC making the bill move')
    .replace(/\bManufacturing \/ industrial\b/g, 'a manufacturing operation')
    .replace(/\bLogistics \/ warehouse \/ distribution\b/g, 'a distribution operation')

  return capitalizeSentenceStarts(result)
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

function toSecondPersonOperationDescriptor(value: string) {
  const text = cleanText(value)
    .replace(/^(?:an?|the)\s+/i, '')
    .replace(/\bthe company'?s\b/i, 'your')
    .replace(/\bhotel owner\b/i, 'hotel property')
  if (!text) return 'your operation'
  if (/^(your|y'all'?s|yours)\b/i.test(text)) return text
  return `your ${text}`
}

function humanizeDriverList(items: string[], limit = 4) {
  const cleaned = uniqueStrings(items.map((item) => cleanText(item).toLowerCase()).filter(Boolean), limit)
    .map((item) => item
      .replace(/\bhvac\b/gi, 'HVAC')
      .replace(/\bit\b/gi, 'IT')
    )
  if (cleaned.length <= 1) return cleaned[0] || 'day-to-day usage'
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`
}

function extractStructuredBriefFacts(
  account: AccountRow,
  candidate: ResearchHit | null,
  profile: IntelligenceProfile | null,
  industryGuidance: ReturnType<typeof buildIndustryGuidance>,
  signalGuidance: ReturnType<typeof buildSignalGuidance>,
): StructuredBriefFacts {
  const text = cleanText([
    account.name,
    account.industry,
    getPublicAccountDescription(account),
    getAccountNotes(account),
    buildIdentityProfileText(account, candidate),
    candidate?.title,
    candidate?.snippet,
  ].join(' ')).toLowerCase()

  const activities = new Set<string>()
  const equipment = new Set<string>()
  const customerContext = new Set<string>()
  const energyDrivers = new Set<string>()
  const avoidAngles = new Set<string>()

  const addIf = (pattern: RegExp, target: Set<string>, terms: string[]) => {
    if (pattern.test(text)) terms.forEach((term) => target.add(term))
  }

  ;(profile?.identityKeywords || []).forEach((term) => activities.add(term))
  ;(profile?.powerKeywords || []).forEach((term) => energyDrivers.add(term))
  ;(industryGuidance.focus || []).forEach((term) => energyDrivers.add(term))
  ;(signalGuidance.focus || []).forEach((term) => energyDrivers.add(term))

  if (hasGolfClubSignals(text)) {
    ;['golf club operations', 'clubhouse operations', 'course maintenance', 'member services'].forEach((term) => activities.add(term))
    ;['clubhouse HVAC', 'cart charging', 'irrigation pumps', 'pro shop lighting', 'club kitchen equipment'].forEach((term) => equipment.add(term))
    ;['clubhouse HVAC', 'cart charging', 'course irrigation', 'pro shop lighting'].forEach((term) => energyDrivers.add(term))
    ;['members', 'tee times', 'club dining', 'course schedules'].forEach((term) => customerContext.add(term))
    avoidAngles.add('retail')
    avoidAngles.add('hotel')
    avoidAngles.add('restaurant')
  }

  addIf(/materials?\s+handling|forklifts?|komatsu|pallet (?:storage )?rack|interlake[-\s]?mecalux|aerial lifts?|jlg\b|warehouse equipment/i, activities, ['materials handling equipment supply', 'equipment service', 'parts support'])
  addIf(/materials?\s+handling|forklifts?|komatsu|pallet (?:storage )?rack|interlake[-\s]?mecalux|aerial lifts?|jlg\b|warehouse equipment/i, equipment, ['forklifts', 'pallet rack systems', 'aerial lift equipment'])
  addIf(/forklift charging|battery charging|service bays?|parts areas?|shop hvac|hvls fans?|conveyors?/i, energyDrivers, ['forklift charging', 'service work', 'parts areas', 'shop HVAC'])
  addIf(/warehouse facilities|distribution centers?|manufacturing plants?/i, customerContext, ['warehouse facilities', 'distribution centers', 'manufacturing plants'])
  if (hasMaterialHandlingEquipmentSignals(text)) {
    avoidAngles.add('generic distribution')
    avoidAngles.add('manufacturing production')
  }

  addIf(/plastics? distributor|plastic sheet|plastic rod|plastic tube|plastic film|cut[-\s]?to[-\s]?size/i, activities, ['plastic materials distribution', 'cut-to-size material support'])
  addIf(/plastic sheet|plastic rod|plastic tube|plastic film|cut[-\s]?to[-\s]?size/i, equipment, ['plastic sheet inventory', 'cut-to-size equipment', 'warehouse handling'])
  addIf(/plastic sheet|plastic rod|plastic tube|plastic film|cut[-\s]?to[-\s]?size|warehouse/i, energyDrivers, ['warehouse lighting', 'cut-to-size equipment', 'material handling'])
  if (hasPlasticsDistributionSignals(text)) {
    avoidAngles.add('food production')
    avoidAngles.add('generic manufacturing')
  }

  addIf(/crane sales|crane service|crane parts|sales and support base|tadano|mobile cranes?|rough terrain cranes?|all[-\s]?terrain cranes?/i, activities, ['crane sales and support operation', 'equipment service', 'parts support'])
  addIf(/crane service|crane parts|mobile cranes?|rough terrain cranes?|all[-\s]?terrain cranes?|service bays?/i, equipment, ['crane service bays', 'parts areas', 'shop equipment'])
  addIf(/crane service|crane parts|service bays?|shop equipment/i, energyDrivers, ['service bays', 'parts areas', 'shop HVAC'])
  if (hasCraneSalesSupportSignals(text)) {
    avoidAngles.add('manufacturing production')
    avoidAngles.add('auto dealership')
  }

  addIf(/harbor pilots?|houston pilots?|ship handlers?|(?:marine|maritime|cargo|shipping|naval|ocean-going|waterborne) vessels?|waterway|ship channel|pilot boat|marine pilot|maritime pilots?/i, activities, ['maritime pilot operations', 'dispatch and support operations'])
  addIf(/pilot boat|\bdispatch\b|marine operations|ship channel|support buildings/i, equipment, ['dispatch systems', 'support buildings', 'boat operations'])
  addIf(/pilot boat|\bdispatch\b|marine operations|support buildings|ship channel/i, energyDrivers, ['dispatch systems', 'support-building HVAC', 'marine operations support'])
  if (hasMaritimePilotSignals(text)) {
    avoidAngles.add('warehouse distribution')
    avoidAngles.add('materials handling')
  }

  addIf(/(ready[-\s]?mix(?:ed)? concrete|concrete batch(?:ing)?|batch plants?|mixer trucks?)/i, activities, ['ready-mix concrete production', 'concrete delivery', 'batch plant operations'])
  addIf(/(ready[-\s]?mix(?:ed)? concrete|concrete batch(?:ing)?|batch plants?|mixer trucks?)/i, equipment, ['batching equipment', 'mixer trucks', 'aggregate handling systems', 'washout/reclaim systems'])
  addIf(/(ready[-\s]?mix(?:ed)? concrete|concrete batch(?:ing)?|batch plants?|mixer trucks?)/i, energyDrivers, ['batching equipment', 'aggregate handling', 'mixer truck dispatch', 'yard lighting'])
  if (hasReadyMixConcreteSignals(text)) {
    avoidAngles.add('generic logistics')
    avoidAngles.add('generic manufacturing')
  }

  addIf(/(fiberglass conduit|fiberglass strut|epoxy fiberglass|curing ovens?)/i, activities, ['fiberglass conduit manufacturing', 'infrastructure product manufacturing'])
  addIf(/(fiberglass conduit|fiberglass strut|epoxy fiberglass|curing ovens?)/i, equipment, ['winding equipment', 'curing ovens', 'resin process areas', 'plant HVAC'])
  addIf(/(fiberglass conduit|fiberglass strut|epoxy fiberglass|curing ovens?)/i, energyDrivers, ['winding equipment', 'curing ovens', 'finishing operations'])
  if (hasFiberglassConduitSignals(text)) {
    avoidAngles.add('generic manufacturing')
    avoidAngles.add('food production')
  }

  addIf(/(site store management|inventory management|petrochemical or energy plant support)/i, activities, ['site-store logistics', 'inventory management', 'receiving operations'])
  addIf(/(site store management|inventory management|petrochemical or energy plant support)/i, equipment, ['site store facilities', 'receiving systems', 'materials tracking systems'])
  addIf(/(site store management|inventory management|petrochemical or energy plant support)/i, energyDrivers, ['site-store HVAC', 'inventory handling', 'receiving timing'])
  if (hasIndustrialSiteLogisticsSignals(text)) {
    avoidAngles.add('generic logistics')
    avoidAngles.add('generic manufacturing')
  }

  addIf(/(pallet management|pallet services?|pallet repair|pallet recycling|pallet retrieval|pallet sortation|pallet redistribution|total pallet management|reverse logistics|wood packaging|remanufactur(?:ing|ed)? pallets?)/i, activities, ['pallet management services', 'reverse logistics', 'warehouse support'])
  addIf(/(pallet management|pallet services?|pallet repair|pallet recycling|pallet retrieval|pallet sortation|pallet redistribution|total pallet management|reverse logistics|wood packaging|remanufactur(?:ing|ed)? pallets?)/i, equipment, ['pallet repair areas', 'sortation equipment', 'warehouse support'])
  addIf(/(pallet management|pallet services?|pallet repair|pallet recycling|pallet retrieval|pallet sortation|pallet redistribution|total pallet management|reverse logistics|wood packaging|remanufactur(?:ing|ed)? pallets?)/i, energyDrivers, ['warehouse support', 'repair bays', 'inventory cycles'])
  if (hasPalletManagementSignals(text)) {
    avoidAngles.add('generic manufacturing')
    avoidAngles.add('generic logistics')
  }

  if (hasFrozenBakeryProductionSignals(text)) {
    ;['frozen bakery production', 'bakery manufacturing'].forEach((term) => activities.add(term))
    ;['mixing equipment', 'ovens', 'freezers', 'packaging lines', 'plant HVAC'].forEach((term) => equipment.add(term))
    ;['mixing', 'ovens', 'freezers', 'packaging', 'sanitation', 'plant HVAC'].forEach((term) => energyDrivers.add(term))
    avoidAngles.add('restaurant dining')
    avoidAngles.add('customer cooling')
  }

  const isFoodProductionContext = hasFrozenBakeryProductionSignals(text) ||
    /\b(food production|food manufacturing|food manufacturer|food processing|production plant|production facility|manufactures?|manufacturer|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?)\b/i.test(text)
  const isRestaurantContext = !isFoodProductionContext &&
    /\b(restaurant|barbe?cue|bbq|smokers?|commercial kitchen|fryers?|grills?|dining|cafe|café|bakery caf[eé]|bar\b|eatery|food service|service rushes?|drive-thru)\b/i.test(text)
  if (isRestaurantContext) {
    addIf(/restaurant|barbe?cue|bbq|smokers?|kitchen|fryers?|grills?|dining|cafe|café|bar\b|eatery/i, activities, ['restaurant service', 'kitchen prep'])
    addIf(/smokers?|fryers?|grills?|restaurant|barbe?cue|bbq|kitchen|dining|ice machines?/i, equipment, ['kitchen equipment', 'refrigeration', 'customer cooling'])
    addIf(/smokers?|kitchen|dining-room|customer cooling|service rush|restaurant|barbe?cue|bbq/i, energyDrivers, ['kitchen timing', 'refrigeration', 'customer cooling'])
  }

  if (hasStrongTruckDealerSignals(text)) {
    addIf(/heavy[-\s]?duty commercial truck|truck dealership|truck center|truck sales|truck service|truck parts|diesel technician training|freightliner|western star|mitsubishi fuso|mercedes-benz trucks|peterbilt|kenworth|mack trucks|volvo trucks/i, activities, ['heavy-duty truck sales', 'truck service', 'parts support'])
    addIf(/heavy[-\s]?duty commercial truck|truck dealership|truck center|truck sales|truck service|truck parts|diesel technician training|freightliner|western star|mitsubishi fuso|mercedes-benz trucks|peterbilt|kenworth|mack trucks|volvo trucks/i, equipment, ['service bays', 'body shop', 'training institute', 'diesel service equipment'])
    addIf(/heavy[-\s]?duty commercial truck|truck dealership|truck center|truck sales|truck service|truck parts|diesel technician training|freightliner|western star|mitsubishi fuso|mercedes-benz trucks|peterbilt|kenworth|mack trucks|volvo trucks/i, energyDrivers, ['service bays', 'body shop', 'training institute', 'shop HVAC', 'lot lighting'])
    avoidAngles.add('car dealership')
    avoidAngles.add('logistics hauling')
  }

  if (hasStrongRVDealerSignals(text) && !hasRvSupportSignals(text)) {
    addIf(/rv dealership|motorhome dealership|motorhomes?|motor coach|motorcoach|recreational vehicles?|camper(?:s)?|travel trailer(?:s)?|toy hauler(?:s)?|rv service|rv parts/i, activities, ['RV sales', 'RV service', 'parts support'])
    addIf(/rv dealership|motorhome dealership|motorhomes?|motor coach|motorcoach|recreational vehicles?|camper(?:s)?|travel trailer(?:s)?|toy hauler(?:s)?|rv service|rv parts/i, equipment, ['service bays', 'parts center', 'customer waiting area'])
    addIf(/rv dealership|motorhome dealership|motorhomes?|motor coach|motorcoach|recreational vehicles?|camper(?:s)?|travel trailer(?:s)?|toy hauler(?:s)?|rv service|rv parts/i, energyDrivers, ['service bays', 'parts center', 'shop HVAC', 'lot lighting'])
    avoidAngles.add('hotel')
    avoidAngles.add('hospitality')
  }

  if ((hasStrongAutomotiveSignals(text) || hasStrongAutomotiveDealerSignals(text)) && !hasStrongTruckDealerSignals(text) && !hasStrongRVDealerSignals(text)) {
    addIf(/dealership|auto dealer|service bays?|showroom|lot lighting|vehicle inventory/i, activities, ['dealership sales', 'service department'])
    addIf(/service bays?|lifts?|compressors?|showroom|lot lighting|parts department/i, equipment, ['service bays', 'showroom AC', 'parts area', 'lot lighting'])
    addIf(/service bays?|showroom ac|lot lighting|parts department/i, energyDrivers, ['service bays', 'showroom AC', 'parts area', 'lot lighting'])
  }

  addIf(/\b(clinic|medical practice|dental|operatories|diagnostic imaging|medical imaging|patient|patients)\b|\blabs?\b|\blaborator(?:y|ies)\b/i, activities, ['patient care', 'clinical operations'])
  addIf(/\b(operatories|diagnostic imaging|medical imaging|treatment rooms?|sterilization|patient rooms?)\b|\blabs?\b|\blaborator(?:y|ies)\b/i, equipment, ['treatment rooms', 'clinical equipment', 'patient-hour HVAC'])
  addIf(/\b(operatories|diagnostic imaging|medical imaging|treatment rooms?|sterilization|patient-hour)\b|\blabs?\b|\blaborator(?:y|ies)\b/i, energyDrivers, ['clinical equipment', 'patient-hour HVAC', 'treatment rooms'])

  addIf(/\b(school district|students|classrooms|athletics|cafeteria|school campus|public school|charter school)\b/i, activities, ['campus operations', 'student schedule'])
  addIf(/\b(classroom technology|athletics|cafeterias?|school campus|students|classrooms)\b/i, equipment, ['campus HVAC', 'classroom technology', 'athletics lighting', 'cafeterias'])
  addIf(/\b(classroom technology|athletics|cafeterias?|school campus|students|classrooms)\b/i, energyDrivers, ['campus HVAC', 'classroom technology', 'athletics lighting'])

  addIf(/manufactur|production|fabricat|assembly|plant/i, activities, ['production work'])
  addIf(/production lines?|process equipment|compressed air|motors?|packaging|assembly/i, equipment, ['production equipment', 'process equipment', 'plant HVAC'])
  addIf(/production lines?|process equipment|compressed air|motors?|packaging|assembly/i, energyDrivers, ['production equipment', 'process timing', 'plant HVAC'])
  if (hasPalletManagementSignals(text)) {
    ;['production work'].forEach((term) => activities.delete(term))
    ;['production equipment', 'process equipment', 'plant HVAC'].forEach((term) => equipment.delete(term))
    ;['production equipment', 'process timing', 'plant HVAC'].forEach((term) => energyDrivers.delete(term))
  }

  const businessModel = cleanText(profile?.companyType || industryGuidance.label || account.industry || 'commercial account')
  const cleanList = (items: Set<string>, limit: number) => uniqueStrings(Array.from(items).map(simplifyTalkTrackLanguage), limit)
  const facts = {
    businessModel,
    activities: cleanList(activities, 7),
    equipment: cleanList(equipment, 7),
    customerContext: cleanList(customerContext, 5),
    energyDrivers: cleanList(energyDrivers, 7),
    avoidAngles: cleanList(avoidAngles, 6),
    sourceTerms: [] as string[],
  }
  facts.sourceTerms = uniqueStrings([
    ...facts.activities,
    ...facts.equipment,
    ...facts.customerContext,
    ...facts.energyDrivers,
  ], 18)
  return facts
}

function buildFactDrivenProblemFrame(facts: StructuredBriefFacts) {
  const model = cleanText(facts.businessModel).toLowerCase()
  let drivers = uniqueStrings([...facts.equipment, ...facts.energyDrivers], 5)
  if (drivers.some((driver) => /\bplant HVAC\b/i.test(driver))) {
    drivers = drivers.filter((driver) => !/^HVAC$/i.test(driver))
  }
  if (!model || drivers.length < 2) return ''
  const article = /^(a|an|the|your)\b/i.test(model) ? '' : getIndefiniteArticle(model)
  const articleSpace = article ? `${article} ` : ''
  return `Often times for ${articleSpace}${model}, ${humanizeDriverList(drivers, 4)} can all hit the meter during the same busy window.`
}

function buildFactDrivenQuestionFrame(facts: StructuredBriefFacts) {
  let drivers = uniqueStrings([...facts.energyDrivers, ...facts.equipment], 5)
  if (drivers.some((driver) => /\bplant HVAC\b/i.test(driver))) {
    drivers = drivers.filter((driver) => !/^HVAC$/i.test(driver))
  }
  if (drivers.length < 2) return ''
  return `I'm curious, how do y'all tell whether ${humanizeDriverList(drivers, 3)} are what moved the bill that month, or is that side of things pretty much handled?`
}

function buildPlainProblemFrame(cluster: IndustryCluster, companyIdentity: string, drivers: string[]) {
  const driverText = humanizeDriverList(drivers)
  const identity = cleanText(companyIdentity).toLowerCase()
  if (/golf club|country club|private club|clubhouse/.test(identity) || /clubhouse|golf course|pro shop|tee time|greens? crew|fairways?|cart path|irrigation|club dining|club grill/i.test(driverText)) {
    return `Often times for a golf club, clubhouse HVAC, dining, cart charging, and course irrigation can all push the meter in different ways because the clubhouse and course run on different schedules.`
  }
  if (/auto dealership|dealership/.test(identity) || /lot lighting|service bays?|vehicle inventory|showroom HVAC/i.test(driverText)) {
    return `Often times for a dealership, service bays, showroom AC, parts counters, and lot lighting can all push the meter during the same busy window.`
  }
  if (/commercial furniture|furniture.*manufacturer|designer and manufacturer/.test(identity)) {
    return `Often times for a furniture manufacturer, the production floor, showroom lighting, office HVAC, and shipping areas can all move the bill in different ways.`
  }
  if (/commercial real estate|real estate|property management|brokerage/.test(identity)) {
    return `Often times for a commercial real estate firm, the hard part is separating office usage from the larger buildings or tenant spaces being managed.`
  }
  if (cluster === 'hospitality_group' || /hospitality group|hotel management|portfolio of hotels|hotel portfolio|resort portfolio|full-service hospitality|branded hotel owner|hotel ownership group|hotel operator|hotel development and management|resort management company/.test(identity)) {
    return `Often times for a hospitality group, it's hard to keep each property's guest rooms, laundry, kitchen service, and HVAC from landing on the meter in the same busy window.`
  }
  if (/hotel property|hotel operating context|hotel owner/.test(identity) || /hotel|resort|guest rooms?|laundry|hospitality property/i.test(driverText)) {
    return `Often times for a hotel property, guest rooms, laundry, kitchen service, and HVAC can all stack up on the meter in the same busy window.`
  }
  if (/county government|municipal facility portfolio|public-sector organization|public sector operation/.test(identity)) {
    return `Often times for a county government, it's hard to keep administrative offices, public safety sites, parks buildings, and utility infrastructure from stacking up on the same bill.`
  }
  if (/truck leasing|truck rental|fleet leasing|leasing and rental/.test(identity) || /truck leasing|truck rental|fleet leasing|leasing and rental|maintenance shops?|fleet staging|yard lighting/i.test(driverText)) {
    return `Often times for a truck leasing and rental operation, maintenance shops, fleet staging, yard lighting, and office load can all hit the meter in the same busy window.`
  }
  if (/rv support and assembly|rv support warehouse|rv setup and support|rv support operation/.test(identity) || /rv support|rv setup|rv assembly|staging|warehouse support/i.test(driverText)) {
    return `Often times for an RV support warehouse, assembly bays, staging, inventory handling, and warehouse HVAC can all hit the meter in the same busy window.`
  }
  if (/medical equipment|medical supply|durable medical equipment|\bdme\b/.test(identity) || /medical supplies|equipment maintenance|inventory storage/i.test(driverText)) {
    return `Often times for a medical supply operation, warehouse cooling, equipment service, inventory storage, and delivery timing can all push the bill in different ways.`
  }
  if (/pallet management|pallet services?|pallet repair|pallet recycling|reverse logistics|wood packaging|total pallet management/.test(identity) || /pallet|reverse logistics|sortation|recycling|repair bays?|warehouse support/i.test(driverText)) {
    return `Often times for a pallet management operation, pallet retrieval, repair, recycling, and warehouse support can all hit the meter in the same busy window.`
  }
  if (/materials? handling|warehouse equipment|forklift|lift equipment|equipment supplier|equipment service/.test(identity) || /forklift|pallet rack|aerial lift|battery charging|equipment service|warehouse equipment/i.test(driverText)) {
    return `Often times for a materials-handling equipment company, forklift charging, lift service, parts areas, warehouse support, and shop HVAC can all hit the meter in the same busy window.`
  }
  if (/cooling products|refrigeration and cooling|chiller|industrial refrigeration/.test(identity) || /chillers?|air handling units?|industrial package units/i.test(driverText)) {
    return `Often times for a cooling-equipment manufacturer, test areas, production equipment, compressors, and plant HVAC can all hit the meter during the same window.`
  }
  if (/energy-intensive industrial|oilfield|drilling equipment|heavy industrial/.test(identity)) {
    return `Often times in heavy industrial operations, large motors, process equipment, maintenance work, and site schedules can all hit the meter during the same window.`
  }
  if (/boba|tea shop|smoothie|beverage cafe/.test(identity) || /brewed teas|smoothies|tapioca|display cases/i.test(driverText)) {
    return `Often times for a beverage cafe, refrigeration, ice machines, drink equipment, display cases, and summer AC can stack up during the same rush.`
  }
  if (/ready[-\s]?mix|ready[-\s]?mixed concrete|aggregates/.test(identity)) {
    return `Often times in ready-mix concrete, batching equipment, aggregate handling, truck dispatch, and yard lighting can hit the meter at the same time.`
  }
  if (/food production|food processing|food manufacturer/.test(identity)) {
    return `Often times in a food production operation, it's hard to prevent refrigeration, cooking, and sanitation from hitting the meter at the exact same time.`
  }
  if (/convenience store/.test(identity)) {
    return `Often times for a convenience-store chain, it's difficult to keep coolers, lighting, fuel-canopy load, and summer AC from driving up a high local billing floor.`
  }
  if (/game and hobby|specialty game/.test(identity)) {
    return `Often times for a specialty retailer, it's hard to separate retail floor cooling and lighting from back-room fulfillment and online order support.`
  }
  const isGenericHospitalIndustry = /hospital\s*(?:s)?\s*(?:&|and)\s*health\s*care/i.test(identity)
  if (/\bhospital\b/.test(identity) && !isGenericHospitalIndustry) {
    return `Often times for a hospital facility, it's difficult to separate emergency care and imaging cycles from normal 24/7 HVAC loads.`
  }
  if (/behavioral health|community care|substance use|recovery|residential treatment/.test(identity) || /counseling|therapy|crisis spaces?|resident|residential/i.test(driverText)) {
    return `Often times for behavioral-health and recovery programs, counseling spaces, residential areas, and HVAC can all move the bill differently depending on the daily schedule.`
  }
  if (/medical practice|clinic|clinical care/.test(identity) || /imaging|lab|laboratory|patient hours|treatment rooms/i.test(driverText)) {
    return `Often times in a clinic setting, imaging, lab work, treatment rooms, and patient-hour HVAC can hit the meter in different ways throughout the day.`
  }
  if (/home health|hospice|end of life care|care coordination/i.test(identity) || /care coordination|phone systems|staff support|records and scheduling/i.test(driverText)) {
    return `Often times for a home health and hospice provider, care coordination, office HVAC, and phone systems can all move the bill in different ways depending on the schedule.`
  }
  if (/site-store|site store|petrochemical site|industrial plant support/.test(identity) || /inventory handling|delivery tracking|petrochemical plant support|receiving/i.test(driverText)) {
    return `Often times in site-store logistics, inventory handling, receiving, warehouse support, and delivery tracking can stack up during the same busy window.`
  }
  if (/coffee roasting|custom roasting|coffee roaster/.test(identity) || /roasting equipment|green bean|packaging/i.test(driverText)) {
    return `Often times in coffee roasting, the roasters, cooling, green bean storage, packaging, and HVAC can stack up during the same production window.`
  }
  if (/grain-based|frozen bakery|bakery production/.test(identity) || /mixing|milling|ovens|freezers|sanitation/i.test(driverText)) {
    return `Often times in bakery manufacturing, mixing, milling, ovens, freezers, packaging, and HVAC can stack up during the same production window.`
  }
  if (/fiberglass conduit|fiberglass strut|conduit manufacturing/.test(identity) || /winding equipment|curing ovens?|resin|finishing/i.test(driverText)) {
    return `Often times in fiberglass conduit manufacturing, winding equipment, curing ovens, finishing, and plant HVAC can stack up during the same production window.`
  }
  switch (cluster) {
    case 'print_fulfillment':
      return `Often times in print and fulfillment, it's hard to tell which processes are driving up the peak charge, whether it's print equipment, mailing machinery, or office HVAC.`
    case 'public_transit':
      return `Often times for a transit operation, it's difficult to separate maintenance shop and support-building usage from the regular office load.`
    case 'moving_storage':
      return `Often times for a moving and storage company, it's hard to prevent storage space climate control, dispatch, and loading activity from spiking the billing floor.`
    case 'retail':
      return `Often times for a retail operation, it's hard to prevent seasonal customer traffic, lighting, and HVAC from driving up the peak charge.`
    case 'restaurant':
      return `Often times for a restaurant operation, it's difficult to prevent kitchen equipment, refrigeration, and cooling from peaking during the exact same busy hours.`
    case 'healthcare':
      return `Often times for a healthcare facility, it's hard to balance 24/7 patient comfort with clinical equipment load without creating unexpected demand spikes.`
    case 'public_sector':
      return `Often times for a county government, it's hard to keep administrative offices, public safety sites, parks buildings, and utility infrastructure from driving the biggest bill days.`
    case 'residential_care':
      return `Often times for a residential-care operation, it's difficult to tell how resident spaces, counseling areas, and support HVAC roll up across the meters.`
    case 'logistics':
      return `Often times for a distribution operation, it's hard to keep dock activity, storage climate control, and office HVAC from driving up the peak charge.`
    case 'manufacturing':
      return `Often times for a manufacturing operation, it's difficult to prevent equipment timing, compressed air, and process loads from spiking the meter during peak hours.`
    default:
      return `Often times for ${companyIdentity.toLowerCase()}, it's hard to prevent ${driverText} from hitting the meter at the same time.`
  }
}

function buildPlainQuestionFrame(cluster: IndustryCluster, drivers: string[], audienceProfile: AudienceProfile | null | undefined) {
  const driverText = humanizeDriverList(drivers)
  const personaQuestion = audienceProfile?.questionHint
    ? audienceProfile.questionHint.replace(/\?+$/, '')
    : ''
  if (personaQuestion) {
    return `I'm curious, ${lowercaseFirst(personaQuestion)}, or is that side of things pretty much on autopilot?`
  }

  if (/golf club|country club|private club|clubhouse/.test(driverText)) {
    return `I'm curious, how do y'all tell whether clubhouse HVAC, dining, or course support is what moved the bill that month, or is that side of things pretty much on autopilot?`
  }
  if (/service bays?|vehicle inventory|lot lighting/i.test(driverText)) {
    return `I'm curious, how do y'all tell whether the service bays, showroom AC, parts area, or lot lighting is what pushed the bill, or is that side of things pretty much handled?`
  }
  if (/medical supplies|equipment maintenance|inventory storage|delivery turnaround|warehouse climate/i.test(driverText)) {
    return `I'm curious, how do y'all tell whether storage cooling, equipment service, or delivery activity is what moved the bill that month, or is that side of things pretty much handled?`
  }
  if (/home health|hospice|end of life care|care coordination/i.test(driverText)) {
    return `I'm curious, how do y'all tell whether care coordination, office HVAC, or phone systems are what moved the bill that month, or is that side of things pretty much handled?`
  }
  if (/forklift|pallet rack|aerial lift|battery charging|equipment service|warehouse equipment|materials? handling/i.test(driverText)) {
    return `I'm curious, how do y'all tell whether forklift charging, service work, parts areas, or shop cooling is what moved the bill that month, or is that side of things pretty much handled?`
  }
  if (/chillers?|air handling units?|industrial package units|cooling products|test areas/i.test(driverText)) {
    return `I'm curious, how do y'all tell whether testing, compressors, production equipment, or plant HVAC is what created the heavier bill, or is that side of things pretty much handled?`
  }
  if (/office occupancy|lease|tenant|conference|managed buildings|property/i.test(driverText)) {
    return `I'm curious, how do y'all separate normal office usage from the buildings or tenant spaces that are actually moving the bill, or is that side of things pretty much handled?`
  }
  if (/rv support|rv setup|rv assembly|staging|warehouse support/i.test(driverText)) {
    return `I'm curious, how do y'all tell whether setup bays, staging, inventory handling, or warehouse support is what pushed the bill, or is that side of things pretty much handled?`
  }
  if (/hotel|resort|motel|inn|lodging|guest rooms?|laundry|hospitality property/i.test(driverText)) {
    if (cluster === 'hospitality_group') {
      return `I'm curious, how do y'all check each hotel on its own meter to spot which property is pushing the bill, or is that side of things pretty much handled?`
    }
    return `I'm curious, how do y'all tell whether guest rooms, laundry, kitchen service, or HVAC is what moved the bill that month, or is that side of things pretty much handled?`
  }
  if (/brewed teas|smoothies|tapioca|display cases|ice machines|drink equipment/i.test(driverText)) {
    return `I'm curious, how do y'all tell whether refrigeration, ice machines, drink equipment, or AC is what pushed the bill, or is that side of things pretty much handled?`
  }

  switch (cluster) {
    case 'print_fulfillment':
      return `I'm curious, how do y'all tell whether the print side, mailing side, or office side is driving the bill that month, or is that side of things pretty much handled?`
    case 'public_transit':
      return `I'm curious, how do y'all separate the maintenance shop and support-building usage from the regular office load, or is that pretty much on autopilot?`
    case 'moving_storage':
      return `I'm curious, how do y'all tell whether storage, dispatch, or loading activity is what moved the bill that month, or is that pretty much on autopilot?`
    case 'retail':
      return `I'm curious, how do y'all tell which stores or areas are actually moving the bill when the seasons change, or is that pretty much handled?`
    case 'restaurant':
      return `I'm curious, how do y'all tell whether kitchen timing, refrigeration, or AC is creating the bigger spike, or is that pretty much on autopilot?`
    case 'healthcare':
      if (/counseling|therapy|crisis spaces?|resident|residential/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether program spaces, residential areas, or HVAC are what moved the bill that month, or is that pretty much handled?`
      }
      if (/imaging|lab|laboratory|patient hours|treatment rooms/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether imaging, lab areas, treatment rooms, or HVAC are what pushed the bill, or is that side of things pretty much handled?`
      }
      return `I'm curious, how do y'all tell which part of the facility is creating the bigger spikes without digging through the meter data, or is that pretty much handled?`
    case 'public_sector':
      return `I'm curious, how do y'all tell whether administrative offices, public safety sites, or utility buildings are what pushed the bill, or is that side of things pretty much handled?`
    case 'residential_care':
      return `I'm curious, how do y'all tell whether resident spaces, support areas, or HVAC are what moved the bill that month, or is that pretty much on autopilot?`
    case 'logistics':
      if (/truck leasing|truck rental|fleet leasing|leasing and rental/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether maintenance shops, fleet staging, or yard lighting is what pushed the bill, or is that side of things pretty much handled?`
      }
      if (/rv support|rv setup|rv assembly|staging|warehouse support/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether setup bays, staging, inventory handling, or warehouse support is what pushed the bill, or is that side of things pretty much handled?`
      }
      if (/site-store|site store|inventory handling|delivery tracking|petrochemical plant support|receiving/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether site stores, inventory handling, delivery tracking, or warehouse support is what pushed the bill, or is that side of things pretty much handled?`
      }
      return `I'm curious, how do y'all tell whether dock activity, storage, or HVAC is driving the heavier bill that month, or is that side of things pretty much handled?`
    case 'manufacturing':
      if (/roasting equipment|green bean|coffee roasting|custom roasting/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether roasting equipment, cooling, storage, or packaging is what pushed the bill, or is that side of things pretty much handled?`
      }
      if (/mixing|milling|ovens|freezers|frozen bakery|grain-based|bakery/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether the freezers, mixing and milling equipment, ovens, or HVAC are what pushed the bill, or is that side of things pretty much handled?`
      }
      if (/winding equipment|curing ovens?|resin|finishing|fiberglass|conduit/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether winding, curing, finishing, or plant HVAC is what pushed the bill, or is that side of things pretty much handled?`
      }
      if (/batching equipment|aggregate handling|truck dispatch|yard lighting|ready[-\s]?mix|ready[-\s]?mixed concrete|aggregates/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether batching, aggregate handling, truck dispatch, or yard lighting is what pushed the bill, or is that side of things pretty much handled?`
      }
      if (/\brefrigeration\b|\bsanitation\b|\bpackaging\b|\bcooking\b/i.test(driverText)) {
        return `I'm curious, how do y'all tell whether refrigeration, cooking, packaging, or sanitation is creating the bigger spike, or is that pretty much on autopilot?`
      }
      return `I'm curious, how do y'all tell which equipment or schedule is creating the highest usage moment, or is that side of things pretty much on autopilot?`
    default:
      return `I'm curious, how do y'all tell which part of the operation is actually moving the bill, or is that pretty much handled?`
  }
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

function talkTrackDriftsFromStructuredFacts(talkTrack: string, context: TalkTrackContext) {
  const facts = context.briefingContext.structuredFacts
  const factTerms = uniqueStrings([
    ...(facts.equipment || []),
    ...(facts.energyDrivers || []),
    ...(facts.activities || []),
  ]
    .map((term) => cleanText(term).toLowerCase())
    .filter((term) => term.length >= 4 && !/^(hvac|lighting|operations|equipment|support|usage|activity|comfort)$/.test(term)), 16)

  if (factTerms.length < 3) return false

  const lower = cleanText(talkTrack).toLowerCase()
  const overlap = factTerms.filter((term) => {
    const escaped = escapeRegExp(term)
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) return true
    return term.split(/\s+/).some((part) => part.length >= 6 && new RegExp(`\\b${escapeRegExp(part)}\\b`, 'i').test(lower))
  })

  return overlap.length === 0
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
  if (/\b(website|homepage|site|about|solutions|services|home|contact|faq|nav|menu)\b/i.test(text)) return false
  if (/[,/\\;:]/.test(text)) return false
  if (/^(deals|news|updates?|press|latest)\s*[:\-]/i.test(text)) return false
  if (/\b(the business press|newswire|google news|linkedin|sec|announcement|report)\b/i.test(text)) return false
  if (/[|]/.test(text)) return false
  if (/\b(rosh hashanah|yom kippur|passover|hanukkah|easter|christmas)\b/i.test(text)) return false
  if (/\b(we have work to do|opinion|editorial|commentary|letter to the editor)\b/i.test(text)) return false
  const wordCount = text.split(/\s+/).length
  if (wordCount > 12 || wordCount < 3) return false
  return true
}

/**
 * Returns true if this account is a competing energy broker, energy consultant,
 * or energy management firm. Calling them about their electricity bill is
 * embarrassing — they do this for a living.
 */
function isCompetitorEnergyBroker(account: AccountRow): boolean {
  const text = cleanText(`${account.industry || ''} ${account.name || ''} ${getPublicAccountDescription(account)}`).toLowerCase()
  return /\b(energy broker|energy consultant|energy consulting|energy management|energy procurement|energy advisor|energy partner|retail electric provider|rep (?:agency|firm)|electricity broker|power broker|deregulated energy|energy reseller|load aggregator|demand response provider|energy analytics|utility management|utility consulting|meter data management)\b/.test(text)
}

/**
 * Returns true if this account is headquartered outside Texas and outside any
 * other US deregulated electricity state (IL, OH, PA, NJ, NY, CT, MD, MA, MI, etc.).
 * Accounts in non-deregulated markets should not receive Texas-specific ERCOT openers.
 */
const DEREGULATED_US_STATES = new Set([
  'texas', 'tx',
  'illinois', 'il',
  'ohio', 'oh',
  'pennsylvania', 'pa',
  'new jersey', 'nj',
  'new york', 'ny',
  'connecticut', 'ct',
  'maryland', 'md',
  'massachusetts', 'ma',
  'michigan', 'mi',
  'delaware', 'de',
  'rhode island', 'ri',
  'new hampshire', 'nh',
  'maine', 'me',
  'montana', 'mt',
  'oregon', 'or',
  'washington', 'wa',
])

function isInDeregulatedMarket(account: AccountRow): boolean {
  const state = cleanText(account.state).toLowerCase()
  if (!state) return true // unknown — assume eligible, do not block
  return DEREGULATED_US_STATES.has(state)
}

function inferIndustryClusterFromSignals(account: AccountRow, candidate: ResearchHit | null): IndustryCluster {
  const notes = getAccountNotes(account)
  const cleanCandidate = candidate?.label === 'Industry Trends' ? null : candidate
  const text = cleanText(`${account.industry || ''} ${account.name || ''} ${getPublicAccountDescription(account)} ${notes} ${cleanCandidate?.title || ''} ${cleanCandidate?.snippet || ''}`).toLowerCase()
  const verifiedLocationCount = getVerifiedLocationCount(account)
  if (!text) return 'unknown'
  // Energy brokers and consultants — do not classify as any operational cluster
  if (isCompetitorEnergyBroker(account)) return 'office_services'
  // Religious must come before school_district — churches that mention elementary schools in their founding history
  // (e.g. "held first service at Black Jack Elementary School") would otherwise be misclassified as school_district
  if (hasReligiousOrganizationSignals(text)) return 'religious'
  if (/(primary\/secondary education|school district|independent school district|\bisd\b|public school|charter school|k-12|school board|high school|middle school|elementary school|school campus|school system)/.test(text) && !hasReligiousOrganizationSignals(text)) return 'school_district'
  if (/(summer camp|outdoor recreational summer camp|year-round preschool|preschool|childcare|daycare|learning center|academy)/.test(text)) return 'education_nonprofit'
  if (/(college(?![-\s]?preparatory)|university(?!\s+(?:blvd|boulevard|ave|avenue|dr|drive|rd|road|st|street))|higher education|community college|student housing|dorm|residence hall|campus ministry)/.test(text)) return 'higher_education'
  if (/(\bfood production\b|\bfood manufacturing\b|\bfood manufacturer\b|\bfood processing\b|food processing facilit|usda[-\s]?approved|\bcustom proteins?\b|\bkettle soups?\b|\bdry sausage\b|\bdehydrated beans\b|\bco[-\s]?manufacturing\b|\bfrozen bakery\b|\bgrain-based\b|\bflour mill\b|\bsmall-batch\b.*\broast|\bcoffee roasting\b|\bcustom roasting\b|\broasting equipment\b)/.test(text) &&
      !/(fabricat|weld|metal|steel|machine shop|industrial gas|compressed air|compressor)/.test(text)) return 'manufacturing'
  if (hasStrongLogisticsSignals(text) && /(logistics|supply chain|site store management|inventory management|warehouse management|materials and delivery tracking|transportation management|third party integrator)/.test(text)) return 'logistics'
  if (hasMaterialHandlingEquipmentSignals(text)) return 'logistics'
  if (hasPlasticsDistributionSignals(text)) return 'logistics'
  if (hasCraneSalesSupportSignals(text)) return 'logistics'
  if (hasIndustrialSiteLogisticsSignals(text)) return 'logistics'
  if (hasPalletManagementSignals(text)) return 'logistics'
  if (hasTruckLeasingSignals(text)) return 'logistics'
  if (hasMaritimePilotSignals(text)) return 'public_transit'
  if (hasReadyMixConcreteSignals(text)) return 'manufacturing'
  if (hasFiberglassConduitSignals(text)) return 'manufacturing'
  if (hasStrongCommercialRealEstateSignals(text)) return 'office_services'
  if (hasFurnitureManufacturingSignals(text)) return 'manufacturing'
  // Move multi_site to bottom of priority list to favor industry-specific guidance
  if (/(defense|space|aerospace|rocket|aviation|aircraft|missile|orbital|satellite)/.test(text)) return 'manufacturing'
  if (/\b(oil and gas|oilfield|natural gas|mining|quarry|cement|refinery|industrial gas|midstream|upstream|downstream|pipeline|petroleum)\b/i.test(text)) {
    if (!/(energy drink|high-energy|low-energy|clean energy distributor|renewable energy products|solar distributor)/i.test(text)) {
      return 'energy_intensive'
    }
  }
  if (hasStrongManufacturersRepSignals(text)) return 'office_services'
  if (/(manufactur|fabricat|weld|foundry|assembly (?:plant|line|facility))/i.test(text)) {
    if (hasStrongRetailStoreSignals(text) && !/(fabricat|weld|foundry|assembly (?:plant|line|facility))/i.test(text)) {
      return 'retail'
    }
    return 'manufacturing'
  }

  if (/(blood center|bloodcare|blood bank|blood donation|blood products|blood components|transfusion|donor center|mobile blood drives?|blood collection|blood processing|specialized laboratory testing)/.test(text)) return 'healthcare'
  if (hasPublicTransitSignals(text)) return 'public_transit'
  if (hasPrintFulfillmentSignals(text)) return 'print_fulfillment'
  if (hasMovingStorageSignals(text)) return 'moving_storage'
  // Residential care & shelter services — must come before general behavioral health/healthcare to prevent shelters from landing as clinics/hospitals
  if (/(shelter|women's shelter|emergency shelter|homeless shelter|transitional housing|supportive housing|children'?s home|foster care|adoption assistance|residential services|independent living center|counseling center|youth services|human services|group home|residential care)/.test(text)) return 'residential_care'
  if (hasStrongBehavioralHealthSignals(text)) return 'healthcare'
  if (hasStrongBakeryCafeSignals(text)) return 'restaurant'
  if (hasGolfClubSignals(text)) return 'hospitality_group'
  // Automotive dealer — must come before brewery to prevent dealership groups owning craft breweries from landing as food storage
  if (hasStrongAutomotiveDealerSignals(text)) return 'retail'
  // Brewery / taproom — must come before retail store to prevent craft breweries landing as 'shop and showroom'
  if (/(\bbrewery\b|\bbreweries\b|\bbrewing company\b|\bbrewing co\.?\b|\btaproom\b|\btap room\b|\bcraft beer\b|\bcraft brewery\b|\bmicrobrewery\b|\bnanobrewery\b|\bdistillery\b|\bdistilled spirits\b|\bwinery\b|\bwine maker\b|\bwinemaker\b|\bvineyard\b|\balemaker\b|\bale house\b)/.test(text)) return 'food_storage'
  if (hasStrongRetailStoreSignals(text)) return 'retail'
  // Food production — require primary food/beverage production signals, NOT just 'food service' (e.g. a manufacturer making food service equipment is not a food producer)
  if (/(\bfood production\b|\bfood manufacturing\b|\bfood manufacturer\b|\bfood processing\b|food processing facilit|usda[-\s]?approved|\bcustom proteins?\b|\bkettle soups?\b|\bdry sausage\b|\bdehydrated beans\b|\bco[-\s]?manufacturing\b)/.test(text) &&
      !/(manufactur|fabricat|weld|metal|steel|machine|industrial gas|compressed air|compressor|hotel|hospitality|resort|lodging|motel|inn)/.test(text)) return 'manufacturing'
  if (hasStrongPetrochemicalSignals(text)) return 'manufacturing'
  // Core manufacturing signals were moved to higher priority position above healthcare
  if (hasStrongAutoPartsDistributionSignals(text)) return 'logistics'
  if (/(durable medical equipment|\bdme\b|home medical equipment|medical equipment|medical supplies?|equipment logistics|equipment delivery|equipment maintenance|direct-service locations?|direct service locations?|hospice dme|hospice equipment|inventory management|medical supply(?:ies)?)/.test(text)) return 'logistics'
  // Tile / flooring / surface distributors — showroom + distribution, NOT manufacturing
  if (/(\btile\b|\bflooring\b|\bfloor solutions\b|\bporcelain tile\b|\bceramic tile\b|\bsurface solutions\b|\bfloor covering\b|\bfloor coverings\b)/.test(text) &&
      /(showroom|distributor|supplier|surface|\barchitect\b|\bdesigner\b|\bcommercial flooring\b)/.test(text) &&
      !/(manufactur|fabricat|weld|extrusion)/.test(text)) return 'logistics'
  // Logistics check — exclude accounts that are primarily manufacturers (have fabrication/welding/industrial signals)
  if (/(building materials|lumber|wholesale distribution|specialty building materials|\bdistributor\b|distribution center|distribution centers|distribution network|\blogistics\b|\bwarehouse\b|\bdistribution\b|\bfulfillment\b|\bfreight\b|nvo?cc|\btrucking\b|supply chain|\btransport\b|\bshipping\b|\bcargo\b|auto logistics|freight forwarder)/.test(text) &&
      !/(manufactur|fabricat|weld|foundry|machine shop|precision metal|metal fabricat|industrial compressor|compressed air)/.test(text)) return 'logistics'
  if (hasTruckLeasingSignals(text)) return 'logistics'
  if (/(manufactur|industrial|fabricat|machine|plastics?|chemical|metal|steel|packag|production|component|construction|epc|builder|contractor)/.test(text) &&
      (!/(freight forwarder|nvo?cc|logistics|warehouse|distribution|fulfillment|trucking|transport|shipping|cargo|auto logistics|hotel|hospitality|resort|lodging|motel|inn)/.test(text) ||
       /(manufactur|fabricat|weld|foundry|assembly (?:plant|line|facility))/i.test(text))) return 'manufacturing'
  if (/\b(municipal|city of|county government|county of|public sector|civic|public works|public safety|utility infrastructure|public facilities)\b/i.test(text)) return 'public_sector'
  const hotelProperty = looksLikeHotelProperty(text)
  const hospitalityGroup = looksLikeHospitalityGroup(text, verifiedLocationCount, notes)
  if (hospitalityGroup) return 'hospitality_group'
  if (hotelProperty && (verifiedLocationCount === null || verifiedLocationCount <= 1)) return 'hotel_owner'
  if (/(healthcare|\bhospital\b|clinic|medical|senior living|assisted living|nursing|alzheimer'?s?|memory care|retirement living|continuum of care|skilled nursing|pharma|pharmacy|psychiatric|partial hospitalization|intensive outpatient|substance use|chemical dependency)/.test(text)) return 'healthcare'
  if (/(restaurant|dining|cafe|café|grill|bar\b|pub\b|eatery|hospitality|hotel|lodging|venue|wedding|event space|banquet)/.test(text)) return hotelProperty ? 'hotel_owner' : 'restaurant'
  if (/(retail|store|shopping|franchise|dealer|showroom|convenience|\brecreation\b|fitness|gym|entertainment|amusement|automotive|auto)/.test(text)) return 'retail'
  if (/(bank|credit union|financial|wealth|insurance|lending)/.test(text)) return 'banking'
  if (/(cold storage|refrigerat|freezer|food (?:storage|process|production|distribut|wholesale)|beverage (?:storage|process|production|distribut|wholesale)|grocery|produce|dairy|meat|bakery)/.test(text)) return 'food_storage'
  if (/(primary\/secondary education|school district|independent school district|\bisd\b|public school|charter school|k-12|school board|high school|middle school|elementary school|school campus|school system)/.test(text)) return 'school_district'
  if (/(college(?![-\s]?preparatory)|university(?!\s+(?:blvd|boulevard|ave|avenue|dr|drive|rd|road|st|street))|higher education|community college|student housing|dorm|residence hall|campus ministry)/.test(text)) return 'higher_education'
  if (hasReligiousOrganizationSignals(text)) return 'religious'
  if (/(school|education|university|college|nonprofit|foundation|charity|academy|daycare|preschool|childcare|tutoring|learning center)/.test(text)) return 'education_nonprofit'
  if (/(technology|software|saas|data center|it services|cloud|digital)/.test(text)) return 'technology'
  if (/(office|professional services|law|legal|consulting|accounting|marketing|real estate|staffing|agency|design|engineering|architect)/.test(text)) return 'office_services'
  if (/\b(multi[-\s]?site|portfolio|branch(?:es)?|(?<!supply\s)chain|holdings)\b/i.test(text)) return 'multi_site'
  return 'unknown'
}

function inferIndustryCluster(account: AccountRow, candidate: ResearchHit | null): IndustryCluster {
  const cleanCandidate = candidate?.label === 'Industry Trends' ? null : candidate
  const savedProfile = getAccountIdentityProfile(account, cleanCandidate)
  if (savedProfile?.industryCluster) {
    return savedProfile.industryCluster
  }

  const coreText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)}`).toLowerCase()
  if (/\b(hospital|medical center|regional hospital|health system|emergency room|acute care)\b/i.test(coreText)) return 'healthcare'
  // Religious must come before school_district — same priority issue as inferIndustryClusterFromSignals
  if (hasReligiousOrganizationSignals(coreText)) return 'religious'
  if (/(primary\/secondary education|school district|independent school district|\bisd\b|public school|charter school|k-12|school board|high school|middle school|elementary school|school campus|school system)/i.test(coreText) && !hasReligiousOrganizationSignals(coreText)) return 'school_district'
  if (/(summer camp|outdoor recreational summer camp|year-round preschool|preschool|childcare|daycare|learning center|academy)/i.test(coreText)) return 'education_nonprofit'
  if (/(college(?![-\s]?preparatory)|university(?!\s+(?:blvd|boulevard|ave|avenue|dr|drive|rd|road|st|street))|higher education|community college|student housing|dorm|residence hall|campus ministry)/i.test(coreText)) return 'higher_education'
  if (hasStrongCommercialRealEstateSignals(coreText)) return 'office_services'
  if (hasFurnitureManufacturingSignals(coreText)) return 'manufacturing'
  if (hasReadyMixConcreteSignals(coreText)) return 'manufacturing'
  if (hasFiberglassConduitSignals(coreText)) return 'manufacturing'
  if (/(\bfood production\b|\bfood manufacturing\b|\bfood manufacturer\b|\bfood processing\b|food processing facilit|usda[-\s]?approved|\bcustom proteins?\b|\bkettle soups?\b|\bdry sausage\b|\bdehydrated beans\b|\bco[-\s]?manufacturing\b|\bfrozen bakery\b|\bgrain-based\b|\bflour mill\b|\bsmall-batch\b.*\broast|\bcoffee roasting\b|\bcustom roasting\b|\broasting equipment\b)/i.test(coreText) &&
      !/(fabricat|weld|metal|steel|machine shop|industrial gas|compressed air|compressor|hotel|hospitality|resort|lodging|motel|inn)/i.test(coreText)) return 'manufacturing'
  if (hasPublicTransitSignals(coreText)) return 'public_transit'
  if (hasMaritimePilotSignals(coreText)) return 'public_transit'
  if (hasPrintFulfillmentSignals(coreText)) return 'print_fulfillment'
  if (hasMovingStorageSignals(coreText)) return 'moving_storage'
  // Use county government|county of (not bare \bcounty\b) to avoid matching geographic names like "Harris County, Texas"
  if (/\b(municipal|city of|county government|county of|public sector|civic|public works|public safety|utility infrastructure|public facilities)\b/i.test(coreText)) return 'public_sector'
  if (hasGolfClubSignals(coreText)) return 'hospitality_group'
  if (hasTruckLeasingSignals(coreText)) return 'logistics'
  if (hasMaterialHandlingEquipmentSignals(coreText)) return 'logistics'
  if (hasPlasticsDistributionSignals(coreText)) return 'logistics'
  if (hasCraneSalesSupportSignals(coreText)) return 'logistics'
  if (hasIndustrialSiteLogisticsSignals(coreText)) return 'logistics'
  if (/(shelter|women's shelter|emergency shelter|homeless shelter|transitional housing|supportive housing|children'?s home|foster care|adoption assistance|residential services|independent living center|counseling center|youth services|human services|group home|residential care)/i.test(coreText)) return 'residential_care'
  if (hasConvenienceStoreSignals(coreText) || hasGameRetailSignals(coreText) || hasStrongAutomotiveDealerSignals(coreText)) return 'retail'

  return inferIndustryClusterFromSignals(account, cleanCandidate)
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
    if (/(heat pump|electrification|decarbonization|ev charging|charging station|data center|server|ai compute|bitcoin|mining|technical testing|\blabs?\b|\blaborator(?:y|ies)\b|pilot plant|research|prototype|fabrication)/i.test(text)) {
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
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)}`).toLowerCase()
  const alreadyOpen = isAlreadyOpenLocationSignal(candidateText)
  const futureOpen = isFutureOpenLocationSignal(candidateText)
  const accountLooksLikeOperatingHospital = /(acute care hospital|medical\/surgical beds|intensive care unit|women[’']?s center|emergency room|operating rooms?|medical imaging|hospital district|owned by|operated by)/i.test(accountText)
  const openingIndustryLine = buildOpeningIndustryLine(
    inferIndustryCluster(account, candidate),
    alreadyOpen,
    cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase(),
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
            `With a 24/7 property, the useful question is whether the power plan is lined up now or still waiting on the buildout.`,
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
              ? `The useful question is whether the meter, billing, and operating load were already lined up when the site opened.`
              : `The first thing to sanity-check is whether the new meter and ramp-up are being planned ahead of time.`,
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
      const isDentalGrowth = /(dental|dentist|dentistry|dso\b|dpo\b|practice acquisition|practice expansion|operatories?|sterilization|hygienist|hygiene|orthodont|oral surgery)/i.test(text)
      if (isDentalGrowth) {
        return {
          label: 'Dental practice growth',
          angle: 'Practice acquisition, operatories, imaging, sterilization, and patient flow adding load across the office network.',
          question: 'Has anyone checked which practices are driving the biggest spikes on their own meters as the network grows?',
          openers: [
            `The busier offices can quietly change the load pattern across the network.`,
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
            `The busier clinics can quietly change the load pattern across the network.`,
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
          `When a business is growing, the load pattern usually shifts before the bill catches up.`,
          `That kind of growth usually surfaces questions about whether the existing setup was sized right.`,
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
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  const multiSiteInfo = detectMultiSiteScale(account, candidate)

  if (hasGolfClubSignals(text)) {
    if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount >= 3) {
      const locationDesc = multiSiteInfo.locationCount >= 10
        ? `${multiSiteInfo.locationCount}+ clubs`
        : `${multiSiteInfo.locationCount} clubs`
      const regionDesc = multiSiteInfo.regions.length > 1
        ? ` across ${multiSiteInfo.regions.length} states`
        : ''

      return {
        label: 'Golf club network',
        angle: `Clubhouse-by-clubhouse comparison of clubhouse HVAC, dining, cart charging, and course irrigation across ${locationDesc}${regionDesc}.`,
        question: `I'm curious, how do y'all check which clubhouses are carrying the biggest peaks, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a golf club network, clubhouse HVAC, dining, cart charging, and course irrigation can all hit the meter in different ways because the clubhouse and course run on different schedules.`,
          `Often times for multi-site private clubs, it's hard to compare clubhouse load from one property to the next because each course runs on its own schedule.`,
          `Often times for a golf portfolio, it's difficult to tell which clubhouse or course support building is carrying the highest peak because the bills get blended together at the corporate level.`,
        ],
        focus: ['clubhouse HVAC', 'cart charging', 'course irrigation', 'pro shop lighting', 'club dining', 'member services'],
      }
    }

    return {
      label: 'Golf club',
      angle: 'Clubhouse HVAC, dining, cart charging, and course irrigation driving the load on the same meter.',
      question: `I'm curious, how do y'all tell whether clubhouse HVAC, dining, or course support is what moved the bill that month, or is that side of things pretty much on autopilot?`,
      openers: [
        `Often times for a golf club, it's hard to keep clubhouse HVAC, dining, cart charging, and course irrigation from hitting the meter in different ways because the clubhouse and course run on different schedules.`,
        `Often times at a private club, it's difficult to separate clubhouse load from course irrigation and cart charging because they do not run on the same schedule.`,
        `Often times for a golf club, the bill moves more from clubhouse operations and course support than from a normal office-style load.`,
      ],
      focus: ['clubhouse HVAC', 'cart charging', 'course irrigation', 'pro shop lighting', 'club dining', 'member services'],
    }
  }

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

        if (acquisitionHeavy) {
          return {
            label: 'Acquisition-led network',
            angle: `Acquisition-led branch network across ${locationDesc}${regionDesc}, with each meter carrying its own peak history.`,
            question: `I'm curious, how do y'all track the peak charges at those individual acquired branches, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times for an acquisition-heavy branch network, it's hard to catch when individual yards or branches are carrying their own locked-in peak charges because the bills get rolled up at the corporate level.`,
              `Often times for an acquisition-led network, it's difficult to normalize utility costs across different branches because each local meter carries its own inherited peak history.`,
              `Often times for a newly acquired branch, it's hard to tell whether its current billing floor is still inflated by the previous owner's peak usage because of uncoordinated meter transitions.`,
            ],
            focus: ['acquired branches', 'meter history', 'portfolio comparison', 'locked-in peak charges', 'site-level review'],
          }
        } else {
          return {
            label: 'Multi-site portfolio',
            angle: `Portfolio-level comparison of locked-in peak charges across ${locationDesc}${regionDesc}.`,
            question: `I'm curious, how do y'all compare which locations are carrying locked-in peak charges, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times for a large multi-site portfolio, it's hard to track which sites are carrying their own locked-in peak charges because the corporate view is too blended.`,
              `Often times for a footprint with multiple locations, it's difficult to keep a single site's demand spike from inflating its local bill for the next twelve months because each meter behaves differently.`,
              `Often times for a multi-site operation, it's hard to audit each meter separately because billing departments usually just process the consolidated totals.`,
            ],
            focus: ['billing floors', 'locked-in peak charges', 'portfolio comparison', 'budget erosion', 'hidden spikes'],
          }
        }
      }

      return {
        label: 'Multi-site portfolio',
        angle: 'Portfolio-level comparison of locked-in peak charges across multiple sites.',
        question: `I'm curious, how do y'all audit those sites meter by meter, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a multi-site portfolio, it's hard to track which sites have their own locked-in peak charge and which ones do not because consolidated bills hide the local details.`,
          `Often times for a footprint with several locations, it's difficult to prevent a single site's operational spike from setting a high billing floor for the entire year because each meter behaves independently.`,
          `Often times for multiple locations, it's hard to separate the high-performing sites from the ones carrying peak history because of blended utility reporting.`,
        ],
        focus: ['billing floors', 'locked-in peak charges', 'portfolio comparison', 'budget erosion', 'hidden spikes'],
      }
    case 'manufacturing':
      if (/\bcoffee roasting|custom roasting|green beans|roasting equipment\b/i.test(text)) {
        return {
          label: 'Coffee roasting operation',
          angle: 'Roasting equipment, cooling, green bean storage, packaging, and HVAC shaping the highest usage moments.',
          question: `I'm curious, how do y'all tell whether roasting equipment, cooling, storage, or packaging is what pushed the bill, or is that side of things pretty much handled?`,
          openers: [
            `Often times in coffee roasting, the roasters, cooling, green bean storage, packaging, and HVAC can stack up during the same production window.`,
            `Often times for custom coffee roasters, it's hard to tell whether the roasting schedule or cooling load is what created the highest usage moment.`,
            `Often times with small-batch roasting, the bill moves more from production timing than from normal office or retail usage.`,
          ],
          focus: ['roasting equipment', 'cooling', 'green bean storage', 'packaging', 'HVAC', 'production timing'],
        }
      }

      if (/\b(grain-based|frozen bakery|flour mill|biscuits?|muffins?|bakery manufacturing|bakery products)\b/i.test(text)) {
        return {
          label: 'Grain-based and frozen bakery production',
          angle: 'Mixing, milling, ovens, freezers, packaging, sanitation, and HVAC creating high-usage production windows.',
          question: `I'm curious, how do y'all tell whether the freezers, mixing and milling equipment, ovens, or HVAC are what pushed the bill, or is that side of things pretty much handled?`,
          openers: [
            `Often times in bakery manufacturing, mixing, milling, ovens, freezers, packaging, and HVAC can stack up during the same production window.`,
            `Often times for frozen bakery production, it's hard to tell whether freezer banks, ovens, or mixing equipment are creating the highest usage moments.`,
            `Often times with grain-based production, the bill moves more from production timing and cold storage than from normal building usage.`,
          ],
          focus: ['mixing', 'milling', 'ovens', 'freezers', 'packaging', 'sanitation', 'HVAC'],
        }
      }

      if (hasReadyMixConcreteSignals(text)) {
        const concreteMultiSite = detectMultiSiteScale(account, candidate)
        const locationDesc = concreteMultiSite.isMultiSite && concreteMultiSite.locationCount
          ? concreteMultiSite.locationCount >= 10
            ? `${concreteMultiSite.locationCount}+ ready-mix or aggregates sites`
            : `${concreteMultiSite.locationCount} ready-mix or aggregates sites`
          : 'the ready-mix and aggregates operation'

        return {
          label: 'Ready-mix concrete and aggregates',
          angle: `Ready-mix batching, aggregate handling, mixer-truck dispatch, yard lighting, and site-level timing shaping the bill across ${locationDesc}.`,
          question: `I'm curious, how do y'all tell whether batching, aggregate handling, truck dispatch, or yard lighting is what pushed the bill, or is that side of things pretty much handled?`,
          openers: [
            `Often times in ready-mix concrete, batching equipment, aggregate handling, truck dispatch, and yard lighting can all hit the meter during the same busy window.`,
            `Often times for concrete and aggregates operations, it's hard to tell whether the batch plant, material handling, or yard activity is what created the highest usage moment.`,
            `Often times with ready-mix sites, the bill can move more from timing around batching and dispatch than from normal office or building usage.`,
          ],
          focus: ['ready-mix batching', 'aggregate handling', 'mixer-truck dispatch', 'yard lighting', 'washout/reclaim systems', 'site-level timing'],
        }
      }

      if (hasFiberglassConduitSignals(text)) {
        return {
          label: 'Fiberglass conduit manufacturing',
          angle: 'Winding equipment, curing ovens, resin/process areas, finishing, and plant HVAC creating the highest usage moments.',
          question: `I'm curious, how do y'all tell whether winding, curing, finishing, or plant HVAC is what pushed the bill, or is that side of things pretty much handled?`,
          openers: [
            `Often times in fiberglass conduit manufacturing, winding equipment, curing ovens, finishing, and plant HVAC can stack up during the same production window.`,
            `Often times for conduit production, it's hard to tell whether the winding line, curing process, or general plant load created the highest usage moment.`,
            `Often times with fiberglass production, process heat and production timing move the bill more than normal building usage.`,
          ],
          focus: ['winding equipment', 'curing ovens', 'resin/process areas', 'finishing', 'plant HVAC', 'production timing'],
        }
      }

      if (hasStrongPetrochemicalSignals(text)) {
        return {
          label: 'Petrochemical manufacturing',
          angle: 'Chemical processing, pumps, compressors, storage terminals, and reliability systems driving usage differently than a normal warehouse or office.',
          question: `I'm curious, how do y'all separate the process equipment load from the terminal support services, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a petrochemical plant, it's hard to keep process equipment, terminal operations, and reliability systems from spiking the meter at the same time because of continuous production runs.`,
            `Often times for a chemical processing facility, it's difficult to manage the demand spikes from heavy pumps and compressors because reliability requirements prevent delaying operations.`,
            `Often times for a processing terminal, it's hard to tell whether the main production lines or the backup support systems are setting the peak billing floor because of shared electrical service.`,
          ],
          focus: ['chemical processing', 'process equipment', 'pumps', 'compressors', 'terminal operations', 'reliability systems'],
        }
      }

      if (/(food production|food manufacturing|food manufacturer|food processing|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|bakery|dessert|cake|cheesecake|pie|frozen food|bakehouse|baking line|production kitchen)/.test(text) ||
          (/(refrigerat|freezer|cold chain)/.test(text) && /\b(food|beverage|bakery|processing|poultry|meat|dairy|grocery|fruit|vegetable|snack|cookie|confectionery|brewery|distillery|winery|kitchen|meals)\b/.test(text))) {
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
            question: `I'm curious, how do y'all track the peak demand patterns across those different plants, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times for a food production network, it's hard to keep refrigeration, cooking, packaging, and sanitation from driving up the bill at individual plants because production schedules overlap.`,
              `Often times for multiple USDA food plants, it's difficult to compare efficiency when one facility is quietly carrying a much heavier peak demand charge than the others.`,
              `Often times for a food manufacturing footprint, it's hard to prevent high-heat sanitation cycles or packaging line startups from setting a permanent billing floor because of tight production windows.`,
            ],
            focus: ['refrigeration', 'cooking lines', 'packaging', 'sanitation', 'production cycles', 'portfolio management'],
          }
        }

        return {
          label: 'Food production',
          angle: 'Refrigeration, cooking, packaging, sanitation, and production timing creating the highest usage moments.',
          question: `I'm curious, how do y'all coordinate shift startup times to avoid peak spikes, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in a food production facility, it's difficult to prevent refrigeration, ovens, and packaging lines from hitting the meter all at once because of overlapping shift schedules.`,
            `Often times for a food processor, it's hard to manage the constant draw of refrigeration alongside heavy cooking load without triggering a demand ratchet because of strict temperature needs.`,
            `Often times in food manufacturing, it's hard to separate the actual production energy from the baseline refrigeration and sanitation load because they share the same meter.`,
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
            question: `I'm curious, how do y'all track which plants are setting the peak billing floors, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times for an environmental products network, it's hard to prevent mixing, packaging, and warehouse climate control from running together and driving up the peak charge at individual sites because of simultaneous operating hours.`,
              `Often times for a multi-facility manufacturer, it's difficult to spot which plant is carrying a demand ratchet because consolidated energy budgets blend all the bills together.`,
              `Often times for a specialty production footprint, it's hard to prevent a single hot month's warehouse cooling load from setting a high billing floor for the entire year because of demand ratchet rules.`,
            ],
            focus: ['mixing', 'packaging', 'warehouse climate control', 'distribution', 'billing floors', 'demand ratchets'],
          }
        }

        return {
          label: 'Environmental products manufacturing',
          angle: 'Mixing, packaging, warehouse climate control, and distribution support driving the billing floor.',
          question: `I'm curious, how do y'all manage the startup timing of the mixing and packaging lines, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in a specialty manufacturing facility, it's hard to prevent mixing, packaging, and warehouse climate control from running together and driving up the peak charge because of simultaneous process demands.`,
            `Often times for an industrial operator, it's difficult to run heavy mixing or packaging equipment without setting a permanent billing floor because of the demand ratchet on the meter.`,
            `Often times for a production plant, it's hard to tell whether the main manufacturing lines or the general warehouse climate control is what's setting the monthly peak because they run on a single meter.`,
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
          question: `I'm curious, how do y'all track which manufacturing sites are carrying the highest peak charges, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a manufacturing network, it's hard to review each site's meter history separately because corporate roll-ups hide the individual plant spikes.`,
            `Often times for a multi-site manufacturer, it's difficult to keep a single plant's summer startup spike from inflating its local bill for the next twelve months because of local demand ratchets.`,
            `Often times for multiple industrial facilities, it's hard to see which site is carrying a peak charge that doesn't match its current production volume because of lack of site-level visibility.`,
          ],
          focus: ['portfolio visibility', 'meter-specific peak charges', 'multi-site coordination', 'billing floors', 'site-level review'],
        }
      }
      
        return {
          label: 'Manufacturing operation',
          angle: 'Machine startup timing and production ramps creating usage spikes that can stay on the bill.',
          question: `I'm curious, how do y'all manage the startup sequence of your heavy machinery, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in a manufacturing facility, it's hard to prevent heavy machine startups and process heating from hitting the meter at the same time because of production shift changes.`,
            `Often times for an industrial plant, it's difficult to manage the demand spikes from compressors and motors without triggering a permanent demand ratchet floor because of constant operational needs.`,
            `Often times for a manufacturer, it's hard to tell whether the main production line or the facility HVAC is setting the monthly peak because they share the same utility service.`,
          ],
          focus: ['startup sequences', 'production ramps', 'shift-driven peaks', 'billing floors', 'demand ratchets', 'transmission liability'],
        }
    case 'logistics':
      if (hasPalletManagementSignals(text)) {
        const palletMultiSite = detectMultiSiteScale(account, candidate)
        if (palletMultiSite.isMultiSite && palletMultiSite.locationCount && palletMultiSite.locationCount >= 3) {
          const locationDesc = palletMultiSite.locationCount >= 10
            ? `${palletMultiSite.locationCount}+ facilities`
            : `${palletMultiSite.locationCount} facilities`
          const regionDesc = palletMultiSite.regions.length > 1
            ? ` across ${palletMultiSite.regions.length} states`
            : ''

          return {
            label: 'Pallet management and reverse logistics network',
            angle: `Pallet retrieval, repair, recycling, sortation, inventory handling, and warehouse support across ${locationDesc}${regionDesc}.`,
            question: `I'm curious, how do y'all tell which sites are carrying the biggest peaks, or is that side of things pretty much handled?`,
            openers: [
              `Often times for a pallet management network, pallet retrieval, repair, recycling, sortation, and warehouse support can all hit the meter during the same busy window.`,
              `Often times for reverse-logistics operations, it's hard to tell whether the repair bays or the warehouse support side is what actually moved the bill that month.`,
              `Often times with pallet services, the bill moves more from warehouse support and inventory cycles than from a standard office setup.`,
            ],
            focus: ['pallet retrieval', 'repair bays', 'sortation equipment', 'warehouse support', 'inventory cycles', 'reverse logistics'],
          }
        }

        return {
          label: 'Pallet management and reverse logistics',
          angle: 'Pallet retrieval, repair, recycling, sortation, inventory handling, and warehouse support shaping the bill.',
          question: `I'm curious, how do y'all tell which parts of the operation are driving the highest usage, or is that side of things pretty much handled?`,
          openers: [
            `Often times for a pallet management operation, pallet retrieval, repair, recycling, sortation, and warehouse support can all hit the meter during the same busy window.`,
            `Often times for reverse-logistics work, it's hard to tell whether the repair bays or the warehouse support side is what actually moved the bill that month.`,
            `Often times with pallet services, the bill moves more from warehouse support and inventory cycles than from a standard office setup.`,
          ],
          focus: ['pallet retrieval', 'repair bays', 'sortation equipment', 'warehouse support', 'inventory cycles', 'reverse logistics'],
        }
      }

      if (hasPalletManagementSignals(text)) {
        const palletMultiSite = detectMultiSiteScale(account, candidate)
        if (palletMultiSite.isMultiSite && palletMultiSite.locationCount && palletMultiSite.locationCount >= 3) {
          const locationDesc = palletMultiSite.locationCount >= 10
            ? `${palletMultiSite.locationCount}+ facilities`
            : `${palletMultiSite.locationCount} facilities`
          const regionDesc = palletMultiSite.regions.length > 1
            ? ` across ${palletMultiSite.regions.length} states`
            : ''

          return {
            label: 'Pallet management and reverse logistics network',
            angle: `Pallet retrieval, repair, recycling, sortation, inventory handling, and warehouse support across ${locationDesc}${regionDesc}.`,
            question: `I'm curious, how do y'all tell which sites are carrying the biggest peaks, or is that side of things pretty much handled?`,
            openers: [
              `Often times for a pallet management network, pallet retrieval, repair, recycling, sortation, and warehouse support can all hit the meter during the same busy window.`,
              `Often times for reverse-logistics operations, it's hard to tell whether the repair bays or the warehouse support side is what actually moved the bill that month.`,
              `Often times with pallet services, the bill moves more from warehouse support and inventory cycles than from a standard office setup.`,
            ],
            focus: ['pallet retrieval', 'repair bays', 'sortation equipment', 'warehouse support', 'inventory cycles', 'reverse logistics'],
          }
        }

        return {
          label: 'Pallet management and reverse logistics',
          angle: 'Pallet retrieval, repair, recycling, sortation, inventory handling, and warehouse support shaping the bill.',
          question: `I'm curious, how do y'all tell which parts of the operation are driving the highest usage, or is that side of things pretty much handled?`,
          openers: [
            `Often times for a pallet management operation, pallet retrieval, repair, recycling, sortation, and warehouse support can all hit the meter during the same busy window.`,
            `Often times for reverse-logistics work, it's hard to tell whether the repair bays or the warehouse support side is what actually moved the bill that month.`,
            `Often times with pallet services, the bill moves more from warehouse support and inventory cycles than from a standard office setup.`,
          ],
          focus: ['pallet retrieval', 'repair bays', 'sortation equipment', 'warehouse support', 'inventory cycles', 'reverse logistics'],
        }
      }

      const logisticsMultiSite = detectMultiSiteScale(account, candidate)
      const logisticsAcquisitionHeavy = /\b(acquisition|acquisitions|acquired|rollup|distribution|building materials|wholesale|lumber|yards?|branches?)\b/i.test(text)

      if (hasIndustrialSiteLogisticsSignals(text)) {
        return {
          label: 'Petrochemical site-store logistics',
          angle: 'Site-store management, consumable materials, inventory control, warehouse support, and delivery tracking inside petrochemical or energy plants.',
          question: `I'm curious, how do y'all tell whether site stores, inventory handling, delivery tracking, or warehouse support is what pushed the bill, or is that side of things pretty much handled?`,
          openers: [
            `Often times in petrochemical site-store logistics, inventory handling, warehouse support, and delivery tracking can all hit the meter during the same busy window.`,
            `Often times for site-store operators inside industrial plants, it's hard to separate materials handling from normal office and warehouse support load.`,
            `Often times with consumable-materials programs, the bill moves from the timing of receiving, inventory work, and delivery activity more than from a standard office setup.`,
          ],
          focus: ['site-store management', 'inventory handling', 'warehouse support', 'delivery tracking', 'receiving', 'petrochemical plant support'],
        }
      }

      if (hasConstructionMachinerySupportSignals(text)) {
        return {
          label: 'Construction equipment sales and support',
          angle: 'Concrete mixers, mortar pumps, access equipment, parts areas, service bays, and support-space HVAC shaping the bill differently than a plant floor.',
          question: `I'm curious, how do y'all tell whether service work, parts areas, or equipment testing is what moved the bill that month, or is that side of things pretty much handled?`,
          openers: [
            `Often times for construction equipment support, the parts area, service bays, equipment testing, and shop HVAC can all hit the meter during the same busy window.`,
            `Often times for a construction equipment sales and service operation, the support side, parts room, and service work can move the bill differently than a normal office setup.`,
            `Often times with construction machinery support, the bill can move more from service timing and parts handling than from a typical storefront or office load.`,
          ],
          focus: ['concrete mixers', 'mortar pumps', 'access equipment', 'service bays', 'parts areas', 'shop HVAC'],
        }
      }

      if (hasMaterialHandlingEquipmentSignals(text)) {
        return {
          label: 'Materials-handling equipment and service',
          angle: 'Forklift charging, lift service, parts areas, warehouse support, shop HVAC, and customer equipment support shaping the bill.',
          question: `I'm curious, how do y'all tell whether forklift charging, service work, parts areas, or shop cooling is what moved the bill that month, or is that side of things pretty much handled?`,
          openers: [
            `Often times for materials-handling equipment companies, forklift charging, lift service, parts areas, warehouse support, and shop HVAC can all hit the meter during the same busy window.`,
            `Often times for forklift and warehouse-equipment suppliers, it's hard to tell whether the service side, parts area, or equipment charging is what actually moved the bill that month.`,
            `Often times with lift equipment and warehouse support, the bill can move from service timing and charging activity more than from a normal office setup.`,
          ],
          focus: ['forklift charging', 'battery charging', 'lift service', 'parts areas', 'warehouse support', 'shop HVAC', 'warehouse equipment'],
        }
      }

      if (hasCraneSalesSupportSignals(text)) {
        return {
          label: 'Crane sales and support operation',
          angle: 'Crane service bays, parts areas, shop equipment, and support-building HVAC shaping the bill differently than a manufacturing plant.',
          question: `I'm curious, how do y'all tell whether crane service work, parts areas, or shop cooling is what moved the bill that month, or is that side of things pretty much handled?`,
          openers: [
            `Often times for crane sales and support operations, service bays, parts areas, shop equipment, and HVAC can all hit the meter during the same busy window.`,
            `Often times for heavy-equipment support teams, it's hard to tell whether the service side, parts area, or shop cooling is what actually moved the bill that month.`,
            `Often times with crane service and parts support, the bill can move from service timing and shop activity more than from a normal office setup.`,
          ],
          focus: ['crane service bays', 'parts areas', 'shop equipment', 'shop HVAC', 'equipment support'],
        }
      }

      if (hasPlasticsDistributionSignals(text)) {
        return {
          label: 'Plastics distribution',
          angle: 'Plastic sheet, rod, tube, film inventory, cut-to-size work, warehouse lighting, and material handling shaping the bill.',
          question: `I'm curious, how do y'all tell whether cut-to-size work, warehouse handling, or branch HVAC is what moved the bill that month, or is that side of things pretty much handled?`,
          openers: [
            `Often times for plastics distributors, cut-to-size work, warehouse handling, branch lighting, and HVAC can all hit the meter during the same busy window.`,
            `Often times for plastic sheet and rod suppliers, it's hard to tell whether the warehouse side or cut-to-size work is what actually moved the bill that month.`,
            `Often times in a materials distribution setup, the bill moves from inventory handling and cut-to-size activity more than from a normal office setup.`,
          ],
          focus: ['plastic sheet inventory', 'cut-to-size equipment', 'warehouse handling', 'branch HVAC', 'material handling'],
        }
      }

      if (hasStrongAutoPartsDistributionSignals(text)) {
        const locationDesc = logisticsMultiSite.locationCount
          ? `${logisticsMultiSite.locationCount}+ parts locations`
          : 'a parts supply network'
        const regionDesc = logisticsMultiSite.regions.length > 1
          ? ` across ${logisticsMultiSite.regions.length} states`
          : ''

        return {
          label: 'Wholesale auto-parts distribution',
          angle: `Branch traffic, inventory turns, delivery timing, warehouse support, and HVAC shaping the bill across ${locationDesc}${regionDesc}.`,
          question: `I'm curious, how do y'all compare the branch bills to see which locations are spiking, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in wholesale parts distribution, it's hard to keep branch counter traffic, inventory turns, and HVAC from driving up the peak demand at individual locations because of constant activity.`,
            `Often times for an auto-parts network, it's difficult to manage utility costs when branches and distribution centers have completely different operating patterns on their meters.`,
            `Often times for a parts supply business, it's hard to catch when a single branch sets a high billing floor during a summer peak because the corporate view is too summarized.`,
          ],
          focus: ['parts branches', 'distribution centers', 'inventory turns', 'delivery timing', 'warehouse support', 'branch-level bill spikes'],
        }
      }

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
            question: `I'm curious, how do y'all track how branch deliveries and turnaround affect individual meters, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times for an equipment support network, it's hard to track how branch deliveries, storage, and turnaround are moving the peak on each individual meter because of fragmented billing systems.`,
              `Often times for multiple service branches, it's difficult to normalize utility costs when one location's testing or refurbishing load sets a permanent billing floor for that site.`,
              `Often times for a regional equipment footprint, it's hard to see which locations are carrying the heaviest load because each facility operates on its own schedule.`,
            ],
            focus: ['equipment deliveries', 'inventory', 'service turnaround', 'storage', 'branch-level review', 'meter-level exposure'],
          }
        }

        return {
          label: 'Equipment support provider',
          angle: 'Equipment deliveries, inventory, service turnaround, and storage creating the highest usage moments at the support location.',
          question: `I'm curious, how do y'all manage the processing and handling load on the meter, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in an equipment support facility, it's hard to tell whether dock activity, office load, or equipment processing is what's setting that monthly peak because the busy parts of the day overlap.`,
            `Often times for an equipment provider, it's difficult to manage the demand spikes from testing or refurbishing bays without triggering a demand ratchet on the meter.`,
            `Often times in support operations, it's hard to separate the baseline warehouse lighting from the actual equipment processing load because they share the same service.`,
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
              question: `I'm curious, how do y'all audit the acquired branch meters for inherited peak charges, or is that side of things pretty much on autopilot?`,
              openers: [
                `Often times for an acquisition-led distribution network, it's hard to prevent inherited branch meters from carrying hidden peak histories that inflate the monthly bills.`,
                `Often times for a growing branch network, it's difficult to normalize energy costs because each acquired site's meter has its own historical billing floor.`,
                `Often times for an acquisition-heavy distributor, it's hard to audit the individual branch meters during a rollout because utility transfers are handled by different entities.`,
              ],
              focus: ['acquired branches', 'meter history', 'locked-in peak charges', 'portfolio comparison', 'branch-level review'],
            }
          : {
              label: 'Logistics network',
              angle: `Portfolio-level electricity management across ${locationDesc}${regionDesc}.`,
              question: `I'm curious, how do y'all track which warehouses are carrying peak demand charges, or is that side of things pretty much on autopilot?`,
              openers: [
                `Often times in a logistics network, it's hard to track which distribution centers are carrying their own locked-in peak charges because the corporate view is too summarized.`,
                `Often times for multiple warehouses, it's difficult to keep a single location's summer cooling or dock activity from setting a 12-month billing floor on that meter.`,
                `Often times for a logistics footprint, it's hard to align energy usage across locations because dock door cycles and HVAC loads vary by region.`,
              ],
              focus: ['portfolio visibility', 'meter-specific peak charges', 'warehouse coordination', 'billing floors', '24/7 load'],
            }
      }
      
      return {
        label: 'Distribution operation',
        angle: 'Dock doors, automation, and HVAC creating expensive usage spikes during busy windows.',
        question: `I'm curious, how do y'all coordinate dock activity and climate control schedules, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times in a logistics operation, it's hard to tell whether dock activity, office load, or warehouse support is what's actually setting that monthly peak because the busy parts of the day overlap.`,
          `Often times for a warehouse facility, it's difficult to prevent open dock doors and climate control from spiking the meter at the same time during hot summer afternoons.`,
          `Often times in distribution centers, it's hard to manage the demand spikes from sorting automation or conveyors without triggering a permanent demand ratchet floor.`,
        ],
        focus: ['thermal liability', 'dock door timing', 'automation peaks', 'HVAC load', 'demand ratchets', 'billing floors'],
      }
    case 'print_fulfillment':
      return {
        label: 'Print and fulfillment',
        angle: 'Print equipment, mailing equipment, fulfillment areas, office systems, and HVAC shaping the bill differently than a factory or pure warehouse.',
        question: `I'm curious, how do y'all separate the print side, mailing side, and office side on the bill, or is that usually handled after the invoice comes in?`,
        openers: [
          `A print and fulfillment setup can look simple from the outside, but printing equipment, mailing equipment, fulfillment areas, and office HVAC can all hit the meter differently.`,
          `Often times in print and fulfillment, the hard part is knowing whether the print floor, mailing equipment, or office HVAC is what actually moved the bill that month.`,
          `For a document and fulfillment operation, the bill can move for different reasons than a normal office or warehouse.`,
        ],
        focus: ['print equipment', 'mailing equipment', 'fulfillment area', 'office HVAC', 'IT systems', 'billing clarity'],
      }
    case 'public_transit':
      if (hasMaritimePilotSignals(text)) {
        return {
          label: 'Maritime pilot operations',
          angle: 'Continuous dispatch systems, support buildings, pilot boat operations, and ship channel support shaping the energy profile.',
          question: `I'm curious, how do y'all tell whether dispatch systems, support-building HVAC, or boat operations is what moved the bill that month, or is that side of things pretty much handled?`,
          openers: [
            `Often times for maritime pilot operations, dispatch systems, support buildings, and boat operations can all hit the meter during the same busy window.`,
            `Often times for ship channel pilot associations, it's hard to tell whether the dispatch center or the boat operations support is what actually moved the bill that month.`,
            `Often times with marine pilot groups, the bill moves from dispatch reliability and support-building cooling more than from a standard office setup.`,
          ],
          focus: ['dispatch systems', 'support buildings', 'boat operations', 'marine operations', 'support-building HVAC', 'ship channel'],
        }
      }

      return {
        label: 'Public transit',
        angle: 'Transit reliability, vehicle maintenance, lighting, shop equipment, and public-service schedules shaping facility usage.',
        question: `I'm curious, how do y'all separate the maintenance shop, lighting, and office usage on the bill, or is that usually handled after the invoice comes in?`,
        openers: [
          `A public transit operation has a different power profile than freight or warehousing because reliability, maintenance, lighting, and public-service schedules all matter.`,
          `For a trolley or transit operation, the bill is usually tied more to maintenance facilities, lighting, and support buildings than warehouse activity.`,
          `Public transit facilities can be hard to read from the bill because the public-facing service and the maintenance side do not always move together.`,
        ],
        focus: ['vehicle maintenance', 'shop equipment', 'lighting', 'HVAC', 'public-service reliability', 'support buildings'],
      }
    case 'moving_storage':
      return {
        label: 'Moving and storage',
        angle: 'Storage space, dispatch offices, loading activity, warehouse lighting, and HVAC shaping usage by site.',
        question: `I'm curious, how do y'all separate storage, dispatch, and loading activity on the bill, or is that usually handled after the invoice comes in?`,
        openers: [
          `A moving and storage operation is usually less about production and more about storage space, dispatch, loading activity, lighting, and HVAC.`,
          `Often times for moving and storage companies, it is hard to tell whether storage, dispatch, or loading activity is what moved the bill that month.`,
          `For a moving and storage site, the bill can change even when it is not a manufacturing or heavy equipment operation.`,
        ],
        focus: ['storage space', 'dispatch office', 'loading activity', 'warehouse lighting', 'HVAC', 'site-level usage'],
      }
    case 'food_storage':
      return {
        label: 'Food / cold storage',
        angle: 'Refrigeration load, freezer power, and defrost cycles drive cost through demand ratchets.',
        question: `I'm curious, how do y'all coordinate refrigeration and defrost cycles to avoid peaks, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times in a cold storage facility, it's hard to prevent refrigeration, compressor cycles, and defrost sequences from hitting the meter all at once because of continuous cooling needs.`,
          `Often times for food storage providers, it's difficult to manage the constant electrical draw of freezers and coolers without triggering a 12-month locked-in peak charge during summer heat waves.`,
          `Often times in refrigerated warehouses, it's hard to separate the baseline cooling load from the peak demand spikes created by compressor startups because they share the same electrical service.`,
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
          question: `I'm curious, how do y'all audit each campus meter to check for summer peak carryovers, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a school district, it's difficult to keep classroom HVAC and sports lighting from spiking the meter during seasonal occupancy shifts because of varying extracurricular calendars.`,
            `Often times for a multi-campus school district, it's hard to catch when a single campus is carrying a locked-in peak charge because the consolidated bills hide individual campus details.`,
            `Often times for school networks, it's difficult to manage utility budgets when summer athletics or school start-up events set a high billing floor on individual campus meters.`,
          ],
          focus: ['campus calendar', 'HVAC', 'athletics', 'classroom technology', 'billing floors', 'district budget'],
        }
      }

      return {
        label: 'School district',
        angle: 'Campus calendar, HVAC, athletics, and classroom technology driving locked-in peak charges at the meter level.',
        question: `I'm curious, how do y'all track which campus HVAC systems are setting the highest billing floors, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a school district, it's difficult to keep classroom HVAC and sports lighting from spiking the meter during seasonal occupancy shifts because of varying extracurricular calendars.`,
          `Often times for a school campus, it's hard to prevent a one-time summer peak or start-up event from setting a high billing floor for the next twelve months because of demand ratchet rules.`,
          `Often times in public schools, it's difficult to separate the classroom HVAC load from the athletic field lighting because they often run on the same meter.`,
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
          question: `I'm curious, how do y'all track which residence halls or lab buildings are setting the highest peak charges, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a university campus, it's hard to keep residence halls, research labs, and dining spaces from spiking the meter at different times because of irregular student schedules.`,
            `Often times for a higher education network, it's difficult to manage utility costs when different buildings have completely different occupancy patterns on their meters.`,
            `Often times for a college footprint, it's hard to tell which research labs or dining halls are setting a high billing floor for the campus because of shared utility infrastructure.`,
          ],
          focus: ['campus load', 'student housing', 'labs', 'occupancy swings', 'billing floors', 'dining'],
        }
      }

      return {
        label: 'Higher education',
        angle: 'Campus load, student housing, labs, and occupancy swings driving the billing floor.',
        question: `I'm curious, how do y'all manage the building cooling and lab equipment spikes, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times on a college campus, it's hard to keep student housing, labs, and dining halls from spiking the meter at the same time because of varying campus schedules.`,
          `Often times for a university, it's difficult to prevent research lab equipment or dining hall kitchens from setting a permanent billing floor during hot summer months.`,
          `Often times in higher education facilities, it's hard to tell whether the classroom HVAC or the student housing load is what's setting the peak because they run on a single meter.`,
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
          question: `I'm curious, how do y'all track which group homes or support facilities are carrying peak charges, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a residential care nonprofit, it's hard to separate what the homes, counseling spaces, and support services are each adding to the bill because of how multiple meters roll up.`,
            `Often times for a care network, it's difficult to keep a single residential building's 24/7 HVAC load from setting a permanent peak charge on its individual meter.`,
            `Often times for multi-site care providers, it's hard to see which counseling or therapy centers are carrying peak history because corporate budgets blend all the sites together.`,
          ],
          focus: ['residential care', 'counseling spaces', 'program load', 'billing floors', 'budget protection'],
        }
      }

      return {
        label: 'Residential care',
        angle: '24/7 homes, counseling spaces, and support programs leaving their own locked-in peak charges on the meter.',
        question: `I'm curious, how do y'all track which support areas or living spaces are driving the peak, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a residential care home, it's hard to balance 24/7 resident comfort with cooling cycles that spike the demand ratchet because of strict climate control requirements.`,
          `Often times for a shelter or residential care facility, it's difficult to keep counseling spaces, living quarters, and laundry from hitting the meter all at once because of irregular daily routines.`,
          `Often times in care facilities, it's hard to prevent a single hot month's air conditioning from setting a high billing floor for the next eleven months because of the 24/7 nature of the program.`,
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
          question: `I'm curious, how do y'all audit each hotel's meter for summer HVAC or laundry spikes, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a hotel portfolio, it's hard to check each property's meter history separately because corporate reports average all the utility bills together.`,
            `Often times for multiple hospitality sites, it's difficult to prevent guest rooms, laundry, and kitchen operations from peaking together at a single property and setting a high local billing floor.`,
            `Often times for a hotel property, it's hard to spot which location is carrying a summer peak charge on its meter because of blended property budgets.`,
          ],
          focus: ['property comparison', 'guest rooms', 'laundry', 'HVAC', 'portfolio view', 'locked-in peak charges'],
        }
      }

      return {
        label: 'Hotel property',
        angle: 'Guest rooms, laundry, kitchen service, and HVAC driving the load on a single hotel meter.',
        question: `I'm curious, how do y'all coordinate guest-room climate controls and laundry schedules, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a hospitality property, it's difficult to manage guest rooms, laundry, and kitchen load without them all peaking at the exact same time because of varying occupancy levels.`,
          `Often times for a hotel, it's hard to prevent guest room AC cycles and commercial laundry from peaking together during hot summer afternoons because of check-in and checkout flows.`,
          `Often times in a hotel building, it's difficult to separate the guest-room HVAC draw from the lobby and meeting room loads because they are on the same meter.`,
        ],
        focus: ['guest rooms', 'laundry', 'kitchen service', 'HVAC', 'hotel meter', 'locked-in peak charges'],
      }
    case 'healthcare':
      const healthcareMultiSite = detectMultiSiteScale(account, candidate)
      const classificationText = text.replace(/hospital\s*(?:s)?\s*(?:&|and)\s*health\s*care/gi, 'healthcare')
  const hasHospitalSignals = /\b(hospital|neighborhood hospital|micro[-\s]?hospital|community hospital|small-format hospital|licensed hospital|emergency room|emergency care|inpatient care|inpatient bed|acute care)\b/i.test(classificationText)
      const isClinic = /(clinic|practice|eye|vision|optics|dental|dentist|optometry|ophthalmology|retina|medical practice|surgical center|outpatient|diagnostic imaging|imaging center|ortho|orthopedic|pediatric|wellness|doctor)/i.test(text) && !hasHospitalSignals
      const isBehavioralHealth = hasStrongBehavioralHealthSignals(text)
      const isSeniorLiving = /(senior living|assisted living|memory care|skilled nursing|retirement living|continuum of care|nursing home|alzheimer'?s? care|independent living cottages?|apartments?)/i.test(text)
      const isDentalPractice = /(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry|multi-site dental|dental partnership organization)/i.test(text)
      const isBloodCenter = /(blood center|bloodcare|blood bank|blood donation|blood products|blood components|transfusion|donor center|mobile blood drives?|blood collection|blood processing|specialized laboratory testing)/i.test(text)
      const isPharmacy = /\b(pharmacy|pharmacies|compounding|apothecary|chemist)\b/i.test(text) && !hasHospitalSignals
      const isHospitalOperator = hasHospitalSignals && !isBehavioralHealth && !isSeniorLiving && !isBloodCenter && !isPharmacy

      if (isPharmacy) {
        return {
          label: 'Compounding pharmacy',
          angle: 'Cleanroom HVAC, refrigeration, and retail flow shaping the electricity bill at a pharmacy site.',
          question: `I'm curious, how do y'all monitor the cleanroom HVAC and refrigeration peaks, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a specialized pharmacy, it's hard to run cleanroom HVAC and 24/7 refrigeration without setting a high billing floor because of strict temperature and air-quality standards.`,
            `Often times in a compounding pharmacy, it's difficult to manage the constant draw of product refrigeration alongside cleanroom climate control without setting a high peak demand charge.`,
            `Often times for pharmacy operators, it's hard to see how cleanroom HVAC starts affect the monthly peak because utility bills lack interval details.`,
          ],
          focus: ['cleanroom HVAC', 'refrigeration', 'retail flow', 'pharmacy meter', 'peak demand'],
        }
      }

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
            question: `I'm curious, how do y'all identify which offices are hitting the billing floors hardest, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times for a dental partnership network, it's hard to keep track of how different offices are driving peak charges on their local meters because consolidated bills average everything out.`,
              `Often times for multiple dental practices, it's difficult to manage utility costs when operatories, imaging, and sterilization cycles peak together at individual offices.`,
              `Often times for a growing DSO, it's hard to see which acquired practices are carrying peak history because of unstandardized billing processes.`,
            ],
            focus: ['operatories', 'imaging', 'sterilization', 'patient flow', 'practice comparison', 'site-specific bill spikes'],
          }
        }

        return {
          label: 'Dental practice',
          angle: 'Operatories, imaging, sterilization, patient flow, and HVAC shaping the bill at a dental office.',
          question: `I'm curious, how do y'all coordinate sterilization cycles with your peak office hours, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in a dental clinic, it's difficult to manage patient-chair usage, imaging, and sterilization cycles without driving up the peak demand charge because of continuous patient scheduling.`,
            `Often times for a dental office, it's hard to keep patient comfort, imaging, and sterilizers from hitting the meter all at once during busy clinic days.`,
            `Often times in dental practices, it's difficult to see which treatment rooms or sterilizers are driving the biggest bill days because of standard monthly utility billing.`,
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
          question: `I'm curious, how do y'all track how lab processing and cold storage affect each meter, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a clinical laboratory or blood center network, it's hard to keep donor collection, lab processing, and cold storage from peaking together on the same meter.`,
            `Often times for a regional blood-service footprint, it's difficult to compare efficiency when one processing site is quietly carrying a much heavier peak demand charge than the others.`,
            `Often times in a blood processing facility, it's hard to prevent constant refrigeration and cleanroom HVAC from triggering a high billing floor because of strict regulatory compliance.`,
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
            question: `I'm curious, how do y'all monitor which hospitals are setting the highest billing floors, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times in a hospital network, it's difficult to balance patient safety and budget control when one site is quietly carrying a much heavier bill pattern than the rest.`,
              `Often times for multiple hospitals, it's hard to compare site-level efficiency when emergency rooms, surgery bays, and patient HVAC peak differently on each meter.`,
              `Often times for neighborhood hospitals, it's difficult to catch when one site's summer cooling load sets a permanent demand ratchet because corporate roll-ups hide the detail.`,
            ],
            focus: ['emergency care', 'imaging', 'inpatient rooms', 'lab work', 'hospital comparison', 'site-specific bill spikes'],
          }
        }

        if (isBehavioralHealth) {
          return {
            label: 'Behavioral health network',
            angle: `Portfolio-level comparison of meter-level peak history across ${locationDesc}${regionDesc}.`,
            question: `I'm curious, how do y'all compare the clinic and crisis site meters across the network, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times in behavioral health networks, it's hard to keep client programs stable without letting one facility's peak demand quietly drive up the entire budget.`,
              `Often times for a behavioral health organization with multiple sites, it's difficult to track how crisis spaces, outpatient clinics, and admin offices peak differently on their meters.`,
              `Often times for multi-site care providers, it's hard to see which community or residential centers are carrying peak history because of blended utility reporting.`,
            ],
            focus: ['behavioral health network', 'crisis services', 'outpatient sites', 'administrative buildings', 'meter-level peak history', 'locked-in peak charges'],
          }
        }
          
        if (isClinic) {
          return {
            label: 'Medical Practice / Clinical Network',
            angle: `Clinic-by-clinic comparison of where the biggest usage spikes are happening across ${locationDesc}.`,
            question: `I'm curious, how do y'all compare clinic bills to see which ones are spiking during patient hours, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times for a medical practice network, it's hard to catch when a single clinic is carrying a high peak demand charge because corporate budgets average all the offices together.`,
              `Often times for multiple medical clinics, it's difficult to keep patient-room HVAC and diagnostic equipment from setting a 12-month billing floor at individual offices.`,
              `Often times for a growing medical group, it's hard to see which local clinics are driving the highest usage spikes during hot summer afternoons.`,
            ],
            focus: ['clinical peaks', 'equipment startup', 'portfolio comparison', 'peak charges', 'site-specific exposure'],
          }
        }

        return {
          label: 'Healthcare network',
          angle: `Facility-by-facility comparison of where the biggest usage spikes are happening across ${locationDesc}.`,
          question: `I'm curious, how do y'all monitor which facilities are setting the highest billing floors, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a healthcare network, it's hard to catch when a single care site is carrying a high peak demand charge because consolidated bills average all the locations together.`,
            `Often times for multiple care facilities, it's difficult to keep patient comfort systems and clinical gear from setting a 12-month billing floor at individual sites.`,
            `Often times for a healthcare footprint, it's hard to see which local meters are driving the highest peak charges during hot summer months.`,
          ],
          focus: ['portfolio comparison', 'reliability', 'peak charges', 'meter-level exposure'],
        }
      }
      
      if (isHospitalOperator) {
        return {
          label: 'Hospital / neighborhood hospital',
          angle: 'Emergency care, imaging, short-stay rooms, lab work, and round-the-clock HVAC shaping the bill at a licensed hospital site.',
          question: `I'm curious, how do y'all separate clinical equipment draw from the main building HVAC load, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in a hospital facility, it's difficult to keep heavy medical gear, surgery rooms, and patient-care spaces from hitting the meter all at once because of continuous operations.`,
            `Often times for a small-format hospital, it's hard to prevent a single hot month's cooling load from setting a permanent billing floor on that local meter.`,
            `Often times in licensed hospital buildings, it's difficult to manage demand spikes from emergency rooms and imaging bays because patient safety always comes first.`,
          ],
          focus: ['emergency care', 'imaging', 'inpatient rooms', 'lab work', 'HVAC', 'bill spikes'],
        }
      }

      if (isClinic) {
        return {
          label: 'Medical Practice / Clinic',
          angle: 'Patient schedule, treatment-room equipment, lighting, and HVAC creating the highest usage moments at the clinic.',
          question: `I'm curious, how do y'all track whether your HVAC or clinical gear is setting the highest demand spikes, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in a medical clinic, it's difficult to keep patient comfort systems, lighting, and clinical equipment from peaking all at once during busy patient hours.`,
            `Often times for a medical practice, it's hard to prevent a hot summer day's cooling load from setting a high billing floor for the entire year because of demand ratchet rules.`,
            `Often times in a clinical office, it's difficult to see which treatment rooms or equipment are driving the biggest bill days because utility bills only show monthly summaries.`,
          ],
          focus: ['patient hours', 'treatment-room equipment', 'HVAC', 'peak charges', 'clinic meter'],
        }
      }

      if (isBehavioralHealth) {
        const isPsychHospital = hasHospitalSignals || /(acute care|inpatient|beds?|residential treatment|partial hospitalization|intensive outpatient)/i.test(text)
        if (isPsychHospital) {
          return {
            label: 'Behavioral health hospital',
            angle: 'Patient safety, comfort, inpatient units, treatment programs, and 24-hour building reliability shaping the bill at a psychiatric hospital.',
            question: `I'm curious, how do y'all separate patient HVAC draw from treatment program equipment spikes, or is that side of things pretty much on autopilot?`,
            openers: [
              `Often times in psychiatric facilities, it's difficult to support inpatient and outpatient programs simultaneously without letting patient-area HVAC and 24-hour systems spike the meter.`,
              `Often times for a behavioral health hospital, it's hard to keep patient-area HVAC, inpatient units, and treatment spaces from setting a permanent billing floor because of strict climate rules.`,
              `Often times in care facilities, it's difficult to manage demand spikes from laundry and kitchen equipment without triggering a demand ratchet during peak summer hours.`,
            ],
            focus: ['patient safety', 'patient comfort', 'inpatient units', 'treatment programs', 'HVAC', '24-hour reliability'],
          }
        }

        return {
          label: 'Behavioral health / community care',
          angle: 'Different care programs and support buildings leaving different peak histories on their own meters.',
          question: `I'm curious, how do y'all track which counseling or outpatient meters are carrying the highest peak charges, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a community care facility, it's hard to keep track of how different programs and counseling spaces are driving the peak across separate meters.`,
            `Often times for a behavioral health clinic, it's difficult to prevent a single hot summer week's cooling load from setting a high billing floor for the next eleven months.`,
            `Often times in social service facilities, it's hard to see which community or residential areas are driving the biggest peak demand spikes because of lack of interval data.`,
          ],
          focus: ['different programs', 'crisis spaces', 'outpatient programs', 'counseling clinics', 'billing floors', 'program tracking'],
        }
      }

      if (isSeniorLiving) {
        return {
          label: 'Senior living community',
          angle: 'Balancing resident comfort, dining load, laundry services, and HVAC cycles on a 24/7 care schedule.',
          question: `I'm curious, how do y'all manage the HVAC load of your resident rooms alongside commercial laundry cycles, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a senior living community, it's difficult to balance 24/7 resident comfort with cooling cycles that spike the demand ratchet because of strict climate control requirements.`,
            `Often times in assisted living properties, it's hard to prevent resident room AC units, main dining facilities, and laundry equipment from peaking all at once on the meter.`,
            `Often times for memory care facilities, it's difficult to manage demand charges during summer heat spikes because safety regulations mandate keeping the indoor climate constant.`,
          ],
          focus: ['resident comfort', 'laundry services', 'dining load', 'HVAC cycles', 'demand ratchets', 'care schedule'],
        }
      }

      return {
        label: 'Clinical / healthcare facility',
        angle: 'Patient comfort systems, medical equipment, and lighting creating a flat, heavy daily usage pattern.',
        question: `I'm curious, how do y'all track whether your HVAC or clinical gear is setting the highest demand spikes, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times in a clinical facility, it's hard to separate heavy medical gear and patient-care spaces from normal building cooling costs because of continuous clinical operations.`,
          `Often times for a healthcare site, it's difficult to prevent a hot summer day's cooling load from setting a high billing floor for the entire year because of demand ratchet rules.`,
          `Often times in a care facility, it's hard to tell which clinical rooms or support systems are driving the biggest bill spikes because of shared utility service.`,
        ],
        focus: ['patient comfort', 'medical equipment', 'lighting', 'healthcare meter', 'usage spikes'],
      }
    case 'banking':
      const bankingMultiSite = detectMultiSiteScale(account, candidate)
      const bankingLocationDesc = bankingMultiSite.locationCount
        ? `${bankingMultiSite.locationCount}+ branches`
        : 'a branch network'
      const bankingRegionDesc = bankingMultiSite.regions.length > 1
        ? ` across ${bankingMultiSite.regions.length} states`
        : ''

      return {
        label: 'Retail banking network',
        angle: `Portfolio-wide electricity management and contract alignment across ${bankingLocationDesc}${bankingRegionDesc}.`,
        question: `I'm curious, how do y'all audit the branch meters for inconsistent rates or peak charges, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a bank with multiple branches, it's hard to catch when individual branch offices are carrying high peak demand charges because utility bills are processed centrally without site-level audits.`,
          `Often times for a branch banking network, it's difficult to maintain consistent facility costs when different sites have completely different operating patterns and local contracts.`,
          `Often times for financial institution portfolios, it's hard to see which branch HVAC systems are setting a permanent billing floor during summer months.`,
        ],
        focus: ['branch footprints', 'contract alignment', 'portfolio visibility', 'branch-level review', 'central management'],
      }
    case 'retail':
      const retailMultiSite = detectMultiSiteScale(account, candidate)

      if (hasStrongAutomotiveSignals(text)) {
        return {
          label: 'Automotive dealership',
          angle: 'Service bay machinery, paint booths, detailed diagnostic equipment, and expansive showroom HVAC driving peak demand.',
          question: `I'm curious, how do y'all coordinate service bay equipment use with showroom cooling, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a dealership, it's hard to prevent the service bays and showroom AC from running wide open at the exact same time because of constant customer and vehicle traffic.`,
            `Often times for a retail automotive group, it's difficult to keep paint booths, diagnostic bays, and showroom HVAC from spiking the meter at the same time because of overlapping operational shifts.`,
            `Often times in car dealerships, it's hard to prevent a single hot Saturday's cooling and service load from setting a permanent billing floor on that meter.`,
          ],
          focus: ['service bays', 'showroom HVAC', 'compressor spikes', 'paint booths', 'billing demand'],
        }
      }

      if (hasStrongTruckDealerSignals(text)) {
        const locationDesc = retailMultiSite.locationCount
          ? retailMultiSite.locationCount >= 10
            ? `${retailMultiSite.locationCount}+ truck locations`
            : `${retailMultiSite.locationCount} truck locations`
          : 'the truck network'
        const regionDesc = retailMultiSite.regions.length > 1
          ? ` across ${retailMultiSite.regions.length} states`
          : ''

        return {
          label: 'Heavy-duty truck dealership',
          angle: `Service bays, body shop work, parts support, and diesel technician training shaping the bill across ${locationDesc}${regionDesc}.`,
          question: `I'm curious, how do y'all compare the truck service and body shop bills to see which locations are spiking, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a heavy-duty truck dealership, it's hard to keep service bays, body shop work, parts support, and training spaces from pushing the meter during the same busy window.`,
            `Often times for a truck center, it's difficult to separate the diesel service side from the parts counter and driver-support spaces because those hours all overlap.`,
            `Often times in truck sales and service, a single busy repair cycle can set a high bill on that site even when the rest of the month looks normal.`,
          ],
          focus: ['service bays', 'body shop', 'parts support', 'diesel technician training', 'shop HVAC', 'truck service'],
        }
      }

      if (hasStrongRVDealerSignals(text) && !hasRvSupportSignals(text)) {
        const locationDesc = retailMultiSite.locationCount
          ? retailMultiSite.locationCount >= 10
            ? `${retailMultiSite.locationCount}+ RV locations`
            : `${retailMultiSite.locationCount} RV locations`
          : 'the RV network'
        const regionDesc = retailMultiSite.regions.length > 1
          ? ` across ${retailMultiSite.regions.length} states`
          : ''

        return {
          label: 'RV dealership',
          angle: `Service bays, parts counters, customer waiting areas, and showroom HVAC shaping the bill across ${locationDesc}${regionDesc}.`,
          question: `I'm curious, how do y'all compare the RV service bills to see which locations are spiking, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for an RV dealership, it's hard to keep service bays, parts counters, and customer comfort from pushing the meter during the same busy window.`,
            `Often times for a motorhome dealer, it's difficult to separate service work from showroom comfort cooling because the same property handles both.`,
            `Often times in RV sales and service, a single busy repair cycle can set a high bill on that site even when the rest of the month looks normal.`,
          ],
          focus: ['service bays', 'parts counter', 'showroom HVAC', 'customer waiting area', 'RV service'],
        }
      }

      if (hasConvenienceStoreSignals(text)) {
        const locationDesc = retailMultiSite.locationCount
          ? `${retailMultiSite.locationCount}+ stores`
          : 'the store network'

        return {
          label: 'Convenience store chain',
          angle: `Store-by-store comparison of refrigeration, lighting, HVAC, and fuel canopy usage across ${locationDesc}.`,
          question: `I'm curious, how do y'all compare the store bills to see whether coolers, lighting, or HVAC are driving the spikes, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for convenience-store chains, it's hard to tell whether walk-in coolers, store lighting, or HVAC are driving the higher bills because each store runs a little differently.`,
            `Often times across multiple convenience stores, it's difficult to catch which locations have refrigeration or lighting patterns that are making their bills stand out.`,
            `Often times for c-store operators, it's hard to separate steady cooler usage from summer HVAC spikes because the bill rolls all of that into one monthly number.`,
          ],
          focus: ['walk-in coolers', 'refrigeration', 'store lighting', 'HVAC', 'fuel canopy lighting', 'store comparison'],
        }
      }

      if (hasGameRetailSignals(text)) {
        return {
          label: 'Game and hobby retailer',
          angle: 'Store lighting, customer comfort, online order packing, and warehouse support shaping the bill.',
          question: `I'm curious, how do y'all tell whether the store side or the warehouse support side is creating the bigger spikes, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for game and hobby retailers, it's hard to tell whether store lighting, customer comfort, or online order packing is what is really moving the bill.`,
            `Often times in a retail business with online orders, it's difficult to separate the store load from warehouse support because both sides run through the same monthly bill.`,
            `Often times for specialty retailers, it's hard to see whether the retail floor or back-of-house order work is creating the bigger usage spikes.`,
          ],
          focus: ['store lighting', 'customer comfort', 'online order packing', 'warehouse support', 'office load'],
        }
      }

      const profile = getAccountIdentityProfile(account, candidate)
      const isNationalRetailDistribution = profile?.companyType === 'national retail and distribution network' || 
                                           (retailMultiSite.isMultiSite && /(distribution|warehouse|manufacturing|headquarters|hq)/i.test(text))

      if (isNationalRetailDistribution) {
        const storeCount = retailMultiSite.locationCount || 1000
        const locationDesc = `${storeCount}+ retail stores, centralized logistics, and corporate manufacturing`
        return {
          label: 'National retail and distribution network',
          angle: 'Centralized distribution center cooling, corporate campus HVAC, and manufacturing process loads peaking alongside a massive nationwide store footprint.',
          question: `I'm curious, how do y'all separate the electricity bills for the central manufacturing and distribution hub from the nationwide store network, or is that side of things pretty much handled?`,
          openers: [
            `Often times for a national retail and distribution network, the main headache is that distribution center cooling, corporate campus HVAC, and manufacturing process loads all hit the meter during the same peak windows.`,
            `Often times when running a centralized corporate and logistics hub alongside a nationwide store footprint, it's hard to tell whether the central manufacturing processes or the store HVAC is what's setting that peak charge.`,
            `Often times for a retail network of this scale, it's difficult to keep high-capacity distribution center cooling and campus lighting from driving up the bill during hot summer afternoons.`,
          ],
          focus: ['distribution center cooling', 'store HVAC', 'manufacturing process loads', 'facility lighting', 'centralized logistics', 'portfolio peak demand'],
        }
      }

      if (retailMultiSite.isMultiSite && retailMultiSite.locationCount && retailMultiSite.locationCount >= 3) {
        const locationDesc = retailMultiSite.locationCount >= 10
          ? `${retailMultiSite.locationCount}+ showrooms`
          : `${retailMultiSite.locationCount} showrooms`
        const regionDesc = retailMultiSite.regions.length > 1
          ? ` across ${retailMultiSite.regions.length} states`
          : ''

        return {
          label: 'Retail showroom network',
          angle: `Portfolio-wide comparison of showroom lighting and summer cooling across ${locationDesc}${regionDesc}.`,
          question: `I'm curious, how do y'all compare showroom bills to see which stores are spiking, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for retail networks, it's hard to keep showroom lighting, open floor plans, and customer comfort from driving up individual store bills because of varying traffic levels.`,
            `Often times for multiple retail locations, it's difficult to manage utility costs when one store's summer cooling load sets a permanent billing floor for that local meter.`,
            `Often times for a growing retail brand, it's hard to catch when a single showroom sets a high peak charge because corporate bills are averaged together.`,
          ],
          focus: ['showroom lighting', 'cooling loads', 'portfolio management', 'billing floors', 'peak demands'],
        }
      }

      return {
        label: 'Retail store / showroom',
        angle: 'Large open floor plans, showroom lighting, and comfort cooling creating high daily usage.',
        question: `I'm curious, how do y'all manage the showroom lighting and HVAC spikes, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times in retail stores, it's hard to tell whether lighting, customer traffic, or summer HVAC is what is really moving the bill.`,
          `Often times for a retail store, it's difficult to maintain customer comfort and high-end lighting without letting summer cooling load drive up the peak charge.`,
          `Often times in commercial retail spaces, it's hard to tell whether the main showroom lighting or the back-office HVAC is setting the monthly peak because they run on a single meter.`,
        ],
        focus: ['showroom lighting', 'cooling loads', 'customer comfort', 'peak usage', 'retail bill'],
      }
    case 'restaurant':
      const restaurantMultiSite = detectMultiSiteScale(account, candidate)

      if (restaurantMultiSite.isMultiSite && restaurantMultiSite.locationCount && restaurantMultiSite.locationCount >= 3) {
        const locationDesc = restaurantMultiSite.locationCount >= 10
          ? `${restaurantMultiSite.locationCount}+ locations`
          : `${restaurantMultiSite.locationCount} locations`
        const regionDesc = restaurantMultiSite.regions.length > 1
          ? ` across ${restaurantMultiSite.regions.length} states`
          : ''

        return {
          label: 'Restaurant chain',
          angle: 'Kitchen equipment, refrigeration, and HVAC creating high-usage moments that can sit on specific location bills.',
          question: `I'm curious, how do y'all identify which locations are hitting the billing floors hardest, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times in restaurant groups with ${locationDesc}, it's hard to keep kitchen rushes, refrigeration, and HVAC from making individual locations cost significantly more than the rest.`,
            `Often times for a restaurant chain, it's difficult to manage utility costs when one unit's kitchen spike sets a permanent billing floor for that local meter.`,
            `Often times for multiple dining units, it's hard to catch when a single kitchen sets a high peak charge during hot summer months because of summarized reporting.`,
          ],
          focus: ['service rushes', 'kitchen equipment', 'refrigeration', 'HVAC', 'location-level bill spikes'],
        }
      }
      
      const isHospitality = /(hospitality|hotel|lodging|venue|wedding|event space|banquet|resort)/i.test(cleanText(`${account.name} ${account.industry} ${candidate?.title || ''}`))

      if (isHospitality) {
        return {
          label: 'Hospitality / Event Venues',
          angle: 'Guest rooms, event timing, kitchen service, laundry, and HVAC creating the highest usage moments.',
          question: `I'm curious, how do y'all coordinate event setup times with kitchen and HVAC loads, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for hospitality and event venues, it's hard to keep guest rooms, event timing, kitchen service, and HVAC from spiking the meter at the same time because of unpredictable booking schedules.`,
            `Often times for an event venue, it's difficult to manage utility costs when a single large weekend banquet sets a high billing floor on the meter for the entire year.`,
            `Often times in lodging and hospitality spaces, it's hard to tell which banquet rooms or kitchen appliances are driving the biggest bill days because of shared utility service.`,
          ],
          focus: ['guest rooms', 'event timing', 'kitchen service', 'laundry', 'HVAC', 'property meter'],
        }
      }

      return {
        label: 'Restaurant / Dining',
        angle: 'Kitchen equipment, refrigeration, and HVAC creating the highest usage moments during rush periods.',
        question: `I'm curious, how do y'all coordinate kitchen prep cycles with showroom cooling, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times in restaurants, it's difficult to prevent fryers, grills, refrigeration, and AC from hitting the meter all at once during a dinner rush.`,
          `Often times for a dining establishment, it's hard to prevent kitchen prep cycles and customer HVAC from peaking together during hot summer afternoons because of service schedules.`,
          `Often times in food service facilities, it's difficult to separate refrigeration baseline draw from peak kitchen equipment usage because they share the same meter.`,
        ],
        focus: ['service rushes', 'kitchen equipment', 'refrigeration', 'HVAC load', 'peak charges'],
      }
    case 'hotel_owner':
      return {
        label: 'Hotel property',
        angle: 'Guest rooms, laundry, kitchen service, and HVAC driving the load on a single hotel meter.',
        question: `I'm curious, how do y'all coordinate guest-room climate controls and laundry schedules, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a hospitality property, it's difficult to manage guest rooms, laundry, and kitchen load without them all peaking at the exact same time because of varying occupancy levels.`,
          `Often times for a hotel, it's hard to prevent guest room AC cycles and commercial laundry from peaking together during hot summer afternoons because of check-in and checkout flows.`,
          `Often times in a hotel building, it's difficult to separate the guest-room HVAC draw from the lobby and meeting room loads because they are on the same meter.`,
        ],
        focus: ['guest rooms', 'laundry', 'kitchen service', 'HVAC', 'hotel meter', 'locked-in peak charges'],
      }
    case 'hospitality_group':
      return {
        label: 'Hospitality group',
        angle: 'Property-by-property comparison of guest-room, laundry, and HVAC load across the portfolio.',
        question: `I'm curious, how do y'all check each hotel on its own meter to spot peak charges, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a hospitality group, it's hard to audit each hotel's meter history separately because corporate budgets average all the properties together.`,
          `Often times for multiple lodging sites, it's difficult to prevent guest rooms, laundry, and kitchen operations from peaking together at a single hotel and setting a high billing floor.`,
          `Often times for a hotel portfolio, it's hard to spot which location is carrying a summer peak charge on its meter because of blended property reporting.`,
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
          question: `I'm curious, how do y'all audit each nonprofit site's meter to check for peak carryovers, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a nonprofit network with multiple sites, it's hard to catch when individual locations are carrying high peak demand charges because bills are rolled up into a single budget total.`,
            `Often times for a program-based nonprofit, it's difficult to keep classroom cooling and special events from triggering a high billing floor for the entire year because of irregular facility schedules.`,
            `Often times for education nonprofits, it's hard to compare site-level utility costs when different locations have completely different occupancy patterns.`,
          ],
          focus: ['billing floors', 'locked-in peak charges', 'portfolio comparison', 'budget erosion', 'hidden spikes'],
        }
      }
      
      return {
        label: 'Education / nonprofit',
        angle: 'Diagnostic check for a locked-in peak charge caused by seasonal occupancy or special event spikes.',
        question: `I'm curious, how do y'all manage special event HVAC schedules to avoid peaks, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a program-based nonprofit, it's hard to prevent classroom cooling and special events from triggering a high billing floor for the entire year because of irregular facility schedules.`,
          `Often times for an education nonprofit, it's difficult to balance steady classroom HVAC with one-time summer event spikes that set a permanent billing floor.`,
          `Often times in nonprofit facilities, it's hard to tell whether daily office operations or weekend community programs are setting the monthly peak on the meter.`,
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
          question: `I'm curious, how do y'all track which public facilities are carrying peak charges, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a public sector network, it's hard to track which facilities have their own locked-in peak charge because consolidated municipal bills hide the local details.`,
            `Often times for multiple public buildings, it's difficult to prevent administrative office HVAC, public safety, and utility infrastructure from peaking on their own meters.`,
            `Often times for city operations, it's hard to compare energy efficiency when one department's facility is quietly carrying a much heavier peak demand charge than the rest.`,
          ],
          focus: ['public facilities', 'budget protection', 'summer cooling load', 'public safety', 'utility infrastructure', 'billing floors'],
        }
      }
      
      return {
        label: 'Public sector',
        angle: 'Mission-critical public facilities, summer cooling load, and a locked-in peak charge at the meter.',
        question: `I'm curious, how do y'all track which departments or buildings are setting the peak billing floor, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a public facility, it's hard to keep administrative offices, public safety, and utility load from setting a permanent billing floor because of continuous operations.`,
          `Often times for municipal buildings, it's difficult to prevent a hot summer day's cooling load from setting a high billing floor for the entire year because of demand ratchet rules.`,
          `Often times in city offices, it's hard to see which parts of the building or utility operations are driving the biggest bill days because of shared electrical service.`,
        ],
        focus: ['public safety', 'utility infrastructure', 'administrative offices', 'summer cooling', 'budget protection'],
      }
    case 'religious':
      return {
        label: 'Religious organization',
        angle: 'Sanctuary HVAC spikes and weekend peaks create stealth billing floors that erode mission funds.',
        question: `I'm curious, how do y'all coordinate Sunday sanctuary cooling to avoid peak spikes, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a religious organization, it's hard to prevent a single hot weekend service from triggering a locked-in peak charge that inflates the monthly bill for the entire year.`,
          `Often times in a church or sanctuary, it's difficult to balance weekly low usage with high weekend heating or cooling peaks because of the demand ratchet on the meter.`,
          `Often times for a congregation, it's hard to see how sanctuary HVAC start-ups affect the billing floor because utility bills only show monthly consolidated totals.`,
        ],
        focus: ['stealth liability', 'billing floors', 'mission fund erosion', 'sanctuary HVAC', 'demand ratchets', 'weekend peaks'],
      }
    case 'technology':
      return {
        label: 'Technology / data-heavy office',
        angle: 'Cooling and server spaces change the billing floor faster than the growth plan expects.',
        question: `I'm curious, how do y'all monitor server cooling spikes alongside normal office load, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a technology company, it's hard to keep office HVAC, server room cooling, and research labs from setting a permanent billing floor during hot summer months.`,
          `Often times in growing tech offices, it's difficult to prevent server expansions and office fit-outs from triggering a high demand ratchet on the meter.`,
          `Often times for tech firms, it's hard to tell whether day-to-day office computing or server space cooling is what's setting the monthly peak because they share the same meter.`,
        ],
        focus: ['fit-outs', 'growth', 'cooling', 'office load', 'server rooms', 'demand ratchets'],
      }
    case 'energy_intensive':
      return {
        label: 'Energy-intensive industrial',
        angle: 'Large motors, process load, and equipment timing driving the highest-cost moments on the bill.',
        question: `I'm curious, how do y'all map process startup times against peak demand windows, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times for a heavy industrial facility, it's hard to keep large motors and process equipment from hitting the meter at the same time.`,
          `Often times in heavy industrial operations, it's difficult to prevent large motors or process timing from setting a high peak charge because of tight production schedules.`,
          `Often times for high-usage sites, it's hard to tell whether normal usage or one short equipment spike is what made the bill jump.`,
        ],
        focus: ['process load', 'large motors', 'equipment timing', 'site practices', 'maintenance'],
      }
    case 'office_services':
      if (hasStrongManufacturersRepSignals(text)) {
        return {
          label: 'Lighting and electrical rep agency',
          angle: 'Showroom lighting, office HVAC, controls displays, and training space creating a different power pattern than a warehouse or plant.',
          question: `I'm curious, how do y'all monitor showroom HVAC and display lighting peaks, or is that side of things pretty much on autopilot?`,
          openers: [
            `Often times for a manufacturers' rep agency, it's hard to keep showroom lighting, office HVAC, and controls displays from driving up facility costs because of contractor training schedules.`,
            `Often times in showroom and training spaces, it's difficult to prevent display equipment and AC from spiking the meter at the same time during hot summer afternoons.`,
            `Often times for a rep firm, it's hard to tell whether the active display areas or the general office cooling is setting the monthly peak because they share a single meter.`,
          ],
          focus: ['showroom lighting', 'controls displays', 'training space', 'office HVAC', 'contractor education'],
        }
      }

      if (hasStrongCommercialRealEstateSignals(text)) {
        return {
          label: 'Commercial real estate services',
          angle: 'Office HVAC, conference-room usage, IT equipment, and property-services activity shaping the bill differently than an industrial site.',
          question: `I'm curious, how do y'all separate normal office usage from the properties or tenant spaces that actually move the bill, or is that side of things pretty much handled?`,
          openers: [
            `Often times for commercial real estate firms, it's hard to separate the office bill from the properties and tenant spaces everybody is focused on day to day.`,
            `Often times in real estate services, the office load is simple, but the managed-building details can hide which locations are actually moving the cost.`,
            `Often times for brokerage and property-services teams, the utility side only gets attention after a building or tenant space starts creating noise on the bill.`,
          ],
          focus: ['office HVAC', 'conference rooms', 'IT equipment', 'property services', 'managed buildings'],
        }
      }

      return {
        label: 'Office / Professional Services',
        angle: 'Occupancy, HVAC, lighting, and IT equipment creating higher-use windows during business hours.',
        question: `I'm curious, how do y'all manage office HVAC and occupancy spikes during summer months, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times in a professional office space, it's difficult to keep summer cooling and occupancy shifts from driving up overhead during business hours.`,
          `Often times for office-heavy facilities, it's hard to prevent a single hot afternoon's air conditioning from setting a high billing floor for the entire year because of demand ratchet rules.`,
          `Often times in commercial office suites, it's difficult to see which departments or server areas are driving the biggest bill days because of standard monthly billing.`,
        ],
        focus: ['HVAC peaks', 'occupancy drivers', 'lighting', 'IT equipment', 'business-hour spikes'],
      }
    case 'unknown':
    default:
      return {
        label: 'Company context',
        angle: 'Forensic audit of billing floors, transmission exposure, and peak demand liability.',
        question: `I'm curious, how do y'all audit the meters to check for hidden demand ratchets, or is that side of things pretty much on autopilot?`,
        openers: [
          `Often times in commercial facilities, it's hard to prevent stealth demand ratchets from driving up costs even if the contract rate looks fine on paper.`,
          `Often times for commercial operators, it's difficult to keep cooling load and equipment usage from setting a permanent billing floor during hot summer afternoons.`,
          `Often times on utility bills, it's hard to tell whether daily operations or one-time peak spikes are driving the demand charge because of a lack of interval reporting.`,
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
            'If the site has real load behind it, the useful question is how it handles the hotter months before the bills start moving.',
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
        'If a cold snap hits, the useful question is what part of the bill or building gets stressed first.',
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
          'The question to answer now is whether the account is ready for the hotter months or still getting by on old assumptions.',
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
  const identity = getAccountIdentityProfile(account, candidate)
  const structuredFacts = extractStructuredBriefFacts(account, candidate, identity, industryGuidance, signalGuidance)
  const operationalDrivers = uniqueStrings([
    ...structuredFacts.energyDrivers,
    ...structuredFacts.equipment,
    ...(identity?.powerKeywords || []),
    ...industryGuidance.focus,
    ...signalGuidance.focus,
  ], 7)
  const companyIdentity = cleanText(identity?.companyType || industryGuidance.label || account.industry || 'commercial account')
  const personaLens = audienceProfile
    ? `${audienceProfile.contactFirstName || audienceProfile.contactName || 'The contact'} is ${audienceProfile.contactTitle || 'the contact'}; frame the question for ${audienceProfile.roleFamily}. ${audienceProfile.questionHint || ''}`
    : 'No specific contact selected; use owner/controller/facilities-friendly language.'
  const signalReason = isFallbackMode || signalFamily === 'industry_context'
    ? 'company context from website, CRM account facts, and industry pattern'
    : `${signalGuidance.label}: ${signalGuidance.angle}`
  const forbiddenLanguage = uniqueStrings([
    ...(identity?.talkTrackGuardrails || []),
    ...industryGuidance.focus
      .filter((item) => /billing floors?|demand ratchets?|locked-in peak/i.test(item))
      .map(() => 'Do not use jargon like demand ratchet, billing floor, load factor, base load, or throughput.'),
    'Do not mention scraping, LinkedIn, Google, RSS, or internal CRM notes.',
    'Do not sound like a commodity broker or say you can save money.',
  ], 10)
  const factProblemFrame = buildFactDrivenProblemFrame(structuredFacts)
  const factQuestionFrame = buildFactDrivenQuestionFrame(structuredFacts)
  const problemFrame = simplifyTalkTrackLanguage(factProblemFrame || buildPlainProblemFrame(industryCluster, companyIdentity, operationalDrivers))
  const questionFrame = simplifyTalkTrackLanguage(factQuestionFrame || buildPlainQuestionFrame(industryCluster, operationalDrivers, audienceProfile))
  const openingPattern = pickVariant(['observation', 'contrast', 'curiosity'] as const, seed) || 'observation'
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)}`).toLowerCase()
  if (hasStrongTruckDealerSignals(accountText)) {
    const truckProblems = [
      `Often times for a heavy-duty truck dealership, service bays, body shop work, parts support, and training spaces can all hit the meter during the same busy window.`,
      `Often times for a truck center, the diesel service side and the parts counter can move the bill more than a normal showroom because the repair windows overlap.`,
      `Often times in truck sales and service, a single busy repair cycle can set the highest usage moment on that site even when the rest of the month looks normal.`,
    ]
    const truckQuestions = [
      `I'm curious, how do y'all tell whether the truck service side, body shop, or parts support is what moved the bill that month, or is that side of things pretty much handled?`,
      `I'm curious, how do y'all compare the truck service bills to see which locations are spiking, or is that side of things pretty much on autopilot?`,
      `I'm curious, how do y'all separate service bays, body shop work, and the training institute on the bill, or is that already handled?`,
    ]
    return {
      signalFamily,
      signalLabel: signalGuidance.label,
      signalAngle: simplifyTalkTrackLanguage(signalGuidance.angle),
      signalOpeners: simplifyList(signalGuidance.openers),
      industryCluster,
      industryLabel: 'Heavy-duty truck dealership',
      industryAngle: 'Service bays, body shop work, parts support, and diesel technician training shaping the bill.',
      industryOpeners: simplifyList(truckProblems),
      marketSeason: marketGuidance.marketSeason,
      marketLabel: marketGuidance.marketLabel,
      marketAngle: simplifyTalkTrackLanguage(marketGuidance.marketAngle),
      marketQuestion: simplifyTalkTrackLanguage(marketGuidance.marketQuestion),
      marketOpeners: simplifyList(marketGuidance.marketOpeners),
      marketFocus: simplifyList(['service bays', 'body shop', 'parts support', 'diesel technician training', 'shop HVAC']),
      openingPattern,
      openingStyle: 'Open with a short permission-based cold-call opener, then use a concrete truck-dealership detail as the hook, not a generic retail line.',
      question: simplifyTalkTrackLanguage(pickVariant(truckQuestions, seed) || truckQuestions[0]),
      ercotFocus: Array.from(new Set(simplifyList(['service bays', 'body shop', 'parts support', 'diesel technician training', 'shop HVAC']))),
      seed,
      avoidPhrases: [
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
      ],
      briefingContext: {
        companyIdentity: 'Heavy-duty truck dealership',
        signalReason: simplifyTalkTrackLanguage(signalReason),
        problemFrame: simplifyTalkTrackLanguage(truckProblems[0]),
        questionFrame: simplifyTalkTrackLanguage(truckQuestions[0]),
        structuredFacts,
        operationalDrivers,
        forbiddenLanguage,
        personaLens,
        confidence: identity?.confidence || (industryCluster === 'unknown' ? 'low' : 'medium'),
      },
    }
  }
  const openingStyleMap: Record<TalkTrackContext['openingPattern'], string> = {
    observation: 'Open with a short permission-based cold-call opener, then move into a concrete company fact or operating detail.',
    question: 'Open with a short permission-based cold-call opener, then the company fact, then one direct question.',
    contrast: 'Open with a short permission-based cold-call opener, then name the company fact and contrast it with the bill issue.',
    curiosity: 'Open with a short permission-based cold-call opener, then use a specific company detail as the hook, not a generic curiosity line.',
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
    ],
    seed,
    audienceProfile,
    briefingContext: {
      companyIdentity,
      signalReason: simplifyTalkTrackLanguage(signalReason),
      structuredFacts,
      operationalDrivers,
      forbiddenLanguage,
      personaLens,
      confidence: identity?.confidence || (industryCluster === 'unknown' ? 'low' : 'medium'),
      problemFrame,
      questionFrame,
    },
  }
}

async function generateAITalkTrack(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext, siteContext: SiteContext | null = null): Promise<{ opener: string; talk_track: string } | null> {
  const companyName = cleanText(account.name) || 'the company'
  const industry = cleanText(account.industry) || 'general commerce'
  const city = cleanText(account.city)
  const state = cleanText(account.state)
  const location = city && state ? `${city}, ${state}` : state || city || 'Texas'

  const employeesContext = account.employees ? `- Employees: ${account.employees}` : ''
  const revenueContext = account.revenue ? `- Revenue: ${account.revenue}` : ''
  const publicDescription = getPublicAccountDescription(account)
  const descriptionContext = publicDescription ? `- Description: ${publicDescription}` : ''
  const usageContext = account.annual_usage ? `- Annual Usage: ${account.annual_usage}` : ''
  
  const multiSiteInfo = detectMultiSiteScale(account, candidate)
  const multiSiteContext = multiSiteInfo.isMultiSite ? '- Footprint: Multi-location / multi-site profile' : ''

  const identity = getAccountIdentityProfile(account, candidate)
  const identityContext = identity
    ? `IDENTITY PROFILE:
- Cluster: ${identity.industryCluster}
- Company Type: ${identity.companyType}
- Operating Model: ${identity.operatingModel}
- Facility Type: ${identity.facilityType}
- Keywords: ${identity.identityKeywords.join(', ')}
- Power Dynamics: ${identity.powerKeywords.join(', ')}`
    : ''

  const audienceProfileBlock = buildAudienceProfileBlock(context.audienceProfile)
  const firstName = cleanText(context.audienceProfile?.contactFirstName || context.audienceProfile?.contactName || '')
  const audienceRule = context.audienceProfile
    ? `- AUDIENCE PROFILE: ${context.audienceProfile.contactName || context.audienceProfile.contactFirstName || 'the contact'} is the person you are writing to. Use their first name once if it helps the opener and use their title to frame what they care about. Audience selection priority is active/pending task contact, decision-maker card, active sequence contact, then fallback.\n`
    : ''
  const sequencePriorityRule = '- Do not blend multiple people into one talk track. Use only the selected audience profile.'
  const briefingContextBlock = JSON.stringify(context.briefingContext, null, 2)
  const dentalContext = /(dental|dentist|dentistry|dental partnership organization|dso\b|dpo\b|operatories?|sterilization|hygienist|hygiene|orthodont|oral surgery)/i.test(cleanText(`${account.name || ''} ${account.industry || ''} ${publicDescription} ${candidate?.title || ''} ${candidate?.snippet || ''}`))
    ? '- For dental groups, use practice and office language: operatories, imaging, sterilization, hygiene cadence, patient flow, and front-desk timing. Do not use hospital, emergency department, inpatient, or short-stay-room language unless the source explicitly confirms a hospital or surgery-center setting.\n'
    : ''
  
  const behavioralHealthContext = hasStrongBehavioralHealthSignals(cleanText(`${account.name || ''} ${account.industry || ''} ${publicDescription} ${candidate?.title || ''} ${candidate?.snippet || ''}`))
    ? '- For behavioral health and psychiatric hospitals, use patient safety, patient comfort, inpatient units, residential treatment, partial hospitalization, intensive outpatient programs, counseling space, and 24-hour facility reliability when the source supports it. Do not use emergency-room, imaging, lab, manufacturing, restaurant, or logistics language unless the source explicitly says those settings exist.\n'
    : ''

  const pharmacyContext = /\b(pharmacy|pharmacies|compounding|apothecary|chemist)\b/i.test(cleanText(`${account.name || ''} ${account.industry || ''} ${publicDescription} ${candidate?.title || ''} ${candidate?.snippet || ''}`))
    ? '- For compounding pharmacies, use pharmacy and cleanroom language: cleanroom HVAC, product refrigeration, compounding setups, and retail flow. Do not use hospital, emergency department, inpatient, or short-stay-room language unless the source explicitly confirms a hospital setting.\n'
    : ''

  const prompt = `You are a plainspoken energy analyst and strategist. You are writing BOTH a permission-based OPENER and a TALK TRACK that comes after the opener for a peer-to-peer conversation with a C-level executive or operations lead.

ADDITIONAL MULTI-ANGLE OUTPUT RULES:
You must generate a customized "headline" and "talk_track" for each of the 6 angles inside the "angles" JSON field. Do not use generic placeholders; customize them based on the company's research payload, actual products/services, and city/locations:
1. "budgetCertainty": Focus on risk management and price-spike protection for their specific operations. If 'rate' or 'energy_supplier' is known, weave it in (e.g. "with y'all's TXU agreement..." or "securing a fixed rate below 8.7 cents..."). If not, focus on their specific machinery/HVAC seasonal budget volatility. NEVER start with generic phrases like "Often times, the biggest swings..." or "unexpected spikes from equipment usage...".
2. "renewalTiming": Focus on their specific renewal timing. If the 'contract_end_date' is known, you MUST weave it in (e.g. "With y'all's current agreement coming up in October..." or "heading into your October renewal..."). If it is not known, frame it around auditing the renewal terms of their specific clinical/manufacturing equipment load (e.g. "With the clinic's clinical equipment and HVAC running daily, auditing the terms before the next renewal window..."). NEVER use generic starter phrases like "Many businesses just let their electricity contracts auto-renew...".
3. "loadFactor": Focus on their specific operational load profile. If 'meter_count' or 'annual_usage' is known, weave it in (e.g. "managing three utility meters..." or "drawing over a million kilowatt-hours..."). Hook them on their specific machinery (e.g. imaging systems, batching plants, refrigeration compressors) and peak pricing hours.
4. "demandResponse": Focus on earning revenue from their specific flexibility. Reference their specific flexible loads (e.g. non-critical HVAC, secondary compressors, vehicle charging) and getting paid by ERCOT during grid stress.
5. "billingOptimization": Focus on auditing and tax exemptions for their specific entity type. If they are a religious/nonprofit/educational entity, highlight the "utility sales tax exemption" or "tax exemptions" immediately. If they are a clinic/office/manufacturing firm, focus on auditing line-item pass-through charges.
6. "esgRenewables": Focus on hitting sustainability goals for their specific company/brand without paying green premiums.

Each talk_track in the "angles" must be exactly 2 sentences and follow the TALK_TRACK_RULES (start with operational pacing, end with curiosity question + safety-valve).

ENERGY DATA INTEGRATION RULES:
If any of these known energy metrics are present in the account payload, you MUST incorporate them directly into the pacing/opener and the specific angle where it is highly relevant:
- contract_end_date: e.g. if '2026-10-31', weave this date into the "renewalTiming" talk track or opener (e.g. "with your agreement ending this October..." or "heading into your October renewal...").
- energy_supplier: e.g. if 'TXU Energy', weave it in (e.g. "since y'all are currently set up with TXU...").
- rate: e.g. if '8.5 cents/kWh' or '0.085', reference it (e.g. "having a rate of 8.5 cents on that meter...").
- meter_count: e.g. if '3', reference it (e.g. "managing three separate utility meters across Laredo...").
- annual_usage: e.g. if '1,200,000 kWh', reference it (e.g. "drawing over a million kilowatt-hours a year...").

TO PASS THE "CFO TEST" WITH A GRADE OF A/A+:
- NEVER use generic opening statements in the talk tracks like "Many businesses just let their electricity contracts auto-renew..." or "Often times, the biggest swings on a clinic's electricity bill...". These sound like sales scripts.
- Instead, dive directly into a highly specific operational action/equipment/space fact about the company (e.g., "Having those surgery tables and clinical imaging systems preheating every morning...", "With the athletics lighting and campus cooling systems running during the summer calendar...", "Running multiple shift patterns and conveyor systems across your Laredo warehouse...").
- Hook them instantly on a practical operational reality first, then causal-link it to the bill.

VOICE, TONE & PERSUASION PSYCHOLOGY (Lewis Patterson's Calling Cadence & Influence):
- Tone: High-integrity, expert, disarming, low-pressure, direct. Talk peer-to-peer as if calling a friend who runs a business.
- Cadence: Use contractions naturally (y'all, y'all's, it's, don't, can't, we're). Avoid polished, formal, or high-flown sales language. Sound undeniably like Lewis Patterson calling out of the blue.
- Texas energy broker tone: Lewis Patterson is a real guy in Fort Worth. He calls out of the blue, speaks plain English, does not lecture, and translates technical terms immediately (e.g., use "charges tied to when y'all use the most power" or "peak charges that stick on the bill" instead of "demand charges" or "demand ratchet").
- Persuasion Psychology & Hypnotism Framework:
  1. Pacing: Start the talk track by pacing the prospect's actual reality. Make a statement about their operational setup that they must internally agree with (e.g., "Having those commercial bakery ovens preheating every morning...", "When y'all run those salsa packaging lines for the afternoon shift...", "Having those clinical operatory chairs filled all day..."). Pacing establishes immediate trust and drops their critical guard.
  2. Leading: Connect that paced reality to the electricity meter billing structure. Use temporal or causal links (e.g., "...which naturally pulls a heavy demand spike on the utility meter right when prices are highest," or "...which leaves that meter carrying a peak charge longer than people expect.").
  3. Presupposition: Assume they are already running a successful operation. Never use conditional "if" statements (e.g. "If you run machines" or "If you have spikes"). Presuppose the reality: "When y'all operate that CNC machinery..." or "Having that cleanroom HVAC running 24/7...".
  4. Double Bind (The Illusion of Choice): The second sentence must present a choice between two actions/states, both of which lead to a conversation rather than a rejection. Frame the choice around whether they are actively timing the market/comparing renewal options, or if that side of things is just running on autopilot. Start the question with "I'm curious..." or "How do y'all..." and end exactly with one of the safety-valve phrases.
- Scraping Flexibility & Ultimate Specificity:
  - Do NOT use generic templates or vague phrases like "operations", "usage", "facility cost creep", "the extra usage as it grows".
  - You MUST scrape the research payload, description, and website summary for specific operational nouns, products, tools, machinery, or services unique to this company (e.g., "board game shipping", "trolley maintenance", "shelter beds", "laundry setups", "clinical operatories", "tutoring sessions", "cold room refrigeration"). Weave these exact nouns into the pacing sentence. Show them you know exactly what they do, without sounding like a dry encyclopedia.
- Sound like a forensic analyst who has noticed a specific operational fact or news event about the company and wants to check how it affects their utility billing.

OPENER RULES (Exactly two sentences):
- Must be structured EXACTLY like: "[Greeting], it's Lewis with Nodal Point, calling you out the blue here, real quick. [Signal/Research Hook], and had a curious question about y'alls electricity agreements and contracts."
- Greeting (for the first sentence) must use the contact's first name if available (first name: ${firstName || 'none'}), e.g., 'Hey ${firstName}' or 'Hey there' if no name is available.
- For example, if name is John and signal is a new location in Shenandoah, the two sentences must be: "Hey John, it's Lewis with Nodal Point, calling you out the blue here, real quick. I saw y'all are opening a new location in Shenandoah, and had a curious question about y'alls electricity agreements and contracts."
- If the brief is based on general company context or a homepage/domain (no specific news signal), frame the research hook as something Lewis noticed about THEIR business, not a generic category he researched. Use second-person language like "I was looking into your tire recycling operation in [their actual city]" or "I was looking at your compounding pharmacy footprint in [their actual city]" or "I was looking into your school district facilities in [their actual city]". Never say "I've been researching a..." and never use vague category phrases like "a manufacturing operation", "a retail account", "a logistics network", or "an office-style footprint".
- CRITICAL: The city in the opener MUST come from the Location field in COMPANY CONTEXT above. Do NOT use Fort Worth, Houston, or any other city unless that is the actual city in the Location field.
- If the account is a pallet management or reverse-logistics business, call it exactly that. Do not collapse it into a generic logistics or distribution operation.
- CRITICAL: Never use the phrase 'I saw y'all run [Company]' or 'I notice you run [Company]'.
- Must end the second sentence exactly with ", and had a curious question about y'alls electricity agreements and contracts."

TALK_TRACK_RULES (Exactly two sentences):
- Sentence 1: MUST start directly with a concrete operational pacing statement about the company's day-to-day facilities/equipment (e.g., "Having those clinical treatment rooms and imaging setups running...", "With y'all operating the loading docks and charging forklifts across the Laredo facility...", "Running the campus HVAC and athletic lighting during student hours..."). Do NOT start with market details, ERCOT grid alerts, or generic industry descriptions (e.g. do NOT say "During ERCOT grid stress events..." or "Electricity bills for complex campus operations..."). Connect this paced reality to the billing issue in the second half of the sentence using causal links.
- Sentence 2: One short curiosity question that invites them to explain how they handle it. It MUST start with "I'm curious..." or "How do y'all..." and end exactly with one of these safety-valve phrases: ", or is that pretty much on autopilot?" or ", or is that side of things pretty much on autopilot?" or ", or is that pretty much handled?" or ", or is that side of things pretty much handled?".
- Use the STRUCTURED BRIEFING CONTEXT as the source of truth. The signal is the reason for the call; the company identity and operational drivers decide the talk track.
- If the signal and company identity conflict, company identity wins.
- Use structuredFacts first. The talk track must mention at least one concrete activity, product, equipment type, or energy driver from structuredFacts. If structuredFacts says the company supplies/services equipment, do not talk as if they manufacture or operate their customers' facilities.
- Use the problemFrame and questionFrame ONLY as a conceptual guide for the underlying electricity mechanic (e.g. demand spikes, seasonal HVAC, refrigeration, laundry load). Do NOT copy them verbatim. You MUST rewrite the problem and question to incorporate specific details of this company's actual business.
- CRITICAL: The talk track MUST consist of exactly these two sentences. Not one, not three. Exactly two.
- CRITICAL: The word count of the talk track MUST be between 15 and 85 words.
- CRITICAL: Do NOT use "care about" or "usually care about" statements. Do NOT make assumptions about what the prospect cares about.
- CRITICAL: The opener and the talk track sentences must start with a capitalized letter.
- Do NOT use confusing jargon like "Coincident Kitchen Peak" or "load factor" or "demand ratchet" directly. Instead, explain the billing mechanic simply in everyday language: "one high-usage month can leave that meter carrying a higher charge longer than people expect."
- Do NOT use first-person curiosity language like "I was curious about" or "I was looking at" in the first sentence.
- The Talk Track MUST connect the specific operational details of the signal (e.g., "culinary program kitchen equipment", "trailer fabrication machinery", "flight simulator electricity draw", "commercial freight warehousing") directly to how that specific activity consumes power. Be forensic and concrete about the actual machinery, equipment, or facility type involved in the news.
- Never use generic placeholders or vague phrases like "the extra usage as it grows" or "changes the bill before anyone notices."
- Avoid forbidden phrases: "the useful check", "the useful check is whether", "most operators care about", "most leaders care about", "trim waste", "budget predictability", "save money", "improve efficiency", "how the business runs today", "looking at the setup", "staple", "long-standing", "fixture", "current setup", "site by site", "what most operators need to know", "what most leaders care about", "I was looking at the operational footprint", "I came across your website", "I came across [company]'s website", "I was curious about", "I would want", "I would watch", "I would ask", "I was reviewing", "headcount or capex", "rate", "rates", "pricing", "savings", "lower cost", "better price", "consultation", "help you".
${dentalContext}${behavioralHealthContext}${pharmacyContext}

COMPANY CONTEXT:
- Company: ${companyName}
- Industry: ${industry}
- Location: ${location}
${[employeesContext, revenueContext, descriptionContext, usageContext, multiSiteContext].filter(Boolean).join('\n')}

${siteContext?.promptBlock ? siteContext.promptBlock : ''}

SIGNAL CONTEXT:
${candidate ? `- Headline: ${candidate.title}\n- Snippet: ${candidate.snippet}\n- Source: ${candidate.source}` : 'No specific news signal found. Use general business context.'}

MARKET CONTEXT:
- Market angle: ${context.marketAngle}
- Season: ${context.marketLabel}

${identityContext}

${audienceProfileBlock ? `AUDIENCE PROFILE:\n${audienceProfileBlock}\n` : ''}

STRUCTURED BRIEFING CONTEXT:
${briefingContextBlock}

Return JSON only with this shape:
{
  "opener": "The two-sentence permission opener",
  "talk_track": "The two-sentence talk track"
}`

  try {
    const openrouterKey = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY
    const geminiKey = process.env.NEXT_PUBLIC_FREE_GEMINI_KEY || process.env.GEMINI_API_KEY

    let content = ''
    let openRouterFailed = false

    if (openrouterKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://powerchoosers.com',
            'X-Title': 'Power Choosers CRM',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-sonnet-4.6',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.7,
            max_tokens: 400,
          }),
        })

        if (!response.ok) {
          throw new Error(`OpenRouter error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        content = cleanText(data?.choices?.[0]?.message?.content || '')
      } catch (err: any) {
        console.warn('[Intelligence Brief Rewrite] OpenRouter call failed, falling back to direct Gemini API...', err.message)
        openRouterFailed = true
      }
    } else {
      openRouterFailed = true
    }

    if (openRouterFailed) {
      if (!geminiKey) {
        console.warn('[Intelligence Brief Rewrite] Neither OpenRouter nor Gemini API keys are configured for rewrite')
        return null
      }
      console.log('[Intelligence Brief Rewrite] Calling Google Generative AI direct API fallback...')
      const genAI = new GoogleGenerativeAI(geminiKey)
      const modelsToTry = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-pro-latest', 'gemini-2.0-flash-lite']
      let lastError = null

      for (const modelName of modelsToTry) {
        try {
          console.log(`[Intelligence Brief Rewrite] Attempting direct Gemini API with model: ${modelName}`)
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: 'You are a plainspoken energy analyst and strategist polishing sales openers and talk tracks. Return JSON only.',
          })
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7,
            }
          })
          const text = result.response.text()?.trim()
          if (text) {
            content = cleanText(text)
            console.log(`[Intelligence Brief Rewrite] Direct Gemini API call succeeded with model: ${modelName}`)
            break
          }
        } catch (err: any) {
          console.warn(`[Intelligence Brief Rewrite] Direct Gemini API failed for model ${modelName}:`, err.message)
          lastError = err
        }
      }

      if (!content) {
        console.warn('[Intelligence Brief] AI generation returned empty content or all models failed. Last error:', lastError?.message)
        return null
      }
    }

    if (!content) {
      console.warn('[Intelligence Brief] AI generation returned empty content')
      return null
    }

    let parsed: { opener: string; talk_track: string } | null = null
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim())
      }
    }

    if (!parsed || !parsed.opener || !parsed.talk_track) {
      console.warn('[Intelligence Brief] AI generation failed to parse as JSON or missing keys')
      return null
    }

    const opener = cleanText(parsed.opener)
    const talkTrack = enforceIndustryTalkTrackGuardrails(simplifyTalkTrackLanguage(cleanText(parsed.talk_track)), account, candidate)

    // Validate the AI-generated talk track
    const wordCount = talkTrack.split(/\s+/).filter(Boolean).length
    const sentenceCount = splitTalkTrackSentences(talkTrack).length
    if (sentenceCount !== 2 || wordCount < 14 || wordCount > 95) {
      console.warn('[Intelligence Brief] AI talk track word count/sentence count out of range:', wordCount, sentenceCount)
      return null
    }

    // Check for forbidden phrases
    const forbiddenPatterns = [
      /current setup/i,
      /how the business runs today/i,
      /whether the bill matches/i,
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
      /useful check/i,
      /coincident kitchen peak/i,
    ]
    
    if (forbiddenPatterns.some(pattern => pattern.test(talkTrack))) {
      console.warn('[Intelligence Brief] AI talk track contains forbidden phrases')
      return null
    }

    if (!/or is that (?:side of things )?pretty much (?:on autopilot|handled)\?/i.test(talkTrack)) {
      console.warn('[Intelligence Brief] AI talk track missing autopilot safety valve')
      return null
    }

    return { opener, talk_track: talkTrack }
  } catch (error) {
    console.error('[Intelligence Brief] AI generation error:', error)
    return null
  }
}

function talkTrackNeedsRewrite(talkTrack: string, context: TalkTrackContext, account?: AccountRow, candidate: ResearchHit | null = null) {
  const text = cleanText(talkTrack)
  if (!text) return true
  if (isLikelyNonEnglishText(text)) return true

  const lower = text.toLowerCase()
  const accountText = account
    ? cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
    : ''
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const firstSentence = cleanText(text.split(/[.!?]+/)[0] || '')
  const genericHits = TALK_TRACK_GENERIC_PATTERNS.filter((pattern) => pattern.test(lower)).length
  const sentenceCount = splitTalkTrackSentences(text).length
  const mentionsSignal = context.signalFamily !== 'industry_context' &&
    TALK_TRACK_SIGNAL_KEYWORDS[context.signalFamily].some((keyword) => lower.includes(keyword.toLowerCase()))
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
  const repeatedQuestionEcho = /\b(autopilot|proactively|current setup)\b[\s\S]{0,120}\b\1\b/i.test(lower)
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
  const accountIsMaterialHandlingEquipment = hasMaterialHandlingEquipmentSignals(accountText)
  const accountIsPetrochemical = hasStrongPetrochemicalSignals(accountText)
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
  const accountSchoolPracticeJargon = accountIsSchool &&
    /\b(practice(?:s)?|operatories?|patient flow|sterilization|imaging|clinic|dental|medical practice|hospitals?)\b/i.test(lower)
  const accountSchoolRetailJargon = accountIsSchool &&
    /\b(retail footprint|roll-?up view|store meters?|store-level|stores?|customer-facing retail|retail group|showroom)\b/i.test(lower)
  const accountIsAutomotive = hasStrongAutomotiveSignals(accountText)
  const accountIsRetail = context.industryCluster === 'retail' ||
    ((hasStrongRetailStoreSignals(accountText) || /\b(retail|store|stores?|showroom|customer-facing)\b/i.test(accountText)) &&
     !['manufacturing', 'logistics', 'food_storage', 'print_fulfillment', 'moving_storage'].includes(context.industryCluster))
  const accountIsAutoPartsDistribution = hasStrongAutoPartsDistributionSignals(accountText)
  const accountAutoPartsDealershipJargon = accountIsAutoPartsDistribution &&
    /\b(dealership|dealerships|showroom traffic|service bays?|lot lighting|vehicle inventory|auto dealer)\b/i.test(lower)
  const accountAutomotiveHotelJargon = accountIsAutomotive &&
    /\b(hotel|hotels|hotel's|guest rooms?|room load|laundry|lodging|motel|resort|hotel property|blended property)\b/i.test(lower)
  const accountAutomotiveRetailJargon = accountIsAutomotive &&
    /\b(retail operation|retail footprint|roll-?up view|store meters?|store-level|stores?|customer-facing retail|retail group)\b/i.test(lower)
  const accountIsFoodProduction = /\b(food production|food manufacturing|food manufacturer|food processing|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|restaurant chains?|foodservice)\b/i.test(accountText)
  const accountFoodLogisticsJargon = accountIsFoodProduction &&
    /\b(warehouse groups?|dock activity|dock work|dock doors?|high-volume logistics|logistics groups?|automation and hvac|warehouse's summer peak)\b/i.test(lower)
  const accountPetrochemicalLogisticsJargon = accountIsPetrochemical &&
    /\b(logistics business|warehouse groups?|warehouse support|dock activity|dock doors?|terminal-adjacent|high-volume logistics|distribution centers?)\b/i.test(lower)
  const accountDmeMedicalAllowance = accountIsDme &&
    /\b(dme|durable medical equipment|medical equipment|equipment|inventory|delivery|storage|turnaround)\b/i.test(lower)
  const accountRestaurantManufacturingJargon = accountIsRestaurant &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution)\b/i.test(lower)
  const accountRestaurantRetailJargon = accountIsRestaurant &&
    /\b(showroom|showroom cooling|retail floor|store traffic|lot lighting|service bays?)\b/i.test(lower)
  const accountLogisticsManufacturingJargon = accountIsLogistics &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|process equipment|assembly)\b/i.test(lower)
  const accountMaterialHandlingManufacturingJargon = accountIsMaterialHandlingEquipment &&
    /\b(manufacturing operation|production lines?|process loads?|compressed air|machine startup|startup sequence|plant|factory)\b/i.test(lower)
  const accountMaterialHandlingGenericLogisticsJargon = accountIsMaterialHandlingEquipment &&
    /\b(distribution operation|logistics operation|warehouse group|freight|cargo|dock activity|dock doors?|storage climate control)\b/i.test(lower)
  const accountOfficeIndustrialJargon = accountIsOfficeServices &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution|dock activity|dock doors?|terminal throughput)\b/i.test(lower)
  const isNationalRetailDistribution = account
    ? getAccountIdentityProfile(account, candidate)?.companyType === 'national retail and distribution network'
    : false

  const accountRetailIndustrialJargon = accountIsRetail && !isNationalRetailDistribution &&
    /\b(energy-intensive facility|process equipment|process startup|startup times|large motors|manufacturing|industrial|production lines?|machine startup|factory|plant)\b/i.test(lower)
  const accountRetailLogisticsJargon = accountIsRetail && !isNationalRetailDistribution &&
    /\b(logistics operation|logistics and distribution|dock activity|dock doors?|daily throughput|terminal|freight|cargo)\b/i.test(lower)
  const unexplainedJargon = /\b(load factor|base load|demand ratchet|demand ratchets|forensic signal|forensic driver|thermal liability|artificial liability|peak demand charges|transmission side|correlation)\b/i.test(lower)
  // Catch jargon terms that regularly slip through and confuse prospects
  const bannedJargonTerms = /\b(coincident peaks?|4cp exposure|4-cp|four coincident peak|scarcity adder|ercot real-time|ancillary services charge|nodal price)\b/i.test(lower)
  // Catch the redundant "footprint...footprint" pattern
  const redundantFootprint = (/\bfootprint\b/i.test(lower) && lower.indexOf('footprint') !== lower.lastIndexOf('footprint'))
  // Catch when the account is a competitor (energy broker) — any talk track for them is wrong
  const isCompetitor = account ? isCompetitorEnergyBroker(account) : false
  const matchedAngleBuckets = [mentionsSignal, mentionsIndustry, mentionsMarket].filter(Boolean).length
  const marketFeelsBoltedOn = mentionsMarket && (mentionsSignal || mentionsIndustry) && sentenceCount > 2
  const mismatchedIndustryLabel = (Object.entries(TALK_TRACK_INDUSTRY_LABELS) as Array<[IndustryCluster, string[]]>).some(([cluster, labels]) => {
    if (cluster === context.industryCluster) return false
    return labels.some((label) => {
      const escaped = escapeRegExp(label.toLowerCase())
      return new RegExp(`\\b${escaped}\\b`, 'i').test(lower)
    })
  })
  const overstuffed = matchedAngleBuckets > 2 || marketFeelsBoltedOn
  const structuredFactDrift = talkTrackDriftsFromStructuredFacts(text, context)

  const needsRewrite = genericHits > 0 || genericOpening || isCompetitor || bannedJargonTerms || redundantFootprint || unsupportedLeadershipAngle || unsupportedAcquisitionAngle || unsupportedFootprintAngle || repeatedQuestionEcho || filingJargon || footprintOpener || incompleteReportOpener || healthcareRestaurantJargon || healthcareHospitalityJargon || healthcareBankingJargon || schoolManufacturingJargon || accountSchoolManufacturingJargon || accountSchoolPracticeJargon || accountSchoolRetailJargon || residentialRestaurantJargon || hotelEventSpaceJargon || accountHealthcareHotelJargon || accountDentalHospitalJargon || accountDmeHospitalJargon || accountAutoPartsDealershipJargon || accountAutomotiveHotelJargon || accountAutomotiveRetailJargon || accountFoodLogisticsJargon || accountPetrochemicalLogisticsJargon || accountRestaurantManufacturingJargon || accountRestaurantRetailJargon || accountLogisticsManufacturingJargon || accountMaterialHandlingManufacturingJargon || accountMaterialHandlingGenericLogisticsJargon || accountOfficeIndustrialJargon || accountRetailIndustrialJargon || accountRetailLogisticsJargon || structuredFactDrift || unexplainedJargon || sentenceCount !== 2 || wordCount < 14 || wordCount > 95 || overstuffed || (mismatchedIndustryLabel && !accountDmeMedicalAllowance)

  if (needsRewrite) {
    console.warn('[Intelligence Brief Rewrite Validation] Rejected talk track:', {
      talkTrack,
      reasons: {
        genericHits: genericHits > 0,
        genericOpening,
        isCompetitor,
        bannedJargonTerms,
        redundantFootprint,
        unsupportedLeadershipAngle,
        unsupportedAcquisitionAngle,
        unsupportedFootprintAngle,
        repeatedQuestionEcho,
        filingJargon,
        footprintOpener,
        incompleteReportOpener,
        schoolManufacturingJargon: schoolManufacturingJargon || accountSchoolManufacturingJargon,
        accountSchoolPracticeJargon,
        accountSchoolRetailJargon,
        accountRestaurantRetailJargon,
        accountMaterialHandlingManufacturingJargon,
        accountMaterialHandlingGenericLogisticsJargon,
        structuredFactDrift,
        residentialRestaurantJargon,
        hotelEventSpaceJargon,
        unexplainedJargon,
        sentenceCount: sentenceCount !== 2 ? sentenceCount : false,
        wordCount: (wordCount < 14 || wordCount > 95) ? wordCount : false,
        overstuffed,
        mismatchedIndustryLabel: mismatchedIndustryLabel && !accountDmeMedicalAllowance
      }
    })
  }

  return needsRewrite
}

function buildConciseOpenerHook(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext) {
  const companyName = cleanText(account.name) || 'the company'
  const signalAnchor = cleanText(deriveSignalAnchor(account, candidate))
  const rawTitle = cleanText(candidate?.title || '')
  const title = isBoilerplatePageTitle(rawTitle, companyName) ? '' : rawTitle
    .replace(/\s*[-|]\s*(AftermarketNews|Google News|PR Newswire|Business Wire|GlobeNewswire|News)\s*$/i, '')
  const multiSiteInfo = detectMultiSiteScale(account, candidate)
  const companyKey = companyName.toLowerCase()
  const anchorKey = signalAnchor.toLowerCase()

  if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount > 1) {
    const unit =
      context.industryCluster === 'school_district' || context.industryCluster === 'higher_education'
        ? 'campus'
        : 'location'
    const countLabel = `${multiSiteInfo.locationCount}-${unit} footprint`
    return `${companyName}'s ${countLabel}`
  }

  if (signalAnchor && anchorKey !== companyKey && signalAnchor.length <= 60 && signalAnchor.split(/\s+/).length <= 8) {
    return signalAnchor
  }

  if (/\b(launches?|launched|redesigns?|redesigned|opens?|opened|expands?|expanded|acquires?|acquired|appoints?|appointed|promotes?|promoted)\b/i.test(title)) {
    const shortTitle = shortenText(title, 80)
    if (shortTitle && shortTitle.toLowerCase() !== companyKey) return shortTitle
  }

  return companyName
}

/**
 * Builds contextual opener options for industry_context signal family.
 * Instead of saying "I saw y'all run [company name]" — which is useless when calling them directly —
 * this uses what we know about their actual operation (industry cluster, company type, location, size)
 * to say something specific about WHAT they do or HOW they operate.
 */
function buildIndustryContextOpeners(greeting: string, account: AccountRow, context: TalkTrackContext, siteContext: SiteContext | null = null): string[] {
  const companyName = cleanText(account.name) || 'the company'
  const city = cleanText(account.city)
  const state = cleanText(account.state)
  const descriptionText = getPublicAccountDescription(account)
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${descriptionText}`)
  const nonTexasDescriptor = !/\b(texas|tx|ercot|dfw|dallas|houston|austin|san antonio|fort worth|el paso|arlington|plano|irving|pasadena|spring|euless|weatherford|texarkana|colleyville)\b/i.test(descriptionText)
    && /\b(indiana|florida|california|new york|new jersey|ohio|illinois|alabama|georgia|tennessee|oklahoma|louisiana|arkansas|missouri|kansas|colorado|arizona|nevada)\b/i.test(descriptionText)
  // If we have a confirmed service address, extract the city from the first one for the opener
  const confirmedCity = siteContext?.confirmedAddresses[0]
    ? (() => {
        const addr = siteContext.confirmedAddresses[0]
        // Try to extract city from "Street, City, ST ZIP" or "Street, City, Texas" patterns
        const cityMatch = addr.match(/,\s*([^,]+),\s*(?:TX|Texas)/i)
        return cityMatch ? cityMatch[1].trim() : null
      })()
    : null
  const effectiveCity = confirmedCity || city
  const locationClause = nonTexasDescriptor
    ? ''
    : effectiveCity && state ? `in ${effectiveCity}` : state ? `in ${state}` : 'in Texas'
  const multiSiteInfo = detectMultiSiteScale(account, null)
  const palletManagementSignals = hasPalletManagementSignals(accountText)
  const profile = getAccountIdentityProfile(account)
  const companyType = cleanText(profile?.companyType || '')
  const facilityType = cleanText(profile?.facilityType || '')
  const cluster = context.industryCluster
  const isHospitalityGroupCompany = /\bhospitality group\b/i.test(companyType)
  const isHotelOwnerCompany = /\bhotel owner\b/i.test(companyType)
  const isGolfClubCompany = /\bgolf club\b|\bcountry club\b|\bprivate club\b/i.test(companyType) || hasGolfClubSignals(accountText)
  const specificAccountLane = companyType && !/^(commercial account|retail business)$/i.test(companyType)
    ? companyType.toLowerCase()
      .replace(/\s+(network|provider|supplier|operator|company|business)$/i, '')
      .trim()
    : hasIndustrialSiteLogisticsSignals(cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${buildIdentityProfileText(account, null)}`))
      ? 'petrochemical site-store logistics'
    : cluster === 'manufacturing' && hasReadyMixConcreteSignals(cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${buildIdentityProfileText(account, null)}`))
      ? 'ready-mix concrete and aggregates'
      : cluster === 'manufacturing'
        ? 'industrial'
        : cluster === 'restaurant'
          ? 'restaurant'
          : cluster === 'retail'
            ? 'retail'
            : 'commercial'

  // Build an operational descriptor from what we actually know
  const operationDescriptor = (() => {
    if (hasIndustrialSiteLogisticsSignals(cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${buildIdentityProfileText(account, null)}`))) {
      return `a petrochemical site-store logistics operation${locationClause ? ` ${locationClause}` : ''}`
    }
  if (palletManagementSignals) {
    return `${multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount > 1
        ? 'a pallet management and reverse-logistics network'
        : 'a pallet management and reverse-logistics operation'}${locationClause ? ` ${locationClause}` : ''}`
  }
  if (hasConstructionMachinerySupportSignals(cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${buildIdentityProfileText(account, null)}`))) {
    return `${multiSiteInfo.isMultiSite ? 'a construction equipment sales and service network' : 'a construction equipment sales and service operation'}${locationClause ? ` ${locationClause}` : ''}`
  }
  if (isHospitalityGroupCompany) {
    return `a hospitality group${locationClause ? ` ${locationClause}` : ''}`
  }
  if (isHotelOwnerCompany) {
    return `a hotel property${locationClause ? ` ${locationClause}` : ''}`
  }
  if (isGolfClubCompany) {
    return `a private golf club${locationClause ? ` ${locationClause}` : ''}`
  }
  if (companyType && !/^(commercial account|retail business)$/i.test(companyType)) {
    const typeStr = companyType.toLowerCase()
    const article = getIndefiniteArticle(typeStr)
    const articleSpace = article ? `${article} ` : ''
    return `${articleSpace}${typeStr}${locationClause ? ` ${locationClause}` : ''}`
    }
    if (cluster === 'manufacturing') return `a manufacturing operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'logistics') return `a logistics and distribution operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'print_fulfillment') return `a print and fulfillment operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'public_transit') return `a public transit operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'moving_storage') return `a moving and storage operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'food_storage') return `a food storage and distribution operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'healthcare') return `a healthcare operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'banking') return `a banking and branch operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'retail') return `a retail operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'restaurant') return `a restaurant operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'hotel_owner') return `a hotel property${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'hospitality_group') return `a hospitality group${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'school_district') return `a school district${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'higher_education') return `a higher education campus${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'residential_care') return `a residential care facility${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'technology') return `a technology operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'energy_intensive') return `an energy-intensive industrial site${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'multi_site') return `a multi-site operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'public_sector') return `a public sector operation${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'religious') return `a religious organization${locationClause ? ` ${locationClause}` : ''}`
    if (cluster === 'office_services') return `an office-based operation${locationClause ? ` ${locationClause}` : ''}`
    if (companyType) {
      const typeStr = companyType.toLowerCase()
      const article = getIndefiniteArticle(typeStr)
      const articleSpace = article ? `${article} ` : ''
      return `${articleSpace}${typeStr}${locationClause ? ` ${locationClause}` : ''}`
    }
    if (facilityType) {
      const typeStr = facilityType.toLowerCase()
      const article = getIndefiniteArticle(typeStr)
      const articleSpace = article ? `${article} ` : ''
      return `${articleSpace}${typeStr}${locationClause ? ` ${locationClause}` : ''}`
    }
    // Last resort — describe the company by name but phrase it as what they do
    return `${companyName}'s operation`
  })()
  const yourOperationDescriptor = toSecondPersonOperationDescriptor(operationDescriptor)

  return [
    `${greeting}. I'm calling you out the blue here, real quick. I was looking into ${yourOperationDescriptor}, and had a curious question about y'alls electricity agreements and contracts.`,
    `${greeting}. I'm calling you out the blue here, real quick. I was looking at ${companyName} and ${yourOperationDescriptor}, and had a curious question about y'alls electricity agreements and contracts.`,
    `${greeting}. I'm calling you out the blue here, real quick. I saw enough about ${yourOperationDescriptor} to have one quick question about y'alls electricity agreements and contracts.`,
  ]
}

function buildPermissionOpener(account: AccountRow, context: TalkTrackContext, variantSeed: string, candidate: ResearchHit | null = null, siteContext: SiteContext | null = null) {
  const companyName = cleanText(account.name) || 'the company'
  const firstName = cleanText(context.audienceProfile?.contactFirstName || context.audienceProfile?.contactName || '')
  const greeting = firstName
    ? `Hey ${firstName}, it's Lewis with Nodal Point`
    : "Hey there, it's Lewis with Nodal Point"
  const openerHook = buildConciseOpenerHook(account, candidate, context)
  const openerLead = openerHook === companyName ? companyName : openerHook

  const openerBySignal: Record<SignalFamily, string[]> = {
    acquisition: [
      `${greeting}. I'm calling you out the blue here, real quick. I saw the news about the acquisition of ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all took over the ${openerLead} locations, and had a curious question about y'alls electricity agreements and contracts.`,
    ],
    new_location: [
      // Use openerLead only when it is a clean location name (≤6 words), not an article title
      ...(openerLead !== companyName && openerLead.split(/\s+/).length <= 6
        ? [
            `${greeting}. I'm calling you out the blue here, real quick. I saw y'all are opening a new location in ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
            `${greeting}. I'm calling you out the blue here, real quick. I saw y'all just added the new site in ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
          ]
        : [
            `${greeting}. I'm calling you out the blue here, real quick. I saw y'all are adding a new location, and had a curious question about y'alls electricity agreements and contracts.`,
            `${greeting}. I'm calling you out the blue here, real quick. I saw the announcement about the new site, and had a curious question about y'alls electricity agreements and contracts.`,
          ]),
    ],
    leadership_change: [
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all recently brought on a new team member to help manage ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
      `${greeting}. I'm calling you out the blue here, real quick. I saw the leadership transition at ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
    ],
    growth: [
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all are expanding the footprint for ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all are ramping up operations at ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
    ],
    restructuring: [
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all are consolidating some operations at ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
      `${greeting}. I'm calling you out the blue here, real quick. I saw the recent operational shifts at ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
    ],
    contract_win: [
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all landed the new contract for ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all won the recent project for ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
    ],
    funding: [
      `${greeting}. I'm calling you out the blue here, real quick. I saw the recent capital raise for ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
      `${greeting}. I'm calling you out the blue here, real quick. I saw the funding round for ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
    ],
    technical_load: [
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all are running the infrastructure at ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
      `${greeting}. I'm calling you out the blue here, real quick. I saw y'all operate the technical facilities at ${openerLead}, and had a curious question about y'alls electricity agreements and contracts.`,
    ],
    industry_context: buildIndustryContextOpeners(greeting, account, context, siteContext),
  }

  return pickVariant(openerBySignal[context.signalFamily], variantSeed) || openerBySignal[context.signalFamily][0]
}

function openerNeedsRewrite(opener: string, account: AccountRow | null = null) {
  const text = cleanText(opener)
  if (!text) return true
  const accountText = account
    ? cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)}`)
    : ''
  const palletSignals = accountText ? hasPalletManagementSignals(accountText) : false
  return /\b(?:i'?ve been researching|i'?ve been doing some research on)\s+(?:an?|the)\b/i.test(text) ||
    /\bi came across\b[\s\S]{0,90}\bwhile looking at\b/i.test(text) ||
    /\b(?:a|an)\s+(?:manufacturing operation|retail operation|logistics network|logistics and distribution operation|office-style footprint|commercial account)\b/i.test(text) ||
    (palletSignals && !/\b(pallet|reverse logistics|pallet retrieval|pallet repair|pallet sortation)\b/i.test(text))
}

function splitTalkTrackSentences(value: string) {
  return cleanText(value)
    .split(/(?<=[.!?])\s+/)
    .map(cleanText)
    .filter(Boolean)
}

function ensureSentence(value: string) {
  const text = capitalizeSentenceStarts(value)
  if (!text) return ''
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function ensureQuestionSentence(value: string) {
  const text = capitalizeSentenceStarts(value).replace(/[.!]+$/g, '')
  if (!text) return ''
  return /\?$/.test(text) ? text : `${text}?`
}

function buildTwoSentenceTalkTrack(problemSentence: string, questionSentence: string) {
  return simplifyTalkTrackLanguage(
    [ensureSentence(problemSentence), ensureQuestionSentence(questionSentence)]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function enforceIndustryTalkTrackGuardrails(talkTrack: string, account: AccountRow, candidate: ResearchHit | null) {
  const text = cleanText(talkTrack)
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  const cluster = inferIndustryCluster(account, candidate)

  if (hasGolfClubSignals(accountText) && /\b(retail|hotel|guest rooms?|sanctuary|worship|church|restaurant|showroom)\b/i.test(text)) {
    return simplifyTalkTrackLanguage(`Often times for a golf club, clubhouse HVAC, dining, cart charging, and course irrigation can all hit the meter in different ways because the clubhouse and course run on different schedules. I'm curious, how do y'all tell whether clubhouse HVAC, dining, or course support is what moved the bill that month, or is that side of things pretty much handled?`)
  }

  if (cluster === 'hotel_owner' || cluster === 'hospitality_group') {
    if (/\b(emergency care|inpatient|imaging|lab work|hospital|clinic)\b/i.test(text)) {
      return simplifyTalkTrackLanguage(
        cluster === 'hospitality_group'
          ? `Often times for a hospitality group, it's hard to keep each property's guest rooms, laundry, and HVAC from landing on the meter in the same busy window. I'm curious, how do y'all check each hotel on its own meter to spot which property is pushing the bill, or is that side of things pretty much handled?`
          : `Often times for a hotel property, guest rooms, laundry, and HVAC can all hit the meter during the same busy window. I'm curious, how do y'all tell whether guest rooms, laundry, and HVAC are what moved the bill that month, or is that side of things pretty much handled?`
      )
    }
  }

  if (cluster === 'logistics' && hasRvSupportSignals(accountText)) {
    if (/\b(automotive dealership|service bays?|showroom|compressor|production equipment|process equipment)\b/i.test(text)) {
      return simplifyTalkTrackLanguage(`Often times for an RV support warehouse, setup bays, staging, inventory handling, and warehouse HVAC can all hit the meter in the same busy window. I'm curious, how do y'all tell whether setup bays, staging, or warehouse support is what pushed the bill, or is that side of things pretty much handled?`)
    }
  }

  if (cluster === 'logistics' && hasTruckLeasingSignals(accountText)) {
    if (/\b(dealership|showroom|customer lounge|parts counter)\b/i.test(text)) {
      return simplifyTalkTrackLanguage(`Often times for a truck leasing and rental operation, maintenance shops, fleet staging, yard lighting, and office load can all hit the meter in the same busy window. I'm curious, how do y'all tell whether maintenance shops, fleet staging, or yard lighting is what pushed the bill, or is that side of things pretty much handled?`)
    }
  }

  if (cluster === 'manufacturing' && hasRvSupportSignals(accountText)) {
    if (/\b(automotive dealership|service bays?|showroom|compressor|production equipment|process equipment)\b/i.test(text)) {
      return simplifyTalkTrackLanguage(`Often times for an RV support warehouse, setup bays, staging, inventory handling, and warehouse HVAC can all hit the meter in the same busy window. I'm curious, how do y'all tell whether setup bays, staging, or warehouse support is what pushed the bill, or is that side of things pretty much handled?`)
    }
  }

  return text
}

function buildManualTalkTrack(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext, attempt = 0) {
  const fallbackIndustryLine = buildFallbackIndustryLine(account, candidate, context)
  const fallbackQuestion = buildFallbackQuestion(account, candidate, context)
  const candidateText = `${candidate?.title || ''} ${candidate?.snippet || ''}`
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidateText}`)
  const alreadyOpen = isAlreadyOpenLocationSignal(candidateText)
  const variantSeed = `${context.seed}|${attempt}`
  const signalLineBySignal: Record<SignalFamily, string[]> = {
    acquisition: [
      `After an acquisition, somebody usually has to sort out what got inherited on the power side.`,
      `When ownership changes, the electricity setup is often the piece nobody fully cleans up right away.`,
    ],
    new_location: [
      fallbackIndustryLine,
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
      `Growth like this tends to move the load pattern before the electricity setup has caught up with it.`,
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
  const shouldUseStructuredContext = context.briefingContext.confidence !== 'low'
  const problemSentence = shouldUseStructuredContext
    ? context.briefingContext.problemFrame
    : context.signalFamily === 'industry_context'
      ? (shouldUseMarketLine ? marketLine : signalLine)
      : signalLine
  const questionSentence = context.signalFamily === 'industry_context'
    ? (shouldUseStructuredContext ? context.briefingContext.questionFrame : fallbackQuestion)
    : (shouldUseStructuredContext ? context.briefingContext.questionFrame : context.question)

  if (hasStrongTruckDealerSignals(accountText)) {
    const truckProblems = [
      `Often times for a heavy-duty truck dealership, service bays, body shop work, parts support, and training spaces can all hit the meter in the same busy window.`,
      `Often times for a truck center, diesel service and the parts counter can move the bill more than a normal showroom because the repair windows overlap.`,
      `Often times in truck sales and service, a single busy repair cycle can set the highest usage moment on that site even when the rest of the month looks normal.`,
    ]
    const truckQuestions = [
      `I'm curious, how do y'all tell whether the truck service side, body shop, or parts support is what moved the bill that month, or is that side of things pretty much handled?`,
      `I'm curious, how do y'all compare the truck service bills to see which locations are spiking, or is that side of things pretty much on autopilot?`,
      `I'm curious, how do y'all separate service bays, body shop work, and the training institute on the bill, or is that already handled?`,
    ]
    return buildTwoSentenceTalkTrack(
      pickVariant(truckProblems, variantSeed) || truckProblems[0],
      pickVariant(truckQuestions, variantSeed) || truckQuestions[0],
    )
  }

  if (hasStrongRVDealerSignals(accountText) && !hasRvSupportSignals(accountText)) {
    const rvProblems = [
      `Often times for an RV dealership, service bays, parts support, and customer waiting areas can all hit the meter in the same busy window.`,
      `Often times for a motorhome dealer, service work and showroom comfort cooling can move the bill more than a normal retail setup because the repair windows overlap.`,
      `Often times in RV sales and service, a single busy repair cycle can set the highest usage moment on that site even when the rest of the month looks normal.`,
    ]
    const rvQuestions = [
      `I'm curious, how do y'all tell whether the RV service side or parts support is what moved the bill that month, or is that side of things pretty much handled?`,
      `I'm curious, how do y'all compare the RV service bills to see which locations are spiking, or is that side of things pretty much on autopilot?`,
      `I'm curious, how do y'all separate service bays, parts support, and showroom HVAC on the bill, or is that already handled?`,
    ]
    return buildTwoSentenceTalkTrack(
      pickVariant(rvProblems, variantSeed) || rvProblems[0],
      pickVariant(rvQuestions, variantSeed) || rvQuestions[0],
    )
  }

  if (hasConstructionMachinerySupportSignals(accountText)) {
    const constructionProblems = [
      `Often times for a construction equipment sales and service business, the service bays, parts areas, equipment testing, and shop HVAC can all hit the meter in the same busy window.`,
      `Often times with construction equipment support, the bill moves more from service timing and parts handling than from a normal office setup.`,
      `Often times for a dealer-style support network, the parts room, service work, and support-space cooling can move the bill differently than a standard storefront.`,
    ]
    const constructionQuestions = [
      `I'm curious, how do y'all tell whether service work, parts areas, or equipment testing is what moved the bill that month, or is that side of things pretty much handled?`,
      `I'm curious, how do y'all separate the service side, parts areas, and equipment testing on the bill, or is that pretty much on autopilot?`,
      `I'm curious, how do y'all keep track of whether service timing or parts support is what created the heavier bill, or is that already handled?`,
    ]
    return buildTwoSentenceTalkTrack(
      pickVariant(constructionProblems, variantSeed) || constructionProblems[0],
      pickVariant(constructionQuestions, variantSeed) || constructionQuestions[0],
    )
  }

  if (hasMaterialHandlingEquipmentSignals(accountText)) {
    const materialHandlingProblems = [
      `Often times for a materials-handling equipment company, forklift charging, lift service, parts areas, warehouse support, and shop HVAC can all hit the meter in the same busy window.`,
      `Often times for forklift and warehouse-equipment suppliers, the service side, parts area, equipment charging, and shop cooling can all move the bill differently.`,
      `Often times with lift equipment and warehouse support, the bill can move from service timing and charging activity more than from a normal office setup.`,
    ]
    const materialHandlingQuestions = [
      `I'm curious, how do y'all tell whether forklift charging, service work, parts areas, or shop cooling is what moved the bill that month, or is that side of things pretty much handled?`,
      `I'm curious, how do y'all separate the service side, parts area, and equipment charging on the bill, or is that side of things pretty much on autopilot?`,
      `I'm curious, how do y'all keep track of whether the lift service work or equipment charging is what created the heavier bill, or is that pretty much handled?`,
    ]
    return buildTwoSentenceTalkTrack(
      pickVariant(materialHandlingProblems, variantSeed) || materialHandlingProblems[0],
      pickVariant(materialHandlingQuestions, variantSeed) || materialHandlingQuestions[0],
    )
  }

  return buildTwoSentenceTalkTrack(problemSentence, questionSentence)
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
  const match = /<title\b[\s\S]*?<\/title>/i.exec(html)
  return match ? stripXml(match[1]) : ''
}

/**
 * Detects whether a page title is homepage/nav boilerplate that has no signal value.
 * Titles like "Home - Company Name", "Welcome to Company Name", "Company Name | Home" etc.
 * should never be used as a signal_headline — they are meaningless as research hits.
 */
function isBoilerplatePageTitle(title: string, accountName: string): boolean {
  const t = cleanText(title)
  if (!t) return true
  const lower = t.toLowerCase()
  const companyLower = cleanCompanyNameForSearch(accountName).toLowerCase()

  // Allow high-quality descriptive headlines containing specific operations terminology
  if (/\b(distribution|logistics|manufacturing|operating context|billing context|facility|facilities|infrastructure|footprint|retailer|network)\b/i.test(lower)) {
    return false
  }

  // Skip navigation and accessibility boilerplate
  if (/^(skip to content|skip to main content|skip navigation|skip to main|skip content|skip main|menu|toggle navigation)$/i.test(t.trim())) return true

  // HTTP error and server response strings that leak into titles
  if (/^(server error|the request could not be satisfied|access denied|403 forbidden|404 not found|error 403|error 404|service unavailable|bad gateway|gateway timeout|too many requests|you are using an outdated browser)/i.test(t)) return true
  if (/^(close menu|open menu|main menu|site menu|search)$/i.test(t.trim())) return true
  if (/\byou are using an outdated browser\b/i.test(t)) return true
  if (/\bdefend your assets\b.*\boutdated browser\b/i.test(t)) return true
  if (/\buses cookies to enhance your experience\b/i.test(t)) return true
  if (/\b(performing|checking)\s+(security|site connection)\s+verification\b/i.test(t)) return true
  if (/\bsecurity service to protect against malicious bots\b/i.test(t)) return true
  if (/\brequires cookies to be enabled\b/i.test(t)) return true
  if (/\bcookies?\b.*\b(computer|browser|experience|analytics|metrics|remember|customize|privacy)\b/i.test(t)) return true
  if (/^this website stores cookies/i.test(t)) return true
  if (/\baudioeye\b/i.test(t)) return true
  if (/you don't have permission to access/i.test(t)) return true

  // Pure homepage title patterns
  if (/^home\s*[-|–]\s*/i.test(t)) return true
  if (/\s*[-|–]\s*home$/i.test(t)) return true
  if (/^welcome to\b/i.test(t)) return true
  if (/^about\s*[-|–]\s*/i.test(t)) return true
  if (/^(home|about|our company|company|contact|services|products|solutions|search|default)$/i.test(t.trim())) return true
  if (/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/)?$/i.test(t.trim())) return true
  if (/^homepage\s*[-|–]/i.test(t)) return true
  if (/\bhomepage\b/i.test(t) && t.split(/\s+/).length <= 5) return true
  if (/^why\s+[a-z0-9 &/-]{3,40}$/i.test(t.trim())) return true
  if (/^benefits\s+why\s+use\b/i.test(t.trim())) return true
  if (/^[a-z0-9 '&.-]{2,80}\s+in the news$/i.test(t.trim())) return true

  // Title is just the company name (with optional site name separator)
  const strippedCompanyChars = companyLower.replace(/[^a-z0-9]/g, '')
  const strippedTitleChars = lower.replace(/[^a-z0-9]/g, '')
  if (strippedCompanyChars.length > 3 && strippedTitleChars === strippedCompanyChars) return true

  // Title starts/ends with the domain-separator pattern and contains only company info
  if (/^[^|–-]{3,80}\s*[|–-]\s*(home|homepage|official site|official website|welcome)$/i.test(t)) return true
  if (/^(home|homepage|official site|official website|welcome)\s*[|–-]\s*[^|–-]{3,80}$/i.test(t)) return true

  // Repetitive company name check (e.g. "Shine Pediatrics At Shine Pediatrics...")
  if (companyLower.length > 3 && lower.split(companyLower).length > 2) return true

  // SEO title tags: company name followed by a marketing tagline — not a news signal
  // e.g. 'My Pharmacy USA - Find your Daily Medications Need Here'
  //      'Team Worldwide - Large Enough to Serve You'
  //      'Danmar Industries | Compressed Air Solutions | Houston TX'
  if (companyLower.length > 3 && lower.startsWith(companyLower)) {
    const afterName = lower.slice(companyLower.length).trim()
    const startsWithFiller = /^(is|at|we|our|the|your|welcome|offers|provides|serves|specializes|specialise|specialises|helping)\b/i.test(afterName)
    const startsWithSeparator = /^[-|–|,|:|]/.test(afterName)
    // Title is just the name plus a short tagline or filler phrase
    if ((startsWithSeparator && afterName.split(/\s+/).length <= 15) || (startsWithFiller && afterName.split(/\s+/).length <= 25)) return true
  }
  // Title that is just the company name with location appended (directory style)
  if (companyLower.length > 3) {
    const nameVariant = companyLower.replace(/[-|–|,|\s]+/g, '')
    const titleVariant = lower.replace(/[-|–|,|\s]+/g, '')
    if (titleVariant.startsWith(nameVariant) && titleVariant.length - nameVariant.length < 30) return true
  }

  return false
}

/**
 * Sanitizes a research hit title before sending to AI.
 * If the title is nav boilerplate, replaces it with a descriptive fallback
 * so the AI has something meaningful to work with instead of "Home - Company Name".
 */
function sanitizeResearchTitle(title: string, accountName: string, snippet: string): string {
  const titleText = cleanText(title)
  const snippetText = cleanText(snippet)
  if (/website facility and billing intel$/i.test(titleText) && hasReadyMixConcreteSignals(`${titleText} ${snippetText}`)) {
    return `${cleanText(accountName)} Ready-Mix Concrete and Aggregates Operating Context`
  }
  if (!isBoilerplatePageTitle(title, accountName)) return title
  // Try to extract a meaningful phrase from the snippet instead
  const snippetPreview = snippetText.split(/[.!?]/)[0]?.trim()
  if (snippetPreview && snippetPreview.length > 20 && snippetPreview.length < 120) {
    return snippetPreview
  }
  return `${cleanText(accountName)} Facility and Billing Intel`
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
      .replace(/<(header|nav|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
}

function stripWebsiteNavigationNoise(value: string) {
  return cleanText(value)
    .replace(/\b(HOME|ABOUT US|ABOUT|SOLUTIONS|BLOGS?|CONTACT US|CONTACT|NEWS(?:\s*&\s*EVENTS)?|STORE|SHOP|CAREERS|PRIVACY POLICY|TERMS OF USE|READ MORE|LEARN MORE|GET STARTED|SEARCH|SIGN UP FOR UPDATES|FOLLOW)\b/gi, ' ')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, ' ')
    .replace(/\b(?:pages?|menu|skip to content|subscribe|copyright|all rights reserved)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeRawNavigationText(value: string) {
  const text = cleanText(value)
  if (!text) return false
  const upperTokenCount = (text.match(/\b[A-Z]{3,}\b/g) || []).length
  const navHits = countMatchingPatterns(text, [
    /\bABOUT US\b/i,
    /\bCONTACT US\b/i,
    /\bREAD MORE\b/i,
    /\bLEARN MORE\b/i,
    /\bNEWS\s*\+\s*EVENTS\b/i,
    /\bPRIVACY POLICY\b/i,
    /\bTERMS OF USE\b/i,
  ])
  return navHits >= 2 || upperTokenCount >= 8
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

const COMPANY_NAV_BOILERPLATE_PATTERNS = [
  /create a purchase order/i,
  /acknowledge a purchase order/i,
  /create an invoice/i,
  /submit a price change/i,
  /change a promise date/i,
  /submit a quantity change/i,
  /view invoices and payments/i,
  /how to login/i,
  /\biSupplier\b/i,
  /privacy policy/i,
  /terms of use/i,
  /datasheet feed/i,
  /energy management/i,
  /brownfield expansion/i,
  /utilization of idle assets/i,
  /reliability centered maintenance/i,
  /infrastructure improvements/i,
  /materiality assessment/i,
  /sustainability roadmap/i,
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

function shouldPreferCompanyDescription(description: string, bodyText: string, url: string) {
  const cleanDescription = cleanText(description)
  if (!cleanDescription) return false

  const boilerplateHits = countMatchingPatterns([bodyText, url].join(' '), COMPANY_NAV_BOILERPLATE_PATTERNS)
  const bodyWordCount = cleanText(bodyText).split(/\s+/).filter(Boolean).length

  if (boilerplateHits >= 3) return true
  if (boilerplateHits >= 2 && bodyWordCount > 120) return true

  return cleanDescription.length >= 80 && boilerplateHits >= 1
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

  const cleanedBodyText = stripWebsiteNavigationNoise(bodyText)
  const snippet = sourceKind === 'web' && shouldPreferCompanyDescription(description, bodyText, url)
    ? description
    : extractKeywordSnippet(cleanedBodyText || bodyText) || description || (cleanedBodyText || bodyText).slice(0, 420) || title

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
  const [domainHits, broaderHits] = await Promise.all([
    fetchBingRssHits(buildSearchBuckets(account, true, hierarchyContext), 'web', 4, account),
    fetchBingRssHits(buildSearchBuckets(account, false, hierarchyContext).slice(0, 4), 'web', 3, account),
  ])
  return dedupeAndSort([...domainHits, ...broaderHits], account)
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
      return await fetchJinaPage(
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
    fetchOfficialWebsiteHits(account),
    fetchHierarchyWebsiteHits(hierarchyContext),
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

  const [officialWebsiteHits, hierarchyWebsiteHits, newsHits, bingNewsHits, webHits, linkedInHits, secSearchHits, secFilingHits] = settled.map((result: PromiseSettledResult<ResearchHit[]>) => (
    result.status === 'fulfilled' ? result.value : []
  )) as [ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[]]

  return dedupeAndSort([...newsHits, ...bingNewsHits, ...officialWebsiteHits, ...webHits, ...hierarchyWebsiteHits, ...linkedInHits, ...secSearchHits, ...secFilingHits], account)
}

type IntelligenceAngle = {
  angleName: 'budgetCertainty' | 'renewalTiming' | 'loadFactor' | 'demandResponse' | 'billingOptimization' | 'esgRenewables'
  displayName: string
  score: number
}

function determinePrimaryAndSecondaryAngles(
  account: AccountRow,
  siteContext: SiteContext | null
): { primary: string; secondary: string } {
  const angles: IntelligenceAngle[] = [
    { angleName: 'budgetCertainty', displayName: 'Budget Certainty', score: 0 },
    { angleName: 'renewalTiming', displayName: 'Renewal Timing', score: 0 },
    { angleName: 'loadFactor', displayName: 'Load Factor', score: 0 },
    { angleName: 'demandResponse', displayName: 'Demand Response', score: 0 },
    { angleName: 'billingOptimization', displayName: 'Billing Optimization', score: 0 },
    { angleName: 'esgRenewables', displayName: 'ESG & Renewables', score: 0 },
  ]

  const contractDateStr = (account as any).contract_end_date || account.metadata?.contractEndDate
  if (contractDateStr) {
    const contractDate = new Date(contractDateStr)
    const diffMs = contractDate.getTime() - Date.now()
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.4)
    if (diffMonths > 0 && diffMonths <= 12) {
      angles.find(a => a.angleName === 'renewalTiming')!.score += 15
      angles.find(a => a.angleName === 'budgetCertainty')!.score += 5
    } else if (diffMonths > 12 && diffMonths <= 24) {
      angles.find(a => a.angleName === 'renewalTiming')!.score += 8
    }
  } else {
    angles.find(a => a.angleName === 'renewalTiming')!.score += 5
  }

  const industry = (account.industry || '').toLowerCase()
  const description = (getPublicAccountDescription(account) || '').toLowerCase()
  const profile = account.metadata?.intelligenceProfile as any
  const cluster = profile?.industryCluster || ''

  const isHeavyUser = ['manufacturing', 'logistics', 'food_storage', 'cold_storage', 'industrial'].includes(cluster) || 
                      /manufactur|industrial|steel|chemical|plastics|machinery|processing|cold storage|refrigerat|warehouse|distribution/i.test(industry + ' ' + description)
  
  if (isHeavyUser) {
    angles.find(a => a.angleName === 'demandResponse')!.score += 10
    angles.find(a => a.angleName === 'loadFactor')!.score += 8
  }

  const hasMultipleMeters = (siteContext && siteContext.confirmedMeterCount > 1) || 
                            (account.service_addresses && Array.isArray(account.service_addresses) && account.service_addresses.length > 1)
  if (hasMultipleMeters) {
    angles.find(a => a.angleName === 'billingOptimization')!.score += 8
    angles.find(a => a.angleName === 'loadFactor')!.score += 5
  }

  const isNonProfit = ['school_district', 'public_sector', 'church', 'nonprofit', 'government'].includes(cluster) ||
                      /school|district|isd|academy|church|worship|ministry|charity|municipal|city of/i.test(industry + ' ' + description)
  if (isNonProfit) {
    angles.find(a => a.angleName === 'billingOptimization')!.score += 12
    angles.find(a => a.angleName === 'budgetCertainty')!.score += 10
  }

  const isBrandOrRetail = ['retail', 'restaurant', 'hotel_owner', 'hospitality_group'].includes(cluster) ||
                          /retail|restaurant|hotel|hospitality|brand|real estate|office|headquarters/i.test(industry + ' ' + description)
  if (isBrandOrRetail) {
    angles.find(a => a.angleName === 'esgRenewables')!.score += 8
    angles.find(a => a.angleName === 'budgetCertainty')!.score += 6
  }

  const employees = Number(account.employees || account.metadata?.employees || 0)
  if (employees > 0 && employees < 20) {
    angles.find(a => a.angleName === 'billingOptimization')!.score += 10
  } else if (employees >= 250) {
    angles.find(a => a.angleName === 'esgRenewables')!.score += 6
    angles.find(a => a.angleName === 'demandResponse')!.score += 8
  }

  angles.sort((a, b) => b.score - a.score)
  
  return {
    primary: angles[0].angleName,
    secondary: angles[1].angleName
  }
}

function serializeAccount(account: AccountRow) {
  return {
    id: account.id,
    intelligenceBriefHeadline: account.intelligence_brief_headline || null,
    intelligenceBriefDetail: account.intelligence_brief_detail || null,
    intelligenceBriefOpener: account.intelligence_brief_opener || null,
    intelligenceBriefTalkTrack: account.intelligence_brief_talk_track || null,
    intelligenceBriefSignalDate: account.intelligence_brief_signal_date || null,
    intelligenceBriefReportedAt: account.intelligence_brief_reported_at || null,
    intelligenceBriefSourceUrl: account.intelligence_brief_source_url || null,
    intelligenceBriefConfidenceLevel: account.intelligence_brief_confidence_level || null,
    intelligenceBriefLastRefreshedAt: account.intelligence_brief_last_refreshed_at || null,
    intelligenceBriefStatus: (account.intelligence_brief_status || 'idle') as BriefStatus,
    metadata: account.metadata || null,
  }
}

function composeBriefText(opener?: string | null, talkTrack?: string | null) {
  return [cleanText(opener), cleanText(talkTrack)].filter(Boolean).join(' ').trim()
}

function normalizeBriefSections(result: StoredBriefResult): StoredBriefResult {
  const sections = splitIntelligenceBriefSections(
    result.opener || null,
    result.talk_track || null,
  )

  return {
    ...result,
    opener: cleanText(sections.opener) || null,
    talk_track: simplifyTalkTrackLanguage(sections.talkTrack) || '',
  }
}

function buildFallbackSignalDetail(account: AccountRow, candidate: ResearchHit | null) {
  const profile = getAccountIdentityProfile(account, candidate)
  const companyName = cleanText(account.name) || 'This account'
  const location = [cleanText(account.city), cleanText(account.state)].filter(Boolean).join(', ')
  const snippet = stripWebsiteNavigationNoise(cleanText(candidate?.snippet))

  const isEventSignal = candidate && candidate.priority && candidate.priority < 8
  const verifiedFact = (isEventSignal && snippet &&
    snippet.split(/\s+/).filter(Boolean).length >= 12 &&
    !isSameAsAccountDescription(snippet, account) &&
    !/\bchoosing the right school\b/i.test(snippet) &&
    !looksLikeRawNavigationText(snippet))
      ? shortenText(snippet, 260)
      : ''

  // Fallback to local inference if profile is missing
  const cluster = profile?.industryCluster || inferIndustryCluster(account, candidate)
  const industryGuidance = buildIndustryGuidance(cluster, account, candidate) || buildSignalGuidance('industry_context', account, candidate)
  
  const companyType = profile?.companyType || industryGuidance.label || 'commercial facility'
  const operatingModel = profile?.operatingModel || (industryGuidance.focus?.length ? industryGuidance.focus.slice(0, 3).join(', ') : 'operations')
  const facilityType = profile?.facilityType || industryGuidance.label || 'commercial property'
  
  const identityKeywords = profile?.identityKeywords?.length
    ? profile.identityKeywords
    : industryGuidance.focus || []

  const powerKeywords = profile?.powerKeywords?.length
    ? profile.powerKeywords
    : industryGuidance.focus || []

  const detailText = cleanText(`${companyName} ${getPublicAccountDescription(account)} ${profile?.companyType || ''} ${identityKeywords.join(' ')} ${powerKeywords.join(' ')}`).toLowerCase()
  if (hasReadyMixConcreteSignals(detailText)) {
    const hierarchyProfile = getAccountHierarchyProfile(account)
    const parentFact = hierarchyProfile.parentName
      ? `${companyName} is tied to ${hierarchyProfile.parentName} through the parent-company relationship.`
      : ''
    const detail = [
      verifiedFact,
      parentFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and is tied to ready-mix concrete, aggregates, and construction-materials supply.`,
      `The relevant operating pieces are batching, aggregate handling, mixer-truck dispatch, yard lighting, and support equipment, not a generic manufacturing floor.`,
      `The electricity angle is checking which site activity creates the highest usage moments on that meter before those charges quietly become part of the monthly bill.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (hasFiberglassConduitSignals(detailText)) {
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and manufactures fiberglass conduit, strut, and related electrical infrastructure products.`,
      `The relevant operating pieces are winding equipment, curing ovens, resin/process areas, finishing, and plant HVAC, not food production or generic electronics.`,
      `The electricity angle is checking whether production timing and heat/process equipment are creating the highest usage moments on the meter.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (hasPalletManagementSignals(detailText)) {
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and operates a pallet management and reverse-logistics business serving warehouses, manufacturers, and distribution customers.`,
      `The relevant operating pieces are pallet retrieval, repair, recycling, sortation, inventory handling, and warehouse support, not a generic production plant.`,
      `The electricity angle is checking whether repair bays, warehouse support, and inventory cycles are creating the highest usage moments on the meter.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (hasConstructionMachinerySupportSignals(detailText)) {
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and supports construction equipment through sales, parts, and service operations.`,
      `The relevant operating pieces are concrete mixers, mortar pumps, access equipment, parts areas, service bays, and support-space HVAC, not a generic production plant.`,
      `The electricity angle is checking whether service work, parts support, and support-space load are creating the highest usage moments on the meter.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (hasIndustrialSiteLogisticsSignals(detailText)) {
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and supports petrochemical or energy plant operations through site-store logistics, inventory management, warehouse support, and delivery tracking.`,
      `The relevant operating pieces are receiving, materials handling, storage, dispatch, and support-space HVAC, not clinical care or generic freight.`,
      `The electricity angle is checking whether those busy support windows are creating the highest usage moments on the meter.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (/\bcoffee roasting|custom roasting|green beans|roasting equipment\b/i.test(detailText)) {
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and operates as a coffee roasting business serving restaurant and coffeehouse customers.`,
      `The relevant operating pieces are roasting equipment, cooling, green bean storage, packaging, and HVAC, not a restaurant dining room.`,
      `The electricity angle is checking whether roasting schedules and cooling cycles are creating the highest usage moments on the meter.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (/\b(grain-based|frozen bakery|flour mill|biscuits?|muffins?|bakery manufacturing|bakery products)\b/i.test(detailText)) {
    const multiSiteInfo = detectMultiSiteScale(account, candidate)
    const locationText = multiSiteInfo.locationCount ? ` across ${multiSiteInfo.locationCount}+ facilities` : ''
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and manufactures grain-based and frozen bakery products${locationText}.`,
      `The relevant operating pieces are mixing, milling, ovens, freezers, packaging, sanitation, and plant HVAC.`,
      `The electricity angle is checking which production windows create the highest usage moments instead of treating the facilities like generic warehouses or restaurants.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  const multiSiteInfo = detectMultiSiteScale(account, candidate)
  if (profile?.industryCluster === 'restaurant' && (multiSiteInfo.isMultiSite || /\b(franchisee groups?|restaurant group|restaurants? across|multi[-\s]?location|locations? across)\b/i.test(detailText))) {
    const locationText = multiSiteInfo.locationCount
      ? `${multiSiteInfo.locationCount}+ restaurant locations`
      : 'multiple restaurant locations'
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and operates as a restaurant group supporting ${locationText}.`,
      `The relevant operating pieces are kitchen timing, refrigeration, dining-room HVAC, and location-by-location bill review.`,
      `The electricity angle is checking which locations are creating the highest usage moments instead of treating the restaurant group like one blended bill.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (profile?.industryCluster === 'public_sector' || /\b(city of|county|municipal|public safety|utility infrastructure|public facilities)\b/i.test(detailText)) {
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and operates as a municipal or public-sector facility portfolio.`,
      `The relevant operating pieces are administrative offices, public safety, utility infrastructure, and HVAC, not a generic office building.`,
      `The electricity angle is checking whether one hot-weather spike or a few busy buildings are setting the highest usage moments on the meter.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (profile?.industryCluster === 'logistics' && hasRvSupportSignals(detailText)) {
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and operates as an RV support warehouse and assembly operation.`,
      `The relevant operating pieces are setup bays, staging, inventory handling, assembly support, and warehouse HVAC, not a dealership floor or a generic plant.`,
      `The electricity angle is checking whether those support and staging windows are creating the highest usage moments on the meter.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  if (profile?.industryCluster === 'logistics' && hasTruckLeasingSignals(detailText)) {
    const detail = [
      verifiedFact,
      `${companyName}${location ? ` is based in ${location}` : ''} and operates as a truck leasing and rental network with maintenance shops and fleet support.`,
      `The relevant operating pieces are maintenance bays, fleet staging, yard lighting, office load, and vehicle turnover, not a truck dealership floor.`,
      `The electricity angle is checking whether maintenance and staging windows are creating the highest usage moments on the meter.`,
    ].filter(Boolean).join(' ')
    return shortenText(detail, 560)
  }

  const operatingFact = `${companyName}${location ? ` is based in ${location}` : ''} and operates as ${getIndefiniteArticle(companyType)} ${companyType.toLowerCase() === 'commercial account' ? 'commercial facility' : companyType.toLowerCase()}.`
  
  const operationDetail = identityKeywords.length
    ? `The relevant operating pieces are ${identityKeywords.slice(0, 4).join(', ')}.`
    : `${operatingModel || facilityType} is the relevant operating context.`
    
  const simplifiedPowerKeywords = powerKeywords.map((keyword) => simplifyTalkTrackLanguage(keyword))
  const sellingAngle = powerKeywords.length
    ? `The electricity angle is checking whether ${humanizeDriverList(simplifiedPowerKeywords, 4)} are creating the highest usage moments before they quietly become part of the monthly bill.`
    : `The electricity angle is checking whether the facility setup still matches how the business actually uses power.`

  const parts = [
    verifiedFact,
    operatingFact,
    operationDetail,
    sellingAngle,
  ].filter(Boolean)
  
  const detail = cleanText(parts.join(' '))
  if (detail.split(/\s+/).filter(Boolean).length >= 12) {
    return shortenText(detail, 520)
  }

  const description = getPublicAccountDescription(account)
  if (description && description.split(/\s+/).filter(Boolean).length >= 12) {
    const city = cleanText(account.city)
    const state = cleanText(account.state)
    const locationText = [city, state].filter(Boolean).join(', ')
    return shortenText(`${companyName}${locationText ? ` is tied to ${locationText}` : ''}. ${description}`, 520)
  }

  return ''
}

function buildCompanyContextHeadline(account: AccountRow, candidate: ResearchHit | null = null) {
  const companyName = cleanText(account.name) || 'Company'
  const profile = getAccountIdentityProfile(account, candidate)
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()

  if (hasReadyMixConcreteSignals(text)) {
    return `${companyName} Ready-Mix Concrete and Aggregates Operating Context`
  }

  if (hasFiberglassConduitSignals(text)) {
    return `${companyName} Fiberglass Conduit Manufacturing Operating Context`
  }

  if (hasIndustrialSiteLogisticsSignals(text)) {
    return `${companyName} Petrochemical Site-Store Logistics Operating Context`
  }

  if (hasPalletManagementSignals(text)) {
    return `${companyName} Pallet Management and Reverse Logistics Operating Context`
  }

  if (/\bcoffee roasting|custom roasting|green beans|roasting equipment\b/i.test(text)) {
    return `${companyName} Coffee Roasting Production Context`
  }

  if (/\b(grain-based|frozen bakery|flour mill|biscuits?|muffins?|bakery manufacturing|bakery products)\b/i.test(text)) {
    return `${companyName} Grain-Based and Frozen Bakery Production Context`
  }

  if (hasGolfClubSignals(text)) {
    return /\b(golf club|country club|private club)\b/i.test(companyName)
      ? `${companyName} Operating Context`
      : `${companyName} Golf Club Operating Context`
  }

  if (profile?.industryCluster === 'restaurant') {
    const multiSiteInfo = detectMultiSiteScale(account, candidate)
    if (multiSiteInfo.isMultiSite) {
      const locationText = multiSiteInfo.locationCount ? `${multiSiteInfo.locationCount}+` : 'Multi-Location'
      return `${companyName} ${locationText} Restaurant Group Operating Context`
    }
    return `${companyName} Restaurant Operations and Billing Context`
  }

  if (profile?.industryCluster === 'retail') {
    if (/(grocery|supermarket|market|food market)/i.test(text)) return `${companyName} Manages Grocery Store and Refrigerated Retail Load`
    if (hasConvenienceStoreSignals(text)) return `${companyName} Operates Multi-Store Convenience Retail Footprint`
    if (hasGameRetailSignals(text)) return `${companyName} Runs Specialty Game Retail and Online Order Operations`
    if (hasStrongTruckDealerSignals(text)) return `${companyName} Runs Heavy-Duty Truck Sales and Service Operations`
    if (hasStrongRVDealerSignals(text)) return `${companyName} Runs RV Sales and Service Operations`
    if (hasStrongAutomotiveSignals(text)) return `${companyName} Manages Dealership Retail and Service Operations`
    return `${companyName} Manages Retail Store and Customer-Facing Facility Load`
  }

  if (profile?.industryCluster === 'healthcare') {
    if (hasHomeHealthHospiceSignals(text)) {
      return `${companyName} Home Health and Hospice Operating Context`
    }
    if (/(durable medical equipment|\bdme\b|home medical equipment|hospice equipment|medical supplies?)/i.test(text)) {
      return `${companyName} Durable Medical Equipment Operating Context`
    }
    if (hasStrongDentalSignals(text)) {
      return `${companyName} Dental Practice Operating Context`
    }
    if (/(blood center|bloodcare|blood bank|blood donation|blood products|blood components|transfusion|donor center|blood collection|blood processing|specialized laboratory testing)/i.test(text)) {
      return `${companyName} Blood Center Operating Context`
    }
    if (hasStrongBehavioralHealthSignals(text)) {
      return `${companyName} Behavioral Health Operating Context`
    }
    return `${companyName} Healthcare Operating Context`
  }

  if (profile?.industryCluster === 'hotel_owner') {
    if (/\b(hotel|hotels|resort|resorts|motel|inn|lodging|guest rooms?|hospitality property)\b/i.test(text)) {
      return `${companyName} Hotel Property Operating Context`
    }
    return `${companyName} Hotel Operating Context`
  }

  if (profile?.industryCluster === 'hospitality_group') {
    return `${companyName} Hospitality Group Operating Context`
  }

  if (profile?.industryCluster === 'public_sector') {
    if (/\bcounty\b/i.test(text)) {
      return `${companyName} County Government and Public Services Operating Context`
    }
    if (/\b(city|municipal)\b/i.test(text)) {
      return `${companyName} Municipal Services Operating Context`
    }
    return `${companyName} Public Sector Operating Context`
  }

  if (profile?.industryCluster === 'logistics' && hasRvSupportSignals(text)) {
    return `${companyName} RV Support Warehouse and Assembly Operating Context`
  }

  if (profile?.industryCluster === 'logistics' && hasTruckLeasingSignals(text)) {
    return `${companyName} Truck Leasing and Rental Operating Context`
  }

  if (hasRvSupportSignals(text)) {
    return `${companyName} RV Support Warehouse and Assembly Operating Context`
  }

  if (profile?.industryCluster === 'school_district') {
    if (/\b(private k-?12 school|private school|college-preparatory|day school)\b/i.test(text)) {
      return `${companyName} Private K-12 Campus Operating Context`
    }
    return `${companyName} School Campus Operating Context`
  }

  if (profile?.companyType) {
    if (hasHomeHealthHospiceSignals(text)) {
      return `${companyName} Home Health and Hospice Operating Context`
    }
    return cleanText(`${companyName} ${toTitleCase(profile.companyType)} Facility and Billing Intel`)
  }

  return cleanText(`${companyName} Facility and Billing Intel`)
}

function normalizeFinalSignalHeadline(headline: string, account: AccountRow, candidate: ResearchHit | null = null) {
  const cleaned = cleanText(headline).replace(/\s{2,}/g, ' ')
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)}`)
  const navOnlyHeadline = /^[A-Z0-9&,\s/-]{18,}$/.test(cleaned) &&
    /\b(PROPERTIES|SERVICES|OUR TEAM|NEWS|RESEARCH|CONTACT|ABOUT|CAREERS|INVESTORS|PRODUCTS|SOLUTIONS|LOCATIONS)\b/.test(cleaned) &&
    !/\b(OPENS|EXPANDS|ACQUIRES|APPOINTS|ANNOUNCES|LAUNCHES|BUILDS|BREAKS GROUND|MERGES)\b/.test(cleaned)
  if (!cleaned) return buildCompanyContextHeadline(account, null)
  if ((candidate?.priority || 0) >= 8 && (!candidate || !isOfficialCompanyAnnouncement(account, candidate))) return buildCompanyContextHeadline(account, null)
  if (isBoilerplatePageTitle(cleaned, cleanText(account.name) || '')) return buildCompanyContextHeadline(account, null)
  if (isPhoneLikeHeadline(cleaned)) return buildCompanyContextHeadline(account, null)
  if (navOnlyHeadline || looksLikeRawNavigationText(cleaned)) return buildCompanyContextHeadline(account, null)
  if (/\b(dealership|service operations|vehicle inventory|auto dealer)\b/i.test(cleaned) && !hasStrongAutomotiveSignals(accountText)) {
    return buildCompanyContextHeadline(account, null)
  }
  if (/\b(server error|close menu|open menu|security verification|site connection security|requires cookies|uses cookies|benefits why use|in the news|choosing the right school)\b/i.test(cleaned)) {
    return buildCompanyContextHeadline(account, null)
  }
  if (/\bwebsite facility and billing intel\b/i.test(cleaned)) {
    return buildCompanyContextHeadline(account, null)
  }
  if (hasRvSupportSignals(accountText)) {
    return buildCompanyContextHeadline(account, candidate)
  }
  return cleaned
}

function removeInternalSalesInstructionSentences(value: string) {
  const text = cleanText(value)
  if (!text) return ''
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\b(lewis|nodal point|seller|sales angle|strategic sales angle|lead with|should focus|can lead)\b/i.test(sentence))
    .join(' ')
    .trim()
}

function normalizeSignalDetail(detail: string, headline: string, account: AccountRow, candidate: ResearchHit | null) {
  const cleaned = simplifyTalkTrackLanguage(removeInternalSalesInstructionSentences(detail))
    .replace(/\bcommercial energy liabilities\b/gi, 'electricity cost pressure')
    .replace(/\bdemand charges?\b/gi, 'charges tied to when the site uses the most power')
    .replace(/\btransmission fee exposure\b/gi, 'cost exposure tied to when the site uses the most power')
    .replace(/\butility billing\b/gi, 'electricity bill')
    .replace(/\benergy costs?\b/gi, 'electricity costs')
    .replace(/\benergy consumption\b/gi, 'electricity usage')
    .replace(/\bsummer\s+summer peak hours\s+summer peak\b/gi, 'summer peak')
    .replace(/\bsummer peak hours\s+summer peak\b/gi, 'summer peak')
    .replace(/\bsummer\s+summer peak\b/gi, 'summer peak')
  const normalizedDetail = normalizeEntityToken(cleaned)
  const normalizedHeadline = normalizeEntityToken(headline)
  const normalizedCandidateTitle = normalizeEntityToken(candidate?.title || '')
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length

  // Detect raw scraped boilerplate: cookie banners, nav menus, homepage marketing copy
  const isScrapedBoilerplate =
    /\bcookies?\b.*\bexperience\b/i.test(cleaned) ||
    /\bI agree\b/i.test(cleaned) ||
    /\bskip to content\b/i.test(cleaned) ||
    /\blearn more\b.*\blearn more\b/i.test(cleaned) ||
    /\bchoosing the right school\b/i.test(cleaned) ||
    /\bphone:\s*\d/i.test(cleaned) ||
    (cleaned.endsWith('...') && wordCount < 40 && /^(welcome to|we are|we provide|we offer|our mission|about us)/i.test(cleaned))

  const repeatsShortDescription = isSameAsAccountDescription(cleaned, account)
  const weakDetail =
    wordCount < 12 ||
    repeatsShortDescription ||
    /^.{0,80}\bis a commercial account\b/i.test(cleaned) ||
    /\b(lewis should|lewis can|strategic sales angle|sales angle)\b/i.test(cleaned) ||
    (!!normalizedHeadline && normalizedDetail === normalizedHeadline) ||
    (!!normalizedCandidateTitle && normalizedDetail === normalizedCandidateTitle) ||
    /\b(aftermarketnews|google news|newswire|rss)\b/i.test(cleaned) ||
    looksLikeRawNavigationText(cleaned) ||
    isScrapedBoilerplate

  if (!weakDetail) return cleaned

  return buildFallbackSignalDetail(account, candidate) || cleaned
}

function validateBriefResult(result: BriefResult, candidate: ResearchHit | null, account: AccountRow) {
  const usable = Boolean(result?.usable_signal)
  let headline = cleanText(result?.signal_headline)
  if (/website facility and billing intel$/i.test(headline) && hasReadyMixConcreteSignals(cleanText(`${headline} ${getPublicAccountDescription(account)} ${candidate?.snippet || ''}`))) {
    headline = `${cleanText(account.name) || 'Company'} Ready-Mix Concrete and Aggregates Operating Context`
  }
  const detail = normalizeSignalDetail(cleanText(result?.signal_detail), headline, account, candidate)
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
    console.warn('[Intelligence Brief Validation] Missing required fields:', { usable, headline: !!headline, detail: !!detail, talkTrack: !!talkTrack, sourceUrl: !!sourceUrl, signalDate: !!signalDate })
    return null
  }

  // Reject briefs where the headline is a raw page/browser title or directory stub
  // e.g. 'Home', 'Homepage - Team Worldwide', 'Spicy Pickle profile', 'My Pharmacy USA - Find your Daily Medications Here'
  if (isBoilerplatePageTitle(headline, cleanText(account.name) || '')) {
    console.warn('[Intelligence Brief Validation] Boilerplate page title headline:', headline)
    return null
  }
  if (isPhoneLikeHeadline(headline)) {
    console.warn('[Intelligence Brief Validation] Phone-number headline:', headline)
    return null
  }
  if (/\b(dealership|service operations|vehicle inventory|auto dealer)\b/i.test(headline) && !hasStrongAutomotiveSignals(cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)}`))) {
    console.warn('[Intelligence Brief Validation] Automotive headline mismatch:', headline)
    return null
  }
  if (/\b(close menu|open menu|security verification|site connection security|requires cookies|benefits why use)\b/i.test(headline)) {
    console.warn('[Intelligence Brief Validation] Navigation/security headline:', headline)
    return null
  }
  // Reject directory profile stubs like '[Company] profile' or '[Company] - [City], [State]'
  const headlineLower = headline.toLowerCase()
  const nameLower = (cleanText(account.name) || '').toLowerCase()
  if (
    headlineLower === `${nameLower} profile` ||
    /^.{3,60}\s+profile$/i.test(headline) ||
    /^.{3,60}\s*[-|—]\s*(company overview|company profile|linkedin|yelp|yellowpages|manta|dnb|dun & bradstreet)$/i.test(headline)
  ) {
    console.warn('[Intelligence Brief Validation] Directory profile headline:', headline)
    return null
  }

  if (isStaleNewsSignal(candidate)) {
    console.warn('[Intelligence Brief Validation] Stale news signal:', candidate?.title)
    return null
  }

  if (isLikelyNonEnglishText(headline, detail, talkTrack, sourceUrl, result?.source_title || '', result?.source_domain || '')) {
    console.warn('[Intelligence Brief Validation] Likely non-English text')
    return null
  }

  const sourceHost = getHostname(sourceUrl)
  const sourceIsSec = sourceHost === 'sec.gov' || sourceHost.endsWith('.sec.gov')
  const candidateText = `${candidate?.title || ''} ${candidate?.snippet || ''}`
  const outputText = `${headline} ${detail} ${talkTrack}`
  if (/\b(sec filing|filing tied|filing about|recent filing|public filing)\b/i.test(talkTrack) && !sourceIsSec) {
    console.warn('[Intelligence Brief Validation] SEC filing reference on non-SEC source:', talkTrack)
    return null
  }
  if (/\b(acquisition|acquired|merger|buyout|takeover|ownership change|new owner|new ownership|inherited)\b/i.test(outputText) && !hasAcquisitionEvidence(candidateText)) {
    console.warn('[Intelligence Brief Validation] Mismatched acquisition claim:', outputText)
    return null
  }
  if (candidate?.priority === 2 && !isTexasRelevantLocationSignal(`${candidate?.title || ''} ${candidate?.snippet || ''} ${detail} ${talkTrack}`)) {
    console.warn('[Intelligence Brief Validation] Out of state location on priority 2 signal')
    return null
  }
  if (!isTexasRelevantLocationSignal(`${candidate?.title || ''} ${candidate?.snippet || ''} ${detail}`) && /\b(move-?in|new site|new location|new store|opening soon|opening|launching|launches)\b/i.test(talkTrack)) {
    console.warn('[Intelligence Brief Validation] New location signal not in Texas')
    return null
  }

  // Validate talk track length (two short sentences)
  const talkTrackWordCount = talkTrack.split(/\s+/).filter(Boolean).length
  const talkTrackSentenceCount = splitTalkTrackSentences(talkTrack).length
  if (talkTrackSentenceCount !== 2 || talkTrackWordCount < 14 || talkTrackWordCount > 95) {
    console.warn('[Intelligence Brief Validation] Length constraints failed:', { talkTrack, sentenceCount: talkTrackSentenceCount, wordCount: talkTrackWordCount })
    return null
  }

  // Boost confidence for high-quality official sources
  let finalConfidence = confidence || 'Medium'
  if (candidate && isOfficialCompanyAnnouncement(account, candidate)) {
    if (finalConfidence === 'Low') finalConfidence = 'Medium'
    if (finalConfidence === 'Medium') finalConfidence = 'High'
  }
  if (candidate?.sourceKind === 'web' && isCompanyWebsiteHit(account, candidate) && finalConfidence === 'Low') {
    finalConfidence = 'Medium'
  }

  return {
    signal_headline: headline,
    signal_detail: detail,
    opener: cleanText(result?.opener) || null,
    talk_track: talkTrack,
    signal_date: signalDate,
    source_date: sourceDate,
    source_url: sourceUrl,
    confidence_level: finalConfidence,
    selected_priority: candidate?.priority ?? result?.selected_priority ?? 0,
    source_title: candidate?.title || result?.source_title || '',
    source_domain: candidate?.source || result?.source_domain || '',
    angles: result?.angles,
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
  const rawTitle = isLikelyNonEnglishText(candidate?.title || '') ? '' : cleanText(candidate?.title || '')
  // Sanitize: if the title is just a browser tab / directory stub, use the snippet preview or a descriptive fallback
  const headline = sanitizeResearchTitle(rawTitle, companyName, snippet) || buildCompanyContextHeadline(account, candidate)
  let detail = buildFallbackSignalDetail(account, candidate) || getPublicAccountDescription(account) || `${companyName} is a commercial account in Texas.`
  if (detail.length < 20) {
    const city = cleanText(account.city)
    const state = cleanText(account.state)
    const industry = cleanText(account.industry)
    const locationStr = (city && state) ? ` in ${city}, ${state}` : state ? ` in ${state}` : city ? ` in ${city}` : ''
    const industryStr = industry ? ` within the ${industry.toLowerCase()} industry` : ''
    detail = `${companyName} is a commercial account${locationStr}${industryStr}.`
  }
  const talkTrack = buildManualTalkTrack(account, candidate, context, 0)

  return {
    signal_headline: shortenText(
      isBoilerplatePageTitle(headline, companyName) || /\bcompany overview\b/i.test(headline)
        ? buildCompanyContextHeadline(account, candidate)
        : headline,
      120,
    ),
    signal_detail: detail,
    opener: null,
    talk_track: talkTrack,
    signal_date: signalDate,
    source_date: sourceDate,
    source_url: sourceUrl,
    confidence_level: 'Medium',
    selected_priority: candidate?.priority ?? 9,
    source_title: candidate?.title || '',
    source_domain: candidate?.source || '',
    angles: undefined,
  }
}

function cleanCompanyNameForSearch(name: string): string {
  return cleanText(name)
    .replace(/\b(llc|inc|l\.l\.c\.|co\.|corp\.|corporation|ltd|limited|company|lp|gmbh|p\.a\.|pa)\b/gi, '')
    .replace(/[^a-z0-9\s&]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHeaderBoilerplate(text: string, companyName: string): string {
  const t = cleanText(text)
  if (!t || !companyName) return t

  const lower = t.toLowerCase()
  const cleanComp = cleanCompanyNameForSearch(companyName)
  const companyLower = cleanComp.toLowerCase()

  // Find the company name in the text
  if (companyLower.length > 2) {
    const idx = lower.indexOf(companyLower)
    if (idx > 0 && idx < 450) {
      const beforeText = lower.slice(0, idx)
      // Check if the preceding text contains navigation or announcement boilerplate keywords
      const hasNavKeywords = /\b(skip to content|skip to main|skip navigation|menu|toggle|navigation|home|about|locations|providers|careers|contact|search|pay my bill|schedule|patient|portal|login|sign in)\b/i.test(beforeText)
      
      if (hasNavKeywords) {
        return t.slice(idx)
      }
    }
  }

  // Also catch generic "Skip to content" or "Skip navigation" at the very beginning
  const skipMatch = /^\s*(skip to content|skip to main content|skip navigation|skip main|menu|toggle navigation)\b\s*[-|–|,|.]*/i.exec(t)
  if (skipMatch) {
    return t.slice(skipMatch[0].length).trim()
  }

  return t
}

/**
 * Fetches a URL via Jina AI Reader (r.jina.ai), which returns clean markdown
 * stripped of nav, cookie banners, JS warnings, and boilerplate HTML.
 * Falls back to raw HTML extraction if Jina is unavailable or times out.
 */
async function fetchJinaPage(
  url: string,
  bucket: { priority: number; label: string; query: string },
  sourceKind: ResearchSourceKind,
  titleFallback: string,
): Promise<ResearchHit | null> {
  const jinaUrl = `https://r.jina.ai/${url.replace(/^https?:\/\//i, '')}`
  try {
    const { response, text } = await fetchTextWithTimeout(
      jinaUrl,
      {
        headers: {
          'Accept': 'text/plain',
          'User-Agent': WEB_USER_AGENT,
          // Jina returns a JSON envelope when X-Return-Format is set; plain text is cleaner
          'X-Return-Format': 'text',
        },
      },
      14000,
    )
    if (!response.ok || !text || text.length < 80) {
      throw new Error(`Jina returned ${response.status}`)
    }

    // Jina plain-text output: first line is often the page title, rest is body
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    const rawTitle = lines[0] || titleFallback
    const bodyLines = lines.slice(1)
    const bodyText = bodyLines.join(' ').slice(0, 2000)

    const companyName = cleanText(titleFallback)
    const cleanCompName = companyName.replace(/\b(website|profile|site)\b/gi, '').trim()
    const cleanedBodyText = stripHeaderBoilerplate(bodyText, cleanCompName)

    // Use the raw title only if it looks meaningful; otherwise fall back to snippet
    const title = isBoilerplatePageTitle(rawTitle, companyName)
      ? sanitizeResearchTitle(rawTitle, companyName, cleanedBodyText)
      : rawTitle

    const snippet = cleanedBodyText.slice(0, 520) || title

    if (!title && !snippet) return null

    console.info('[Intelligence Brief] Jina fetch succeeded for:', url)
    return {
      priority: bucket.priority,
      label: bucket.label,
      query: bucket.query,
      title,
      url,
      snippet,
      publishedAt: null,
      source: getHostname(url) || 'web',
      sourceKind,
    }
  } catch (error) {
    console.warn('[Intelligence Brief] Jina fetch failed, falling back to raw HTML:', url, error)
    return fetchPageHit(url, bucket, sourceKind, titleFallback)
  }
}

function buildCompanyWebsiteTargets(account: AccountRow) {
  const rootUrl = getAccountWebsiteRoot(account)
  if (!rootUrl) return []

  const makeUrl = (path: string) => {
    try {
      const url = new URL(rootUrl)
      url.pathname = path
      url.search = ''
      url.hash = ''
      return url.toString()
    } catch {
      return ''
    }
  }

  return uniqueStrings([
    rootUrl,
    makeUrl('/about-us'),
    makeUrl('/about'),
    makeUrl('/company'),
    makeUrl('/our-company'),
    makeUrl('/services'),
    makeUrl('/products'),
    makeUrl('/locations'),
    makeUrl('/news'),
    makeUrl('/press'),
    makeUrl('/careers'),
    makeUrl('/pages/about-us'),
    makeUrl('/pages/about'),
  ].filter(Boolean), 10)
}

async function fetchOfficialWebsiteHits(account: AccountRow): Promise<ResearchHit[]> {
  const targets = buildCompanyWebsiteTargets(account)
  if (!targets.length) return []

  try {
    const results = await Promise.allSettled(targets.map((url, index) => fetchJinaPage(
      url,
      {
        priority: 8,
        label: index === 0 ? 'Company Website' : 'Company About Page',
        query: `${account.name} company information`,
      },
      'web',
      `${account.name} website`,
    )))
    const hits = results
      .map((result) => result.status === 'fulfilled' ? result.value : null)
      .filter(Boolean) as ResearchHit[]

    return dedupeAndSort(hits, account).slice(0, 6)
  } catch (error) {
    console.warn('[Intelligence Brief] Company website fetch failed:', error)
    return []
  }
}

async function fetchCompanyWebsiteInfo(account: AccountRow): Promise<ResearchHit | null> {
  const hits = await fetchOfficialWebsiteHits(account)
  return hits[0] || null
}

function buildCompanyProfileFallbackHit(account: AccountRow): ResearchHit | null {
  const domain = cleanText(account.website || account.domain)
  const description = getPublicAccountDescription(account)

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
  siteContext: SiteContext | null = null,
) {
  const openRouterKey = process.env.OPEN_ROUTER_API_KEY
  const geminiKey = process.env.NEXT_PUBLIC_FREE_GEMINI_KEY || process.env.GEMINI_API_KEY
  if (!openRouterKey && !geminiKey) {
    throw new Error('Neither OPEN_ROUTER_API_KEY nor GEMINI_API_KEY is configured')
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
      description: getPublicAccountDescription(account) || '',
      annual_usage: account.annual_usage || '',
      is_in_deregulated_market: isInDeregulatedMarket(account),
      is_competitor_energy_broker: isCompetitorEnergyBroker(account),
      contract_end_date: (account as any).contract_end_date || account.metadata?.contractEndDate || null,
      energy_supplier: (account as any).energy_supplier || account.metadata?.energy_supplier || null,
      rate: (account as any).rate || account.metadata?.rate || null,
      meter_count: siteContext?.confirmedMeterCount || (account.metadata?.meters && Array.isArray(account.metadata.meters) ? account.metadata.meters.length : null) || null,
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
    briefing_context: talkTrackContext.briefingContext,
    research_results: selectedCandidates.map((item) => ({
      priority: item.priority,
      bucket: item.label,
      title: isLikelyNonEnglishText(item.title)
        ? `${cleanText(account.name) || 'Company'} update`
        : sanitizeResearchTitle(item.title, account.name || '', item.snippet),
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
    site_context: siteContext ? {
      confirmed_addresses: siteContext.confirmedAddresses,
      esids: siteContext.esids,
      confirmed_meter_count: siteContext.confirmedMeterCount,
      research_inferred_locations: siteContext.researchInferredLocations,
      research_suggests_more_sites: siteContext.researchSuggestsMoreSites,
    } : null,
  }
  const audienceProfileBlock = buildAudienceProfileBlock(audienceProfile)

  const siteContextBlock = siteContext?.promptBlock ? `\n\n${siteContext.promptBlock}` : ''

  const basePrompt = `You are writing an Intelligence Brief for Nodal Point, a Texas commercial energy broker.

Use ONLY the research payload below. It may include Google News, broad web search, LinkedIn company pages/posts, SEC filings, and official company pages. Do not invent facts. Do not mention that you searched or mention LinkedIn, Google, RSS, SEC, or any source platform in the final output.
If a research result has "official_source": true, treat it as the source of record and prefer its date over a republished article when both are available for the same event.${siteContextBlock}

ADDITIONAL MULTI-ANGLE OUTPUT RULES:
You must generate a customized "headline" and "talk_track" for each of the 6 angles inside the "angles" JSON field. Do not use generic placeholders; customize them based on the company's research payload, actual products/services, and city/locations:
1. "budgetCertainty": Focus on risk management, price spikes, and budget certainty over 24-36 months.
2. "renewalTiming": Focus on contract auto-renewals, estimated renewal window, or auditing renewal terms.
3. "loadFactor": Focus on shifting usage, capacity factor, flat load vs spiky load, or peak pricing hours.
4. "demandResponse": Focus on getting paid for flexibility during grid stress (ERCOT events).
5. "billingOptimization": Focus on line-item auditing, pass-throughs, sales tax exemptions, or billing errors.
6. "esgRenewables": Focus on hitting sustainability/renewable goals without green premiums.

Each talk_track in the "angles" must be exactly 2 sentences and follow the TALK_TRACK_RULES (start with operational pacing, end with curiosity question + safety-valve).

VOICE, TONE & PERSUASION PSYCHOLOGY (Lewis Patterson's Calling Cadence & Influence):
- Tone: High-integrity, expert, disarming, low-pressure, direct. Talk peer-to-peer as if calling a friend who runs a business.
- Cadence: Use contractions naturally (y'all, y'all's, it's, don't, can't, we're). Avoid polished, formal, or high-flown sales language. Sound undeniably like Lewis Patterson calling out of the blue.
- Texas energy broker tone: Lewis Patterson is a real guy in Fort Worth. He calls out of the blue, speaks plain English, does not lecture, and translates technical terms immediately (e.g., use "charges tied to when y'all use the most power" or "peak charges that stick on the bill" instead of "demand charges" or "demand ratchet").
- Persuasion Psychology & Hypnotism Framework:
  1. Pacing: Start the talk track by pacing the prospect's actual reality. Make a statement about their operational setup that they must internally agree with (e.g., "Having those commercial bakery ovens preheating every morning...", "When y'all run those salsa packaging lines for the afternoon shift...", "Having those clinical operatory chairs filled all day..."). Pacing establishes immediate trust and drops their critical guard.
  2. Leading: Connect that paced reality to the electricity meter billing structure. Use temporal or causal links (e.g., "...which naturally pulls a heavy demand spike on the utility meter right when prices are highest," or "...which leaves that meter carrying a peak charge longer than people expect.").
  3. Presupposition: Assume they are already running a successful operation. Never use conditional "if" statements (e.g. "If you run machines" or "If you have spikes"). Presuppose the reality: "When y'all operate that CNC machinery..." or "Having that cleanroom HVAC running 24/7...".
  4. Double Bind (The Illusion of Choice): The second sentence must present a choice between two actions/states, both of which lead to a conversation rather than a rejection. Frame the choice around whether they are actively timing the market/comparing renewal options, or if that side of things is just running on autopilot. Start the question with "I'm curious..." or "How do y'all..." and end exactly with one of the safety-valve phrases.
- Scraping Flexibility & Ultimate Specificity:
  - Do NOT use generic templates or vague phrases like "operations", "usage", "facility cost creep", "the extra usage as it grows".
  - You MUST scrape the research payload, description, and website summary for specific operational nouns, products, tools, machinery, or services unique to this company (e.g., "board game shipping", "trolley maintenance", "shelter beds", "laundry setups", "clinical operatories", "tutoring sessions", "cold room refrigeration"). Weave these exact nouns into the pacing sentence. Show them you know exactly what they do, without sounding like a dry encyclopedia.
- Sound like a forensic analyst who has noticed a specific operational fact or news event about the company and wants to check how it affects their utility billing.

MARKET ELIGIBILITY RULES:
- If the account field "is_competitor_energy_broker" is true, this company is a competing energy broker or energy management consultant. Do NOT generate a normal brief. Set "usable_signal" to false and set "signal_detail" to "[COMPETITOR: This account is an energy broker or energy management firm. Do not call with a standard brief.]". Skip all other fields.
- If the account field "is_in_deregulated_market" is false, this company's headquarters is outside Texas and all other US deregulated electricity markets. Do NOT use Texas-specific ERCOT language, summer peak windows, or deregulated-market openers. If generating a brief, frame the talk track around general commercial energy cost drivers (demand, usage, HVAC, equipment), and note in signal_detail that the account may not be a Texas ERCOT account.

CONFIDENCE LEVEL RULES:
- The "confidence_level" must be exactly High, Medium, or Low:
  * "High": Specific, verified corporate/news events (e.g. new facility opening, merger/acquisition, leadership hire, major contract) sourced from official press releases, SEC filings, or reputable news articles.
  * "Medium": General verified company profiles, official homepage descriptions, or local community updates with less immediate structural/strategic impact.
  * "Low": Unverified sources, generic web directories, third-party catalogs, or fallback briefs with no company-specific updates.

OPENER RULES (Exactly two sentences):
- Must be structured EXACTLY like: "[Greeting], it's Lewis with Nodal Point, calling you out the blue here, real quick. [Signal/Research Hook], and had a curious question about y'alls electricity agreements and contracts."
- Greeting (for the first sentence) must use the contact's first name if available, e.g., 'Hey [First Name]' or 'Hey there' if no name is available.
- For example, if name is John and signal is a new location in Shenandoah, the two sentences must be: "Hey John, it's Lewis with Nodal Point, calling you out the blue here, real quick. I saw y'all are opening a new location in Shenandoah, and had a curious question about y'alls electricity agreements and contracts."
- If the brief is based on general company context or a homepage/domain (no specific news signal), frame the research hook as something Lewis noticed about THEIR business, not a generic category he researched. Use second-person language like "I was looking into your tire recycling operation in [their actual city]" or "I was looking at your compounding pharmacy footprint in [their actual city]" or "I was looking into your school district facilities in [their actual city]". Never say "I've been researching a..." and never use vague category phrases like "a manufacturing operation", "a retail account", "a logistics network", or "an office-style footprint".
- CRITICAL: The city in the opener MUST come from the Location field in COMPANY CONTEXT above. Do NOT use Fort Worth, Houston, or any other city unless that is the actual city in the Location field.
- If the account is a pallet management or reverse-logistics business, call it exactly that. Do not collapse it into a generic logistics or distribution operation.
- CRITICAL: Never use the phrase 'I saw y'all run [Company]' or 'I notice you run [Company]'.
- Must end the second sentence exactly with ", and had a curious question about y'alls electricity agreements and contracts."
- Do NOT repeat words or phrases redundantly.

TALK_TRACK_RULES (Exactly two sentences):
- Sentence 1: A specific, plain-English problem or situational struggle tied to the company's real operations. You MUST customize it to weave in specific, concrete details of this company's actual business (e.g., naming their specific products, services, operations, or equipment found in the description/research, like "tutoring rooms", "trolleys", "bakery ovens", "salsa packaging lines", "shelter facilities") to show you know their specific business. Do NOT just use generic industry templates or placeholders. It can start with "Often times..." only if that sounds natural; do not force the same sentence pattern every time.
- Sentence 2: One short curiosity question that invites them to explain how they handle it. It MUST start with "I'm curious..." or "How do y'all..." and end exactly with one of these safety-valve phrases: ", or is that pretty much on autopilot?" or ", or is that side of things pretty much on autopilot?" or ", or is that pretty much handled?" or ", or is that side of things pretty much handled?".
- Use structuredFacts first. The talk track must mention at least one concrete activity, product, equipment type, or energy driver from structuredFacts. If structuredFacts says the company supplies/services equipment, do not talk as if they manufacture or operate their customers' facilities.
- Use the problemFrame and questionFrame ONLY as a conceptual guide for the underlying electricity mechanic (e.g. demand spikes, seasonal HVAC, refrigeration, laundry load). Do NOT copy them verbatim. You MUST rewrite the problem and question to incorporate specific details of this company's actual business.
- CRITICAL: The talk track MUST consist of exactly these two sentences. Not one, not three. Exactly two.
- CRITICAL: The word count of the talk track MUST be between 15 and 85 words.
- CRITICAL: Do NOT use "care about" or "usually care about" statements. Do NOT make assumptions about what the prospect cares about.
- CRITICAL: The opener and the talk track sentences must start with a capitalized letter.
- Do NOT use confusing jargon like "Coincident Kitchen Peak" or "load factor" or "demand ratchet" directly. Instead, explain the billing mechanic simply in everyday language: "one high-usage month can leave that meter carrying a higher charge longer than people expect."
- Do NOT use first-person curiosity language like "I was curious about" or "I was looking at" in the first sentence.
- The Talk Track MUST connect the specific operational details of the signal (e.g., "culinary program kitchen equipment", "trailer fabrication machinery", "flight simulator electricity draw", "commercial freight warehousing") directly to how that specific activity consumes power. Be forensic and concrete about the actual machinery, equipment, or facility type involved in the news.
- Never use generic placeholders or vague phrases like "the extra usage as it grows" or "changes the bill before anyone notices."
- Avoid forbidden phrases: "the useful check", "the useful check is whether", "most operators care about", "most leaders care about", "trim waste", "budget predictability", "save money", "improve efficiency", "how the business runs today", "looking at the setup", "staple", "long-standing", "fixture", "current setup", "site by site", "what most operators need to know", "what most leaders care about", "I was looking at the operational footprint", "I came across your website", "I came across [company]'s website", "I was curious about", "I would want", "I would watch", "I would ask", "I was reviewing", "headcount or capex", "rate", "rates", "pricing", "savings", "lower cost", "better price", "consultation", "help you".`

  const newsSignalPrompt = `${basePrompt}

Decision rules:
- Pick ONE signal only.
- Use the highest-priority signal supported by the research results.
- If the payload includes an identity_profile block, use it as the operating identity guardrail for the account unless the research clearly proves it wrong.
- If an audience_profile block is present, use it as the human lens for the talk track. Use the person's title to shape the question or second sentence. If you use their first name, keep it after the company fact, not before it. Treat LinkedIn/about/work-history clues as internal only.
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
- A "usable news signal" is a specific event, announcement, press release, SEC filing, or news story that has occurred recently (e.g. facility openings, new programs, acquisitions, hires, financial reports).
- Do NOT treat root homepages, generic landing pages, or basic directory listings (such as Yelp, YellowPages, or main corporate homepages) as news signals.
- Do NOT use any source with a URL from news.google.com or Google News RSS. If all candidates are Google News RSS, set usable_signal to false.
- If the research payload only contains basic website descriptions, generic homepages, or search results that are just the company's main homepage, you MUST set "usable_signal" to false. This is critical so the system can transition to fallback mode and build a clean industry context brief.
- Signal Headline must be a meaningful, human-readable summary of the actual event or company context — NEVER a raw page title, browser tab title, domain name, or the company name alone. Do NOT output anything like "Home - Lincoln Manufacturing, Inc." or "Welcome to Acme Corp" as the headline. Write it as a real intelligence insight: e.g. "Lincoln Manufacturing Expands Oil Field Threading Operations in Texas" or "Avalanche Food Group Opens Bread Zeppelin Location in Shenandoah."
- Signal Detail must be a dense, strategic sales-intelligence summary of the event (exactly 3 to 4 sentences). Do NOT just write a generic company description or bullet points of what they do. Instead, describe:
  1. The operational power-use profile of the company (e.g. "operating 24/7 cleanrooms and refrigeration", "running high-volume CNC machinery", "running classroom HVAC across a school district").
  2. The specific commercial energy liabilities they face (e.g. "heavy demand ratchet exposure from starting up large motors", "high summer 4CP coincident peak liability from comfort cooling during ERCOT scarcity periods", "seasonal budget volatility from HVAC peak load").
  3. The strategic sales angle/pain point for Lewis to lead with (e.g. "leverage contract review to check for demand ratchet floors", "lead with active peak timing during summer 4CP hours to eliminate transmission liability", "discuss seasonal predictability and contract structuring").
- Talk Track must be UNIQUE to the specific signal found. Do NOT use generic templates.
- Talk Track should sound like a real person who actually researched this company, not a script.
- Talk Track must be exactly 2 short sentences. Sentence 1 is the problem or observation. Sentence 2 is the question. Use conversational language.
- Do not say "the useful check" or state what leaders "usually care about". State one specific problem in plain English, then ask one plain curiosity question.
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
- For behavioral health and psychiatric hospitals, use patient safety, patient comfort, inpatient units, residential treatment, partial hospitalization, intensive outpatient programs, counseling space, and 24-hour facility reliability when the source supports it. Do not use emergency-room, imaging, lab, manufacturing, restaurant, or logistics language unless the source explicitly says those settings exist.
- For compounding pharmacies, use pharmacy and cleanroom language: cleanroom HVAC, product refrigeration, compounding setups, and retail flow. Do not use hospital, emergency department, inpatient, or short-stay-room language unless the source explicitly confirms a hospital setting.
- Use the market season fields in talk_track_context to decide whether summer volatility, winter reliability, or a shoulder-season budget reset is the better lead. Keep the market note to one short clause or one short sentence.
- For the "opener" field, generate the opener following the OPENER RULES. Do not write it into the "talk_track" field.
- Start with the concrete event, company fact, or facility detail, then end with one direct question.
- If you can name the event, keep it specific instead of saying "I saw a report about [company]." Example: "Lambda is moving into Aligned's DFW-04 data center in Plano."
- If you cannot name the event clearly, use a plain website or company update detail instead.
- Write in English only. If any source text is not English, ignore it and do not echo it back.
- Confidence Level must be exactly High, Medium, or Low.
- Source URL must be one of the supplied URLs.
- Signal Date should be the event or article date in YYYY-MM-DD if available; otherwise use the closest approximate date from the research results.
- Source Date should be the publication date of the report, article, post, filing, or company announcement in YYYY-MM-DD if available; otherwise use the closest approximate published date from the research results.
- Use the briefing_context inside the research payload as the source of truth for the sales angle. The signal is the reason for the call; company identity, operational drivers, and audience profile decide the talk track.
- Use the talk_track_context block below as supporting context. It includes the signal family, market season, guardrails, and suggested question shape.
- For the "opener" field, generate the opener following the OPENER RULES. Do not write it into the "talk_track" field.
- Rotate the problem sentence and question wording. Do not always sound the same.
- Make the talk track specific to the signal and the industry, not just the company name.
- Do not mention an industry that is not the account's actual industry. If you use an industry reference, it must match the account.
- Respect the identity profile keywords and guardrails. If the identity profile says hospital operator, do not drift into hotel or hospitality language. If it says food manufacturer, do not drift into warehouse language.
- If an audience profile is present, do not blend multiple people into one voice. The selected audience profile already follows this priority: active/pending task contact, decision-maker card, active sequence contact, then fallback.
- Respect the hierarchy context. If the account is a subsidiary, write the brief around the subsidiary's actual business and use the parent only to orient the reader. If the account is a parent company, it is fine to mention the portfolio or network, but keep the talk track meter-specific and location-aware.
- If the company description or source text names specific products or services, use those exact nouns in the first sentence when they matter. Do not replace them with generic words like "operation" or "footprint."
- Do not imply the electricity agreement creates demand spikes. Spikes come from how the site is being used; contract structure only changes how those spikes show up on the bill.
- Do not echo page titles, inventory copy, catalog language, or storefront language back into the talk track.
- Avoid the phrases listed in talk_track_context. If the response starts sounding generic, rewrite it.
- If market context is secondary, keep it to one short clause or leave it out.
- If an audience profile is present, make the talk track feel aimed at that person, not just the company. Mention the first name once only after the company fact if it still sounds natural.

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
- Create a headline that positions the company within their industry context. The headline must be a meaningful intelligence insight — NEVER a raw page title, browser tab title, or the company name alone. Write it like a research analyst would: e.g. "Texas-Based Oil Field Equipment Manufacturer with Multi-Site Production Footprint" or "Multi-Location Restaurant Group Operating Across Houston Metro."
- Signal Detail must be a dense, strategic sales-intelligence summary (exactly 3 to 4 sentences). Do NOT just write a generic company description or bullet points of what they do. Instead, describe:
  1. Their actual operational power-use profile (e.g. "operating 24/7 cleanrooms and refrigeration", "running high-volume CNC machinery", "running classroom HVAC across a school district").
  2. The specific commercial energy liabilities they face (e.g. "heavy demand ratchet exposure from starting up large motors", "high summer 4CP coincident peak liability from comfort cooling during ERCOT scarcity periods", "seasonal budget volatility from HVAC peak load").
  3. The strategic sales angle/pain point for Lewis to lead with (e.g. "leverage contract review to check for demand ratchet floors", "lead with active peak timing during summer 4CP hours to eliminate transmission liability", "discuss seasonal predictability and contract structuring").
- Talk Track must be UNIQUE based on what you learned about the company. Do NOT use templates. You MUST customize the talk track to weave in specific, concrete details of this company's actual business (e.g., naming their specific products, services, operations, or equipment found in the description/research, like "tutoring rooms", "trolleys", "bakery ovens", "salsa packaging lines", "shelter facilities") to show you know their specific business. Do NOT just use generic industry templates or placeholders.
- Talk Track should sound like you actually researched this specific company.
- Use structuredFacts first. The talk track must mention at least one concrete activity, product, equipment type, or energy driver from structuredFacts. If structuredFacts says the company supplies/services equipment, do not talk as if they manufacture or operate their customers' facilities.
- Use the problemFrame and questionFrame in the context ONLY as a conceptual guide for the underlying electricity mechanic (e.g. demand spikes, seasonal HVAC, refrigeration, laundry load). Do NOT copy them verbatim. You MUST rewrite the problem and question to incorporate specific details of this company's actual business.
- Talk Track must be exactly 2 short sentences. Sentence 1 is the problem or observation. Sentence 2 is the question. Use conversational language. Not one, not three. Exactly two.
- Sentence 2 MUST start with "I'm curious..." or "How do y'all..." and end exactly with one of these safety-valve phrases: ", or is that pretty much on autopilot?" or ", or is that side of things pretty much on autopilot?" or ", or is that pretty much handled?" or ", or is that side of things pretty much handled?".
- The word count of the talk track MUST be between 15 and 85 words.
- Do not say "the useful check" or state what leaders "usually care about". State one specific problem in plain English, then ask one plain curiosity question.
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
- For behavioral health and psychiatric hospitals, use patient safety, patient comfort, inpatient units, residential treatment, partial hospitalization, intensive outpatient programs, counseling space, and 24-hour facility reliability when the source supports it. Do not use emergency-room, imaging, lab, manufacturing, restaurant, or logistics language unless the source explicitly says those settings exist.
- For compounding pharmacies, use pharmacy and cleanroom language: cleanroom HVAC, product refrigeration, compounding setups, and retail flow. Do not use hospital, emergency department, inpatient, or short-stay-room language unless the source explicitly confirms a hospital setting.
- For school districts specifically, talk about campus calendars, athletics, cafeterias, classroom technology, and summer HVAC. Do not use factory language like shifts, production, or startup, and do not use dental or medical practice language like practices, operatories, clinics, or patient flow unless the source explicitly says that.
- Use the market season fields in talk_track_context to decide whether summer volatility, winter reliability, or a shoulder-season budget reset should lead. Keep the market note brief if you use it.
- For the "opener" field, generate the opener following the OPENER RULES. Do not write it into the "talk_track" field.
- Start with the concrete business fact or footprint detail, then end with one direct question. For website-only fallback, name the actual business fact from the site instead of saying you found the website.
- If the sentence cannot name the event clearly, keep it plain and specific anyway.
- Write in English only. If any source text is not English, ignore it and do not echo it back.
- If the company site has an announcement or news page, treat that as the original source and use its publish date when available.
- Use short sentences and contractions. Sound plainspoken, not polished.
- Prefer "bill" or "power side" over "utility side".
- Confidence Level should be "Medium" for fallback briefs.
- Source URL should be the company website or the most relevant industry trend article.
- Signal Date should be today's date in YYYY-MM-DD format.
- Source Date should be today's date in YYYY-MM-DD format if you used the company website or trend article, or the page's publish date if the source includes one.
- Use the briefing_context inside the research payload as the source of truth for the sales angle. If there is no fresh news, lean harder on the company identity, operational drivers, and audience profile.
- Use the talk_track_context block below as supporting context. It includes the signal family, market season, guardrails, and suggested question shape.
- If an audience_profile block is present, use it as the human lens. Keep the first name or title tied to the business question instead of generic company language.
- For the "opener" field, generate the opener following the OPENER RULES. Do not write it into the "talk_track" field.
- Rotate the problem sentence and question wording. Do not always sound the same.
- Make it sound like a plainspoken Texas commercial electricity rep who has done the homework on the business, not a generic broker script.
- Do not mention an industry that is not the account's actual industry. If you use an industry reference, it must match the account.
- Do not imply the electricity agreement creates demand spikes. Spikes come from usage, scheduling, and equipment; the contract only affects the cost exposure.
- Do not echo page titles, inventory copy, catalog language, or storefront language back into the talk track.
- Avoid the phrases listed in talk_track_context. If the response starts sounding generic, rewrite it.
- If market context is secondary, keep it to one short clause or leave it out.
- Extract specific physical machinery, production equipment, facility details, or heavy operational assets mentioned in the company description or research payload (such as "CNC routers", "thermoforming lines", "powder coat ovens", "MIG/TIG welding", "extruders", "injection molding", "chillers", "refrigeration compressors", or "stamping presses").
- You MUST explicitly reference these specific equipment/machinery assets inside the talk track and opportunity angle prompts to make the conversation extremely personalized to their physical operations, instead of using generic placeholder words like "production equipment", "facility operations", or "manufacturing processes".

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
  "opener": "",
  "talk_track": "",
  "signal_date": "YYYY-MM-DD",
  "source_date": "YYYY-MM-DD",
  "source_url": "",
  "confidence_level": "High|Medium|Low",
  "selected_priority": 1,
  "source_title": "",
  "source_domain": "",
  "angles": {
    "budgetCertainty": { "headline": "Short customized headline (not generic, e.g., 'Budget Stability and Price-Spike Protection for [Company]')", "talk_track": "2-sentence customized talk track pacing their operations and ending with a safety-valve question" },
    "renewalTiming": { "headline": "Short customized headline", "talk_track": "2-sentence customized talk track" },
    "loadFactor": { "headline": "Short customized headline", "talk_track": "2-sentence customized talk track" },
    "demandResponse": { "headline": "Short customized headline", "talk_track": "2-sentence customized talk track" },
    "billingOptimization": { "headline": "Short customized headline", "talk_track": "2-sentence customized talk track" },
    "esgRenewables": { "headline": "Short customized headline", "talk_track": "2-sentence customized talk track" }
  }
}

TALK_TRACK_CONTEXT:
${talkTrackContextJson}

${audienceProfileBlock ? `AUDIENCE_PROFILE:\n${audienceProfileBlock}\n` : ''}

RESEARCH PAYLOAD:
${JSON.stringify(researchPayload, null, 2)}`

  let rawContent = ''
  let openRouterFailed = false

  if (openRouterKey) {
    try {
      const { response, text } = await fetchTextWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': process.env.API_BASE_URL || 'https://nodalpoint.io',
          'X-Title': 'Nodal Point Intelligence Brief',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: fullPrompt },
            { role: 'user', content: 'Generate the account intelligence brief now.' },
          ],
          temperature: isFallbackMode ? 0.3 : 0.2,
          max_tokens: 4000,
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

      const content = cleanText(responseBody?.choices?.[0]?.message?.content)
      if (!content) {
        throw new Error('OpenRouter returned an empty model response')
      }
      rawContent = content
    } catch (err: any) {
      console.warn('[Intelligence Brief] OpenRouter call failed, falling back to direct Gemini API...', err.message)
      openRouterFailed = true
    }
  } else {
    openRouterFailed = true
  }

  if (openRouterFailed) {
    if (!geminiKey) {
      throw new Error('OpenRouter failed and no direct Gemini API key (NEXT_PUBLIC_FREE_GEMINI_KEY) is configured')
    }
    console.log('[Intelligence Brief] Calling Google Generative AI direct API fallback...')
    const genAI = new GoogleGenerativeAI(geminiKey)
    const modelsToTry = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-pro-latest', 'gemini-2.0-flash-lite']
    let responseText = ''
    let lastError = null

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Intelligence Brief] Attempting direct Gemini API with model: ${modelName}`)
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: fullPrompt,
        })
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `TALK_TRACK_CONTEXT:\n${talkTrackContextJson}\n\n${audienceProfileBlock ? `AUDIENCE_PROFILE:\n${audienceProfileBlock}\n` : ''}\n\nRESEARCH PAYLOAD:\n${JSON.stringify(researchPayload, null, 2)}` }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: isFallbackMode ? 0.3 : 0.2,
          }
        })
        const text = result.response.text()?.trim()
        if (text) {
          responseText = text
          console.log(`[Intelligence Brief] Direct Gemini API call succeeded with model: ${modelName}`)
          break
        }
      } catch (err: any) {
        console.warn(`[Intelligence Brief] Direct Gemini API failed for model ${modelName}:`, err.message)
        lastError = err
      }
    }

    if (!responseText) {
      throw new Error(`Direct Gemini API failed for all models. Last error: ${lastError?.message || 'Unknown'}`)
    }
    rawContent = cleanText(responseText)
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

    const audienceProfile = await resolveAudienceProfileForBrief(account as AccountRow)
    // Fetch meters in parallel with audience profile — non-blocking, fails gracefully
    const accountMeters = await fetchAccountMeters(accountId)

    const privileged = auth.isAdmin || auth.role === 'dev'
    const ownerScopeValues = buildOwnerScopeValues(auth.user)
    const accountOwner = cleanText(account.ownerId).toLowerCase()
    const allowed = privileged || !accountOwner || ownerScopeValues.map((value) => value.toLowerCase()).includes(accountOwner)

    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'You do not have access to refresh this account' })
    }

    const { action, angleKey } = req.body || {}
    if (action === 'select_angle') {
      if (!angleKey) {
        return res.status(400).json({ ok: false, message: 'Missing angleKey' })
      }

      const meta = getAccountMetadata(account as AccountRow)
      const briefAngles = meta.intelligenceBriefAngles as Record<string, any> | null
      const allAngles = briefAngles?.all as Record<string, any> | null
      const selectedAngle = allAngles?.[angleKey]

      if (!selectedAngle || !selectedAngle.talk_track) {
        return res.status(400).json({ ok: false, message: `Angle ${angleKey} data not found on this account` })
      }

      const nextMetadata = {
        ...meta,
        intelligenceBriefAngles: {
          ...briefAngles,
          primary: angleKey,
        }
      }

      const updatePayload: Record<string, any> = {
        intelligence_brief_headline: selectedAngle.headline || account.intelligence_brief_headline,
        intelligence_brief_talk_track: simplifyTalkTrackLanguage(selectedAngle.talk_track),
        metadata: nextMetadata,
        intelligence_brief_last_refreshed_at: new Date().toISOString()
      }

      const { data: updatedAccount, error: updateError } = await supabaseAdmin
        .from('accounts')
        .update(updatePayload)
        .eq('id', accountId)
        .select(ACCOUNT_SELECT)
        .single()

      if (updateError) {
        console.error('[Intelligence Brief] Angle update failed:', updateError)
        return res.status(500).json({ ok: false, message: 'Failed to update selected angle', detail: updateError.message })
      }

      return res.status(200).json({
        ok: true,
        message: `Primary angle updated to ${angleKey}.`,
        account: serializeAccount(updatedAccount as AccountRow)
      })
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

    if (isCompetitorEnergyBroker(account as AccountRow)) {
      const now = new Date().toISOString()
      const competitorBrief: StoredBriefResult = {
        usable_signal: true,
        signal_headline: 'Competitor Energy Broker / Energy Management Firm',
        signal_detail: `${cleanText(account.name) || 'This account'} appears to be an energy broker, energy consultant, or energy management firm. Do not use a standard prospecting brief for this account unless the goal is a referral, partnership, or competitive-intelligence conversation.`,
        opener: null,
        talk_track: 'This is not a normal prospect call because they already work in energy procurement or energy management. If you call them, the angle should be referral or partnership fit, not reviewing their electricity bill.',
        signal_date: now.slice(0, 10),
        source_date: now.slice(0, 10),
        source_url: account.domain ? `https://${cleanText(account.domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '',
        confidence_level: 'High',
        selected_priority: 9,
        source_title: 'Competitor account guardrail',
        source_domain: account.domain || '',
      }

      const { data: updatedAccount, error: updateError } = await supabaseAdmin
        .from('accounts')
        .update({
          intelligence_brief_status: 'ready',
          intelligence_brief_last_refreshed_at: now,
          intelligence_brief_headline: competitorBrief.signal_headline,
          intelligence_brief_detail: competitorBrief.signal_detail,
          intelligence_brief_opener: null,
          intelligence_brief_talk_track: competitorBrief.talk_track,
          intelligence_brief_signal_date: competitorBrief.signal_date,
          intelligence_brief_reported_at: competitorBrief.source_date,
          intelligence_brief_source_url: competitorBrief.source_url,
          intelligence_brief_confidence_level: competitorBrief.confidence_level,
        })
        .eq('id', accountId)
        .select(ACCOUNT_SELECT)
        .single()

      if (updateError) {
        console.error('[Intelligence Brief] Competitor account update failed:', updateError)
        return res.status(200).json({ ok: false, message: FALLBACK_MESSAGE, detail: updateError.message, account: serializeAccount(account) })
      }

      return res.status(200).json({
        ok: true,
        message: 'Account flagged as energy-broker competitor. Standard prospecting brief skipped.',
        brief: competitorBrief,
        account: serializeAccount(updatedAccount as AccountRow),
        diagnostics: buildResearchDiagnostics([]),
        usedFallback: false,
        inferredCluster: 'unknown',
      })
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
            intelligenceHierarchyContext: hierarchyContext ? {
              organizationRole: hierarchyContext.organizationRole,
              parent: hierarchyContext.parent ? {
                name: hierarchyContext.parent.name,
                website: hierarchyContext.parent.website,
                city: hierarchyContext.parent.city,
                state: hierarchyContext.parent.state,
              } : null,
              subsidiaries: hierarchyContext.subsidiaries.slice(0, 6).map((item) => ({
                name: item.name,
                website: item.website,
                city: item.city,
                state: item.state,
              })),
            } : null,
          },
        }
      : account as AccountRow
    const diagnostics = buildResearchDiagnostics(candidateResults)

    // Build site context after candidates are collected so research-inferred locations are available
    const siteContext = buildSiteContext(
      accountMeters,
      account.service_addresses,
      candidateResults,
      briefingAccount,
    )
    console.info('[Intelligence Brief] Site context built:', {
      accountId,
      confirmedAddresses: siteContext.confirmedAddresses.length,
      meterCount: siteContext.confirmedMeterCount,
      researchSuggestsMoreSites: siteContext.researchSuggestsMoreSites,
    })

    console.info('[Intelligence Brief] Research candidates collected:', {
      accountId,
      accountName: briefingAccount.name,
      total: diagnostics.total,
      bySourceKind: diagnostics.bySourceKind,
    })

    let outcomeStatus: BriefStatus = 'empty'
    let validated: StoredBriefResult | null = null
    let generatedBrief: StoredBriefResult | null = null
    let usedFallback = false
    let rescueCandidates = candidateResults

    if (candidateResults.length > 0) {
      try {
        generatedBrief = await runOpenRouterResearch(briefingAccount, candidateResults, false, hierarchyContext, hierarchyWebsiteHits, audienceProfile, siteContext)
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
          
          generatedBrief = await runOpenRouterResearch(briefingAccount, fallbackCandidates, true, hierarchyContext, hierarchyWebsiteHits, audienceProfile, siteContext)
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
      const aiBriefParts = await generateAITalkTrack(briefingAccount, null, fallbackContext, siteContext)
      
      if (aiBriefParts) {
        // Create a minimal brief with the AI opener and talk track
        validated = {
          signal_headline: buildCompanyContextHeadline(briefingAccount, null),
          signal_detail: buildFallbackSignalDetail(briefingAccount, null) || `${cleanText(briefingAccount.name) || 'This account'} needs a company-specific electricity review based on its facility type and operating model.`,
          opener: aiBriefParts.opener,
          talk_track: aiBriefParts.talk_track,
          signal_date: new Date().toISOString().slice(0, 10),
          source_date: new Date().toISOString().slice(0, 10),
          source_url: briefingAccount.domain ? `https://${cleanText(briefingAccount.domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '',
          confidence_level: 'Medium',
          selected_priority: 9,
          source_title: 'Industry Context',
          source_domain: briefingAccount.domain || '',
        }
        outcomeStatus = 'ready'
        usedFallback = true
        console.info('[Intelligence Brief] Successfully generated AI opener and talk track for empty signal case:', {
          accountId,
          talkTrackLength: aiBriefParts.talk_track.length,
        })
      } else {
        // AI generation failed, use manual template as last resort
        console.warn('[Intelligence Brief] AI talk track generation failed, using manual template fallback:', {
          accountId,
          accountName: briefingAccount.name,
        })
        
        const manualTalkTrack = buildManualTalkTrack(briefingAccount, null, fallbackContext, 0)
        
        validated = {
          signal_headline: buildCompanyContextHeadline(briefingAccount, null),
          signal_detail: buildFallbackSignalDetail(briefingAccount, null) || `${cleanText(briefingAccount.name) || 'This account'} needs a company-specific electricity review based on its facility type and operating model.`,
          talk_track: manualTalkTrack,
          signal_date: new Date().toISOString().slice(0, 10),
          source_date: new Date().toISOString().slice(0, 10),
          source_url: briefingAccount.domain ? `https://${cleanText(briefingAccount.domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '',
          confidence_level: 'Medium',
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
    const previousTalkTrack = composeBriefText(
      briefingAccount.intelligence_brief_opener,
      briefingAccount.intelligence_brief_talk_track,
    )
    if (validated) {
      const shouldRewrite = talkTrackNeedsRewrite(validated.talk_track || '', talkTrackRewriteContext, briefingAccount, talkTrackCandidate) ||
        (previousTalkTrack && talkTrackIsTooSimilarToPrevious(validated.talk_track || '', previousTalkTrack)) ||
        talkTrackCache.isTooSimilar(validated.talk_track || '')

      if (shouldRewrite) {
        let rewrittenParts: { opener: string; talk_track: string } | null = null
        
        // Always try AI generation first for rewrites
        rewrittenParts = await generateAITalkTrack(briefingAccount, talkTrackCandidate, talkTrackRewriteContext, siteContext)
        
        // Validate AI-generated talk track
        if (rewrittenParts) {
          if (talkTrackNeedsRewrite(rewrittenParts.talk_track, talkTrackRewriteContext, briefingAccount, talkTrackCandidate) ||
              (previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenParts.talk_track, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenParts.talk_track)) {
            console.warn('[Intelligence Brief] AI-generated talk track failed validation, falling back to manual')
            rewrittenParts = null
          }
        }
        
        // Fall back to manual generation if AI failed or not applicable
        if (rewrittenParts) {
          validated = {
            ...validated,
            opener: rewrittenParts.opener,
            talk_track: rewrittenParts.talk_track,
          }
        } else {
          let rewrittenTalkTrack = buildManualTalkTrack(briefingAccount, talkTrackCandidate, talkTrackRewriteContext, 0)

          // Check against cache and previous talk track
          if ((previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenTalkTrack)) {
            rewrittenTalkTrack = buildManualTalkTrack(briefingAccount, talkTrackCandidate, talkTrackRewriteContext, 1)
          }

          if ((previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenTalkTrack)) {
            rewrittenTalkTrack = buildManualTalkTrack(briefingAccount, talkTrackCandidate, talkTrackRewriteContext, 2)
          }

          validated = {
            ...validated,
            talk_track: rewrittenTalkTrack,
          }
        }
      }

      const finalHeadline = normalizeFinalSignalHeadline(validated.signal_headline || '', briefingAccount, talkTrackCandidate)
      const rawFinalTalkTrack = simplifyTalkTrackLanguage(validated.talk_track || '')
      const accountText = cleanText(`${briefingAccount.name || ''} ${briefingAccount.industry || ''} ${getPublicAccountDescription(briefingAccount)} ${getAccountNotes(briefingAccount)} ${talkTrackCandidate?.title || ''} ${talkTrackCandidate?.snippet || ''}`).toLowerCase()
      let finalTalkTrack = rawFinalTalkTrack

      if ((identityProfile?.industryCluster === 'hotel_owner' || identityProfile?.industryCluster === 'hospitality_group') &&
        /\b(emergency care|inpatient|imaging|lab work|hospital|clinic)\b/i.test(rawFinalTalkTrack)) {
        finalTalkTrack = identityProfile?.industryCluster === 'hospitality_group'
          ? `Often times for a hospitality group, it's hard to keep each property's guest rooms, laundry, and HVAC from landing on the meter in the same busy window. I'm curious, how do y'all check each hotel on its own meter to spot which property is pushing the bill, or is that side of things pretty much handled?`
          : `Often times for a hotel property, guest rooms, laundry, and HVAC can all hit the meter during the same busy window. I'm curious, how do y'all tell whether guest rooms, laundry, and HVAC are what moved the bill that month, or is that side of things pretty much handled?`
      }

      if ((identityProfile?.industryCluster === 'logistics' || identityProfile?.industryCluster === 'manufacturing') &&
        hasRvSupportSignals(accountText) &&
        /\b(automotive dealership|service bays?|showroom|compressor|production equipment|process equipment)\b/i.test(rawFinalTalkTrack)) {
        finalTalkTrack = `Often times for an RV support warehouse, setup bays, staging, inventory handling, and warehouse HVAC can all hit the meter in the same busy window. I'm curious, how do y'all tell whether setup bays, staging, or warehouse support is what pushed the bill, or is that side of things pretty much handled?`
      }
      validated = {
        ...validated,
        signal_headline: finalHeadline,
        signal_detail: normalizeSignalDetail(validated.signal_detail || '', finalHeadline, briefingAccount, talkTrackCandidate),
        talk_track: finalTalkTrack,
      }

      const generatedOpener = buildPermissionOpener(briefingAccount, talkTrackRewriteContext, talkTrackRewriteContext.seed, talkTrackCandidate, siteContext)
      validated = {
        ...validated,
        opener: openerNeedsRewrite(validated.opener || '', briefingAccount) ? generatedOpener : cleanText(validated.opener),
      }

      validated = normalizeBriefSections(validated)

      // Add to cache after successful generation
      const cacheText = composeBriefText((validated as BriefResult).opener, validated.talk_track)
      if (cacheText) {
        talkTrackCache.add(cacheText)
      }
    }

    const angleSelection = determinePrimaryAndSecondaryAngles(briefingAccount, siteContext);

    if (validated && validated.angles) {
      const primary = (validated.angles as any)[angleSelection.primary];
      if (primary && primary.talk_track) {
        validated.talk_track = primary.talk_track;
        if (primary.headline) {
          validated.signal_headline = primary.headline;
        }
      }
    }

    const updatePayload: Record<string, unknown> = {
      intelligence_brief_status: outcomeStatus,
      intelligence_brief_last_refreshed_at: new Date().toISOString(),
    }

    const nextMetadata = {
      ...getAccountMetadata(briefingAccount),
    }
    if (identityProfile) {
      nextMetadata.intelligenceProfile = identityProfile
    } else {
      delete (nextMetadata as Record<string, unknown>).intelligenceProfile
    }
    nextMetadata.intelligenceBriefingContext = talkTrackRewriteContext.briefingContext
    nextMetadata.intelligenceAudienceProfile = audienceProfile ? {
      source: audienceProfile.source,
      sourceLabel: audienceProfile.sourceLabel,
      contactId: audienceProfile.contactId,
      contactName: audienceProfile.contactName,
      contactFirstName: audienceProfile.contactFirstName,
      contactTitle: audienceProfile.contactTitle,
      roleFamily: audienceProfile.roleFamily,
      roleSummary: audienceProfile.roleSummary,
    } : null

    // Save selected primary and secondary angles, along with all generated alternatives
    nextMetadata.intelligenceBriefAngles = {
      primary: angleSelection.primary,
      secondary: angleSelection.secondary,
      all: validated?.angles || null
    }

    updatePayload.metadata = nextMetadata

    if (validated) {
      updatePayload.intelligence_brief_headline = validated.signal_headline
      updatePayload.intelligence_brief_detail = validated.signal_detail
      updatePayload.intelligence_brief_opener = validated.opener ? capitalizeSentenceStarts(validated.opener) : null
      updatePayload.intelligence_brief_talk_track = validated.talk_track ? simplifyTalkTrackLanguage(validated.talk_track) : null
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
    const profile = (getAccountMetadata(updatedAccount as AccountRow).intelligenceProfile || getAccountMetadata(account).intelligenceProfile) as IntelligenceProfile | undefined
    const inferredCluster = profile?.industryCluster || null

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
        inferredCluster,
      })
    }

    return res.status(200).json({
      ok: false,
      message: FALLBACK_MESSAGE,
      account: serialized,
      diagnostics,
      inferredCluster,
    })
  } catch (error) {
    console.error('[Intelligence Brief] Unexpected handler failure:', error)
    return res.status(200).json({
      ok: false,
      message: FALLBACK_MESSAGE,
    })
  }
}
