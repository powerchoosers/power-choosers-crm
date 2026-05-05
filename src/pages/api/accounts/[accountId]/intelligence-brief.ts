import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, requireUser } from '@/lib/supabase'
import { buildOwnerScopeValues } from '@/lib/owner-scope'

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
  linkedin_url: string | null
  city: string | null
  state: string | null
  ownerId: string | null
  employees?: number | null
  description?: string | null
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
}

const FALLBACK_MESSAGE = 'No recent signals found for this account. Try again later or check the source manually.'
const COOLDOWN_MS = 60 * 60 * 1000
const ACCOUNT_SELECT = 'id, name, industry, domain, linkedin_url, city, state, ownerId, employees, description, revenue, annual_usage, intelligence_brief_headline, intelligence_brief_detail, intelligence_brief_talk_track, intelligence_brief_signal_date, intelligence_brief_reported_at, intelligence_brief_source_url, intelligence_brief_confidence_level, intelligence_brief_last_refreshed_at, intelligence_brief_status'
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

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripXml(value: string): string {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim()
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

function buildSearchBuckets(account: AccountRow, includeDomainClause = false) {
  const name = cleanText(account.name) || 'Unknown Company'
  const domain = cleanText(account.domain)
  const city = cleanText(account.city)
  const state = cleanText(account.state)
  const location = [city, state].filter(Boolean).join(', ')
  const industry = cleanText(account.industry)
  const domainClause = includeDomainClause && domain ? ` site:${domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : ''

  const locationClause = location ? ` ${location}` : ''
  const texasClause = ' Texas'

  return [
    {
      priority: 1,
      label: 'Acquisitions / M&A',
      query: `"${name}" acquisition acquired merger buyout takeover${domainClause}${locationClause}`,
    },
    {
      priority: 2,
      label: 'Texas Openings / Construction',
      query: `"${name}" (opened OR opening OR opens OR launch OR launches OR groundbreaking OR "lease signed" OR construction OR relocation OR relocating OR "new facility" OR "new site" OR "new office" OR "new branch")${domainClause}${texasClause}${locationClause}`,
    },
    {
      priority: 3,
      label: 'Executive Leadership Changes',
      query: `"${name}" CFO COO "VP of Finance" "Facilities Director" "Energy Manager" promoted hired${domainClause}${locationClause}`,
    },
    {
      priority: 4,
      label: 'Expansion / Capex / Headcount',
      query: `"${name}" expansion planned expansion capital expenditure capex hiring headcount growth future site${industry ? ` ${industry}` : ''}${domainClause}${locationClause}`,
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
      ? `I was looking at ${companyName}'s website.`
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
    return `I came across ${companyName}'s website.`
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

function buildOpeningIndustryLine(industryCluster: IndustryCluster, alreadyOpen: boolean) {
  const prefix = alreadyOpen
    ? 'Since the site is already live'
    : 'Since you have a new site coming online'

  switch (industryCluster) {
    case 'education_nonprofit':
      return `${prefix}, the main factor for the budget is usually how the seasonal occupancy and HVAC load are landing on the bill.`
    case 'healthcare':
      return `${prefix}, the critical detail is how the 24/7 technical load and HVAC are affecting the base billing floor.`
    case 'restaurant':
      return `${prefix}, the biggest risk is usually kitchen load and HVAC hitting during peak hours and driving up transmission fees.`
    case 'retail':
      return `${prefix}, the hidden cost is often lighting and HVAC load creating spikes that move the bill before you notice it.`
    case 'logistics':
      return `${prefix}, the focus is usually on dock activity and automation driving peaks that hit the transmission side of the bill.`
    case 'office_services':
      return `${prefix}, the concern is usually occupancy and HVAC creating demand ratchets during the summer shoulder months.`
    case 'food_storage':
      return `${prefix}, the volatility usually comes from refrigeration and defrost cycles creating spikes that hit the transmission side.`
    case 'manufacturing':
    case 'energy_intensive':
      return `${prefix}, the primary driver is usually which processes or equipment start-ups are creating peak transmission exposure.`
    default:
      return `${prefix}, the useful check is how the billing load actually matches the way the business is running now.`
  }
}

function hasMultiLocationEvidence(account: AccountRow, candidate: ResearchHit | null) {
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  return /\b(multi[-\s]?unit|multi[-\s]?site|multiple locations|locations across|several locations|portfolio|stores?|branches|restaurant group)\b/.test(text)
}

function buildBusinessSpecificFallbackLine(account: AccountRow, candidate: ResearchHit | null) {
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()

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

  if (/\b(wholesale|distributor|distribution|bearing|hydraulic|hydraulics|industrial hose|power transmission|fluid power)\b/.test(text)) {
    return 'For a wholesale distributor like this, the useful check is whether branch traffic, inventory turns, shop equipment, and any climate-controlled space are what is really pushing the bill.'
  }

  if (/\b(trailer|trailers|heavy haul|heavy-duty|heavy duty|gooseneck|lowboy|transportation equipment|vehicle recovery|commercial trailer|truck equipment)\b/.test(text)) {
    return 'For a trailer manufacturer like this, the useful check is whether production, welding, assembly, paint, and test work are all landing in the bill the way they should.'
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
  const businessSpecificLine = buildBusinessSpecificFallbackLine(account, candidate)

  if (businessSpecificLine) {
    return businessSpecificLine
  }

  if (multiLocation) {
    if (context.industryCluster === 'restaurant') {
      return `For a multi-location restaurant group, the useful check is whether the stores are being looked at together, because kitchen equipment, HVAC, refrigeration, and hours can make one location look fine while another is quietly carrying the cost.`
    }
    if (context.industryCluster === 'retail') {
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
  const text = `${account.name || ''} ${account.industry || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`
  const lower = text.toLowerCase()
  
  // Extract location count if mentioned
  const locationMatch = /(\d+)\s*(?:schools?|locations?|sites?|campuses|stores?|branches?|facilities|restaurants?|units?|buildings?)/i.exec(text)
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
  /i took a look at/i,
  /utility side/i,
  /(?:i saw (?:a|the) note|the note about)/i,
  /for sale/i,
  /pre[-\s]?owned/i,
  /\binventory\b/i,
  /cars?,\s*trucks?,\s*&?\s*suvs?/i,
  /dealership/i,
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
  healthcare: ['occupancy', 'hvac', 'backup', 'reliability', '24/7', 'clinical', 'lab'],
  banking: ['branch', 'occupancy', 'hvac', 'it', 'atms', 'portfolio', 'hours'],
  retail: ['store', 'seasonal', 'traffic', 'lighting', 'hvac', 'refrigeration', 'multi-site'],
  restaurant: ['kitchen', 'hvac', 'refrigeration', 'prep', 'hours', 'multi-unit', 'equipment'],
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

function inferIndustryCluster(account: AccountRow, candidate: ResearchHit | null): IndustryCluster {
  const text = cleanText(`${account.industry || ''} ${account.name || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()
  if (!text) return 'unknown'
  // Move multi_site to bottom of priority list to favor industry-specific guidance
  // if (/(multi[-\s]?site|portfolio|branch(?:es)?|chain|group|holdings)/.test(text)) return 'multi_site'
  if (/(defense|space|aerospace|rocket|aviation|aircraft|missile|orbital|satellite)/.test(text)) return 'manufacturing'
  if (/(oil|gas|energy|mining|quarry|cement|refinery|industrial gas|midstream|upstream|downstream)/.test(text)) return 'energy_intensive'
  if (/(logistics|warehouse|distribution|fulfillment|freight|nvo?cc|trucking|supply chain|transport|shipping|cargo|auto logistics|freight forwarder)/.test(text)) return 'logistics'
  if (/(manufactur|industrial|fabricat|machine|plastics?|chemical|metal|steel|packag|production|component|construction|epc|builder|contractor)/.test(text) && !/(freight forwarder|nvo?cc|logistics|warehouse|distribution|fulfillment|trucking|transport|shipping|cargo|auto logistics)/.test(text)) return 'manufacturing'
  if (/(restaurant|dining|cafe|grill|bar\b|pub\b|eatery|hospitality|hotel|lodging|venue|wedding|event space|banquet)/.test(text)) return 'restaurant'
  if (/(retail|store|shopping|franchise|dealer|showroom|convenience|recreation|fitness|gym|entertainment|amusement|automotive|auto)/.test(text)) return 'retail'
  if (/(healthcare|hospital|clinic|medical|senior living|assisted living|nursing|pharma|pharmacy)/.test(text)) return 'healthcare'
  if (/(bank|credit union|financial|wealth|insurance|lending)/.test(text)) return 'banking'
  if (/(cold storage|refrigerat|freezer|food (?:storage|process|production|distribut|wholesale)|beverage (?:storage|process|production|distribut|wholesale)|grocery|produce|dairy|meat|bakery)/.test(text)) return 'food_storage'
  if (/(church|synagogue|mosque|temple|congregation|parish|worship|ministry|religious|faith)/.test(text)) return 'religious'
  if (/(municipal|government|city|county|public sector|civic|public works|public safety|utility infrastructure)/.test(text)) return 'public_sector'
  if (/(school|education|university|college|nonprofit|foundation|charity)/.test(text)) return 'education_nonprofit'
  if (/(technology|software|saas|data center|it services|cloud|digital)/.test(text)) return 'technology'
  if (/(office|professional services|law|legal|consulting|accounting|marketing|real estate|staffing|agency|design|engineering|architect)/.test(text)) return 'office_services'
  if (/\b(multi[-\s]?site|portfolio|branch(?:es)?|(?<!supply\s)chain|holdings)\b/i.test(text)) return 'multi_site'
  return 'unknown'
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
  const alreadyOpen = isAlreadyOpenLocationSignal(candidateText)
  const futureOpen = isFutureOpenLocationSignal(candidateText)
  const openingIndustryLine = buildOpeningIndustryLine(inferIndustryCluster(account, candidate), alreadyOpen)

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
  const text = cleanText(`${account.name || ''} ${account.industry || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase()

  switch (industryCluster) {
    case 'manufacturing':
      if (/(food production|food manufacturing|bakery|dessert|cake|cheesecake|pie|frozen food|refrigerat|freezer|cold chain|bakehouse|baking line|production kitchen)/.test(text)) {
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
            angle: `Portfolio-level electricity management across ${locationDesc}${regionDesc}.`,
            question: `With ${locationDesc}${regionDesc}, are you tracking which plant is setting the peaks, or is it all getting rolled into one bill?`,
            openers: [
              `Food production groups with ${locationDesc} usually have a hidden blind spot in how refrigeration and bake-line start-ups are hitting the total budget.`,
              `With that kind of footprint${regionDesc}, one plant's cooling load can set a billing floor that sticks for the rest of the year.`,
              `The forensic check I'd want to run is whether any of those ${locationDesc} are carrying a demand ratchet from refrigeration or oven start-up.`,
            ],
            focus: ['refrigeration', 'bake-line start-up', 'production cycles', 'demand ratchets', 'billing floors', 'portfolio management'],
          }
        }

        return {
          label: 'Food production / bakery',
          angle: 'Refrigeration, ovens, bake-line start-ups, and production timing driving the billing floor.',
          question: 'Have you mapped which equipment or production cycles are creating the peaks, or is that still buried in the bill?',
          openers: [
            `Food production is different because refrigeration, ovens, and bake-line start-ups can move the bill long before anyone notices it in operations.`,
            `The part I would watch is whether the cooling load or start-up sequence is setting a billing floor that sticks around all year.`,
            `For a dessert or bakery plant, the power side usually comes down to which lines are creating the peaks, not the average usage.`,
          ],
          focus: ['refrigeration', 'oven start-up', 'bake lines', 'production timing', 'demand ratchets', 'billing floors'],
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
          question: `With ${locationDesc}${regionDesc}, are you managing the portfolio as a group, or is each site carrying its own hidden transmission liability?`,
          openers: [
            `Manufacturing groups with ${locationDesc} usually have a significant blind spot in how local transmission fees at a single site are hitting the group budget.`,
            `With that kind of footprint${regionDesc}, a spike at one plant can set a local billing floor that stays on the books for a year.`,
            `The forensic check I'd want to run is whether any of those ${locationDesc} are carrying a stealth demand ratchet that is dragging down the total budget.`,
          ],
          focus: ['portfolio transmission', 'consolidated demand ratchets', 'multi-site coordination', 'billing floors', 'load factor'],
        }
      }
      
      return {
        label: 'Manufacturing / industrial',
        angle: 'Forensic machine startup cycles and shift-driven demand peaks setting billing floors.',
        question: 'Have you mapped your equipment startup sequences yet to see if they are setting a billing floor for the whole year?',
        openers: [
          `In a manufacturing setup like yours, the biggest forensic signal is usually the machine startup sequence and how it hits the billing floor.`,
          `If your production lines ramp up simultaneously, you're likely setting a demand peak that you pay for long after the shift ends.`,
          `The diagnostic check I'd want to run is whether your equipment timing is creating an artificial liability in the transmission side of the bill.`,
        ],
        focus: ['startup sequences', 'production ramps', 'shift-driven peaks', 'billing floors', 'demand ratchets', 'transmission liability'],
      }
    case 'logistics':
      const logisticsMultiSite = detectMultiSiteScale(account, candidate)
      
      if (logisticsMultiSite.isMultiSite && logisticsMultiSite.locationCount && logisticsMultiSite.locationCount >= 3) {
        const locationDesc = logisticsMultiSite.locationCount >= 10 
          ? `${logisticsMultiSite.locationCount}+ distribution centers`
          : `${logisticsMultiSite.locationCount} distribution centers`
        const regionDesc = logisticsMultiSite.regions.length > 1 
          ? ` across ${logisticsMultiSite.regions.length} states`
          : ''
          
        return {
          label: 'Logistics network',
          angle: `Portfolio-level electricity management across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you tracking demand ratchets site-by-site, or are they hiding in the group-level budget?`,
          openers: [
            `Logistics groups with ${locationDesc} usually have different demand ratchets hiding in each specific facility's bill.`,
            `With that kind of footprint${regionDesc}, one warehouse's summer peak can set a local billing floor that the group has to carry for 11 months.`,
            `The diagnostic check I'd want to run is whether the transmission exposure is being managed across all ${locationDesc} or if a few sites are dragging down the total budget.`,
          ],
          focus: ['portfolio demand ratchets', 'consolidated transmission', 'warehouse coordination', 'billing floors', '24/7 load'],
        }
      }
      
      return {
        label: 'Logistics / warehouse / distribution',
        angle: 'Thermal liability from dock doors and automation setting stealth demand ratchets.',
        question: 'Have you looked at the correlation between your dock activity and your peak demand charges lately?',
        openers: [
          `In high-volume logistics, the biggest forensic driver is usually Thermal Liability—where dock doors and HVAC fight each other during peaks.`,
          `If your automation or dock cycles spike during high-heat hours, you're setting a demand ratchet that follows you into the slow season.`,
          `A lot of warehouse groups focus on the usage, but the real leak is usually the peak floor set by dock timing and climate control.`,
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
    case 'healthcare':
      const healthcareMultiSite = detectMultiSiteScale(account, candidate)
      
      if (healthcareMultiSite.isMultiSite && healthcareMultiSite.locationCount && healthcareMultiSite.locationCount >= 3) {
        const locationDesc = healthcareMultiSite.locationCount >= 10 
          ? `${healthcareMultiSite.locationCount}+ communities`
          : `${healthcareMultiSite.locationCount} communities`
        const regionDesc = healthcareMultiSite.regions.length > 1 
          ? ` across ${healthcareMultiSite.regions.length} states`
          : ''
          
        return {
          label: 'Healthcare network',
          angle: `Portfolio-level reliability requirements masking consolidated demand ratchets across ${locationDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you tracking the transmission exposure on that base load, or is the portfolio budget masking the peaks?`,
          openers: [
            `Healthcare groups with ${locationDesc} usually have a significant blind spot because the 24/7 base load masks the very peaks that set a specific facility's billing floor.`,
            `With that kind of footprint${regionDesc}, the liability isn't just one site — it's how a single site's peak can set a local ratchet that hits the group budget.`,
            `The forensic check I'd want to run is whether any of those ${locationDesc} are carrying a stealth demand ratchet that is dragging down the total budget.`,
          ],
          focus: ['base load masking', 'portfolio transmission', 'reliability', 'demand ratchets', 'billing floors'],
        }
      }
      
      return {
        label: 'Healthcare / Senior Living',
        angle: 'Base load masking where 24/7 reliability requirements hide stealth demand ratchets.',
        question: 'Are you tracking the peak exposure on that 24/7 base load, or is the reliability requirement masking the ratchets?',
        openers: [
          `Healthcare facilities that never sleep have a unique liability because the constant base load often masks stealth demand ratchets.`,
          `Because your buildings never stop, the part I care about is that the base load hides the very peaks that set your billing floor.`,
          `In a 24/7 environment, you're often paying for capacity you aren't actually using because the 'always-on' load makes peaks hard to spot.`,
        ],
        focus: ['base load masking', 'peak transparency', 'reliability liability', 'demand ratchets', 'billing floors', 'capacity mismatch'],
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
          question: `With ${locationDesc}${regionDesc}, are you seeing demand ratchets at specific locations, or is the portfolio masking them?`,
          openers: [
            `Retail chains with ${locationDesc} usually benefit from a portfolio view rather than managing each store separately.`,
            `With that kind of footprint${regionDesc}, one location can easily carry a demand ratchet that hides in the group total.`,
            `The question I'd want answered is whether your ${locationDesc} are being managed centrally or location-by-location.`,
          ],
          focus: ['portfolio management', 'multi-store coordination', 'seasonal swings', 'demand ratchets', 'centralized procurement'],
        }
      }
      
      return {
        label: 'Retail',
        angle: 'Portfolio masking where individual site peaks drag down the total group budget.',
        question: 'Are you seeing demand ratchets at specific stores, or is the group budget masking those local peaks?',
        openers: [
          `Retail operations are sensitive because the summer cooling load at one site can set a billing floor that the whole group carries.`,
          `The biggest liability in a retail footprint is Portfolio Masking, where a few 'dirty' sites are setting the floor for the entire budget.`,
          `With retail footprints, the lighting and HVAC load usually masks a lot of hidden transmission exposure at the meter level.`,
        ],
        focus: ['portfolio masking', 'meter-level ratchets', 'group budget liability', 'billing floors', 'occupancy swings'],
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
          angle: 'Coincident kitchen peaks and portfolio masking dragging down the total group budget.',
          question: `With ${locationDesc}${regionDesc}, are you tracking the coincident peaks site-by-site, or is it one big bucket?`,
          openers: [
            `Restaurant groups with ${locationDesc} usually have a significant blind spot in how kitchen service rushes are setting local demand ratchets.`,
            `With that kind of footprint${regionDesc}, one unit's kitchen spike can trigger a billing floor that the whole group has to carry.`,
            `The diagnostic check I'd want to run is whether any of those ${locationDesc} are carrying a stealth demand ratchet from service peaks.`,
          ],
          focus: ['coincident peaks', 'service rushes', 'kitchen load', 'demand ratchets', 'portfolio masking', 'billing floors'],
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
    case 'education_nonprofit':
      const multiSiteInfo = detectMultiSiteScale(account, candidate)
      const isSchoolDistrict = /\b(isd|independent school district|school district|public school|charter school|campus)\b/.test(text)

      if (isSchoolDistrict) {
        if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount >= 10) {
          const locationDesc = multiSiteInfo.locationCount >= 100
            ? `${multiSiteInfo.locationCount}+ campuses`
            : `${multiSiteInfo.locationCount} campuses`
          const regionDesc = multiSiteInfo.regions.length > 1
            ? ` across ${multiSiteInfo.regions.length} states`
            : ''

          return {
            label: 'School district network',
            angle: `District-wide billing floor audit across ${locationDesc}${regionDesc}.`,
            question: `With ${locationDesc}${regionDesc}, is one campus creating a peak that shows up on the whole district bill?`,
            openers: [
              `For a district with ${locationDesc}${regionDesc}, the useful question is whether one campus peak is still setting the floor for the whole budget.`,
              `School districts usually have a mix of old buildings, new buildings, and heavy summer HVAC, so the bill can look flatter than it really is.`,
              `The campus calendar, athletics, and classroom technology all matter here because they change how the district uses power.`,
            ],
            focus: ['campus calendar', 'HVAC', 'athletics', 'classroom technology', 'billing floors', 'district budget'],
          }
        }

        return {
          label: 'School district',
          angle: 'Campus calendar, HVAC, and classroom technology driving a district-wide billing floor.',
          question: 'Has anyone checked whether the summer cooling load or school calendar is still setting a higher billing floor than it should?',
          openers: [
            `School districts have a different pattern than a normal office because the calendar, athletics, cafeterias, and device charging all push the bill in different directions.`,
            `The thing I would watch is whether one hot campus month is still showing up in the district bill long after school is back in session.`,
            `For a district, the power side is usually about campus timing and HVAC more than anything else.`,
          ],
          focus: ['campus calendar', 'summer HVAC', 'athletics', 'cafeterias', 'device charging', 'district budget'],
        }
      }
      
      if (multiSiteInfo.isMultiSite && multiSiteInfo.locationCount && multiSiteInfo.locationCount >= 10) {
        const locationDesc = multiSiteInfo.locationCount >= 100 
          ? `${multiSiteInfo.locationCount}+ locations`
          : `${multiSiteInfo.locationCount} locations`
        const regionDesc = multiSiteInfo.regions.length > 1 
          ? ` across ${multiSiteInfo.regions.length} states`
          : ''
        
        return {
          label: 'Education / nonprofit network',
          angle: `Forensic audit of billing floors across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}, is a single campus spike triggering a demand ratchet that affects the whole portfolio budget?`,
          openers: [
            `For a portfolio with ${locationDesc}, the biggest liability is usually a demand ratchet at one site that inflates the whole group bill.`,
            `With that kind of footprint${regionDesc}, the budget risk isn't the rate — it is the hidden billing floors masking themselves in the consolidated total.`,
            `The diagnostic check I'd want to run is whether any of those ${locationDesc} are carrying a phantom demand charge from a one-time event.`,
          ],
          focus: ['billing floors', 'demand ratchets', 'portfolio liability', 'budget erosion', 'hidden spikes'],
        }
      }
      
      return {
        label: 'Education / nonprofit',
        angle: 'Diagnostic check for demand ratchets triggered by seasonal occupancy or special event spikes.',
        question: 'Has anyone audited the bill to see if a single summer event triggered a locked-in peak charge that is still eroding the budget today?',
        openers: [
          `In the non-profit sector, the stealth liability is almost always phantom demand — a billing floor that keeps the price high long after an event ends.`,
          `Most campus budgets are designed for steady load, but seasonal spikes can trigger a ratchet that stays on the bill for a full 12 months.`,
          `I was curious if anyone has checked the current billing floor against your actual off-peak usage.`,
        ],
        focus: ['stealth liability', 'billing floors', 'budget erosion', 'seasonal spikes', 'demand ratchets', 'mission fund protection'],
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
          angle: `Municipal budget protection across ${locationDesc}${regionDesc}.`,
          question: `With ${locationDesc}${regionDesc}, are you tracking which public facilities are driving the peaks, or is it all still rolled up together?`,
          openers: [
            `For a city portfolio like this, the real question is which public facilities are setting the billing floor for the whole budget.`,
            `Administrative offices, public safety, and utility buildings usually behave very differently on the power side, so one site can distort the total fast.`,
            `When a municipality has this many facilities, I want to know whether the summer peaks are being tracked by building or just buried in the consolidated bill.`,
          ],
          focus: ['public facilities', 'budget protection', 'summer cooling load', 'public safety', 'utility infrastructure', 'billing floors'],
        }
      }

      return {
        label: 'Public sector',
        angle: 'Mission-critical public facilities, summer cooling load, and budget erosion from peak demand.',
        question: 'Have you looked at which city buildings are creating the highest peaks, or is everything still sitting in one bucket?',
        openers: [
          `City facilities have a different profile because public safety, utility infrastructure, and administrative offices do not all use power the same way.`,
          `The part I would watch is whether one summer peak is still setting the floor for the whole municipal budget.`,
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
        angle: 'Forensic audit of consolidated billing floors and hidden demand ratchets across a portfolio.',
        question: 'Has anyone mapped the portfolio to see if one site is carrying a stealth demand ratchet that is dragging down the group budget?',
        openers: [
          `Multi-site footprints usually have a blind spot where one location quietly sets a local peak demand floor that penalizes the total portfolio budget.`,
          `The part I care about is whether any of the sites in your group are carrying a stealth demand ratchet that is dragging down the total budget.`,
          `With multiple locations, the forensic check is whether a few specific meters are setting a billing floor that you're stuck with for the rest of the year.`,
        ],
        focus: ['stealth billing floors', 'portfolio liability', 'consolidated demand ratchets', 'transmission exposure'],
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
  const lowIntensityCluster = ['office_services', 'banking', 'retail', 'restaurant', 'education_nonprofit', 'public_sector', 'unknown'].includes(industryCluster)

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

function buildTalkTrackContext(account: AccountRow, candidate: ResearchHit | null, isFallbackMode: boolean): TalkTrackContext {
  const seed = [account.id, candidate?.url || candidate?.title || '', isFallbackMode ? 'fallback' : 'signal'].join('|')
  const signalFamily = inferSignalFamily(candidate, isFallbackMode)
  const industryCluster = inferIndustryCluster(account, candidate)
  const signalGuidance = buildSignalGuidance(signalFamily, account, candidate)
  const industryGuidance = buildIndustryGuidance(industryCluster, account, candidate)
  const marketGuidance = buildMarketGuidance(industryCluster)
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
    signalAngle: signalGuidance.angle,
    signalOpeners: signalGuidance.openers,
    industryCluster,
    industryLabel: industryGuidance.label,
    industryAngle: industryGuidance.angle,
    industryOpeners: industryGuidance.openers,
    marketSeason: marketGuidance.marketSeason,
    marketLabel: marketGuidance.marketLabel,
    marketAngle: marketGuidance.marketAngle,
    marketQuestion: marketGuidance.marketQuestion,
    marketOpeners: marketGuidance.marketOpeners,
    marketFocus: marketGuidance.marketFocus,
    openingPattern,
    openingStyle: openingStyleMap[openingPattern],
    question: signalGuidance.question || industryGuidance.question,
    ercotFocus: Array.from(new Set([...signalGuidance.focus, ...industryGuidance.focus])),
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
  }
}

async function generateAITalkTrack(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext): Promise<string | null> {
  const companyName = cleanText(account.name) || 'the company'
  const industry = cleanText(account.industry) || 'business'
  const city = cleanText(account.city) || ''
  const state = cleanText(account.state) || ''
  const location = [city, state].filter(Boolean).join(', ') || 'Texas'
  
  const multiSiteInfo = detectMultiSiteScale(account, candidate)
  const multiSiteContext = multiSiteInfo.isMultiSite && multiSiteInfo.locationCount
    ? `This is a multi-site organization with ${multiSiteInfo.locationCount} locations${multiSiteInfo.regions.length > 1 ? ` across ${multiSiteInfo.regions.length} states` : ''}.`
    : ''
  
  const employeesContext = account.employees ? `- Employee Size: ${account.employees}` : ''
  const revenueContext = account.revenue ? `- Revenue: ${account.revenue}` : ''
  const descriptionContext = account.description ? `- Description: ${account.description}` : ''
  const usageContext = account.annual_usage ? `- Annual Usage: ${account.annual_usage} kWh` : ''
  
  const prompt = `You are a forensic energy analyst and strategist. You are crafting a talk track opener for a peer-to-peer conversation with a C-level executive or operations lead.

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

REQUIREMENTS:
1. THE OPENER: If a SIGNAL CONTEXT is provided, the first sentence MUST name the specific event OR the specific operational detail mentioned (e.g., "I caught the update about the new Haslet campus expansion" or "I was curious about the technical load mentioned in your recent facility update").
2. THE PIVOT (TECHNICAL DEPTH): Look closely at the SIGNAL CONTEXT snippet. If it mentions specific operational terms (e.g., "broadcast load," "fabrication line," "sanctuary load," "24/7 automation"), you MUST use these terms. Do not revert to a generic industry template if specific details are available.
3. FORENSIC PAIN POINT: Connect the technical detail directly to a liability:
   - Electrification / Load Factor Shift: The risk of moving thermal or manual load to electric without restructuring the bill.
   - Phantom Demand / Locked-in Peak Charges: 80% billing floors (often called demand ratchets) that punish businesses for one-time spikes.
   - Transmission Exposure: The hidden charges tied to pulling power during the highest ERCOT grid peaks. (Never say "4CP").
   - Load Mismatch: When the operating schedule changes but the contract doesn't.
4. NO BUILDING CONTROLS: Do not mention building controls, scheduling, or "managing the load." Focus on the liability in the bill itself.
5. THE QUESTION: End with ONE specific, easy-to-answer question about their operations (e.g., "Has anyone looked at whether the testing schedule is triggering a demand ratchet?" or "Are you guys tracking the transmission exposure on that technical load yet?").
6. NON-PROFIT / COMMUNITY: For non-profits, religious groups, or schools, use mission-aligned language like "serving the community" or "supporting your mission" instead of generic business terms.
   - For school districts specifically, talk about campus calendars, athletics, cafeterias, classroom technology, and summer HVAC. Do not use factory language like shifts, production, or startup unless the source explicitly says that.
7. NO REPETITION: Do not repeat the core question or the opening observation.
8. LENGTH: 2-3 sentences max. 50-80 words.
9. FORBIDDEN PHRASES: "trim waste", "budget predictability", "save money", "improve efficiency", "how the business runs today", "looking at the setup", "staple", "long-standing", "fixture", "current setup", "autopilot", "site by site", "I was looking at the operational footprint", "I came across your website", "rate", "rates", "pricing", "savings", "lower cost", "better price", "consultation", "help you".
10. FORENSIC AUTHORITY: Never sound like you are selling a service. Sound like you are reporting a diagnostic finding. Use "liability," "exposure," "billing floor," and "ratchet" instead of "costs," "bills," or "savings."
11. NO BROKER-SPEAK: Never use phrases like "I can help you save," "we look at energy differently," or "I want to be a resource." Lead with the forensic insight immediately.
12. MULTI-SITE: If the organization has multiple locations, you MUST mention the "portfolio" or "group budget" and the risk of "masked peaks" where one site penalizes the whole group.

Generate a forensic, peer-to-peer opener for ${companyName}:`

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
    const talkTrack = cleanText(data?.choices?.[0]?.message?.content || '')
    
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

function talkTrackNeedsRewrite(talkTrack: string, context: TalkTrackContext) {
  const text = cleanText(talkTrack)
  if (!text) return true
  if (isLikelyNonEnglishText(text)) return true

  const lower = text.toLowerCase()
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
  const footprintOpener = /reviewing the operational footprint|operational footprint for/i.test(lower)
  const incompleteReportOpener = /^i\s+(?:saw|noticed|came across)\s+(?:a|the)?\s*(?:report|article|news item|piece|update|post online)\s+(?:about|on)\s+[^.!?]{2,80}\.\s*(?:that|this|it)\s+(?:is|was|would|can|usually|tends|makes)\b/i.test(text)
  const matchedAngleBuckets = [mentionsSignal, mentionsIndustry, mentionsMarket].filter(Boolean).length
  const marketFeelsBoltedOn = mentionsMarket && (mentionsSignal || mentionsIndustry) && sentenceCount > 3
  const mismatchedIndustryLabel = (Object.entries(TALK_TRACK_INDUSTRY_LABELS) as Array<[IndustryCluster, string[]]>).some(([cluster, labels]) => {
    if (cluster === context.industryCluster) return false
    return labels.some((label) => lower.includes(label.toLowerCase()))
  })
  const overstuffed = matchedAngleBuckets > 2 || sentenceCount > 4 || marketFeelsBoltedOn

  return genericHits > 0 || genericOpening || unsupportedLeadershipAngle || unsupportedAcquisitionAngle || unsupportedFootprintAngle || repeatedQuestionEcho || filingJargon || footprintOpener || incompleteReportOpener || sentenceCount < 2 || wordCount < 25 || overstuffed || mismatchedIndustryLabel
}

function buildManualTalkTrack(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext, attempt = 0) {
  const companyName = cleanText(account.name) || 'the company'
  const sourceLead = buildSourceLead(account, candidate)
  const fallbackIndustryLine = buildFallbackIndustryLine(account, candidate, context)
  const fallbackQuestion = buildFallbackQuestion(account, candidate, context)
  const candidateText = `${candidate?.title || ''} ${candidate?.snippet || ''}`
  const alreadyOpen = isAlreadyOpenLocationSignal(candidateText)
  const openingIndustryLine = buildOpeningIndustryLine(context.industryCluster, alreadyOpen)
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

  const opener = pickVariant(openerBySignal[context.signalFamily], variantSeed) || openerBySignal[context.signalFamily][0]
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
      `Deploying new technical load like this usually changes the load factor faster than the billing structure can keep up with.`,
      `Moving processes over to the electric side is a good move, but it usually creates a hidden liability on the billing floor.`,
    ],
    industry_context: [
      fallbackIndustryLine,
    ],
  }

  const industryLine = pickVariant(context.industryOpeners, variantSeed) || context.industryOpeners[0]
  const signalLine = pickVariant(signalLineBySignal[context.signalFamily], variantSeed) || signalLineBySignal[context.signalFamily][0]
  const marketLine = pickVariant(context.marketOpeners, variantSeed) || context.marketOpeners[0]
  
  const lowIntensityCluster = ['office_services', 'banking', 'retail', 'restaurant', 'education_nonprofit', 'public_sector', 'religious', 'unknown'].includes(context.industryCluster)
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
    const observationalOpener = [
      `I was reviewing the operational footprint for ${companyName}.`,
      `I caught the update about ${companyName} online.`,
      `I was looking into the setup at ${companyName}.`
    ][hashString(variantSeed) % 3]

    fullTrack = `${observationalOpener} ${forensicObservation} ${question}`
  } else {
    // Signal-led flow
    fullTrack = `${opener} ${forensicObservation} ${question}`
  }

  return fullTrack.replace(/\s+/g, ' ').trim()
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

async function fetchGeneralWebHits(account: AccountRow) {
  return fetchBingRssHits(buildSearchBuckets(account, true), 'web', 4, account)
}

async function collectResearchCandidates(account: AccountRow) {
  const buckets = buildSearchBuckets(account)
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
    fetchGeneralWebHits(account),
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
  const talkTrack = cleanText(result?.talk_track)
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

async function runOpenRouterResearch(account: AccountRow, candidates: ResearchHit[], isFallbackMode = false) {
  const openRouterKey = process.env.OPEN_ROUTER_API_KEY
  if (!openRouterKey) {
    throw new Error('OPEN_ROUTER_API_KEY is not configured')
  }

  const selectedCandidates = candidates.slice(0, 16)
  const primaryCandidate = selectedCandidates[0] || null
  const talkTrackContext = buildTalkTrackContext(account, primaryCandidate, isFallbackMode)
  const talkTrackContextJson = JSON.stringify(talkTrackContext, null, 2)
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
  }

  const basePrompt = `You are writing an Intelligence Brief for Nodal Point, a Texas commercial energy broker.

Use ONLY the research payload below. It may include Google News, broad web search, LinkedIn company pages/posts, SEC filings, and official company pages. Do not invent facts. Do not mention that you searched or mention LinkedIn, Google, RSS, SEC, or any source platform in the final output.
If a research result has "official_source": true, treat it as the source of record and prefer its date over a republished article when both are available for the same event.`

  const newsSignalPrompt = `${basePrompt}

Decision rules:
- Pick ONE signal only.
- Use the highest-priority signal supported by the research results.
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
- If the company description or source text names specific products or services, use those exact nouns in the first sentence when they matter. Do not replace them with generic words like "operation" or "footprint."
- Do not imply the electricity agreement creates demand spikes. Spikes come from how the site is being used; contract structure only changes how those spikes show up on the bill.
- Do not echo page titles, inventory copy, catalog language, or storefront language back into the talk track.
- Avoid the phrases listed in talk_track_context. If the response starts sounding generic, rewrite it.
- If market context is secondary, keep it to one short clause or leave it out.

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
- Use the market season fields in talk_track_context to decide whether summer volatility, winter reliability, or a shoulder-season budget reset should lead. Keep the market note brief if you use it.
- Use human source language in the opener, but complete the thought. Do not write "I saw a report about [company]" and then move on. Name the actual business fact in the same sentence, or use "I came across [company]'s website..." for website-only fallback.
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

    const candidateResults = await collectResearchCandidates(account)
    const diagnostics = buildResearchDiagnostics(candidateResults)
    console.info('[Intelligence Brief] Research candidates collected:', {
      accountId,
      accountName: account.name,
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
        generatedBrief = await runOpenRouterResearch(account, candidateResults, false)
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
        const websiteInfo = await fetchCompanyWebsiteInfo(account)
        if (websiteInfo) {
          fallbackCandidates.push(websiteInfo)
        }
        
        if (fallbackCandidates.length === 0) {
          const profileFallback = buildCompanyProfileFallbackHit(account)
          if (profileFallback) {
            fallbackCandidates.push(profileFallback)
          }
        }
        
        // Fetch industry trends
        const industryTrends = await fetchIndustryTrends(account)
        fallbackCandidates.push(...industryTrends)
        
        if (fallbackCandidates.length > 0) {
          console.info('[Intelligence Brief] Fallback candidates collected:', {
            accountId,
            accountName: account.name,
            fallbackTotal: fallbackCandidates.length,
          })

          rescueCandidates = dedupeAndSort([...candidateResults, ...fallbackCandidates], account)
          
          generatedBrief = await runOpenRouterResearch(account, fallbackCandidates, true)
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
      const rescueContext = buildTalkTrackContext(account, rescueCandidate, false)
      const rescueBrief = buildRescueBrief(account, rescueCandidate, rescueContext)
      if (rescueBrief) {
        validated = rescueBrief
        generatedBrief = rescueBrief
        outcomeStatus = 'ready'
        console.info('[Intelligence Brief] Using deterministic rescue brief:', {
          accountId,
          accountName: account.name,
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
        accountName: account.name,
        industry: account.industry,
      })
      
      const fallbackContext = buildTalkTrackContext(account, null, true)
      const aiTalkTrack = await generateAITalkTrack(account, null, fallbackContext)
      
      if (aiTalkTrack) {
        // Create a minimal brief with just the AI talk track
        const industryLabel = cleanText(account.industry) || 'this business'
        validated = {
          signal_headline: 'Industry Context',
          signal_detail: `No recent news signals found. Generated talk track based on ${industryLabel} industry patterns and electricity usage.`,
          talk_track: aiTalkTrack,
          signal_date: new Date().toISOString().slice(0, 10),
          source_date: new Date().toISOString().slice(0, 10),
          source_url: account.domain ? `https://${cleanText(account.domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '',
          confidence_level: 'Low',
          selected_priority: 9,
          source_title: 'Industry Context',
          source_domain: account.domain || '',
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
          accountName: account.name,
        })
        
        const manualTalkTrack = buildManualTalkTrack(account, null, fallbackContext, 0)
        const industryLabel = cleanText(account.industry) || 'this business'
        
        validated = {
          signal_headline: 'Industry Context',
          signal_detail: `No recent news signals found. Generated talk track based on ${industryLabel} industry patterns and electricity usage.`,
          talk_track: manualTalkTrack,
          signal_date: new Date().toISOString().slice(0, 10),
          source_date: new Date().toISOString().slice(0, 10),
          source_url: account.domain ? `https://${cleanText(account.domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '',
          confidence_level: 'Low',
          selected_priority: 9,
          source_title: 'Industry Context',
          source_domain: account.domain || '',
        }
        outcomeStatus = 'ready'
        usedFallback = true
        console.info('[Intelligence Brief] Using manual template fallback for empty signal case')
      }
    }

    const talkTrackCandidate = generatedBrief ? findCandidateForResult(generatedBrief as BriefResult, rescueCandidates) : rescueCandidates[0] || null
    const talkTrackRewriteContext = buildTalkTrackContext(account, talkTrackCandidate, false)
    const previousTalkTrack = cleanText(account.intelligence_brief_talk_track || '')
    if (validated) {
      const shouldRewrite = talkTrackNeedsRewrite(validated.talk_track || '', talkTrackRewriteContext) ||
        (previousTalkTrack && talkTrackIsTooSimilarToPrevious(validated.talk_track || '', previousTalkTrack)) ||
        talkTrackCache.isTooSimilar(validated.talk_track || '')

      if (shouldRewrite) {
        let rewrittenTalkTrack: string | null = null
        
        // Always try AI generation first for rewrites
        rewrittenTalkTrack = await generateAITalkTrack(account, talkTrackCandidate, talkTrackRewriteContext)
        
        // Validate AI-generated talk track
        if (rewrittenTalkTrack) {
          if (talkTrackNeedsRewrite(rewrittenTalkTrack, talkTrackRewriteContext) ||
              (previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenTalkTrack)) {
            console.warn('[Intelligence Brief] AI-generated talk track failed validation, falling back to manual')
            rewrittenTalkTrack = null
          }
        }
        
        // Fall back to manual generation if AI failed or not applicable
        if (!rewrittenTalkTrack) {
          rewrittenTalkTrack = buildManualTalkTrack(account, talkTrackCandidate, talkTrackRewriteContext, 0)

          // Check against cache and previous talk track
          if ((previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenTalkTrack)) {
            rewrittenTalkTrack = buildManualTalkTrack(account, talkTrackCandidate, talkTrackRewriteContext, 1)
          }

          if ((previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) ||
              talkTrackCache.isTooSimilar(rewrittenTalkTrack)) {
            rewrittenTalkTrack = buildManualTalkTrack(account, talkTrackCandidate, talkTrackRewriteContext, 2)
          }
        }

        validated = {
          ...validated,
          talk_track: rewrittenTalkTrack,
        }
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
