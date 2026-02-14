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
    'contact.load_zone': fallback(meta?.energy?.loadZone as string),
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

export async function compileFoundry(assetId: string, contactData: any) {
  const { data: asset, error } = await supabase
    .from('transmission_assets')
    .select('*')
    .eq('id', assetId)
    .single()

  if (error || !asset) {
    throw new Error(`Failed to fetch foundry asset: ${error?.message || 'Not found'}`)
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

export function generateStaticHtml(blocks: any[], options?: { skipFooter?: boolean; profile?: any }) {
  const skipFooter = options?.skipFooter === true
  // This would be used in the builder to generate the final HTML string
  // for storage in foundry assets compiled_html
  let html = `
    <div style="font-family: 'Inter', sans-serif; background: #ffffff; color: #18181b; width: 100%; max-width: 600px; margin: 20px auto; border: 1px solid #e4e4e7; border-collapse: separate; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); overflow: hidden;">
      <table border="0" cellpadding="0" cellspacing="0" style="border-bottom: 1px solid #e4e4e7; width: 100%; box-sizing: border-box;">
        <tr>
          <td style="padding: 16px 20px; vertical-align: middle; white-space: nowrap; width: 60%;">
            <img src="https://nodalpoint.io/images/nodalpoint.png" alt="" style="height: 20px; width: auto; display: inline-block; vertical-align: middle; margin-right: 8px;" />
            <span style="font-family: monospace; font-size: 10px; font-weight: bold; letter-spacing: 2px; color: #18181b; vertical-align: middle;">NODAL_POINT // INTELLIGENCE</span>
          </td>
          <td style="padding: 16px 20px; vertical-align: middle; text-align: right; white-space: nowrap; width: 40%;">
            <span style="font-family: monospace; font-size: 10px; color: #71717a;">REF: {{date}} // {{context_id}}</span>
          </td>
        </tr>
      </table>
      <div style="padding: 32px;">
  `

  blocks.forEach((block: any) => {
    if (block.type === 'TEXT_MODULE') {
      const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content ?? ''), useAi: false, aiPrompt: '' }
      const text = contentObj.text || ''
      const bullets = contentObj.bullets ?? []
      const useAi = contentObj.useAi ?? false

      if (useAi && !text.trim()) {
        html += `
          <div style="border: 2px dashed #e4e4e7; border-radius: 8px; padding: 30px; background: #fafafa; text-align: center; margin-bottom: 20px;">
            <p style="font-family: monospace; font-size: 10px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 2px; margin: 0;">
              [ AI_GENERATION_IN_PROGRESS ]
            </p>
          </div>
        `
      } else {
        const escaped = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')

        const paragraphs = escaped.split(/\n\n+/).filter((p: string) => p.trim())

        html += `<div style="margin-bottom: 24px;">`
        paragraphs.forEach((p: string, idx: number) => {
          html += `<p style="line-height: 1.25; font-size: 13px; font-family: sans-serif; white-space: pre-wrap; margin: 0 0 16px 0; color: #18181b;">${p.trim()}</p>`
        })

        if (bullets.length > 0) {
          html += `<div style="margin: 20px 0 0 0;">`
          bullets.forEach((bullet: string) => {
            const escapedBullet = bullet
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
            html += `
              <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 10px; width: 100%;">
                <tr>
                  <td valign="top" style="width: 20px; color: #002FA7; font-size: 16px; line-height: 1.2;">●</td>
                  <td valign="top" style="font-family: monospace; font-size: 11px; color: #52525b; line-height: 1.4; padding-left: 10px;">${escapedBullet}</td>
                </tr>
              </table>
            `
          })
          html += `</div>`
        }
        html += `</div>`
      }
    } else if (block.type === 'TACTICAL_BUTTON') {
      html += `
        <div style="margin: 30px 0; text-align: center;">
          <a href="{{cta_url}}" style="background: #002FA7; color: #ffffff; padding: 12px 24px; text-decoration: none; font-family: monospace; font-size: 12px; font-weight: bold; letter-spacing: 1px; border-radius: 2px;">${block.content}</a>
        </div>
      `
    } else if (block.type === 'TELEMETRY_GRID') {
      const valueColors: ('yellow' | 'green' | 'red')[] = block.content.valueColors ?? []
      const valueColorStyle = (c: string) => {
        if (c === 'yellow') return 'color: #b45309;'
        if (c === 'red') return 'color: #dc2626;'
        if (c === 'black') return 'color: #18181b;'
        return 'color: #059669;'
      }
      html += `
        <div style="background: #f4f4f5; border-radius: 6px; padding: 16px; margin-bottom: 24px; border: 1px solid #e4e4e7;">
          <table style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #d4d4d8;">
                ${block.content.headers.map((h: string) => `<th style="text-align: left; padding: 8px 0; font-size: 10px; color: #71717a; text-transform: uppercase;">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${block.content.rows.map((row: string[], ri: number) => {
        const rowColor = valueColors[ri] ?? 'green'
        const valueStyle = valueColorStyle(rowColor)
        return `
                <tr>
                  ${row.map((cell: string, ci: number) =>
          ci > 0
            ? `<td style="padding: 8px 12px 8px 0; ${valueStyle}">${escapeHtml(cell)}</td>`
            : `<td style="padding: 8px 12px 8px 0; color: #18181b;">${escapeHtml(cell)}</td>`
        ).join('')}
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      `
    } else if (block.type === 'VARIABLE_CHIP') {
      html += `<span style="font-family: monospace; font-size: 12px; color: #002FA7;">${block.content}</span>`
    } else if (block.type === 'LIABILITY_GAUGE') {
      const c = block.content || {}
      const baselineLabel = escapeHtml(c.baselineLabel ?? 'CURRENT_FIXED_RATE')
      const riskLevel = Math.min(100, Math.max(0, Number(c.riskLevel) ?? 75))
      const status = escapeHtml(c.status ?? 'VOLATILE')
      const note = (c.note != null && String(c.note).trim() !== '') ? String(c.note).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''
      html += `
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #e4e4e7;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px;">
            <div>
              <p style="font-family: monospace; font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px 0;">${baselineLabel}</p>
              <p style="font-family: monospace; font-size: 20px; color: #18181b; margin: 0;">${'$'}{{contact.currentRate}}/kWh</p>
            </div>
            <div style="text-align: right;">
              <p style="font-family: monospace; font-size: 10px; color: #002FA7; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px 0;">${status}</p>
              <p style="font-family: monospace; font-size: 20px; color: #18181b; margin: 0;">${riskLevel}%</p>
            </div>
          </div>
          <div style="height: 8px; width: 100%; background: #d4d4d8; border-radius: 4px; overflow: hidden;">
            <div style="height: 100%; width: ${riskLevel}%; background: #002FA7; transition: width 0.3s ease;"></div>
          </div>
          ${note ? `<p style="font-family: monospace; font-size: 9px; color: #52525b; line-height: 1.4; text-transform: uppercase; letter-spacing: 0.05em; margin: 12px 0 0 0;">${note}</p>` : ''}
        </div>
      `
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
    } else if (block.type === 'MARKET_BREADCRUMB') {
      const c = block.content || {}
      const headline = escapeHtml(c.headline ?? 'ERCOT_RESERVES_DROP_BELOW_3000MW')
      const source = escapeHtml(c.source ?? 'GridMonitor_Intelligence')
      const impactLevel = escapeHtml(c.impactLevel ?? 'HIGH_VOLATILITY')
      const url = (c.url && String(c.url).trim()) ? String(c.url).trim().replace(/"/g, '&quot;') : ''
      // nodalAnalysis supports variables like {{contact.load_zone}} - escape HTML but preserve {{...}} placeholders
      const nodalAnalysis = (c.nodalAnalysis != null && String(c.nodalAnalysis).trim() !== '')
        ? String(c.nodalAnalysis).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        : ''
      html += `
        <div style="border: 1px solid #e4e4e7; background: #ffffff; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="background: #f4f4f5; padding: 8px 16px; border-bottom: 1px solid #e4e4e7; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-family: monospace; font-size: 9px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">
              Source: ${source}
            </span>
            <span style="font-family: monospace; font-size: 9px; color: #002FA7; font-weight: bold;">
              [ ${impactLevel} ]
            </span>
          </div>
          <div style="padding: 16px;">
            <h4 style="font-size: 14px; font-weight: bold; color: #18181b; line-height: 1.3; text-transform: uppercase; font-family: monospace; margin: 0 0 12px 0;">
              ${headline}
            </h4>
            ${nodalAnalysis ? `
            <div style="background: #18181b; padding: 12px; border-radius: 2px; border-left: 4px solid #002FA7; margin-bottom: 12px;">
              <p style="font-family: monospace; font-size: 10px; color: #a1a1aa; text-transform: uppercase; margin: 0 0 4px 0;">
                Nodal_Architect_Analysis:
              </p>
              <p style="font-size: 12px; color: #ffffff; line-height: 1.5; font-style: italic; margin: 0;">
                "${nodalAnalysis}"
              </p>
            </div>
            ` : ''}
            ${url ? `
            <a href="${url}" style="font-family: monospace; font-size: 10px; color: #002FA7; text-decoration: underline; text-transform: uppercase; letter-spacing: 0.05em;">
              [ VIEW_FULL_TRANSMISSION ]
            </a>
            ` : ''}
          </div>
        </div>
      `
    }
  }) // End of blocks loop

  html += `</div>` // Close the content padding div (32px) before the footer

  if (!skipFooter) {
    const profile = options?.profile
    const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Lewis Patterson'
    const title = profile?.jobTitle || 'Director of Energy Architecture'
    const phone = profile?.selectedPhoneNumber || '+1 (817) 809-3367'
    const location = [profile?.city, profile?.state].filter(Boolean).join(', ') || 'Fort Worth, TX'
    const photoUrl = profile?.hostedPhotoUrl || profile?.photoURL || ''
    const linkedinUrl = escapeHtml(profile?.linkedinUrl || 'https://linkedin.com/company/nodal-point')

    html += `
      <div style="margin-top: 40px; border-top: 1px solid #f4f4f5; background-color: #fafafa; font-family: sans-serif;">
        <div style="padding: 32px 24px;">
          <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="vertical-align: top;">
              <!-- Identity Block -->
              <table style="border-collapse: collapse; margin-bottom: 16px;">
                <tr>
                  ${photoUrl ? `
                  <td style="width: 48px; vertical-align: middle; padding-right: 12px;">
                    <img src="${photoUrl}" alt="${name}" style="width: 40px; height: 40px; border-radius: 12px; border: 1px solid #e4e4e7; display: block; object-fit: cover;" />
                  </td>
                  ` : ''}
                  <td style="vertical-align: middle;">
                    <div style="font-family: sans-serif; font-weight: bold; color: #18181b; font-size: 14px; line-height: 1.2;">
                      ${name}
                    </div>
                    <div style="font-family: sans-serif; color: #71717a; font-size: 12px; margin-top: 2px;">
                      ${title}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Contact Telemetry -->
              <div style="font-family: monospace; font-size: 11px; color: #52525b; line-height: 1.5; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.02em;">
                <div>P: ${phone}</div>
                <div>${location}</div>
              </div>

              <!-- Action Links -->
              <table border="0" cellpadding="0" cellspacing="0" style="font-family: monospace; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em;">
                <tr>
                  <td style="padding-right: 20px;">
                    <a href="${linkedinUrl}" style="color: #002FA7; text-decoration: none;">LINKEDIN</a>
                  </td>
                  <td style="padding-right: 20px;">
                    <a href="https://nodalpoint.io" style="color: #002FA7; text-decoration: none;">NETWORK</a>
                  </td>
                  <td>
                    <a href="https://nodalpoint.io/bill-debugger" style="color: #002FA7; text-decoration: none;">[ RUN_AUDIT ]</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          </table>
        </div>
      </div>
    `
  }
  html += `</div>` // Close the outer container (600px)


  return html
}
