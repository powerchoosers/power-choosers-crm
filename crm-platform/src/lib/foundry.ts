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

import { render } from '@react-email/render'
import FoundryTemplate from '@/components/foundry/FoundryTemplate'

export async function generateStaticHtml(blocks: any[], options?: { skipFooter?: boolean; profile?: any }) {
  const html = await render(
    FoundryTemplate({
      blocks,
      options: {
        skipFooter: options?.skipFooter,
        profile: options?.profile
      }
    })
  )
  return html
}

export async function generateStaticHtmlForEditor(blocks: any[], options?: { skipFooter?: boolean; profile?: any }) {
  // We can use the same function for both now, but kept for compatibility if needed
  return generateStaticHtml(blocks, options)
}
