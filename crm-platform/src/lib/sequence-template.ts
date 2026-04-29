type TemplateValue = string | number | boolean | null | undefined

type TemplateContext = {
  contact?: Record<string, any> | null
  account?: Record<string, any> | null
  site?: Record<string, any> | null
}

function toText(value: TemplateValue, fallback = ''): string {
  const text = value == null ? '' : String(value).trim()
  return text || fallback
}

function firstText(...values: TemplateValue[]): string {
  for (const value of values) {
    const text = toText(value)
    if (text) return text
  }
  return ''
}

function joinLocation(city?: TemplateValue, state?: TemplateValue): string {
  return [toText(city), toText(state)].filter(Boolean).join(', ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitNameParts(name: string): { first: string; last: string } {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return {
    first: parts[0] || '',
    last: parts.length > 1 ? parts.slice(1).join(' ') : '',
  }
}

export function buildSequenceTemplateVariables(source: TemplateContext = {}): Record<string, string> {
  const contact = source.contact || {}
  const account = source.account || {}
  const site = source.site || {}

  const companyName = firstText(
    account.name,
    contact.companyName,
    contact.company,
    account.domain,
    site.companyName,
    'your company',
  )
  const contactName = firstText(
    contact.name,
    [contact.firstName, contact.lastName].filter(Boolean).join(' '),
    contact.email ? String(contact.email).split('@')[0] : '',
    'there',
  )
  const contactParts = splitNameParts(contactName)
  const contactFirstName = firstText(
    contact.firstName,
    contactParts.first,
    contact.email ? String(contact.email).split('@')[0] : '',
    'there',
  )
  const contactLastName = firstText(contact.lastName, contactParts.last)
  const location = firstText(
    site.location,
    account.location,
    contact.location,
    joinLocation(site.city || account.city || contact.city, site.state || account.state || contact.state),
  )
  const address = firstText(site.address, account.address, contact.address)
  const industry = firstText(account.industry, contact.industry)
  const electricitySupplier = firstText(
    account.electricity_supplier,
    account.electricitySupplier,
    contact.electricitySupplier,
  )
  const annualUsage = firstText(account.annual_usage, account.annualUsage, contact.annualUsage)
  const currentRate = firstText(account.current_rate, account.currentRate, contact.currentRate)
  const contractEnd = firstText(
    account.contract_end_date ? String(account.contract_end_date) : '',
    account.contractEnd,
    contact.contractEnd,
  )
  const description = firstText(account.description, contact.accountDescription)
  const companyPhone = firstText(account.phone, account.companyPhone, contact.companyPhone)
  const website = firstText(account.website, account.domain, contact.website)
  const linkedinUrl = firstText(account.linkedin_url, account.linkedinUrl, contact.linkedinUrl)
  const loadZone = firstText(site.utilityTerritory, site.tdu, account.load_zone, contact.load_zone)

  return {
    'contact.firstName': contactFirstName,
    'contact.lastName': contactLastName,
    'contact.name': contactName,
    'contact.email': toText(contact.email),
    'contact.title': toText(contact.title),
    'contact.phone': toText(contact.phone || contact.mobile || contact.workDirectPhone || contact.otherPhone || companyPhone),
    'contact.mobile': toText(contact.mobile),
    'contact.workDirectPhone': toText(contact.workDirectPhone),
    'contact.otherPhone': toText(contact.otherPhone),
    'contact.companyPhone': toText(contact.companyPhone || companyPhone),
    'contact.city': toText(contact.city || site.city || account.city),
    'contact.state': toText(contact.state || site.state || account.state),
    'contact.location': toText(contact.location || location),
    'contact.address': toText(contact.address || address),
    'contact.linkedinUrl': toText(contact.linkedinUrl || linkedinUrl),
    'contact.website': toText(contact.website || website),
    'contact.notes': toText(contact.notes),
    'contact.listName': toText(contact.listName),
    'contact.companyName': companyName,
    'contact.industry': industry,
    'contact.electricitySupplier': electricitySupplier,
    'contact.annualUsage': annualUsage,
    'contact.currentRate': currentRate,
    'contact.contractEnd': contractEnd,
    'contact.accountDescription': description,
    'contact.load_zone': loadZone,
    'account.name': companyName,
    'account.industry': industry,
    'account.domain': website,
    'account.description': description,
    'account.companyPhone': toText(account.companyPhone || companyPhone),
    'account.contractEnd': contractEnd,
    'account.location': toText(location),
    'account.city': toText(account.city || site.city || contact.city),
    'account.state': toText(account.state || site.state || contact.state),
    'account.address': toText(account.address || address),
    'account.linkedinUrl': toText(account.linkedinUrl || linkedinUrl),
    'account.annualUsage': annualUsage,
    'account.electricitySupplier': electricitySupplier,
    'account.currentRate': currentRate,
    'account.revenue': toText(account.revenue),
    'account.employees': toText(account.employees),
    'site.city': toText(site.city || account.city || contact.city),
    'site.state': toText(site.state || account.state || contact.state),
    'site.address': toText(site.address || address),
    'site.utilityTerritory': toText(site.utilityTerritory),
    'site.tdu': toText(site.tdu),
    'site.marketContext': toText(site.marketContext),
    first_name: contactFirstName,
    last_name: contactLastName,
    company_name: companyName,
    email: toText(contact.email),
    title: toText(contact.title),
    industry: industry,
    contract_end: contractEnd,
    load_zone: loadZone,
    scarcity_risk: 'HIGH',
    date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    context_id: contact.id ? `CONTACT_${String(contact.id).slice(0, 8).toUpperCase()}` : 'TX_001',
    cta_url: '#',
  }
}

export function renderSequenceTemplate(input: string, variables: Record<string, string> = {}): string {
  let output = String(input || '')
  if (!output) return ''

  for (const [key, rawValue] of Object.entries(variables)) {
    const value = rawValue == null ? '' : String(rawValue).trim()
    if (!value) continue
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g')
    output = output.replace(pattern, value)
  }

  output = output.replace(/\{\{\s*[^}]+\s*\}\}/g, '')
  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
