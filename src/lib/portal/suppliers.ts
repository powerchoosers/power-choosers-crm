import { supabaseAdmin } from '@/lib/supabase'
import { normalizePhone, normalizeWebsite } from '@/lib/portal/bill-extract'

/**
 * Supplier directory: who to call about a bill.
 *
 * Where a phone number can come from, in the order we trust it:
 *   1. advisor  - a Nodal Point advisor entered or confirmed it
 *   2. bill     - printed on this client's own bill (kept on the bill, never shared)
 *   3. web      - found by an AI web search; stored with its source link, unverified
 * Numbers are never invented and never seeded from memory.
 */

export interface SupplierRow {
  id: string
  name: string
  name_key: string
  aliases: string[]
  support_phone: string | null
  support_hours: string | null
  support_email: string | null
  website: string | null
  phone_source: 'bill' | 'web' | 'advisor' | null
  source_url: string | null
  verified: boolean
  looked_up_at: string | null
}

const LOOKUP_RETRY_DAYS = 30
const COMPANY_SUFFIX = /\b(l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|l\.?p\.?|ltd\.?|company)\b/gi

export function supplierKey(name: string | null | undefined): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/&/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Find a directory entry by any known spelling. Never creates one. */
export async function findSupplier(name: string | null | undefined): Promise<SupplierRow | null> {
  const key = supplierKey(name)
  if (key.length < 2) return null
  const { data: exact } = await supabaseAdmin.from('energy_suppliers').select('*').eq('name_key', key).limit(1)
  if (exact?.[0]) return exact[0] as SupplierRow
  const { data: alias } = await supabaseAdmin.from('energy_suppliers').select('*').contains('aliases', [key]).limit(1)
  return (alias?.[0] as SupplierRow) || null
}

/** Find or create. Only call with a name an advisor entered, never one read from an upload. */
export async function ensureSupplier(name: string): Promise<SupplierRow | null> {
  const existing = await findSupplier(name)
  if (existing) return existing
  const key = supplierKey(name)
  const display = name.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (key.length < 2 || !display) return null
  const { data } = await supabaseAdmin
    .from('energy_suppliers')
    .upsert({ name: display, name_key: key }, { onConflict: 'name_key' })
    .select('*')
    .limit(1)
  return (data?.[0] as SupplierRow) || null
}

interface WebContact {
  phone: string | null
  hours: string | null
  website: string | null
  sourceUrl: string | null
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

/** Ask a web-search model for the supplier's business customer service line. */
async function searchSupplierContact(name: string): Promise<WebContact | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) return null

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      model: 'sonar',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You find official contact details for retail electricity suppliers. Use only the supplier\'s own website or a state regulator. If you cannot find a detail on such a page, return null for it. Never guess. Reply with JSON only.',
        },
        {
          role: 'user',
          content:
            `Find the customer service phone number for business (commercial) electricity customers of the retail electric provider "${name}" in Texas. ` +
            'Do not return a residential-only, sales, outage, or emergency number. ' +
            'Reply as JSON: {"phone": string|null, "hours": string|null, "website": string|null, "source_url": string|null}. ' +
            'source_url must be the exact page where the phone number is shown.',
        },
      ],
    }),
  })
  if (!response.ok) return null
  const payload = await response.json().catch(() => null)
  const content: string = payload?.choices?.[0]?.message?.content || ''
  const nothing: WebContact = { phone: null, hours: null, website: null, sourceUrl: null }
  const first = content.indexOf('{')
  const last = content.lastIndexOf('}')
  if (first < 0 || last <= first) return nothing

  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(content.slice(first, last + 1)) } catch { return nothing }

  const phone = normalizePhone(parsed.phone)
  const sourceUrl = httpsUrl(parsed.source_url)
  // A number with no page to check it against is not good enough to show a client.
  if (!phone || !sourceUrl) return { phone: null, hours: null, website: normalizeWebsite(parsed.website), sourceUrl: null }
  const hours = typeof parsed.hours === 'string' ? parsed.hours.replace(/\s+/g, ' ').trim().slice(0, 120) || null : null
  return { phone, hours, website: normalizeWebsite(parsed.website), sourceUrl }
}

/**
 * Fill in a missing support number from the web, at most once every 30 days per supplier.
 * Advisor-entered details are never overwritten.
 */
export async function lookUpSupplierContact(supplier: SupplierRow): Promise<SupplierRow> {
  if (supplier.support_phone) return supplier
  const last = supplier.looked_up_at ? new Date(supplier.looked_up_at).getTime() : 0
  if (Date.now() - last < LOOKUP_RETRY_DAYS * 86_400_000) return supplier

  let found: WebContact | null = null
  try { found = await searchSupplierContact(supplier.name) } catch { found = null }
  // null means the search did not run (not configured, or the service was down): try again next time.
  if (!found) return supplier

  const patch: Record<string, unknown> = { looked_up_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  if (found?.phone && found.sourceUrl) {
    patch.support_phone = found.phone
    patch.support_hours = found.hours
    patch.phone_source = 'web'
    patch.source_url = found.sourceUrl
    patch.verified = false
  }
  if (found?.website && !supplier.website) patch.website = found.website

  const { data } = await supabaseAdmin.from('energy_suppliers').update(patch).eq('id', supplier.id).select('*').limit(1)
  return (data?.[0] as SupplierRow) || supplier
}
