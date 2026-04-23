// @ts-nocheck
/**
 * scrape-intelligence
 * Focused recon scraper for outreach-targeted market intelligence.
 * Keeps rows compact, avoids invalid enum values, and trims old records
 * so Supabase storage doesn't grow without bounds.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as crypto from 'node:crypto'

const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY')
const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const MAX_TOTAL_ROWS = 450
const MAX_SUMMARY_LEN = 320
const MAX_NAME_LEN = 120
const MAX_HEADLINE_LEN = 180

const REGULATED_CITIES = ['austin', 'san antonio', 'el paso', 'amarillo', 'new braunfels', 'converse', 'schertz', 'selma']

const TARGET_ZONES = `Focus on the Texas deregulated market (ERCOT). Major hubs include DFW, Houston, Rio Grande Valley, and the Coastal Bend. Use your knowledge to identify if the city is in a deregulated territory (Oncor, CenterPoint, AEP, TNMP). Strictly exclude municipal utilities in Austin (Austin Energy) and San Antonio (CPS Energy).`

const EXCLUSIONS = `Strictly exclude energy producers/sellers and residential projects. Focus on real commercial and industrial CONSUMERS. No unnamed entities. Targeting enterprise and mid-market buyers (no employee cap).`

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function normalizeCityKey(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesCityTerm(city: string, term: string): boolean {
  const normalizedCity = normalizeCityKey(city)
  const normalizedTerm = normalizeCityKey(term)
  if (!normalizedCity || !normalizedTerm) return false
  return normalizedCity === normalizedTerm
    || normalizedCity.startsWith(`${normalizedTerm} `)
    || normalizedCity.endsWith(` ${normalizedTerm}`)
    || normalizedCity.includes(` ${normalizedTerm} `)
}

function truncate(value: unknown, max: number): string | null {
  const text = cleanText(value)
  if (!text) return null
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

function normalizeDomain(value: unknown): string {
  const text = cleanText(value).toLowerCase()
  if (!text) return ''
  return text.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
}

function hashHeadline(headline: string): string {
  return crypto.createHash('sha256').update(headline.toLowerCase().trim()).digest('hex').slice(0, 16)
}

function safeHostname(value: unknown): string | null {
  const text = cleanText(value)
  if (!text) return null
  try {
    return new URL(text).hostname
  } catch {
    return null
  }
}

function isRegulatedTerritory(signal: any): boolean {
  const city = cleanText(signal.city || signal.metadata?.city).toLowerCase()
  if (!city) return false
  return REGULATED_CITIES.some((term) => city.includes(term))
}

function determineTdspZone(city: string, foundTdsp?: string): string {
  if (foundTdsp && ['oncor', 'centerpoint', 'aep', 'tnmp'].some(x => foundTdsp.toLowerCase().includes(x))) {
    if (foundTdsp.toLowerCase().includes('oncor')) return 'Oncor'
    if (foundTdsp.toLowerCase().includes('centerpoint')) return 'CenterPoint'
    if (foundTdsp.toLowerCase().includes('aep')) return 'AEP Texas'
    if (foundTdsp.toLowerCase().includes('tnmp')) return 'TNMP'
  }
  if (['houston', 'beaumont', 'port arthur', 'baytown', 'pasadena', 'pearland', 'sugar land', 'the woodlands', 'conroe', 'galveston', 'lufkin', 'nacogdoches', 'aldine', 'bammel', 'bunker hill village', 'hedwig village', 'hilshire village', 'huffman', 'humble', 'hunters creek village', 'jersey village', 'kingwood', 'oak ridge north', 'piney point village', 'satsuma', 'spring', 'spring branch', 'spring valley', 'spring valley village', 'westfield'].some((x) => matchesCityTerm(city, x))) return 'CenterPoint'
  if (['dallas', 'fort worth', 'arlington', 'plano', 'irving', 'garland', 'mesquite', 'mckinney', 'frisco', 'grand prairie', 'waco', 'lubbock', 'tyler', 'longview', 'wichita falls', 'abilene', 'midland', 'odessa'].some((x) => matchesCityTerm(city, x))) return 'Oncor'
  if (['corpus christi', 'victoria', 'mcallen', 'laredo', 'harlingen', 'brownsville'].some((x) => matchesCityTerm(city, x))) return 'AEP Texas'
  if (['pecos', 'fort stockton', 'alpine', 'marfa', 'presidio', 'big spring', 'sweetwater', 'clute', 'lake jackson', 'angleton', 'alvin', 'freeport'].some((x) => matchesCityTerm(city, x))) return 'TNMP'
  return 'ERCOT_Unknown'
}

async function verifyWithApollo(entityName: string): Promise<{ domain: string; logo_url: string; employee_count?: number } | null> {
  if (!APOLLO_API_KEY || !entityName) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch('https://api.apollo.io/v1/mixed_companies/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify({ q_organization_name: entityName, per_page: 1 }),
    }).finally(() => clearTimeout(timeout))

    if (!response.ok) return null

    const data = await response.json()
    const org = data.organizations?.[0] || data.accounts?.[0]
    if (!org) return null

    return {
      domain: cleanText(org.primary_domain || org.domain).toLowerCase(),
      logo_url: cleanText(org.logo_url),
      employee_count: org.employee_count || null,
    }
  } catch {
    return null
  }
}

// ── Rotation tables — vary search territory on every run ─────────────────────
// Industry bucket rotates by hour-of-day (8 buckets → changes 3x/day across crons)
const INDUSTRY_BUCKETS = [
  'cold storage, food processing, meat packing, dairy, beverage manufacturing, brewery',
  'data centers, colocation facilities, hyperscale computing, cloud infrastructure',
  'hospitals, health systems, surgery centers, long-term care, specialty clinics',
  'petrochemical, chemical processing, plastics manufacturing, rubber, specialty chemicals',
  'automotive plants, auto parts, stamping, tier-1 suppliers, EV component manufacturing',
  'logistics hubs, distribution centers, fulfillment centers, refrigerated 3PL warehousing',
  'hotel chains, resort operations, convention centers, casino resorts, large hospitality',
  'steel mills, metal fabrication, aluminum processing, foundries, pipe and tube manufacturing',
]

// City cluster rotates by day-of-epoch (4 buckets → different ERCOT geography each day)
const CITY_CLUSTERS = [
  'Houston, Spring, Humble, Kingwood, Oak Ridge North, Jersey Village, Beaumont, Port Arthur, Baytown, Pasadena, Sugar Land, The Woodlands, Conroe, Galveston',
  'Dallas, Fort Worth, Arlington, Plano, Irving, McKinney, Frisco, Denton, Waco, Garland',
  'Corpus Christi, Victoria, McAllen, Laredo, Harlingen, Brownsville, Edinburg',
  'Midland, Odessa, Abilene, Lubbock, Wichita Falls, Tyler, Longview, Lufkin, Nacogdoches',
]

function getRotation(): { industry: string; cities: string } {
  const hourSlot = Math.floor(Date.now() / 3_600_000) % INDUSTRY_BUCKETS.length
  const daySlot = Math.floor(Date.now() / 86_400_000) % CITY_CLUSTERS.length
  return { industry: INDUSTRY_BUCKETS[hourSlot], cities: CITY_CLUSTERS[daySlot] }
}

function getJobs(mode: string) {
  const today = new Date()
  const year = today.getFullYear()
  const stamp = today.toDateString()
  const { industry, cities } = getRotation()
  const FOCUS = `This run focuses on: ${industry}. Priority cities: ${cities}.`

  const allJobs = [
    {
      type: 'new_location',
      prompt: `Find 10-15 Texas companies opening new facilities, breaking ground, or relocating in ${year}. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'energy_rfp',
      prompt: `Find 5-10 active open RFPs issued after ${stamp} for retail electricity supply, energy consulting, or commercial energy management in Texas. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'expansion',
      prompt: `Find 10-15 Texas industrial plant expansions, capex investments, new production lines, or manufacturing growth projects in ${year}. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'sec_filing',
      prompt: `Find 5-10 SEC filings (8-K, 10-Q) or investor updates in ${year} signaling new Texas facility growth, significant new electrical load, or major operational capex. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'capital_raise',
      prompt: `Find 5-10 Texas mid-market or enterprise companies that closed investment rounds, issued bonds, or completed IPOs in ${year} and are deploying capital into facilities or operations. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'merger_acquisition',
      prompt: `Find 5-10 M&A deals, private equity buyouts, or ownership changes involving Texas-based commercial or industrial companies in ${year}. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'hiring_spree',
      prompt: `Find 5-10 Texas companies announcing significant hiring campaigns (50+ jobs), new shift additions, or workforce expansions tied to operational growth in ${year}. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'data_center',
      prompt: `Find 10-15 new data center campus announcements, hyperscale expansions, or colocation facility groundbreakings in Texas deregulated zones for ${year}. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'tax_abatement',
      prompt: `Find 10-15 Texas Chapter 312 or 313 tax abatement applications, economic development agreements, or industrial district incentive grants approved in ${year}. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'industrial_permit',
      prompt: `Find 5-10 high-value industrial or commercial building permits, TCEQ air quality permit applications, or Texas Railroad Commission facility registrations filed in ${year}. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'cold_storage',
      prompt: `Find 5-10 new cold storage facility announcements, refrigerated warehouse expansions, or food processing plant openings in Texas in ${year}. These are high load-factor energy prospects. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
    {
      type: 'manufacturing',
      prompt: `Find 5-10 new manufacturing facilities (steel, chemicals, battery components, semiconductors, EV parts) breaking ground or announcing site selection in Texas in ${year}. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`,
    },
  ]

  if (mode === 'growth') {
    return allJobs.filter((job) => ['capital_raise', 'hiring_spree', 'expansion', 'data_center'].includes(job.type))
  }

  if (mode === 'location') {
    return allJobs.filter((job) => ['new_location', 'expansion', 'merger_acquisition', 'tax_abatement'].includes(job.type))
  }

  if (mode === 'buyer') {
    return allJobs.filter((job) => ['energy_rfp', 'sec_filing', 'capital_raise'].includes(job.type))
  }

  if (mode === 'people') {
    return [
      {
        type: 'exec_hire',
        prompt: `Find Texas executive hires, plant managers, facility directors, COOs, and operations leaders announced in ${year}. New leadership = new supplier relationships. ${FOCUS} ${TARGET_ZONES} ${EXCLUSIONS} Return JSON array: entity_name, entity_domain, headline, summary, source_url, relevance_score, city, state.`,
      },
    ]
  }

  return allJobs
}

/**
 * Returns signals alongside the citation URLs Perplexity actually fetched.
 * Citations are the ground truth — if a source_url's domain isn't in citations,
 * the signal may be hallucinated.
 */
async function callPerplexity(prompt: string): Promise<{ signals: any[]; citations: string[] }> {
  if (!PERPLEXITY_API_KEY) {
    console.error('[perplexity] PERPLEXITY_API_KEY is not set')
    return { signals: [], citations: [] }
  }

  let response: Response
  try {
    response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content:
              'You are an energy brokerage analyst focused on the Texas deregulated ERCOT market. Return ONLY a valid JSON array — no prose, no markdown, no explanation. Only include real named commercial or industrial companies that buy electricity. Never include energy producers, utilities, REPs, or residential projects.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    })
  } catch (fetchErr) {
    console.error('[perplexity] fetch error:', fetchErr)
    return { signals: [], citations: [] }
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    console.error(`[perplexity] HTTP ${response.status}: ${errBody.slice(0, 200)}`)
    return { signals: [], citations: [] }
  }

  const data = await response.json()
  const citations: string[] = Array.isArray(data.citations) ? data.citations : []
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    console.warn('[perplexity] empty content in response')
    return { signals: [], citations }
  }

  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    const signals = Array.isArray(parsed) ? parsed : parsed.signals || []
    return { signals, citations }
  } catch {
    console.warn(`[perplexity] JSON parse failed. Content preview: ${cleaned.slice(0, 300)}`)
    return { signals: [], citations }
  }
}

/**
 * Check if the signal's source domain appears in Perplexity's citation list.
 * Domain-level match is intentional — exact URL paths often differ slightly
 * between what Perplexity cites and what it puts in the JSON.
 */
function isInCitations(sourceUrl: string, citations: string[]): boolean {
  if (!sourceUrl || citations.length === 0) return false
  try {
    const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '')
    return citations.some((c) => {
      try {
        return new URL(c).hostname.replace(/^www\./, '') === sourceHost
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

/**
 * Last-resort HEAD check. Only called when citation validation fails.
 * 4s timeout — a real page on a live server responds quickly.
 * Accepts any non-4xx response (3xx redirects, 200 OK, even 5xx is ambiguous).
 */
async function verifyUrl(url: string): Promise<boolean> {
  if (!url) return false
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NodalPointBot/1.0)' },
    }).finally(() => clearTimeout(tid))
    // 404, 410, 403 on a URL that should be public = doesn't exist
    return res.status !== 404 && res.status !== 410
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const payload = await req.json().catch(() => ({}))

  // ── Diagnostic ping mode ───────────────────────────────────────────────────
  // POST { mode: 'ping' } → makes one minimal Perplexity call and returns the
  // raw HTTP status + content preview so we can confirm the API key is working.
  if (cleanText(payload?.mode).toLowerCase() === 'ping') {
    const keyPresent = Boolean(PERPLEXITY_API_KEY)
    if (!keyPresent) {
      return new Response(JSON.stringify({ ping: 'fail', reason: 'PERPLEXITY_API_KEY not set' }), { headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [{ role: 'user', content: 'Say the word PONG and nothing else.' }],
          temperature: 0,
          max_tokens: 10,
        }),
      })
      const body = await res.text()
      return new Response(JSON.stringify({ ping: res.ok ? 'ok' : 'fail', status: res.status, preview: body.slice(0, 400) }), { headers: { 'Content-Type': 'application/json' } })
    } catch (e: any) {
      return new Response(JSON.stringify({ ping: 'fail', reason: e?.message }), { headers: { 'Content-Type': 'application/json' } })
    }
  }
  // ── End diagnostic ping mode ───────────────────────────────────────────────

  // ── Debug mode: raw Perplexity response for one real production prompt ─────
  // POST { mode: 'debug' } → runs one real scrape prompt and returns the full
  // raw Perplexity response body so we can see exactly what the model returns.
  if (cleanText(payload?.mode).toLowerCase() === 'debug') {
    if (!PERPLEXITY_API_KEY) {
      return new Response(JSON.stringify({ debug: 'fail', reason: 'PERPLEXITY_API_KEY not set' }), { headers: { 'Content-Type': 'application/json' } })
    }
    const testPrompt = `Find 3 Texas industrial companies opening new facilities or breaking ground in 2026. Focus on Houston and Dallas metro areas in ERCOT deregulated territory. Return ONLY a valid JSON array with fields: entity_name, entity_domain, headline, summary, source_url, city, tdsp, relevance_score.`
    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: 'system', content: 'You are an energy brokerage analyst. Return ONLY a valid JSON array — no prose, no markdown, no explanation.' },
            { role: 'user', content: testPrompt },
          ],
          temperature: 0.1,
          search_recency_filter: 'month',
        }),
      })
      const body = await res.text()
      return new Response(JSON.stringify({ debug: res.ok ? 'ok' : 'fail', status: res.status, raw: body }), { headers: { 'Content-Type': 'application/json' } })
    } catch (e: any) {
      return new Response(JSON.stringify({ debug: 'fail', reason: e?.message }), { headers: { 'Content-Type': 'application/json' } })
    }
  }
  // ── End debug mode ──────────────────────────────────────────────────────────

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const mode = cleanText(payload?.mode).toLowerCase() || 'all'

  const jobs = getJobs(mode)
  console.log(`[scrape-intelligence] Executing ${jobs.length} jobs in ${mode} mode...`)
  const allSignals: any[] = []
  for (const job of jobs) {
    const { signals, citations } = await callPerplexity(job.prompt)
    console.log(`  - ${job.type}: found ${signals.length} raw results, ${citations.length} citations`)
    allSignals.push(...signals.map((signal) => ({ ...signal, signal_type: job.type, _citations: citations })))
  }
  console.log(`[scrape-intelligence] Total raw signals: ${allSignals.length}`)

  let inserted = 0
  let skippedRegulated = 0
  let skippedDuplicate = 0
  let skippedUnnamed = 0
  let skippedHallucinated = 0

  for (const signal of allSignals) {
    try {
      const entityName = truncate(signal.entity_name, MAX_NAME_LEN)
      const headline = truncate(signal.headline, MAX_HEADLINE_LEN)
      if (!entityName || !headline) {
        skippedUnnamed++
        continue
      }

      const nameLower = entityName.toLowerCase()
      if (['unnamed', 'undisclosed', 'unknown'].some((term) => nameLower.includes(term))) {
        skippedUnnamed++
        continue
      }

      if (signal.signal_type !== 'energy_rfp' && isRegulatedTerritory(signal)) {
        skippedRegulated++
        continue
      }

      const headlineHash = hashHeadline(headline)
      const { data: existing } = await supabase
        .from('market_intelligence')
        .select('id')
        .eq('headline_hash', headlineHash)
        .maybeSingle()

      if (existing) {
        skippedDuplicate++
        continue
      }

      // ── Hallucination gate ──────────────────────────────────────────────────
      // 1. Check if the source URL's domain appears in Perplexity's citation list
      // 2. If not, fall back to a HEAD request to verify the URL is real
      // 3. If both fail, the signal is likely fabricated — reject it
      const sourceUrl = cleanText(signal.source_url)
      const citations: string[] = signal._citations || []
      if (sourceUrl) {
        const inCitations = isInCitations(sourceUrl, citations)
        if (!inCitations) {
          const urlLive = await verifyUrl(sourceUrl)
          if (!urlLive) {
            console.warn(`[hallucination] rejected: ${entityName} — ${sourceUrl}`)
            skippedHallucinated++
            continue
          }
        }
      }
      // ── End hallucination gate ──────────────────────────────────────────────

      const city = truncate(signal.city || signal.metadata?.city, 80) || ''
      const state = truncate(signal.state || signal.metadata?.state || 'TX', 32) || 'TX'
      const tdspZone = determineTdspZone(city, signal.tdsp)
      const apolloVerified = await verifyWithApollo(entityName)

      let crmMatchId = null
      let crmMatchType: 'exact_domain' | 'fuzzy_name' | 'none' = 'none'
      const finalDomain = normalizeDomain(signal.entity_domain || apolloVerified?.domain || '')
      const queryParts: string[] = []
      if (finalDomain) queryParts.push(`domain.ilike.%${finalDomain}%`)
      if (entityName) queryParts.push(`name.ilike.${entityName.replace(/[']/g, "''")}`)

      if (queryParts.length > 0) {
        const { data: matches } = await supabase
          .from('accounts')
          .select('id, domain, name')
          .or(queryParts.join(','))
          .limit(1)

        if (matches?.length) {
          crmMatchId = matches[0].id
          crmMatchType = finalDomain && (matches[0].domain || '').toLowerCase().includes(finalDomain) ? 'exact_domain' : 'fuzzy_name'
        }
      }

      const { error: insertError } = await supabase.from('market_intelligence').insert({
        signal_type: signal.signal_type,
        headline,
        summary: truncate(signal.summary, MAX_SUMMARY_LEN),
        entity_name: entityName,
        entity_domain: finalDomain || null,
        source_url: truncate(signal.source_url, 500),
        relevance_score: signal.relevance_score,
        headline_hash: headlineHash,
        crm_account_id: crmMatchId,
        crm_match_type: crmMatchType,
        metadata: {
          city,
          state,
          tdsp_zone: tdspZone,
          apollo_verified: Boolean(apolloVerified),
          employee_count: apolloVerified?.employee_count || null,
          source_host: safeHostname(signal.source_url),
        },
      })

      if (!insertError) {
        inserted++
      }
    } catch (error) {
      console.error('[scrape-intelligence] signal error:', error)
    }
  }

  const { count } = await supabase.from('market_intelligence').select('id', { count: 'exact', head: true })
  if (typeof count === 'number' && count > MAX_TOTAL_ROWS) {
    const excess = count - MAX_TOTAL_ROWS
    const { data: oldRows } = await supabase
      .from('market_intelligence')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(excess)

    if (oldRows?.length) {
      await supabase.from('market_intelligence').delete().in('id', oldRows.map((row) => row.id))
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      mode,
      found: allSignals.length,
      inserted,
      skippedRegulated,
      skippedDuplicate,
      skippedUnnamed,
      skippedHallucinated,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
