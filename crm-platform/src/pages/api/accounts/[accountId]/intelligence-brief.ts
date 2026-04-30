import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, requireUser } from '@/lib/supabase'
import { buildOwnerScopeValues } from '@/lib/owner-scope'

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
  | 'technology'
  | 'energy_intensive'
  | 'office_services'
  | 'multi_site'
  | 'unknown'

type TalkTrackContext = {
  signalFamily: SignalFamily
  signalLabel: string
  signalAngle: string
  signalOpeners: string[]
  industryCluster: IndustryCluster
  industryLabel: string
  industryAngle: string
  industryOpeners: string[]
  openingPattern: 'observation' | 'question' | 'contrast' | 'curiosity'
  openingStyle: string
  question: string
  ercotFocus: string[]
  avoidPhrases: string[]
  seed: string
}

const FALLBACK_MESSAGE = 'No recent signals found for this account. Try again later or check the source manually.'
const COOLDOWN_MS = 60 * 60 * 1000
const ACCOUNT_SELECT = 'id, name, industry, domain, linkedin_url, city, state, ownerId, intelligence_brief_headline, intelligence_brief_detail, intelligence_brief_talk_track, intelligence_brief_signal_date, intelligence_brief_reported_at, intelligence_brief_source_url, intelligence_brief_confidence_level, intelligence_brief_last_refreshed_at, intelligence_brief_status'
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

function isPressReleaseStyleUrl(value: string) {
  const url = cleanText(value)
  if (!url) return false

  const host = getHostname(url)
  const lower = url.toLowerCase()
  const pressReleasePath = /(newsroom|press[-_]?release|press[-_]?room|press|release|announcement|announcements|updates?|blog|stories?|media|ir\/|investors?\/)/i

  if (host && PRESS_RELEASE_HOSTS.has(host)) return true
  return pressReleasePath.test(lower)
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
  if (!candidate) return `I came across an update about ${companyName}.`

  if (candidate.sourceKind === 'web' && isCompanyWebsiteHit(account, candidate)) {
    if (isOfficialCompanyAnnouncement(account, candidate)) {
      return `I saw your announcement about ${companyName}.`
    }
    return 'I came across your website.'
  }

  switch (candidate.sourceKind) {
    case 'linkedin':
      return `I saw a post online about ${companyName}.`
    case 'sec':
      return `I saw a filing about ${companyName}.`
    case 'web':
      if (isOfficialCompanyAnnouncement(account, candidate)) {
        return `I saw your announcement about ${companyName}.`
      }
      return `I saw an article about ${companyName}.`
    case 'news':
    default:
      return `I saw a report about ${companyName}.`
  }
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
  const siteNoun = /(\blocation\b|\bsite\b|\bfacility\b|\bwarehouse\b|\bplant\b|\boffice\b|\bbranch\b|\bcampus\b|\bbuilding\b)/i.test(lower)

  return openingVerb && siteNoun && !genericDirectory
}

function inferSignalPriority(text: string, fallbackPriority: number) {
  const lower = cleanText(text).toLowerCase()
  if (/(acquir|merger|takeover|buyout)/.test(lower)) return 1
  if (hasStrongNewLocationEvidence(lower)) return 2
  if (/(cfo|chief financial officer|coo|chief operating officer|vp of finance|vice president of finance|facilities director|energy manager|promoted|hired)/.test(lower)) return 3
  if (/(expansion|capital expenditure|capex|headcount|growth|future site|buildout|build-out)/.test(lower)) return 4
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
  technology: ['cooling', 'server', 'fit-out', 'occupancy', 'equipment', 'space', 'data'],
  energy_intensive: ['4cp', 'process', 'motor', 'equipment', 'peak', 'load', 'maintenance'],
  office_services: ['occupancy', 'lease', 'hvac', 'conference', 'equipment', 'hours', 'space'],
  multi_site: ['portfolio', 'site', 'occupancy', 'hours', 'equipment', 'load', 'meter'],
  unknown: ['usage', 'occupancy', 'equipment', 'load'],
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

function stripTrailingQuestionMark(value: string) {
  return cleanText(value).replace(/\?+$/, '').trim()
}

function tokenizeTalkTrack(value: string) {
  return Array.from(
    new Set(
      cleanText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length > 2)
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

  if (looksLikeCommercialListingPage(title, candidate?.snippet || '', candidate?.snippet || '', candidate?.url || '')) {
    return companyName || 'this account'
  }

  if (countMatchingPatterns(title, LOW_QUALITY_LISTING_PATTERNS) >= 2) {
    return companyName || 'this account'
  }

  if (companyName) {
    const stripped = title.replace(new RegExp(`^${escapeRegExp(companyName)}[\\s\\-:–—|,]+`, 'i'), '')
    const cleaned = cleanText(stripped)
    if (cleaned && cleaned.length < title.length) {
      return shortenText(cleaned, 110)
    }
  }

  return shortenText(title, 110)
}

function inferIndustryCluster(account: AccountRow): IndustryCluster {
  const text = cleanText(`${account.industry || ''} ${account.name || ''}`).toLowerCase()
  if (!text) return 'unknown'
  if (/(multi[-\s]?site|portfolio|branch(?:es)?|chain|group|holdings)/.test(text)) return 'multi_site'
  if (/(defense|space|aerospace|rocket|aviation|aircraft|missile|orbital|satellite)/.test(text)) return 'manufacturing'
  if (/(oil|gas|energy|mining|quarry|cement|refinery|industrial gas|midstream|upstream|downstream)/.test(text)) return 'energy_intensive'
  if (/(manufactur|industrial|fabricat|machine|plastics?|chemical|metal|steel|packag|production|component)/.test(text)) return 'manufacturing'
  if (/(logistics|warehouse|distribution|fulfillment|freight|trucking|supply chain|transport|shipping)/.test(text)) return 'logistics'
  if (/(cold storage|refrigerat|freezer|food|beverage|grocery|produce|dairy|meat|bakery)/.test(text)) return 'food_storage'
  if (/(healthcare|hospital|clinic|medical|senior living|assisted living|nursing|pharma|pharmacy)/.test(text)) return 'healthcare'
  if (/(bank|credit union|financial|wealth|insurance|lending)/.test(text)) return 'banking'
  if (/(restaurant|dining|cafe|hospitality|hotel|food service)/.test(text)) return 'restaurant'
  if (/(retail|store|shopping|franchise|dealer|showroom|convenience)/.test(text)) return 'retail'
  if (/(school|education|university|college|nonprofit|church|foundation|charity|municipal)/.test(text)) return 'education_nonprofit'
  if (/(technology|software|saas|data center|it services|cloud|digital)/.test(text)) return 'technology'
  if (/(office|professional services|law|legal|consulting|accounting|marketing|real estate|staffing|agency)/.test(text)) return 'office_services'
  return 'unknown'
}

function inferSignalFamily(candidate: ResearchHit | null, isFallbackMode = false): SignalFamily {
  if (isFallbackMode || !candidate) return 'industry_context'

  const text = `${candidate.title || ''} ${candidate.snippet || ''}`
  switch (inferSignalPriority(text, candidate.priority)) {
    case 1:
      return 'acquisition'
    case 2:
      return 'new_location'
    case 3:
      return 'leadership_change'
    case 4:
      return 'growth'
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
      return {
        label: 'New location / facility / construction',
        angle: 'New meter timing, lease timing, construction power, and ramp-up risk.',
        question: `Are you planning the electricity piece for the ${texasLocation} site now, or is that still early?`,
        openers: [
          sourceLead,
          `When a company is adding a Texas site, the electricity piece usually needs to get handled before move-in, not after.`,
          `The part I’d want to sanity-check first is whether the new meter and ramp-up are being planned ahead of time.`,
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
      return {
        label: 'Growth / capex / headcount',
        angle: 'Growing load, added equipment, and budget creep before the bills catch up.',
        question: 'Has anyone checked whether the current setup still matches the way the site is growing?',
        openers: [
          sourceLead,
          `When headcount or capex starts moving, the electricity side usually changes before anyone notices it in the budget.`,
          `The thing I’d want to understand is whether the current setup still fits the way the operation is scaling.`,
        ],
        focus: ['load growth', 'equipment additions', 'budget creep'],
      }
    case 'restructuring':
      return {
        label: 'Restructuring / closure / consolidation',
        angle: 'Stranded capacity, unused sites, and cleanup after a footprint change.',
        question: 'Have you looked at whether the power side can be cleaned up with the footprint change?',
        openers: [
          sourceLead,
          `When a company closes or merges sites, the power side can keep carrying costs that no longer make sense.`,
          `That’s usually the point where I want to know whether the footprint change has already been worked through on the power side.`,
        ],
        focus: ['stranded capacity', 'unused sites', 'footprint cleanup'],
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
        angle: 'Fresh capital, tighter cost scrutiny, a new facility, and the next growth phase.',
        question: 'Has the electricity side been mapped against the new facility and production ramp, or is that still getting sorted out?',
        openers: [
          sourceLead,
          `A Series C plus a new manufacturing buildout usually means the power plan needs to be thought through before the next round of spending starts.`,
          `That is the kind of moment where I want to understand how the new facility and production ramp are being handled on the power side.`,
        ],
        focus: ['cost scrutiny', 'growth planning', 'budget visibility', 'facility buildout', 'production ramp'],
      }
    case 'industry_context':
    default:
      return {
        label: 'Industry context',
        angle: 'How this kind of business actually uses electricity.',
        question: 'When companies like this review electricity, what tends to get missed first?',
        openers: [
          `I looked at how ${companyName} runs day to day.`,
          `Even without a fresh news item, the bill usually points back to a few real operating habits.`,
          `What usually matters most is whether the setup still matches the way the business works now.`,
        ],
        focus: ['budget visibility', 'operating fit', 'ERCOT exposure'],
      }
  }
}

function buildIndustryGuidance(industryCluster: IndustryCluster, account: AccountRow) {
  const companyName = cleanText(account.name) || 'the company'
  const industryLabel = cleanText(account.industry) || companyName

  switch (industryCluster) {
    case 'manufacturing':
      return {
        label: 'Manufacturing / industrial',
        angle: 'Demand spikes driven by process timing, shift changes, and equipment start-up, plus 4CP exposure.',
        question: 'Has anyone mapped which processes or equipment are creating the spikes, and whether anything on-site could smooth them out?',
        openers: [
          `In manufacturing, the thing that usually bites is not the rate, it is the usage pattern and where the peaks come from.`,
          `If the operation runs in shifts, the electricity bill can punish the wrong kind of peak pretty fast.`,
          `The part I’d sanity-check first is which processes, schedules, or equipment are driving the spikes.`,
        ],
        focus: ['demand spikes', '4CP', 'production ramps', 'shift changes', 'equipment', 'operations', 'site practices'],
      }
    case 'logistics':
      return {
        label: 'Logistics / warehouse / distribution',
        angle: '24/7 warehouse usage, dock activity, automation, and HVAC drive the bill more than the headline rate.',
        question: 'Has anyone looked at which parts of the warehouse operation are creating the peaks, and whether scheduling or controls could smooth them out?',
        openers: [
          `Warehouses can look simple on paper, but dock activity, HVAC, and automation usually tell a different story.`,
          `A lot of the cost pressure comes from how the site is used, not just how it is priced.`,
          `I’d want to know which part of the operation is creating the peaks.`,
        ],
        focus: ['24/7 load', 'dock doors', 'automation', 'throughput swings', 'scheduling', 'controls'],
      }
    case 'food_storage':
      return {
        label: 'Food / cold storage',
        angle: 'Refrigeration load, freezer power, defrost cycles, and door openings drive the cost more than the rate.',
        question: 'Have you looked at which cooling systems or operating habits are causing the peaks, and whether controls or maintenance could help?',
        openers: [
          `Cold storage is different because refrigeration never really turns off.`,
          `When the load is tied to freezers, coolers, and defrost cycles, a small miss can show up quickly in the bill.`,
          `That is the kind of operation where I’d want to know what is driving the peaks on-site.`,
        ],
        focus: ['refrigeration', 'freezer load', 'summer peaks', 'temperature-sensitive load', 'defrost cycles', 'controls'],
      }
    case 'healthcare':
      return {
        label: 'Healthcare',
        angle: '24/7 uptime, occupancy, HVAC, and backup systems keep the load steady all day.',
        question: 'Have you looked at which parts of the building are driving the base load, and whether there is any safe way to trim waste without hurting reliability?',
        openers: [
          `Healthcare is one of those sectors where the building never really gets to sleep.`,
          `With 24/7 operations, the part I care about is reliability first and budget predictability second.`,
          `The power side matters because the load is tied to occupancy, HVAC, and backup readiness.`,
        ],
        focus: ['24/7 uptime', 'reliability', 'occupancy', 'backup systems', 'HVAC', 'base load'],
      }
    case 'banking':
      return {
        label: 'Banking / financial services',
        angle: 'Branch hours, occupancy, HVAC, ATMs, and IT closets drive the load more than one big bill number.',
        question: 'Do you know which branches or building systems are actually driving the most usage, or is it mostly handled as one bucket?',
        openers: [
          `A lot of banks and branch groups end up looking at one site at a time and missing the bigger picture.`,
          `Branch footprints can hide more in the usage pattern than people expect.`,
          `The first question I usually have is whether the group is tracking the real drivers or just the invoice total.`,
        ],
        focus: ['branch portfolio', 'usage drivers', 'budget predictability', 'HVAC', 'IT closets'],
      }
    case 'retail':
      return {
        label: 'Retail',
        angle: 'Store hours, traffic swings, lighting, HVAC, and refrigeration create seasonal load changes.',
        question: 'Have you looked at which store behaviors are creating the peaks, and whether controls or equipment changes could smooth them out?',
        openers: [
          `Retail usually swings more than people expect once the seasons and traffic patterns change.`,
          `A lot of stores look steady until occupancy, weather, or operating hours start moving the bill around.`,
          `If there are multiple locations, the timing can get messy fast if nobody is looking at the whole picture.`,
        ],
        focus: ['seasonal swings', 'occupancy changes', 'multi-site timing', 'lighting', 'HVAC', 'refrigeration'],
      }
    case 'restaurant':
      return {
        label: 'Restaurant / hospitality',
        angle: 'Kitchen load, HVAC, refrigeration, and prep schedules drive the bill more than the rate does.',
        question: 'Have you looked at which kitchen or HVAC loads are creating the spikes, and whether equipment or operating changes could help?',
        openers: [
          `Restaurants are tough because kitchen load, HVAC, and refrigeration can move the bill even when sales look flat.`,
          `The power side often gets overlooked until a location starts behaving differently in the summer.`,
          `If there are multiple units, consistency matters because each site can drift in a different direction.`,
        ],
        focus: ['kitchen load', 'HVAC', 'hours of operation', 'multi-unit consistency', 'refrigeration', 'equipment'],
      }
    case 'education_nonprofit':
      return {
        label: 'Education / nonprofit',
        angle: 'Campus occupancy, events, HVAC schedules, and building controls drive the load more than the invoice total.',
        question: 'Do you know which buildings or schedules are driving the load, and whether smarter controls or occupancy planning could help?',
        openers: [
          `For schools and nonprofits, the power side usually comes down to budget discipline and timing.`,
          `Campus operations can change with occupancy, events, and seasonal usage even when the footprint looks stable.`,
          `That is the sort of setup where usage patterns matter more than the contract headline.`,
        ],
        focus: ['tight budgets', 'campus timing', 'stewardship', 'seasonal occupancy', 'controls', 'scheduling'],
      }
    case 'technology':
      return {
        label: 'Technology / data-heavy office',
        angle: 'Cooling, server rooms, fit-outs, and occupancy changes drive the load faster than people expect.',
        question: 'Have you looked at which rooms or systems are causing the peaks, and whether cooling or space planning could reduce waste?',
        openers: [
          `Tech companies can add load quietly through fit-outs, cooling, and space changes.`,
          `A lot of the cost shows up after the growth is already live instead of before it starts.`,
          `That is why I’d want to know which systems are driving the peaks now.`,
        ],
        focus: ['fit-outs', 'growth', 'cooling', 'office load', 'server rooms', 'space planning'],
      }
    case 'energy_intensive':
      return {
        label: 'Energy-intensive industrial',
        angle: '4CP exposure, process load, large motors, and the equipment driving the peaks.',
        question: 'Have you mapped which processes or motors are creating the peaks, and whether controls or maintenance could smooth them out?',
        openers: [
          `When a site carries heavy load, the peak side of the bill can matter as much as the rate.`,
          `That is usually where process timing and equipment choices start to matter a lot more.`,
          `If the plant or site is energy intensive, I’d want to know which pieces are driving the peaks and whether anything can be smoothed on-site.`,
        ],
        focus: ['4CP', 'process load', 'peak exposure', 'large motors', 'equipment', 'site practices', 'maintenance'],
      }
    case 'office_services':
      return {
        label: 'Office / professional services',
        angle: 'Occupancy, lease changes, conference rooms, HVAC, and equipment usually drive the waste.',
        question: 'Has anyone looked at which parts of the building are actually driving the bill now, and whether occupancy or controls could trim waste?',
        openers: [
          `Office businesses usually feel quiet until a lease, occupancy change, or growth step changes the load.`,
          `The electricity side can stay untouched for years even when the business around it has changed a lot.`,
          `That is the kind of thing I’d want to check before it gets swallowed by the rest of the budget.`,
        ],
        focus: ['occupancy', 'new leases', 'conference load', 'budget control', 'HVAC', 'equipment'],
      }
    case 'multi_site':
      return {
        label: 'Multi-site / portfolio',
        angle: 'Portfolio timing, site-by-site usage differences, and whether one location is masking the real load story.',
        question: 'Do you look at usage patterns site by site, or is it mostly one bucket across the portfolio?',
        openers: [
          `Multi-site groups can leave leverage on the table when each location gets treated like a separate decision.`,
          `The bigger issue is usually whether someone is looking at the whole footprint instead of just one meter at a time.`,
          `Portfolio timing matters because one site can hide the real usage pattern.`,
        ],
        focus: ['portfolio timing', 'site-by-site blind spots', 'usage patterns', 'operating differences'],
      }
    case 'unknown':
    default:
      return {
        label: 'Company context',
        angle: 'Budget visibility, usage patterns, and whether the current setup still fits how the business runs now.',
        question: 'Has anyone looked at which parts of the business are actually driving the bill now?',
        openers: [
          `I was trying to get a feel for how ${industryLabel} runs day to day.`,
          `Even when the industry is broad, the bill usually points back to a few real habits.`,
          `What matters most is whether the current setup still matches the business as it runs today.`,
        ],
        focus: ['budget visibility', 'operating fit', 'ERCOT exposure', 'usage patterns'],
      }
  }
}

function buildTalkTrackContext(account: AccountRow, candidate: ResearchHit | null, isFallbackMode: boolean): TalkTrackContext {
  const seed = [account.id, candidate?.url || candidate?.title || '', isFallbackMode ? 'fallback' : 'signal'].join('|')
  const signalFamily = inferSignalFamily(candidate, isFallbackMode)
  const industryCluster = inferIndustryCluster(account)
  const signalGuidance = buildSignalGuidance(signalFamily, account, candidate)
  const industryGuidance = buildIndustryGuidance(industryCluster, account)
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

function talkTrackNeedsRewrite(talkTrack: string, context: TalkTrackContext) {
  const text = cleanText(talkTrack)
  if (!text) return true

  const lower = text.toLowerCase()
  const firstSentence = cleanText(text.split(/[.!?]+/)[0] || '')
  const genericHits = TALK_TRACK_GENERIC_PATTERNS.filter((pattern) => pattern.test(lower)).length
  const sentenceCount = text.split(/[.!?]+/).map(cleanText).filter(Boolean).length
  const mentionsSignal = TALK_TRACK_SIGNAL_KEYWORDS[context.signalFamily].some((keyword) => lower.includes(keyword.toLowerCase()))
  const mentionsIndustry = TALK_TRACK_INDUSTRY_KEYWORDS[context.industryCluster].some((keyword) => lower.includes(keyword.toLowerCase()))
  const mentionsAtLeastOneFocus = context.ercotFocus.some((phrase) => lower.includes(phrase.toLowerCase()))
  const genericOpening = /^(that|this|it)\s+(makes|is|was|would|can|usually|tends)\b/i.test(firstSentence)

  return genericHits > 0 || genericOpening || sentenceCount < 2 || (!mentionsSignal && !mentionsIndustry && !mentionsAtLeastOneFocus)
}

function buildManualTalkTrack(account: AccountRow, candidate: ResearchHit | null, context: TalkTrackContext, attempt = 0) {
  const companyName = cleanText(account.name) || 'the company'
  const signalAnchor = deriveSignalAnchor(account, candidate)
  const sourceLead = buildSourceLead(account, candidate)
  const location = [cleanText(account.city), cleanText(account.state)].filter(Boolean).join(', ')
  const locationText = location || 'Texas'
  const variantSeed = `${context.seed}|${attempt}`
  const openerBySignal: Record<SignalFamily, string[]> = {
    acquisition: [
      sourceLead,
      `The deal news on ${companyName} is exactly the kind of thing that makes me ask what got inherited on the power side.`,
      `When ownership changes, the electricity setup is usually the first thing that deserves a clean look.`,
    ],
    new_location: [
      sourceLead,
      `When a company adds a ${locationText} location, the power setup usually needs to be thought through before move-in.`,
      `That is the kind of change where the new meter and ramp-up deserve attention early.`,
    ],
    leadership_change: [
      sourceLead,
      `Fresh eyes usually mean somebody has to explain what the power side looks like in plain English.`,
      `That is the first thing I'd want a new CFO or facilities lead to have in front of them.`,
    ],
    growth: [
      sourceLead,
      `Headcount, capex, or a bigger footprint usually changes the bill before it shows up anywhere obvious.`,
      `That is why I'd want to know whether the current setup still matches how the site is growing.`,
    ],
    restructuring: [
      sourceLead,
      `When a company consolidates or closes a site, the power side can keep carrying costs that no longer make sense.`,
      `That is usually the point where I'd want to know whether the footprint change has already been cleaned up on the power side.`,
    ],
    contract_win: [
      sourceLead,
      `New work can change the load story faster than people expect.`,
      `That is the kind of change that can leave the old utility setup out of step pretty quickly.`,
    ],
    funding: [
      sourceLead,
      `A raise like that usually means someone is going to ask whether the new capital lines up with the facility and production plan.`,
      `That is where I'd want to understand the load growth, not just the headline funding number.`,
    ],
    industry_context: [
      sourceLead,
      `I looked at how ${companyName} runs day to day.`,
      `Even without a fresh news item, the bill usually points back to a few real operating habits.`,
      `What matters is whether the setup still matches the way the business works day to day.`,
    ],
  }

  const opener = pickVariant(openerBySignal[context.signalFamily], variantSeed) || openerBySignal[context.signalFamily][0]
  const industryLineByCluster: Record<IndustryCluster, string[]> = {
    manufacturing: [
      'In manufacturing, the thing that usually bites is not the rate, it is the usage pattern and where the peaks come from.',
      'If the operation runs in shifts, the bill can punish the wrong kind of peak pretty fast.',
      'I’d want to know which processes, schedules, or equipment are driving the spikes.',
    ],
    logistics: [
      'Warehouses can look simple on paper, but dock activity, HVAC, and automation usually tell a different story.',
      'A lot of the cost pressure comes from how the site is used, not just how it is priced.',
      'I’d want to know which part of the operation is creating the peaks.',
    ],
    food_storage: [
      'Cold storage is different because refrigeration never really turns off.',
      'When the load is tied to freezers, coolers, and defrost cycles, a small miss can show up quickly in the bill.',
      'That is the kind of operation where I’d want to know what is driving the peaks on-site.',
    ],
    healthcare: [
      'Healthcare is one of those sectors where the building never really gets to sleep.',
      'With 24/7 operations, the part I care about is reliability first and budget predictability second.',
      'The power side matters because the load is tied to occupancy, HVAC, and backup readiness.',
    ],
    banking: [
      'A lot of banks and branch groups end up looking at one site at a time and missing the bigger picture.',
      'Branch footprints can hide more in the usage pattern than people expect.',
      'The first question I usually have is whether the group is tracking the real drivers or just the invoice total.',
    ],
    retail: [
      'Retail usually swings more than people expect once the seasons and traffic patterns change.',
      'A lot of stores look steady until occupancy, weather, or operating hours start moving the bill around.',
      'If there are multiple locations, the timing can get messy fast if nobody is looking at the whole picture.',
    ],
    restaurant: [
      'Restaurants are tough because kitchen load, HVAC, and refrigeration can move the bill even when sales look flat.',
      'The power side often gets overlooked until a location starts behaving differently in the summer.',
      'If there are multiple units, consistency matters because each site can drift in a different direction.',
    ],
    education_nonprofit: [
      'For schools and nonprofits, the power side usually comes down to budget discipline and timing.',
      'Campus operations can change with occupancy, events, and seasonal usage even when the footprint looks stable.',
      'That is the sort of setup where usage patterns matter more than the contract headline.',
    ],
    technology: [
      'Tech companies can add load quietly through fit-outs, cooling, and space changes.',
      'A lot of the cost shows up after the growth is already live instead of before it starts.',
      'That is why I’d want to know which systems are driving the peaks now.',
    ],
    energy_intensive: [
      'When a site carries heavy load, the peak side of the bill can matter as much as the rate.',
      'That is usually where process timing and equipment choices start to matter a lot more.',
      'If the plant or site is energy intensive, I’d want to know which pieces are driving the peaks and whether anything can be smoothed on-site.',
    ],
    office_services: [
      'Office businesses usually feel quiet until a lease, occupancy change, or growth step changes the load.',
      'The power side can stay untouched for years even when the business around it has changed a lot.',
      'That is the kind of thing I’d want to check before it gets swallowed by the rest of the budget.',
    ],
    multi_site: [
      'Multi-site groups can leave leverage on the table when each location gets treated like a separate decision.',
      'The bigger issue is usually whether someone is looking at the whole footprint instead of just one meter at a time.',
      'Portfolio timing matters because one site can hide the real usage pattern.',
    ],
    unknown: [
      'Even when the industry is broad, the bill usually shows up in the same few places.',
      'What matters most is whether the current setup still matches the business as it runs today.',
      'That is the part I’d want to understand before anything else.',
    ],
  }

  const industryLine = pickVariant(industryLineByCluster[context.industryCluster], variantSeed) || industryLineByCluster[context.industryCluster][0]
  const question = context.question

  switch (context.openingPattern) {
    case 'question':
      return [
        opener,
        industryLine,
        `${stripTrailingQuestionMark(question)}?`,
      ].join(' ')
    case 'contrast':
      return [
        `The business update is one thing, but the power side is usually where the practical questions show up.`,
        opener,
        industryLine,
        question,
      ].join(' ')
    case 'curiosity':
      return [
        `I saw the update about ${signalAnchor}. What I wanted to understand is how that changes the power side.`,
        opener,
        industryLine,
        question,
      ].join(' ')
    case 'observation':
    default:
      return [opener, industryLine, question].join(' ')
  }
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

function validateBriefResult(result: BriefResult, candidate: ResearchHit | null) {
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

  return {
    signal_headline: headline,
    signal_detail: detail,
    talk_track: talkTrack,
    signal_date: signalDate,
    source_date: sourceDate,
    source_url: sourceUrl,
    confidence_level: confidence || 'Medium',
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
  const snippet = cleanText(candidate?.snippet || '')
  const headline = cleanText(candidate?.title || '') || `${companyName} update`
  const detailParts = [
    snippet || `I saw an update about ${signalAnchor}.`,
    `That is the kind of change that can matter on the power side because it usually shifts how the site is being used.`,
    context.question,
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

async function fetchIndustryTrends(account: AccountRow): Promise<ResearchHit[]> {
  const industry = cleanText(account.industry)
  if (!industry) return []

  const trendBuckets = [
    {
      priority: 9,
      label: 'Industry Trends',
      query: `${industry} Texas ERCOT commercial energy demand expansion facilities hiring 4CP`,
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
    account: {
      name: account.name || '',
      industry: account.industry || '',
      domain: account.domain || '',
      linkedin_url: account.linkedin_url || '',
      city: account.city || '',
      state: account.state || '',
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
      title: item.title,
      url: item.url,
      snippet: item.snippet,
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
- If there is no clear, usable signal, set "usable_signal" to false and leave the other fields empty.
- Signal Detail must be 2 to 4 sentences.
- Talk Track must be UNIQUE to the specific signal found. Do NOT use generic templates.
- Talk Track should sound like a real person who actually researched this company, not a script.
- Talk Track must be 3-5 short sentences maximum. Use conversational language.
- Talk Track should make the prospect THINK about their specific situation, not pitch at them.
- Use plain language. Avoid corporate fluff.
- Use human source language in the opener. Say "I saw a report about...", "I saw an article about...", "I saw a post online about...", "I saw your announcement about...", or "I came across your website..." instead of "I saw the note..." or "I was looking at...".
- Confidence Level must be exactly High, Medium, or Low.
- Source URL must be one of the supplied URLs.
- Signal Date should be the event or article date in YYYY-MM-DD if available; otherwise use the closest approximate date from the research results.
- Source Date should be the publication date of the report, article, post, filing, or company announcement in YYYY-MM-DD if available; otherwise use the closest approximate published date from the research results.
- Use the talk_track_context block below as the real sales angle. It already tells you the signal family, the ERCOT angle, the operating context, the opening style, and the question to ask.
- Start with a direct observation about the event and why it matters for operations. Do not open like a support ticket or ask if the person is "responsible" for electricity.
- Rotate the first sentence shape. Do not always open the same way.
- Make the talk track specific to the signal and the industry, not just the company name.
- Do not imply the electricity agreement creates demand spikes. Spikes come from how the site is being used; contract structure only changes how those spikes show up on the bill.
- Do not echo page titles, inventory copy, catalog language, or storefront language back into the talk track.
- Avoid the phrases listed in talk_track_context. If the response starts sounding generic, rewrite it.

Talk Track angle selection (choose ONE based on the actual signal):

IF SIGNAL = New location/facility/expansion:
- Focus on timing and planning ahead, not reactive decisions
- Question: Are they thinking about the electricity setup NOW or waiting until they move in?
- Example: "I saw you're opening a new location in [city]. Most companies wait until they're in the building to think about the electricity setup, and by then they're reacting instead of planning. How far ahead are you on that, or is it still on the back burner?"

IF SIGNAL = Acquisition/merger/being acquired:
- Focus on inherited agreements and hidden exposure
- Question: Do they know what they're inheriting on the electricity side?
- Example: "I saw [company] was acquired by [acquirer]. Usually when that happens, the electricity agreements get inherited without much review, and sometimes there's exposure nobody caught. Have you guys looked at what you're actually taking on, or is that still being sorted out?"

IF SIGNAL = Leadership change (CFO, COO, Facilities Director):
- Focus on inherited problems and fresh-eyes review
- Question: Is the new person aware of what they inherited?
- Example: "I saw [name] just joined as CFO. Usually when someone new comes in, they inherit the electricity setup without realizing what's actually in there. Has [name] had a chance to review that side yet, or is it still on the list?"

IF SIGNAL = Funding round/IPO/capital raise:
- Focus on budget scrutiny and cost visibility before scaling
- Question: Are they tightening up costs before the next growth phase?
- Example: "I saw you guys just closed a Series B. If that capital is going toward a new facility or a bigger production ramp, the thing I'd want to understand is how the power side is being mapped against that buildout. Has that been reviewed yet, or is it still getting sorted out?"

IF SIGNAL = Contract win/new customer/major project:
- Focus on load increase and whether current agreement can handle it
- Question: Will the current setup handle the new load without surprises?
- Example: "I saw you landed the [customer/project] contract. That's going to change your load profile pretty significantly. Have you looked at whether your current electricity setup can handle that without creating surprises, or is that still down the road?"

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
- Talk Track should be 3-5 short sentences maximum. Use conversational language.
- Use plain language. Avoid corporate fluff.
- Use human source language in the opener. Say "I saw a report about...", "I saw an article about...", "I saw a post online about...", or "I came across your website..." instead of "I saw the note..." or "I was looking at...".
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
- Do not imply the electricity agreement creates demand spikes. Spikes come from usage, scheduling, and equipment; the contract only affects the cost exposure.
- Do not echo page titles, inventory copy, catalog language, or storefront language back into the talk track.
- Avoid the phrases listed in talk_track_context. If the response starts sounding generic, rewrite it.

Talk Track angle selection for fallback mode (choose based on what you found):

IF COMPANY = Multi-location/multi-site:
- Focus on whether they look at electricity site-by-site or portfolio-wide
- Example: "I noticed you've got locations across [region]. Most multi-site companies end up looking at electricity one location at a time, which is fine, but sometimes that leaves leverage on the table. Do you guys tend to look at that site by site, or more at the company level?"

IF COMPANY = Actively hiring/growing team:
- Focus on operational changes and whether electricity setup is keeping up
- Example: "I saw you're actively hiring right now. Usually when headcount is moving like that, the electricity side starts behaving differently, but nobody notices until costs start creeping up. Has that been pretty stable for you guys, or are you seeing some movement?"

IF COMPANY = Long-established (20+ years):
- Focus on whether they've reviewed their setup recently or it's just been running
- Example: "I noticed you've been around for [X] years in [city]. Most established companies have electricity agreements that have just been rolling over without much review. When's the last time you guys actually looked at whether the setup still makes sense, or has it just been running?"

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
      model: 'google/gemini-3-flash-preview',
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
  const validated = validateBriefResult(parsed, bestCandidate)
  return validated
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
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
    if (lastRefreshAt) {
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
    }

    const talkTrackCandidate = generatedBrief ? findCandidateForResult(generatedBrief as BriefResult, rescueCandidates) : rescueCandidates[0] || null
    const talkTrackRewriteContext = buildTalkTrackContext(account, talkTrackCandidate, false)
    const previousTalkTrack = cleanText(account.intelligence_brief_talk_track || '')
    if (validated) {
      const shouldRewrite = talkTrackNeedsRewrite(validated.talk_track || '', talkTrackRewriteContext) ||
        (previousTalkTrack && talkTrackIsTooSimilarToPrevious(validated.talk_track || '', previousTalkTrack))

      if (shouldRewrite) {
        let rewrittenTalkTrack = buildManualTalkTrack(account, talkTrackCandidate, talkTrackRewriteContext, 0)

        if (previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) {
          rewrittenTalkTrack = buildManualTalkTrack(account, talkTrackCandidate, talkTrackRewriteContext, 1)
        }

        if (previousTalkTrack && talkTrackIsTooSimilarToPrevious(rewrittenTalkTrack, previousTalkTrack)) {
          rewrittenTalkTrack = buildManualTalkTrack(account, talkTrackCandidate, talkTrackRewriteContext, 2)
        }

        validated = {
          ...validated,
          talk_track: rewrittenTalkTrack,
        }
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
