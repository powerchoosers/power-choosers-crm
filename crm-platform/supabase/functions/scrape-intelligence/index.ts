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

const MAX_TOTAL_ROWS = 900
const MAX_SUMMARY_LEN = 320
const MAX_NAME_LEN = 120
const MAX_HEADLINE_LEN = 180

const REGULATED_CITIES = ['austin', 'san antonio', 'el paso', 'amarillo', 'new braunfels', 'converse', 'schertz', 'selma']

const TARGET_ZONES = `Target only businesses in deregulated ERCOT territory:
- Oncor: Dallas, Fort Worth, DFW, North Texas, Waco, Midland, Odessa, Tyler, Longview, Wichita Falls, Abilene, Lubbock
- CenterPoint: Houston, Greater Houston, Sugar Land, The Woodlands, Conroe, Katy, Pasadena, Baytown, Galveston, League City, Beaumont
- AEP Texas Central: Corpus Christi, Victoria, Laredo, McAllen, Harlingen, Brownsville
- AEP Texas North: Abilene, Wichita Falls region
- Entergy Texas: Beaumont, Port Arthur, Orange, Lufkin, Nacogdoches, East Texas
- TNMP: Pecos, Fort Stockton, Alpine, Big Spring, Sweetwater, Clute, Lake Jackson, Angleton, Alvin, Gulf Coast`

const EXCLUSIONS = `Strictly exclude Austin Energy, CPS Energy, El Paso Electric, Xcel SPS/Amarillo, rural co-ops, residential projects, unnamed entities, and companies with more than 5,000 employees.`

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
  const blob = `${cleanText(signal.headline)} ${cleanText(signal.summary)}`.toLowerCase()
  if (city) return REGULATED_CITIES.some((term) => city.includes(term))
  return REGULATED_CITIES.some((term) => blob.includes(term))
}

function determineTdspZone(city: string): string {
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
    const response = await fetch('https://api.apollo.io/v1/mixed_companies/search', {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify({ q_organization_name: entityName, per_page: 1 }),
    })

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
      prompt: `Find 5-10 real Texas companies opening new facilities, breaking ground, or relocating in ${year} or ${year + 1}. ${TARGET_ZONES} ${EXCLUSIONS} Include entity_name, entity_domain, headline, summary, source_url, relevance_score, city, state. Only return named companies with specific cities.`,
    },
    {
      type: 'energy_rfp',
      prompt: `Find active open RFPs after ${stamp} for retail electricity supply, energy consulting, or energy management services for commercial and industrial buyers. ${TARGET_ZONES} ${EXCLUSIONS} Include city and state where possible.`,
    },
    {
      type: 'expansion',
      prompt: `Find Texas company expansion announcements, plant expansions, capex projects, and tax-abatement backed growth stories for ${year}. ${TARGET_ZONES} ${EXCLUSIONS} Include entity_name, headline, summary, source_url, relevance_score, city, state.`,
    },
    {
      type: 'sec_filing',
      prompt: `Find SEC filings, 8-Ks, earnings releases, and investor updates that signal facility growth, new load, or operational expansion for Texas-relevant commercial and industrial companies in ${year}. ${TARGET_ZONES} ${EXCLUSIONS} Include entity_name, headline, summary, source_url, relevance_score, city, state.`,
    },
  ]

  if (mode === 'location') {
    return allJobs.filter((job) => ['new_location', 'expansion'].includes(job.type))
  }

  if (mode === 'buyer') {
    return allJobs.filter((job) => ['energy_rfp', 'sec_filing'].includes(job.type))
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

async function callPerplexity(prompt: string): Promise<any[]> {
  if (!PERPLEXITY_API_KEY) return []

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

  if (!response.ok) return []

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) return []

  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : parsed.signals || []
  } catch {
    return []
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

  const allSignals: any[] = []
  for (const job of getJobs(mode)) {
    const signals = await callPerplexity(job.prompt)
    allSignals.push(...signals.map((signal) => ({ ...signal, signal_type: job.type })))
  }

  let inserted = 0
  let skippedRegulated = 0
  let skippedDuplicate = 0
  let skippedUnnamed = 0

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

      const city = truncate(signal.city || signal.metadata?.city, 80) || ''
      const state = truncate(signal.state || signal.metadata?.state || 'TX', 32) || 'TX'
      const tdspZone = city ? determineTdspZone(city) : 'ERCOT_Unknown'
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
    JSON.stringify({ success: true, mode, inserted, skippedRegulated, skippedDuplicate, skippedUnnamed }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
