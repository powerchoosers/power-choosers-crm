import { cors } from '../_cors.js'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import {
  buildProspectServiceAddresses,
  enrichApolloOrganizationByDomain,
  formatProspectLocationLabel,
  normalizeOrganizationName,
} from '@/lib/apollo-prospect'
import { parseHeadcount, headcountMetadata } from '@/lib/headcount'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { getApiKey } from '../apollo/_utils.js'
import { extractDomain, inferNameParts, normalizeOrigin, trimText } from './_shared.js'

function sanitizeText(value) {
  const text = trimText(value)
  if (!text) return ''
  const lowered = text.toLowerCase()
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') return ''
  return text
}

function normalizeLinkedinUrl(value) {
  const text = sanitizeText(value)
  if (!text) return ''
  try {
    const parsed = new URL(text.includes('://') ? text : `https://${text.replace(/^\/+/, '')}`)
    const hostname = parsed.hostname.replace(/^www\./i, '')
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return `${hostname}${pathname}`.replace(/\/+$/, '').toLowerCase()
  } catch {
    return text
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
  }
}

function normalizeLinkedinLookup(value) {
  const text = sanitizeText(value)
  if (!text) return ''

  try {
    const parsed = new URL(text.includes('://') ? text : `https://${text.replace(/^\/+/, '')}`)
    const hostname = parsed.hostname.replace(/^www\./i, '')
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return `${hostname}${pathname}`.replace(/\/+$/, '').toLowerCase()
  } catch {
    return text
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
  }
}

function buildIdentityName(input) {
  let firstName = sanitizeText(input?.firstName || input?.first_name)
  let lastName = sanitizeText(input?.lastName || input?.last_name)
  let name = sanitizeText(input?.name || input?.fullName || input?.full_name)

  if ((!firstName || !lastName) && name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (!firstName && parts.length > 0) firstName = parts[0]
    if (!lastName && parts.length > 1) lastName = parts.slice(1).join(' ')
  }

  if (!name) {
    name = [firstName, lastName].filter(Boolean).join(' ').trim()
  }

  return {
    firstName,
    lastName,
    name,
  }
}

function normalizePhoneEntries(value) {
  const entries = Array.isArray(value) ? value : []
  const mapped = entries
    .map((entry) => {
      if (typeof entry === 'string') {
        const number = formatPhoneNumber(entry)
        if (!number) return null
        return { number, type: '' }
      }

      if (!entry || typeof entry !== 'object') return null
      const raw = entry?.number || entry?.sanitized_number || entry?.raw_number
      const number = formatPhoneNumber(raw)
      if (!number) return null
      return {
        number,
        type: sanitizeText(entry?.type || entry?.type_cd).toLowerCase(),
      }
    })
    .filter(Boolean)

  const seen = new Set()
  const unique = []
  mapped.forEach((entry) => {
    const key = `${entry.number}|${entry.type || ''}`
    if (seen.has(key)) return
    seen.add(key)
    unique.push(entry)
  })
  return unique
}

function assignPhones(entries) {
  const patch = {}
  const extras = []
  const slots = { mobile: false, work: false, other: false }
  let primaryPhoneField = ''

  entries.forEach((entry) => {
    const type = sanitizeText(entry?.type).toLowerCase()

    if (type.includes('mobile')) {
      if (!slots.mobile) {
        patch.mobile = entry.number
        patch.phone = entry.number
        if (!primaryPhoneField) primaryPhoneField = 'mobile'
        slots.mobile = true
      } else {
        extras.push(entry)
      }
      return
    }

    if (type.includes('direct') || type.includes('work')) {
      if (!slots.work) {
        patch.workPhone = entry.number
        if (!primaryPhoneField) primaryPhoneField = 'workDirectPhone'
        slots.work = true
      } else {
        extras.push(entry)
      }
      return
    }

    if (!slots.other) {
      patch.otherPhone = entry.number
      if (!primaryPhoneField) primaryPhoneField = 'otherPhone'
      slots.other = true
    } else {
      extras.push(entry)
    }
  })

  if (!patch.mobile && entries[0]?.number) {
    patch.mobile = entries[0].number
    if (!primaryPhoneField) primaryPhoneField = 'mobile'
  }
  if (!patch.phone) {
    patch.phone = patch.mobile || entries[0]?.number || patch.workPhone || patch.otherPhone || ''
    if (!primaryPhoneField) {
      primaryPhoneField = patch.mobile ? 'mobile' : patch.workPhone ? 'workDirectPhone' : patch.otherPhone ? 'otherPhone' : ''
    }
  }
  if (primaryPhoneField) {
    patch.primaryPhoneField = primaryPhoneField
  }

  return { patch, extras }
}

function normalizeAddressKey(value) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/\b(united states of america|usa)\b/g, 'united states')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeServiceAddresses(value) {
  if (!Array.isArray(value)) return []

  return value
    .flatMap((entry, index) => {
      if (typeof entry === 'string') {
        const address = sanitizeText(entry)
        if (!address) return []
        return [{
          address,
          city: '',
          state: '',
          country: '',
          type: index === 0 ? 'headquarters' : 'service',
          isPrimary: index === 0,
        }]
      }

      if (!entry || typeof entry !== 'object') return []

      const address = sanitizeText(entry.address || entry.service_address || '')
      const city = sanitizeText(entry.city)
      const state = sanitizeText(entry.state)
      const country = sanitizeText(entry.country)
      const fallbackAddress = address || [city, state, country].filter(Boolean).join(', ')
      if (!fallbackAddress && !city && !state && !country) return []

      return [{
        ...entry,
        address: fallbackAddress,
        city,
        state,
        country,
        type: sanitizeText(entry.type) || (index === 0 ? 'headquarters' : 'service'),
        isPrimary: typeof entry.isPrimary === 'boolean' ? entry.isPrimary : index === 0,
      }]
    })
}

function mergeServiceAddresses(existingValue, incomingValue) {
  const existing = normalizeServiceAddresses(existingValue)
  const incoming = normalizeServiceAddresses(incomingValue)
  if (incoming.length === 0) return existing
  if (existing.length === 0) return incoming

  const merged = [...existing]
  incoming.forEach((entry) => {
    const key = normalizeAddressKey(entry.address)
    if (!key) {
      merged.push(entry)
      return
    }

    const index = merged.findIndex((row) => normalizeAddressKey(row.address) === key)
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...entry,
        address: merged[index].address || entry.address,
        city: merged[index].city || entry.city,
        state: merged[index].state || entry.state,
        country: merged[index].country || entry.country,
        type: merged[index].type || entry.type,
        isPrimary: merged[index].isPrimary || entry.isPrimary,
      }
      return
    }

    merged.push(entry)
  })

  if (merged.length > 0 && !merged.some((entry) => entry.isPrimary)) {
    merged[0] = { ...merged[0], isPrimary: true }
  }

  return merged
}

function normalizeMeters(value) {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const address = sanitizeText(entry)
      if (!address) return []
      return [{
        id: crypto.randomUUID(),
        esiId: '',
        address,
        rate: '',
        endDate: '',
      }]
    }

    if (!entry || typeof entry !== 'object') return []

    const address = sanitizeText(entry.address || entry.service_address || '')
    if (!address) return []

    return [{
      id: sanitizeText(entry.id) || crypto.randomUUID(),
      esiId: sanitizeText(entry.esiId || entry.esid || ''),
      address,
      rate: sanitizeText(entry.rate || ''),
      endDate: sanitizeText(entry.endDate || entry.end_date || ''),
    }]
  })
}

function mergeMeters(existingValue, incomingValue) {
  const existing = normalizeMeters(existingValue)
  const incoming = normalizeMeters(incomingValue)
  if (incoming.length === 0) return existing
  if (existing.length === 0) return incoming

  const merged = [...existing]
  incoming.forEach((entry) => {
    const key = normalizeAddressKey(entry.address)
    if (!key) {
      merged.push(entry)
      return
    }

    const index = merged.findIndex((row) => normalizeAddressKey(row.address) === key)
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        address: merged[index].address || entry.address,
        esiId: merged[index].esiId || entry.esiId,
        rate: merged[index].rate || entry.rate,
        endDate: merged[index].endDate || entry.endDate,
      }
      return
    }

    merged.push(entry)
  })

  return merged
}

function resolveAppOrigin(req, bodyOrigin) {
  const explicit = normalizeOrigin(bodyOrigin)
  if (explicit && !explicit.startsWith('chrome-extension://')) {
    return explicit
  }

  const protocol = sanitizeText(req.headers['x-forwarded-proto'] || '') || 'https'
  const host = sanitizeText(req.headers['x-forwarded-host'] || req.headers.host || '') || 'www.nodalpoint.io'
  return `${protocol}://${host}`
}

function extractLinkedInHints(title) {
  const clean = sanitizeText(title)
    .replace(/\s*[|•-]\s*LinkedIn.*$/i, '')
    .trim()

  if (!clean) {
    return {
      contactName: '',
      companyName: '',
    }
  }

  const atMatch = clean.match(/\bat\s+(.+)$/i)
  const companyName = sanitizeText(atMatch?.[1] || '')
  const contactName = sanitizeText(clean.replace(/\bat\s+.+$/i, ''))

  return {
    contactName: contactName || clean,
    companyName,
  }
}

function normalizeContactRow(row) {
  if (!row || typeof row !== 'object') return null
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const identity = buildIdentityName({
    firstName: row.firstName || row.first_name,
    lastName: row.lastName || row.last_name,
    name: row.name,
  })

  const phones = [
    sanitizeText(row.mobile),
    sanitizeText(row.workPhone),
    sanitizeText(row.phone),
    sanitizeText(row.companyPhone),
    sanitizeText(row.otherPhone),
    sanitizeText(row.directPhone),
  ].filter(Boolean)

  const photoUrl = sanitizeText(
    metadata.photoUrl ||
      metadata.photo_url ||
      metadata.avatarUrl ||
      metadata.avatar_url ||
      ''
  ) || null

  return {
    id: sanitizeText(row.id),
    accountId: sanitizeText(row.accountId || row.account_id) || null,
    crmId: sanitizeText(row.id) || null,
    apolloPersonId: sanitizeText(metadata.apollo_person_id) || null,
    name: identity.name || 'Contact',
    firstName: identity.firstName || null,
    lastName: identity.lastName || null,
    title: sanitizeText(row.title) || null,
    email: sanitizeText(row.email) || null,
    linkedin: sanitizeText(row.linkedinUrl) || null,
    location: [sanitizeText(row.city), sanitizeText(row.state)].filter(Boolean).join(', ') || null,
    photoUrl,
    phone: sanitizeText(row.phone) || null,
    mobile: sanitizeText(row.mobile) || null,
    workPhone: sanitizeText(row.workPhone) || null,
    companyPhone: sanitizeText(row.companyPhone) || null,
    otherPhone: sanitizeText(row.otherPhone) || null,
    directPhone: sanitizeText(row.directPhone) || null,
    primaryPhoneField: sanitizeText(row.primaryPhoneField || metadata.primaryPhoneField) || null,
    phones,
    source: 'crm',
  }
}

function buildApolloCacheCompany(account) {
  if (!account || typeof account !== 'object') return null

  return {
    id: sanitizeText(account.id) || null,
    name: sanitizeText(account.name) || '',
    domain: sanitizeText(account.domain) || null,
    description: sanitizeText(account.description) || null,
    employees: account.employees ?? null,
    industry: sanitizeText(account.industry) || null,
    city: sanitizeText(account.city) || null,
    state: sanitizeText(account.state) || null,
    country: sanitizeText(account.country) || null,
    address: sanitizeText(account.address) || null,
    logoUrl: sanitizeText(account.logo_url || account.logoUrl || '') || null,
    linkedin: sanitizeText(account.linkedin_url || account.linkedinUrl || '') || null,
    companyPhone: sanitizeText(account.phone || account.companyPhone || '') || null,
    zip: sanitizeText(account.zip) || null,
    revenue: sanitizeText(account.revenue) || null,
  }
}

function buildApolloCacheContact(contact, contactPhones) {
  if (!contact || typeof contact !== 'object') return null

  const metadata = contact.metadata && typeof contact.metadata === 'object' ? contact.metadata : {}
  const normalizedPhones = Array.isArray(contactPhones) && contactPhones.length > 0
    ? contactPhones
    : Array.isArray(contact.phones)
      ? contact.phones
      : []

  return {
    id: sanitizeText(contact.id) || '',
    crmId: sanitizeText(contact.id) || null,
    apolloPersonId: sanitizeText(metadata.apollo_person_id) || null,
    name: sanitizeText(contact.name) || 'Contact',
    firstName: sanitizeText(contact.firstName) || null,
    lastName: sanitizeText(contact.lastName) || null,
    title: sanitizeText(contact.title) || null,
    email: sanitizeText(contact.email) || null,
    linkedin: sanitizeText(contact.linkedin) || sanitizeText(contact.linkedinUrl) || null,
    location: [sanitizeText(contact.city), sanitizeText(contact.state)].filter(Boolean).join(', ') || null,
    photoUrl: sanitizeText(contact.photoUrl || metadata.photoUrl || metadata.photo_url || '') || null,
    phone: sanitizeText(contact.phone) || null,
    mobile: sanitizeText(contact.mobile) || null,
    workPhone: sanitizeText(contact.workPhone) || null,
    companyPhone: sanitizeText(contact.companyPhone) || null,
    otherPhone: sanitizeText(contact.otherPhone) || null,
    directPhone: sanitizeText(contact.directPhone) || null,
    primaryPhoneField: sanitizeText(contact.primaryPhoneField || metadata.primaryPhoneField) || null,
    phones: normalizedPhones,
    isMonitored: true,
    source: 'crm',
  }
}

async function persistApolloSearchCache({ accountId, account, contact, contactPhones, now }) {
  if (!supabaseAdmin) return
  const company = buildApolloCacheCompany(account)
  if (!company || !company.name) return

  const cacheData = {
    company,
    contacts: contact ? [buildApolloCacheContact(contact, contactPhones)].filter(Boolean) : [],
    timestamp: Date.now(),
    searchTerm: '',
    currentPage: 1,
  }

  const keys = Array.from(new Set([
    accountId ? `ACCOUNT_${accountId}` : '',
    company.domain || '',
    company.name || '',
  ].filter(Boolean)))

  if (keys.length === 0) return

  try {
    const rows = keys.map((key) => ({
      key,
      data: cacheData,
      updated_at: now,
    }))

    const { error } = await supabaseAdmin
      .from('apollo_searches')
      .upsert(rows, { onConflict: 'key' })

    if (error) {
      console.warn('[Extension Ingest Contact] Apollo cache write failed:', error)
    }
  } catch (error) {
    console.warn('[Extension Ingest Contact] Apollo cache write failed:', error?.message || error)
  }
}

function buildOrganizationFields({ accountName, accountDomain, accountWebsite, accountDescription, accountIndustry, accountCity, accountState, accountCountry, accountAddress, accountZip, accountPhone, accountLinkedIn, accountLogo, employeesValue, revenue, now, accountTitle, rawOrg, fallbackOrg, pageUrl, parsedHeadcount }) {
  const fullAddress = formatProspectLocationLabel({
    address: accountAddress,
    city: accountCity,
    state: accountState,
    zip: accountZip,
  })

  const serviceAddresses = buildProspectServiceAddresses({
    address: accountAddress,
    city: accountCity,
    state: accountState,
    country: accountCountry,
  })

  const meters = fullAddress && fullAddress !== 'Unknown Location'
    ? [{
        id: crypto.randomUUID(),
        esiId: '',
        address: fullAddress,
        rate: '',
        endDate: '',
      }]
    : []

  return {
    name: accountName,
    domain: accountDomain || null,
    website: accountWebsite || null,
    industry: accountIndustry || null,
    description: accountDescription || null,
    employees: employeesValue,
    revenue: revenue || null,
    city: accountCity || null,
    state: accountState || null,
    country: accountCountry || null,
    address: accountAddress || null,
    zip: accountZip || null,
    logo_url: accountLogo || null,
    phone: accountPhone || null,
    linkedin_url: accountLinkedIn || null,
    status: 'active',
    metadata: {
      source: 'linkedin_contact_ingest',
      source_page_url: pageUrl || null,
      source_page_title: accountTitle || null,
      source_company_fields: {
        company_name: accountName || null,
        company_domain: accountDomain || null,
        company_website: accountWebsite || null,
        company_description: accountDescription || null,
        company_industry: accountIndustry || null,
        company_city: accountCity || null,
        company_state: accountState || null,
        company_country: accountCountry || null,
        company_address: accountAddress || null,
        company_zip: accountZip || null,
        company_phone: accountPhone || null,
        company_linkedin: accountLinkedIn || null,
        company_logo_url: accountLogo || null,
        company_employee_count: employeesValue,
        company_employee_count_range: parsedHeadcount?.label || null,
        headcount: employeesValue,
        company_revenue: revenue || null,
      },
      apollo_org_id: rawOrg?.id || fallbackOrg?.id || null,
      apollo_raw_data: rawOrg || fallbackOrg || null,
      apollo_enriched_at: now,
      meters,
      ...headcountMetadata(parsedHeadcount, 'linkedin_contact_ingest'),
      linkedin_profile_url: pageUrl || null,
    },
    service_addresses: serviceAddresses,
  }
}

async function findExistingAccount({ accountDomain, accountLinkedIn, accountName }) {
  if (!supabaseAdmin) return null

  const select = 'id, ownerId, "primaryContactId", service_addresses, metadata'

  if (accountDomain) {
    const { data } = await supabaseAdmin
      .from('accounts')
      .select(select)
      .eq('domain', accountDomain)
      .maybeSingle()
    if (data) return data
  }

  if (accountLinkedIn) {
    const linkedinLookup = normalizeLinkedinLookup(accountLinkedIn)
    if (linkedinLookup) {
      const { data } = await supabaseAdmin
        .from('accounts')
        .select(select)
        .ilike('linkedin_url', `%${linkedinLookup}%`)
        .maybeSingle()
      if (data) return data
    }
  }

  if (accountName) {
    const { data } = await supabaseAdmin
      .from('accounts')
      .select(select)
      .ilike('name', accountName)
      .maybeSingle()
    if (data) return data
  }

  return null
}

async function findExistingContact({ personId, email, linkedinUrl, firstName, lastName, accountId }) {
  if (!supabaseAdmin) return null

  const contactSelect = 'id, accountId, ownerId, name, firstName, lastName, email, title, linkedinUrl, phone, mobile, workPhone, companyPhone, otherPhone, primaryPhoneField, city, state, metadata'

  if (personId) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select(contactSelect)
      .eq('metadata->>apollo_person_id', personId)
      .maybeSingle()
    if (data) return data
  }

  if (email && accountId) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select(contactSelect)
      .eq('accountId', accountId)
      .ilike('email', email)
      .maybeSingle()
    if (data) return data
  }

  if (email) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select(contactSelect)
      .ilike('email', email)
      .maybeSingle()
    if (data) return data
  }

  if (linkedinUrl) {
    const linkedinLookup = normalizeLinkedinLookup(linkedinUrl)
    const linkedinPattern = linkedinLookup ? `%${linkedinLookup.split('linkedin.com/').pop() || linkedinLookup}%` : ''
    let query = supabaseAdmin
      .from('contacts')
      .select(contactSelect)
      .ilike('linkedinUrl', linkedinPattern || linkedinLookup || linkedinUrl)

    if (accountId) query = query.eq('accountId', accountId)
    const { data } = await query.maybeSingle()
    if (data) return data
  }

  if (accountId && firstName && lastName) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select(contactSelect)
      .eq('accountId', accountId)
      .eq('firstName', firstName)
      .eq('lastName', lastName)
      .maybeSingle()
    if (data) return data
  }

  return null
}

export default async function handler(req, res) {
  if (cors(req, res)) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const auth = await requireUser(req)
    if (!auth.user && !auth.isAdmin) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!supabaseAdmin) {
      res.status(500).json({ error: 'Supabase is not configured' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : body
    const pageUrl = trimText(snapshot?.url || body.pageUrl || '')

    if (!/linkedin\.com\/in\/[^/?#]+/i.test(pageUrl)) {
      res.status(400).json({ error: 'LinkedIn contact ingest requires a LinkedIn person profile.' })
      return
    }

    const appOrigin = resolveAppOrigin(req, body.appOrigin || snapshot?.origin || null)
    const authHeader = sanitizeText(req.headers.authorization || '')
    const snapshotTitle = sanitizeText(snapshot?.title || body.title || '')
    const hints = extractLinkedInHints(snapshotTitle)
    const fallbackIdentity = inferNameParts(hints.contactName || snapshotTitle)

    const personUrl = normalizeLinkedinUrl(pageUrl)
    const personBody = {
      linkedinUrl: personUrl,
      revealEmails: true,
      revealPhones: true,
      contacts: [{
        id: '',
        name: hints.contactName || fallbackIdentity.fullName || undefined,
        firstName: fallbackIdentity.firstName || undefined,
        lastName: fallbackIdentity.lastName || undefined,
        linkedin: personUrl,
        title: undefined,
        companyName: hints.companyName || undefined,
        companyDomain: undefined,
        companyWebsite: undefined,
      }],
      name: hints.contactName || fallbackIdentity.fullName || undefined,
      firstName: fallbackIdentity.firstName || undefined,
      lastName: fallbackIdentity.lastName || undefined,
      title: undefined,
      company: {
        name: hints.companyName || undefined,
        domain: undefined,
      },
    }

    const enrichResp = await fetch(`${appOrigin}/api/apollo/enrich`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(personBody),
    })

    const enrichText = await enrichResp.text()
    let enrichData = null
    if (enrichText) {
      try {
        enrichData = JSON.parse(enrichText)
      } catch {
        enrichData = enrichText
      }
    }

    if (!enrichResp.ok) {
      const message = typeof enrichData === 'object' && enrichData
        ? enrichData.message || enrichData.error
        : enrichData
      throw new Error(String(message || `Apollo enrich failed (${enrichResp.status})`))
    }

    const enrichedPerson = Array.isArray(enrichData?.contacts) ? enrichData.contacts[0] || null : null
    if (!enrichedPerson) {
      throw new Error('Apollo did not return a LinkedIn contact.')
    }

    const personIdentity = buildIdentityName({
      firstName: enrichedPerson.firstName || enrichedPerson.first_name || fallbackIdentity.firstName,
      lastName: enrichedPerson.lastName || enrichedPerson.last_name || fallbackIdentity.lastName,
      name: enrichedPerson.name || enrichedPerson.fullName || fallbackIdentity.fullName || hints.contactName,
    })

    const fallbackOrg = enrichedPerson.organization && typeof enrichedPerson.organization === 'object'
      ? enrichedPerson.organization
      : {}

    let apiKey = ''
    try {
      apiKey = getApiKey()
    } catch (error) {
      console.warn('[Extension Ingest Contact] Apollo API key not configured, falling back to mapped org data.')
    }

    let rawOrg = null
    const orgDomain = extractDomain(
      fallbackOrg.domain ||
        fallbackOrg.website ||
        enrichedPerson.companyDomain ||
        enrichedPerson.companyWebsite ||
        ''
    )

    if (apiKey && orgDomain) {
      try {
        rawOrg = await enrichApolloOrganizationByDomain({ domain: orgDomain }, apiKey)
      } catch (error) {
        console.warn('[Extension Ingest Contact] Apollo org enrich failed:', error?.message || error)
      }
    }

    const mergedOrg = rawOrg || fallbackOrg || {}

    const accountName = normalizeOrganizationName(
      mergedOrg.name ||
        enrichedPerson.companyName ||
        hints.companyName ||
        fallbackIdentity.fullName ||
        orgDomain ||
        'LinkedIn Company'
    ) || 'LinkedIn Company'

    const accountDomain = sanitizeText(
      extractDomain(
        mergedOrg.primary_domain ||
          mergedOrg.domain ||
          mergedOrg.website_url ||
          mergedOrg.website ||
          enrichedPerson.companyDomain ||
          enrichedPerson.companyWebsite ||
          ''
      ) || ''
    ) || null

    const accountWebsite = normalizeOrigin(
      mergedOrg.website_url ||
        mergedOrg.website ||
        enrichedPerson.companyWebsite ||
        ''
    ) || (accountDomain ? `https://${accountDomain}` : null)

    const accountDescription = sanitizeText(
      mergedOrg.short_description ||
        mergedOrg.seo_description ||
        mergedOrg.description ||
        enrichedPerson.companyDescription ||
        ''
    ) || null

    const accountIndustry = sanitizeText(
      mergedOrg.industry ||
        (Array.isArray(mergedOrg.industries) ? mergedOrg.industries[0] : '') ||
        enrichedPerson.companyIndustry ||
        ''
    ) || null

    const accountCity = sanitizeText(
      mergedOrg.city ||
        mergedOrg.organization_city ||
        enrichedPerson.companyCity ||
        ''
    ) || null

    const accountState = sanitizeText(
      mergedOrg.state ||
        mergedOrg.organization_state ||
        enrichedPerson.companyState ||
        ''
    ) || null

    const accountCountry = sanitizeText(mergedOrg.country || enrichedPerson.companyCountry || '') || null

    const accountAddress = sanitizeText(
      mergedOrg.formatted_address ||
        mergedOrg.raw_address ||
        mergedOrg.street_address ||
        mergedOrg.organization_raw_address ||
        mergedOrg.organization_street_address ||
        enrichedPerson.companyAddress ||
        ''
    ) || null

    const accountZip = sanitizeText(
      mergedOrg.postal_code ||
        mergedOrg.organization_postal_code ||
        enrichedPerson.companyZip ||
        ''
    ) || null

    const accountLinkedIn = sanitizeText(
      mergedOrg.linkedin_url ||
        enrichedPerson.companyLinkedin ||
        ''
    ) || null

    const accountLogo = sanitizeText(
      mergedOrg.logo_url ||
        enrichedPerson.companyLogoUrl ||
        ''
    ) || null

    const accountPhone = formatPhoneNumber(
      mergedOrg.phone ||
        mergedOrg.sanitized_phone ||
        mergedOrg.primary_phone?.number ||
        enrichedPerson.companyPhone ||
        ''
    ) || null

    const revenue = sanitizeText(
      mergedOrg.annual_revenue_printed ||
        mergedOrg.organization_revenue_printed ||
        enrichedPerson.companyRevenue ||
        ''
    ) || null

    const employeesRaw =
      mergedOrg.estimated_num_employees ||
      mergedOrg.employee_count ||
      enrichedPerson.companyEmployees ||
      null

    const parsedHeadcount = parseHeadcount(employeesRaw)
    const employeesValue = parsedHeadcount.value

    const accountLocationLabel = formatProspectLocationLabel({
      address: accountAddress,
      city: accountCity,
      state: accountState,
      zip: accountZip,
    })

    const accountServiceAddresses = buildProspectServiceAddresses({
      address: accountAddress,
      city: accountCity,
      state: accountState,
      country: accountCountry,
    })

    const accountMeters = accountLocationLabel && accountLocationLabel !== 'Unknown Location'
      ? [{
          id: crypto.randomUUID(),
          esiId: '',
          address: accountLocationLabel,
          rate: '',
          endDate: '',
        }]
      : []

    const now = new Date().toISOString()

    const existingAccount = await findExistingAccount({
      accountDomain,
      accountLinkedIn,
      accountName,
    })

    const existingAccountMetadata = existingAccount?.metadata && typeof existingAccount.metadata === 'object'
      ? existingAccount.metadata
      : {}

    const mergedServiceAddresses = mergeServiceAddresses(existingAccount?.service_addresses, accountServiceAddresses)
    const mergedMeters = mergeMeters(existingAccountMetadata.meters, accountMeters)
    const ownerId =
      sanitizeText(
        existingAccount?.ownerId ||
          auth.email?.toLowerCase() ||
          auth.user?.email?.toLowerCase() ||
          String(auth.id || '').trim().toLowerCase() ||
          String(auth.user?.id || '').trim().toLowerCase()
      ) || null

    const accountMetadata = {
      ...existingAccountMetadata,
      source: 'linkedin_contact_ingest',
      source_page_url: pageUrl || null,
      source_page_title: snapshotTitle || null,
      source_company_fields: {
        ...(existingAccountMetadata.source_company_fields && typeof existingAccountMetadata.source_company_fields === 'object'
          ? existingAccountMetadata.source_company_fields
          : {}),
        company_name: accountName,
        company_domain: accountDomain,
        company_website: accountWebsite,
        company_description: accountDescription,
        company_industry: accountIndustry,
        company_city: accountCity,
        company_state: accountState,
        company_country: accountCountry,
        company_address: accountAddress,
        company_zip: accountZip,
        company_phone: accountPhone,
        company_linkedin: accountLinkedIn,
        company_logo_url: accountLogo,
        company_employee_count: employeesValue,
        company_employee_count_range: parsedHeadcount.label || null,
        headcount: employeesValue,
        company_revenue: revenue,
      },
      apollo_org_id: mergedOrg.id || existingAccountMetadata.apollo_org_id || null,
      apollo_raw_data: mergedOrg || existingAccountMetadata.apollo_raw_data || null,
      apollo_enriched_at: now,
      meters: mergedMeters,
      ...headcountMetadata(parsedHeadcount, 'linkedin_contact_ingest'),
      linkedin_profile_url: pageUrl || null,
    }

    const accountPayload = {
      name: accountName,
      domain: accountDomain,
      website: accountWebsite,
      industry: accountIndustry,
      description: accountDescription,
      employees: employeesValue,
      revenue,
      city: accountCity,
      state: accountState,
      country: accountCountry,
      address: accountAddress,
      zip: accountZip,
      logo_url: accountLogo,
      phone: accountPhone,
      linkedin_url: accountLinkedIn,
      status: 'active',
      service_addresses: mergedServiceAddresses,
      ownerId,
      metadata: accountMetadata,
      updatedAt: now,
    }

    const accountId = existingAccount?.id || crypto.randomUUID()

    if (existingAccount) {
      const updatePayload = {
        status: 'active',
        updatedAt: now,
      }

      if (accountName) updatePayload.name = accountName
      if (accountDomain) updatePayload.domain = accountDomain
      if (accountWebsite) updatePayload.website = accountWebsite
      if (accountIndustry) updatePayload.industry = accountIndustry
      if (accountDescription) updatePayload.description = accountDescription
      if (employeesValue !== null) updatePayload.employees = employeesValue
      if (revenue) updatePayload.revenue = revenue
      if (accountCity) updatePayload.city = accountCity
      if (accountState) updatePayload.state = accountState
      if (accountCountry) updatePayload.country = accountCountry
      if (accountAddress) updatePayload.address = accountAddress
      if (accountZip) updatePayload.zip = accountZip
      if (accountLogo) updatePayload.logo_url = accountLogo
      if (accountPhone) updatePayload.phone = accountPhone
      if (accountLinkedIn) updatePayload.linkedin_url = accountLinkedIn
      if (mergedServiceAddresses.length > 0) updatePayload.service_addresses = mergedServiceAddresses
      updatePayload.metadata = accountMetadata
      if (!sanitizeText(existingAccount.ownerId) && ownerId) updatePayload.ownerId = ownerId

      const { error } = await supabaseAdmin
        .from('accounts')
        .update(updatePayload)
        .eq('id', existingAccount.id)

      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('accounts')
        .insert({
          id: accountId,
          ...accountPayload,
          createdAt: now,
        })

      if (error) throw error
    }

    const contactPhones = normalizePhoneEntries([
      ...(Array.isArray(enrichedPerson.phones) ? enrichedPerson.phones : []),
      ...(enrichedPerson.phone ? [{ number: enrichedPerson.phone, type: 'work' }] : []),
    ])
    const { patch: contactPhonePatch, extras: overflowPhones } = assignPhones(contactPhones)
    const existingContact = await findExistingContact({
      personId: sanitizeText(enrichedPerson.id || ''),
      email: sanitizeText(enrichedPerson.email || ''),
      linkedinUrl: sanitizeText(enrichedPerson.linkedin || ''),
      firstName: personIdentity.firstName || '',
      lastName: personIdentity.lastName || '',
      accountId,
    })

    const existingContactMetadata = existingContact?.metadata && typeof existingContact.metadata === 'object'
      ? existingContact.metadata
      : {}

    const contactPhotoUrl = sanitizeText(
      enrichedPerson.photoUrl ||
        enrichedPerson.photo_url ||
        existingContactMetadata.photoUrl ||
        existingContactMetadata.photo_url ||
        ''
    ) || null

    const contactIdentity = buildIdentityName({
      firstName: enrichedPerson.firstName || enrichedPerson.first_name || personIdentity.firstName,
      lastName: enrichedPerson.lastName || enrichedPerson.last_name || personIdentity.lastName,
      name: enrichedPerson.name || enrichedPerson.fullName || personIdentity.name,
    })

    const contactTitle = sanitizeText(enrichedPerson.jobTitle || enrichedPerson.title || '') || null
    const contactEmail = sanitizeText(enrichedPerson.email || '') || null
    const contactLinkedIn = sanitizeText(enrichedPerson.linkedin || '') || null
    const contactCity = sanitizeText(enrichedPerson.city || enrichedPerson.location?.split(',')?.[0] || '') || null
    const contactState = sanitizeText(enrichedPerson.state || enrichedPerson.location?.split(',')?.[1] || '') || null
    const currentContactOwnerId = sanitizeText(
      existingContact?.ownerId ||
        auth.email?.toLowerCase() ||
        auth.user?.email?.toLowerCase() ||
        String(auth.id || '').trim().toLowerCase() ||
        String(auth.user?.id || '').trim().toLowerCase()
    ) || null

    const contactMetadata = {
      ...existingContactMetadata,
      source: 'LinkedIn contact ingest',
      source_page_url: pageUrl || null,
      source_page_title: snapshotTitle || null,
      company: accountName,
      apollo_person_id: sanitizeText(enrichedPerson.id || '') || existingContactMetadata.apollo_person_id || null,
      apollo_revealed_phones: contactPhones,
      apollo_overflow_phones: overflowPhones,
      original_apollo_data: enrichedPerson,
      photoUrl: contactPhotoUrl || existingContactMetadata.photoUrl || null,
      photo_url: contactPhotoUrl || existingContactMetadata.photo_url || null,
      avatarUrl: contactPhotoUrl || existingContactMetadata.avatarUrl || null,
      avatar_url: contactPhotoUrl || existingContactMetadata.avatar_url || null,
      linkedin_profile_url: contactLinkedIn || null,
    }

    const contactPayload = {
      accountId,
      firstName: contactIdentity.firstName || null,
      lastName: contactIdentity.lastName || null,
      name: contactIdentity.name || [contactIdentity.firstName, contactIdentity.lastName].filter(Boolean).join(' ') || 'Contact',
      title: contactTitle,
      email: contactEmail,
      linkedinUrl: contactLinkedIn,
      city: contactCity,
      state: contactState,
      ownerId: currentContactOwnerId,
      status: 'active',
      metadata: contactMetadata,
      updatedAt: now,
    }

    const contactId = existingContact?.id || crypto.randomUUID()

    if (existingContact) {
      const updatePayload = {
        status: 'active',
        updatedAt: now,
        metadata: contactMetadata,
      }

      if (contactIdentity.firstName) updatePayload.firstName = contactIdentity.firstName
      if (contactIdentity.lastName) updatePayload.lastName = contactIdentity.lastName
      if (contactIdentity.name) updatePayload.name = contactIdentity.name
      if (contactTitle) updatePayload.title = contactTitle
      if (contactEmail) updatePayload.email = contactEmail
      if (contactLinkedIn) updatePayload.linkedinUrl = contactLinkedIn
      if (contactCity) updatePayload.city = contactCity
      if (contactState) updatePayload.state = contactState
      if (contactPhonePatch.mobile) updatePayload.mobile = contactPhonePatch.mobile
      if (contactPhonePatch.phone) updatePayload.phone = contactPhonePatch.phone
      if (contactPhonePatch.workPhone) updatePayload.workPhone = contactPhonePatch.workPhone
      if (contactPhonePatch.otherPhone) updatePayload.otherPhone = contactPhonePatch.otherPhone
      if (contactPhonePatch.primaryPhoneField) updatePayload.primaryPhoneField = contactPhonePatch.primaryPhoneField
      if (accountId) updatePayload.accountId = accountId
      if (!sanitizeText(existingContact.ownerId) && currentContactOwnerId) updatePayload.ownerId = currentContactOwnerId

      const { error } = await supabaseAdmin
        .from('contacts')
        .update(updatePayload)
        .eq('id', existingContact.id)

      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('contacts')
        .insert({
          id: contactId,
          ...contactPayload,
      mobile: contactPhonePatch.mobile || null,
      phone: contactPhonePatch.phone || null,
      workPhone: contactPhonePatch.workPhone || null,
      otherPhone: contactPhonePatch.otherPhone || null,
      primaryPhoneField: contactPhonePatch.primaryPhoneField || null,
      createdAt: now,
        })

      if (error) throw error
    }

    const { data: updatedContact, error: contactReadError } = await supabaseAdmin
      .from('contacts')
      .select('id, accountId, firstName, lastName, name, email, title, linkedinUrl, phone, mobile, workPhone, companyPhone, otherPhone, primaryPhoneField, city, state, metadata')
      .eq('id', contactId)
      .maybeSingle()

    if (contactReadError) throw contactReadError

    const normalizedContact = normalizeContactRow(updatedContact)

    if (!sanitizeText(existingAccount?.primaryContactId) && normalizedContact?.id) {
      const { error: primaryContactError } = await supabaseAdmin
        .from('accounts')
        .update({
          primaryContactId: normalizedContact.id,
          updatedAt: now,
        })
        .eq('id', accountId)

      if (primaryContactError) {
        console.warn('[Extension Ingest Contact] Failed to set primary contact:', primaryContactError)
      }
    }

    const { data: refreshedAccount, error: accountReadError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle()

    if (accountReadError) throw accountReadError

    await persistApolloSearchCache({
      accountId,
      account: refreshedAccount || accountPayload,
      contact: normalizedContact,
      contactPhones,
      now,
    })

    res.status(200).json({
      success: true,
      existing: Boolean(existingAccount),
      accountExisting: Boolean(existingAccount),
      contactExisting: Boolean(existingContact),
      accountId,
      contactId: normalizedContact?.id || contactId,
      account: refreshedAccount,
      contact: normalizedContact,
      enriched: true,
      linkedInUrl: personUrl,
      primaryContactLinked: Boolean(normalizedContact?.id),
    })
  } catch (error) {
    console.error('[Extension Ingest Contact] Error:', error)
    res.status(500).json({
      error: 'LinkedIn contact ingest failed',
      message: error.message,
    })
  }
}
