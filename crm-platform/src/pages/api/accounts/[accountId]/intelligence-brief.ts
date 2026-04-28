import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, requireUser } from '@/lib/supabase'
import { buildOwnerScopeValues } from '@/lib/owner-scope'

type BriefStatus = 'idle' | 'ready' | 'empty' | 'error'

type AccountRow = {
  id: string
  name: string | null
  industry: string | null
  domain: string | null
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

const FALLBACK_MESSAGE = 'No recent signals found for this account. Try again later or check the source manually.'
const COOLDOWN_MS = 60 * 60 * 1000
const ACCOUNT_SELECT = 'id, name, industry, domain, city, state, ownerId, intelligence_brief_headline, intelligence_brief_detail, intelligence_brief_talk_track, intelligence_brief_signal_date, intelligence_brief_source_url, intelligence_brief_confidence_level, intelligence_brief_last_refreshed_at, intelligence_brief_status'

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

function parseRssItems(xml: string, bucket: { priority: number; label: string; query: string }, maxItems = 3): ResearchHit[] {
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
    const source = getTag('source') || 'Google News'

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

function buildSearchBuckets(account: AccountRow) {
  const name = cleanText(account.name) || 'Unknown Company'
  const domain = cleanText(account.domain)
  const city = cleanText(account.city)
  const state = cleanText(account.state)
  const location = [city, state].filter(Boolean).join(', ')
  const industry = cleanText(account.industry)
  const domainClause = domain ? ` site:${domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : ''

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
      query: `"${name}" new Texas location opening lease construction facility warehouse plant${domainClause}${texasClause}${locationClause}`,
    },
    {
      priority: 3,
      label: 'Executive Leadership Changes',
      query: `"${name}" CFO COO "VP of Finance" "Facilities Director" "Energy Manager" promoted hired LinkedIn${domainClause}${locationClause}`,
    },
    {
      priority: 4,
      label: 'Expansion / Capex / Headcount',
      query: `"${name}" expansion capital expenditure capex hiring headcount growth${industry ? ` ${industry}` : ''}${domainClause}${locationClause}`,
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
  const sourceUrl = cleanText(result?.source_url) || candidate?.url || ''
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

async function runOpenRouterResearch(account: AccountRow, candidates: ResearchHit[]) {
  const openRouterKey = process.env.OPEN_ROUTER_API_KEY
  if (!openRouterKey) {
    throw new Error('OPEN_ROUTER_API_KEY is not configured')
  }

  const selectedCandidates = candidates.slice(0, 12)
  const researchPayload = {
    account: {
      name: account.name || '',
      industry: account.industry || '',
      domain: account.domain || '',
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
    })),
  }

  const prompt = `You are writing an Intelligence Brief for Nodal Point, a Texas commercial energy broker.

Use ONLY the research payload below. Do not invent facts. Do not mention that you searched or mention LinkedIn, Google, RSS, or any source platform in the final output.

Decision rules:
- Pick ONE signal only.
- Use the highest-priority signal supported by the research results.
- If there is no clear, usable signal, set "usable_signal" to false and leave the other fields empty.
- Signal Detail must be 2 to 4 sentences.
- Talk Track must be first-person and sound like an energy broker who did the homework.
- Confidence Level must be exactly High, Medium, or Low.
- Source URL must be one of the supplied URLs.
- Signal Date should be the event or article date in YYYY-MM-DD if available; otherwise use the closest approximate date from the research results.
- Write plain English that a rep can use immediately.

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
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate the account intelligence brief now.' },
      ],
      temperature: 0.2,
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

  const bestCandidate = selectedCandidates.find((item) => item.priority === Number(parsed?.selected_priority)) || selectedCandidates[0] || null
  const validated = validateBriefResult(parsed, bestCandidate)
  return validated
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    return res.status(500).json({ ok: false, message: 'Failed to load account', detail: accountError.message })
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

  const buckets = buildSearchBuckets(account)
  const headers = { 'User-Agent': 'NodalPointCRM/1.0' }
  const fetchPromises = buckets.map(async (bucket) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(bucket.query)}&hl=en-US&gl=US&ceid=US:en`
    try {
      const { response, text } = await fetchTextWithTimeout(url, { headers }, 12000)
      if (!response.ok || !text) return [] as ResearchHit[]
      return parseRssItems(text, bucket, 3)
    } catch (error) {
      console.warn('[Intelligence Brief] RSS fetch failed for bucket:', bucket.label, error)
      return [] as ResearchHit[]
    }
  })

  const bucketResults = await Promise.all(fetchPromises)
  const candidateResults = dedupeAndSort(bucketResults.flat())

  let outcomeStatus: BriefStatus = 'empty'
  let validated: ReturnType<typeof validateBriefResult> = null
  let generatedBrief: ReturnType<typeof validateBriefResult> = null

  if (candidateResults.length > 0) {
    try {
      generatedBrief = await runOpenRouterResearch(account, candidateResults)
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
  } else {
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
    return res.status(500).json({ ok: false, message: 'Failed to store intelligence brief', detail: updateError.message })
  }

  const serialized = serializeAccount(updatedAccount as AccountRow)

  if (validated) {
    return res.status(200).json({
      ok: true,
      message: 'Intelligence brief refreshed.',
      brief: validated,
      account: serialized,
    })
  }

  return res.status(200).json({
    ok: false,
    message: FALLBACK_MESSAGE,
    account: serialized,
  })
}
