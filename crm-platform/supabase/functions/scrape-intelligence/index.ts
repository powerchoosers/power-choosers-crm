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
  const c = city.toLowerCase()
  if (['houston', 'beaumont', 'port arthur', 'baytown', 'pasadena', 'pearland', 'sugar land', 'the woodlands', 'conroe', 'galveston', 'lufkin', 'nacogdoches'].some((x) => c.includes(x))) return 'CenterPoint'
  if (['dallas', 'fort worth', 'arlington', 'plano', 'irving', 'garland', 'mesquite', 'mckinney', 'frisco', 'grand prairie', 'waco', 'lubbock', 'tyler', 'longview', 'wichita falls', 'abilene', 'midland', 'odessa'].some((x) => c.includes(x))) return 'Oncor'
  if (['corpus christi', 'victoria', 'mcallen', 'laredo', 'harlingen', 'brownsville'].some((x) => c.includes(x))) return 'AEP Texas'
  if (['pecos', 'fort stockton', 'alpine', 'marfa', 'presidio', 'big spring', 'sweetwater', 'clute', 'lake jackson', 'angleton', 'alvin', 'freeport'].some((x) => c.includes(x))) return 'TNMP'
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

function getJobs(mode: string) {
  const today = new Date()
  const year = today.getFullYear()
  const stamp = today.toDateString()

  const allJobs = [
    {
      type: 'new_location',
      prompt: `Find 10-15 Texas companies opening new facilities, breaking ground, or relocating in ${year}. Focus on high-intensity energy users: cold storage, data centers, food processing, logistics. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, entity_domain, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'energy_rfp',
      prompt: `Find 5-10 active open RFPs after ${stamp} for retail electricity supply, energy consulting, or energy management for Texas commercial/industrial. ${TARGET_ZONES} ${EXCLUSIONS} Include: city, state, tdsp.`,
    },
    {
      type: 'expansion',
      prompt: `Find 10-15 Texas industrial expansions, plant growth, and manufacturing projects in ${year}. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'sec_filing',
      prompt: `Find 5-10 SEC filings/investor updates signaling Texas facility growth or new load. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'capital_raise',
      prompt: `Find 5-10 Texas mid-market/enterprise companies that recently closed investment rounds or IPOs in ${year}. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'merger_acquisition',
      prompt: `Find 5-10 M&A deals involving Texas-based industrial/commercial entities in ${year}. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'hiring_spree',
      prompt: `Find 5-10 Texas companies (industrial, cold storage, tech) announcing hiring pushes (>50 people). ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'data_center',
      prompt: `Find 10-15 new data center announcements or expansions in Texas deregulated zones for ${year}. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'tax_abatement',
      prompt: `Find 10-15 recent Texas Chapter 312 or 313 tax abatement applications or industrial growth stories. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'industrial_permit',
      prompt: `Find 5-10 high-value industrial/commercial permits recently filed for new facilities in Texas. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'cold_storage',
      prompt: `Find 5-10 new cold storage facility announcements, refrigerated warehouse expansions, or food processing startups in Texas for ${year}. High load factor leads. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
    },
    {
      type: 'manufacturing',
      prompt: `Find 5-10 new manufacturing facilities (steel, chemical, battery components, semiconductors) breaking ground in Texas in ${year}. ${TARGET_ZONES} ${EXCLUSIONS} Include: entity_name, headline, summary, source_url, city, tdsp.`,
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
        prompt: `Find Texas or Texas-relevant executive hires, facility leaders, plant managers, CFOs, COOs, and operations leaders for ${year}. Focus on companies that look like real energy prospects: manufacturers, data centers, logistics, cold storage, healthcare, hospitality, and industrial processing. ${TARGET_ZONES} ${EXCLUSIONS} Include entity_name, headline, summary, source_url, relevance_score, city, state.`,
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
  if (!PERPLEXITY_API_KEY) return { signals: [], citations: [] }

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
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
            'You are an energy brokerage analyst focused on the Texas deregulated ERCOT market. Return valid JSON only. Only include real, named prospects with specific city-level locations. Never include regulated utility territories, unnamed entities, or residential projects.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      search_recency_filter: 'month',
    }),
  })

  if (!response.ok) return { signals: [], citations: [] }

  const data = await response.json()
  const citations: string[] = Array.isArray(data.citations) ? data.citations : []
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) return { signals: [], citations }

  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    const signals = Array.isArray(parsed) ? parsed : parsed.signals || []
    return { signals, citations }
  } catch {
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const payload = await req.json().catch(() => ({}))
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
