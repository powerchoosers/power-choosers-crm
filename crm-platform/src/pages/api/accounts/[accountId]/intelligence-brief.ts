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

type BriefResult = {
  usable_signal: boolean
  signal_headline?: string
  signal_detail?: string
  talk_track?: string
  signal_date?: string
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

const FALLBACK_MESSAGE = 'No recent signals found for this account. Try again later or check the source manually.'
const COOLDOWN_MS = 60 * 60 * 1000
const ACCOUNT_SELECT = 'id, name, industry, domain, linkedin_url, city, state, ownerId, intelligence_brief_headline, intelligence_brief_detail, intelligence_brief_talk_track, intelligence_brief_signal_date, intelligence_brief_source_url, intelligence_brief_confidence_level, intelligence_brief_last_refreshed_at, intelligence_brief_status'
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

function dedupeAndSort(items: ResearchHit[]) {
  const seen = new Set<string>()
  return items
    .slice()
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      const left = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const right = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return right - left
    })
    .filter((item) => {
      const key = `${item.url || item.title}`.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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
      query: `"${name}" new Texas location future location opening soon lease construction facility warehouse plant${domainClause}${texasClause}${locationClause}`,
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
      query: `site:sec.gov "${name}" Texas location opening lease construction facility warehouse plant${locationBits}`,
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

function inferSignalPriority(text: string, fallbackPriority: number) {
  const lower = cleanText(text).toLowerCase()
  if (/(acquir|merger|takeover|buyout)/.test(lower)) return 1
  if (/(new location|future location|opening soon|opening|lease|construction|facility|warehouse|plant|groundbreaking)/.test(lower)) return 2
  if (/(cfo|chief financial officer|coo|chief operating officer|vp of finance|vice president of finance|facilities director|energy manager|promoted|hired)/.test(lower)) return 3
  if (/(expansion|capital expenditure|capex|headcount|growth|future site|buildout|build-out)/.test(lower)) return 4
  if (/(restructuring|closure|consolidation|downsizing|layoff|shutdown)/.test(lower)) return 5
  if (/(contract award|government contract|customer win|major customer|new customer)/.test(lower)) return 6
  if (/(funding round|series [abcde]|ipo|initial public offering|going public)/.test(lower)) return 7
  return fallbackPriority
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

function extractBodyText(html: string) {
  return cleanText(
    String(html || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
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
    extractTimeDatetime(html)
  )

  const bodyText = extractBodyText(html)
  if (sourceKind === 'linkedin' && /(sign in|join linkedin|authwall|create account)/i.test(bodyText)) {
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

async function fetchBingRssHits(buckets: Array<{ priority: number; label: string; query: string }>, sourceKind: ResearchSourceKind, maxItemsPerBucket = 4) {
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

  return dedupeAndSort(results.flat())
}

async function fetchBingNewsHits(buckets: Array<{ priority: number; label: string; query: string }>, sourceKind: ResearchSourceKind, maxItemsPerBucket = 4) {
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

  return dedupeAndSort(results.flat())
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

  return dedupeAndSort(candidates.filter(Boolean) as ResearchHit[])
}

async function fetchSecSearchHits(account: AccountRow) {
  return fetchBingRssHits(buildSecBuckets(account).slice(0, 4), 'sec', 3)
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

  const searchHits = await fetchBingRssHits(buildLinkedInBuckets(account), 'linkedin', 3)
  hits.push(...searchHits)
  return dedupeAndSort(hits)
}

async function fetchGeneralWebHits(account: AccountRow) {
  return fetchBingRssHits(buildSearchBuckets(account, true), 'web', 4)
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
      return dedupeAndSort(rssResults.flat())
    })(),
    fetchBingNewsHits(buckets, 'news', 4),
    fetchGeneralWebHits(account),
    fetchLinkedInHits(account),
    fetchSecSearchHits(account),
    fetchSecFilingHits(account),
  ])) as PromiseSettledResult<ResearchHit[]>[]

  const [newsHits, bingNewsHits, webHits, linkedInHits, secSearchHits, secFilingHits] = settled.map((result: PromiseSettledResult<ResearchHit[]>) => (
    result.status === 'fulfilled' ? result.value : []
  )) as [ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[], ResearchHit[]]

  return dedupeAndSort([...newsHits, ...bingNewsHits, ...webHits, ...linkedInHits, ...secSearchHits, ...secFilingHits])
}

function serializeAccount(account: AccountRow) {
  return {
    id: account.id,
    intelligenceBriefHeadline: account.intelligence_brief_headline || null,
    intelligenceBriefDetail: account.intelligence_brief_detail || null,
    intelligenceBriefTalkTrack: account.intelligence_brief_talk_track || null,
    intelligenceBriefSignalDate: account.intelligence_brief_signal_date || null,
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
  const sourceUrl = candidate?.url || cleanText(result?.source_url) || ''
  const signalDate = formatDateForDb(result?.signal_date, candidate?.publishedAt || null)
  const confidence = toTitleCase(cleanText(result?.confidence_level))

  if (!usable || !headline || !detail || !talkTrack || !sourceUrl || !signalDate) {
    return null
  }

  return {
    signal_headline: headline,
    signal_detail: detail,
    talk_track: talkTrack,
    signal_date: signalDate,
    source_url: sourceUrl,
    confidence_level: confidence || 'Medium',
    selected_priority: candidate?.priority ?? result?.selected_priority ?? 0,
    source_title: candidate?.title || result?.source_title || '',
    source_domain: candidate?.source || result?.source_domain || '',
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
      query: `${industry} industry trends 2026 technology adoption digital transformation`,
    },
  ]

  try {
    return await fetchBingNewsHits(trendBuckets, 'news', 3)
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
    research_results: selectedCandidates.map((item) => ({
      priority: item.priority,
      bucket: item.label,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      published_at: item.publishedAt,
      source: item.source,
      source_kind: item.sourceKind,
    })),
  }

  const basePrompt = `You are writing an Intelligence Brief for Nodal Point, a Texas commercial energy broker.

Use ONLY the research payload below. It may include Google News, broad web search, LinkedIn company pages/posts, SEC filings, and official company pages. Do not invent facts. Do not mention that you searched or mention LinkedIn, Google, RSS, SEC, or any source platform in the final output.`

  const newsSignalPrompt = `${basePrompt}

Decision rules:
- Pick ONE signal only.
- Use the highest-priority signal supported by the research results.
- If a SEC filing or LinkedIn result confirms the same event, prefer it over a generic web snippet.
- If there is no clear, usable signal, set "usable_signal" to false and leave the other fields empty.
- Signal Detail must be 2 to 4 sentences.
- Talk Track must be first-person and sound like an energy broker who did the homework.
- Confidence Level must be exactly High, Medium, or Low.
- Source URL must be one of the supplied URLs.
- Signal Date should be the event or article date in YYYY-MM-DD if available; otherwise use the closest approximate date from the research results.
- Write plain English that a rep can use immediately.`

  const fallbackPrompt = `${basePrompt}

FALLBACK MODE: No recent news signals were found. Generate an intelligence brief based on company website information and industry context.

Decision rules:
- ALWAYS set "usable_signal" to true in fallback mode.
- Create a headline that positions the company within their industry context and growth opportunities.
- Signal Detail should describe: company overview (services, team size, location), any hiring/growth indicators from their website, and relevant industry trends affecting their sector.
- Talk Track must be first-person, consultative, and focus on how industry trends create opportunities for the company (e.g., technology adoption, efficiency improvements, competitive positioning).
- Confidence Level should be "Medium" for fallback briefs.
- Source URL should be the company website or the most relevant industry trend article.
- Signal Date should be today's date in YYYY-MM-DD format.
- Write plain English that positions you as a knowledgeable partner who understands their industry.`

  const prompt = isFallbackMode ? fallbackPrompt : newsSignalPrompt

  const fullPrompt = `${prompt}

Return JSON only with this shape:
{
  "usable_signal": true,
  "signal_headline": "",
  "signal_detail": "",
  "talk_track": "",
  "signal_date": "YYYY-MM-DD",
  "source_url": "",
  "confidence_level": "High|Medium|Low",
  "selected_priority": 1,
  "source_title": "",
  "source_domain": ""
}

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

    if (!validated) {
      outcomeStatus = 'empty'
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
