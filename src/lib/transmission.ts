import { supabase } from './supabase'

/** Contact-detail shape from useContact (includes account-derived fields) */
export interface ContactVariableSource {
  id?: string
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  company?: string | null
  companyName?: string | null
  email?: string | null
  title?: string | null
  phone?: string | null
  mobile?: string | null
  workDirectPhone?: string | null
  otherPhone?: string | null
  companyPhone?: string | null
  city?: string | null
  state?: string | null
  location?: string | null
  address?: string | null
  linkedinUrl?: string | null
  website?: string | null
  notes?: string | null
  listName?: string | null
  industry?: string | null
  electricitySupplier?: string | null
  annualUsage?: string | null
  currentRate?: string | null
  contractEnd?: string | null
  accountDescription?: string | null
  metadata?: { general?: { company?: string }; energy?: { loadZone?: string } } | null
}

const fallback = (v: string | null | undefined): string => (v != null && String(v).trim() !== '' ? String(v).trim() : '—')

/**
 * Maps a contact (and its linked account) to a flat object for {{variable}} substitution.
 * Supports {{contact.xxx}}, {{account.xxx}}, and legacy {{first_name}}, {{date}}, etc.
 */
export function contactToVariableMap(contact: ContactVariableSource | null | undefined): Record<string, string> {
  if (!contact) return {}
  const meta = contact.metadata
  const companyName = contact.company ?? contact.companyName ?? (meta?.general?.company as string)

  const contactKeys: Record<string, string> = {
    'contact.firstName': fallback(contact.firstName),
    'contact.lastName': fallback(contact.lastName),
    'contact.name': fallback(contact.name ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')),
    'contact.email': fallback(contact.email),
    'contact.title': fallback(contact.title),
    'contact.phone': fallback(contact.phone),
    'contact.mobile': fallback(contact.mobile),
    'contact.workDirectPhone': fallback(contact.workDirectPhone),
    'contact.otherPhone': fallback(contact.otherPhone),
    'contact.companyPhone': fallback(contact.companyPhone),
    'contact.city': fallback(contact.city),
    'contact.state': fallback(contact.state),
    'contact.location': fallback(contact.location),
    'contact.address': fallback(contact.address),
    'contact.linkedinUrl': fallback(contact.linkedinUrl),
    'contact.website': fallback(contact.website),
    'contact.notes': fallback(contact.notes),
    'contact.listName': fallback(contact.listName),
    'contact.companyName': fallback(companyName),
    'contact.industry': fallback(contact.industry),
    'contact.electricitySupplier': fallback(contact.electricitySupplier),
    'contact.annualUsage': fallback(contact.annualUsage),
    'contact.currentRate': fallback(contact.currentRate),
    'contact.contractEnd': fallback(contact.contractEnd),
    'contact.accountDescription': fallback(contact.accountDescription),
  }

  const accountKeys: Record<string, string> = {
    'account.name': fallback(companyName),
    'account.industry': fallback(contact.industry),
    'account.domain': fallback(contact.website),
    'account.description': fallback(contact.accountDescription),
    'account.companyPhone': fallback(contact.companyPhone),
    'account.contractEnd': fallback(contact.contractEnd),
    'account.location': fallback(contact.location),
    'account.city': fallback(contact.city),
    'account.state': fallback(contact.state),
    'account.address': fallback(contact.address),
    'account.linkedinUrl': fallback(contact.linkedinUrl),
    'account.annualUsage': fallback(contact.annualUsage),
    'account.electricitySupplier': fallback(contact.electricitySupplier),
    'account.currentRate': fallback(contact.currentRate),
    'account.revenue': '',
    'account.employees': '',
  }

  const legacy: Record<string, string> = {
    first_name: fallback(contact.firstName),
    last_name: fallback(contact.lastName),
    company_name: fallback(companyName),
    email: fallback(contact.email),
    title: fallback(contact.title),
    industry: fallback(contact.industry),
    contract_end: fallback(contact.contractEnd),
    load_zone: fallback(meta?.energy?.loadZone as string),
    scarcity_risk: 'HIGH',
    date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    context_id: contact.id ? `CONTACT_${contact.id.slice(0, 8).toUpperCase()}` : 'TX_001',
    cta_url: '#',
  }

  return { ...contactKeys, ...accountKeys, ...legacy }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Replaces {{key}} in html with data[key] (escaped). Keys not in data are left as {{key}}.
 */
export function substituteVariables(html: string, data: Record<string, string>): string {
  let out = html
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g')
    out = out.replace(regex, escapeHtml(value))
  })
  return out
}

export async function compileTransmission(assetId: string, contactData: any) {
  const { data: asset, error } = await supabase
    .from('transmission_assets')
    .select('*')
    .eq('id', assetId)
    .single()

  if (error || !asset) {
    throw new Error(`Failed to fetch transmission asset: ${error?.message || 'Not found'}`)
  }

  let html = asset.compiled_html || ''
  const variables = asset.variables || []

  // Replace variables in the compiled HTML
  // contactData should contain keys matching the variables
  variables.forEach((variable: string) => {
    const value = contactData[variable] || `[MISSING_${variable.toUpperCase()}]`
    const regex = new RegExp(`{{${variable}}}`, 'g')
    html = html.replace(regex, value)
  })

  // Add signature if not present (simplified for now)
  if (!html.includes('Lewis Patterson')) {
    html += `
      <div style="margin-top: 40px; border-top: 1px solid #f4f4f5; padding-top: 20px; font-family: sans-serif;">
        <div style="font-weight: bold; color: #18181b;">Lewis Patterson</div>
        <div style="color: #71717a; font-size: 12px;">Director of Energy Architecture</div>
      </div>
    `
  }

  return html
}

export function generateStaticHtml(blocks: any[], options?: { skipFooter?: boolean }) {
  const skipFooter = options?.skipFooter === true
  // This would be used in the builder to generate the final HTML string
  // for storage in transmission_assets.compiled_html
  let html = `
    <div style="font-family: 'Inter', sans-serif; background: #ffffff; color: #18181b; padding: 40px; max-width: 600px; margin: 0 auto;">
      <div style="border-bottom: 1px solid #e4e4e7; padding-bottom: 12px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="/images/nodalpoint.png" alt="" style="height: 24px; width: auto;" />
          <span style="font-family: monospace; font-size: 10px; font-weight: bold; letter-spacing: 2px; color: #18181b;">NODAL_POINT // INTELLIGENCE</span>
        </div>
        <span style="font-family: monospace; font-size: 10px; color: #71717a;">REF: {{date}} // {{context_id}}</span>
      </div>
  `

  blocks.forEach((block: any) => {
    if (block.type === 'TEXT_MODULE') {
      const escaped = String(block.content ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
      html += `<p style="line-height: 1.6; margin-bottom: 20px; white-space: pre-wrap;">${escaped}</p>`
    } else if (block.type === 'TACTICAL_BUTTON') {
      html += `
        <div style="margin: 30px 0; text-align: center;">
          <a href="{{cta_url}}" style="background: #002FA7; color: #ffffff; padding: 12px 24px; text-decoration: none; font-family: monospace; font-size: 12px; font-weight: bold; letter-spacing: 1px; border-radius: 2px;">${block.content}</a>
        </div>
      `
    } else if (block.type === 'TELEMETRY_GRID') {
      const valueColors: ('yellow' | 'green' | 'red')[] = block.content.valueColors ?? []
      const valueColorBorder = (c: string) => {
        if (c === 'yellow') return 'border-left: 4px solid #eab308; padding-left: 8px;'
        if (c === 'red') return 'border-left: 4px solid #ef4444; padding-left: 8px;'
        return 'border-left: 4px solid #22c55e; padding-left: 8px;'
      }
      html += `
        <div style="background: #f4f4f5; border-radius: 6px; padding: 16px; margin-bottom: 20px; border: 1px solid #e4e4e7;">
          <table style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #d4d4d8;">
                ${block.content.headers.map((h: string) => `<th style="text-align: left; padding: 8px 0; font-size: 10px; color: #71717a; text-transform: uppercase;">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${block.content.rows.map((row: string[], ri: number) => {
                const rowColor = valueColors[ri] ?? 'green'
                const valueStyle = valueColorBorder(rowColor)
                return `
                <tr>
                  ${row.map((cell: string, ci: number) =>
                    ci === 1
                      ? `<td style="padding: 8px 0; color: #18181b; ${valueStyle}">${escapeHtml(cell)}</td>`
                      : `<td style="padding: 8px 0; color: #18181b;">${escapeHtml(cell)}</td>`
                  ).join('')}
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      `
    } else if (block.type === 'VARIABLE_CHIP') {
      html += `<span style="font-family: monospace; font-size: 12px; color: #002FA7;">${block.content}</span>`
    } else if (block.type === 'IMAGE_BLOCK') {
      const c = block.content as { url?: string; description?: string; caption?: string }
      const url = (c?.url && String(c.url).trim()) ? String(c.url).trim().replace(/"/g, '&quot;') : ''
      const desc = (c?.description != null && String(c.description).trim() !== '') ? String(c.description).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''
      const cap = (c?.caption != null && String(c.caption).trim() !== '') ? String(c.caption).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''
      if (url) {
        html += `<figure style="margin: 20px 0;">`
        html += `<img src="${url}" alt="${desc}" style="max-width: 100%; height: auto; display: block;" />`
        if (cap) html += `<figcaption style="font-family: monospace; font-size: 10px; color: #71717a; margin-top: 8px;">${cap}</figcaption>`
        html += `</figure>`
      }
    }
  })

  if (!skipFooter) {
    html += `
      <div style="margin-top: 40px; border-top: 1px solid #f4f4f5; padding-top: 20px; font-family: sans-serif;">
        <div style="font-weight: bold; color: #18181b;">Lewis Patterson</div>
        <div style="color: #71717a; font-size: 12px;">Director of Energy Architecture</div>
      </div>
    `
  }
  html += `</div>`

  return html
}
