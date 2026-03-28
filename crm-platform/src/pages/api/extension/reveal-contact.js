import { cors } from '../_cors.js'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { extractDomain, trimText } from './_shared.js'
import { formatPhoneForContact } from '../apollo/_utils.js'

function sanitizeText(value) {
  const text = trimText(value)
  if (!text) return ''
  const lowered = text.toLowerCase()
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') return ''
  return text
}

function resolvePhotoUrl(...sources) {
  const directKeys = [
    'photoUrl',
    'photo_url',
    'avatarUrl',
    'avatar_url',
    'profilePhotoUrl',
    'profile_photo_url',
    'imageUrl',
    'image_url',
  ]
  const nestedKeys = ['metadata', 'general', 'contact', 'original_apollo_data']

  const fromRecord = (record) => {
    if (!record || typeof record !== 'object') return ''

    for (const key of directKeys) {
      const url = sanitizeText(record?.[key])
      if (url) return url
    }

    for (const key of nestedKeys) {
      const nested = record?.[key]
      if (!nested || typeof nested !== 'object') continue
      const nestedUrl = fromRecord(nested)
      if (nestedUrl) return nestedUrl
    }

    return ''
  }

  for (const source of sources) {
    const url = fromRecord(source)
    if (url) return url
  }

  return ''
}

function normalizeLinkedin(value) {
  return sanitizeText(value).replace(/\/+$/, '')
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

function parseLocation(value) {
  const text = sanitizeText(value)
  if (!text) return { city: '', state: '' }
  const parts = text.split(',').map((part) => sanitizeText(part)).filter(Boolean)
  return {
    city: parts[0] || '',
    state: parts[1] || '',
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
        const number = formatPhoneForContact(entry)
        if (!number) return null
        return { number, type: '' }
      }

      if (!entry || typeof entry !== 'object') return null
      const raw = entry?.number || entry?.sanitized_number || entry?.raw_number
      const number = formatPhoneForContact(raw)
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

function buildCompanySummary(accountRow, fallbackCompany = null) {
  const fallback = fallbackCompany && typeof fallbackCompany === 'object' ? fallbackCompany : {}
  return {
    id: sanitizeText(accountRow?.id || fallback.id || '') || '',
    name: sanitizeText(accountRow?.name || fallback.name || '') || '',
    domain: sanitizeText(accountRow?.domain || accountRow?.website || fallback.domain || '') || '',
    description: sanitizeText(accountRow?.description || fallback.description || '') || '',
    employees: accountRow?.employees ?? fallback.employees ?? null,
    industry: sanitizeText(accountRow?.industry || fallback.industry || '') || '',
    city: sanitizeText(accountRow?.city || fallback.city || '') || '',
    state: sanitizeText(accountRow?.state || fallback.state || '') || '',
    country: sanitizeText(accountRow?.country || fallback.country || '') || '',
    address: sanitizeText(accountRow?.address || fallback.address || '') || '',
    logoUrl: sanitizeText(accountRow?.logo_url || fallback.logoUrl || '') || null,
    linkedin: sanitizeText(accountRow?.linkedin_url || fallback.linkedin || '') || '',
    companyPhone: sanitizeText(accountRow?.phone || fallback.companyPhone || '') || '',
    zip: sanitizeText(accountRow?.zip || fallback.zip || '') || '',
    revenue: sanitizeText(accountRow?.revenue || fallback.revenue || '') || '',
  }
}

function buildApolloCacheContact({
  personId,
  crmId,
  person,
  enriched,
  normalizedPhones,
  existingContact,
  existingMetadata,
}) {
  const enrichedIdentity = buildIdentityName({
    firstName: enriched?.firstName,
    lastName: enriched?.lastName,
    name: enriched?.fullName || enriched?.name,
  })
  const personIdentity = buildIdentityName({
    firstName: person?.firstName || person?.first_name,
    lastName: person?.lastName || person?.last_name,
    name: person?.name,
  })
  const resolvedIdentity = {
    name: enrichedIdentity.name || personIdentity.name || existingContact?.name || 'Contact',
    firstName: enrichedIdentity.firstName || personIdentity.firstName || existingContact?.firstName || '',
    lastName: enrichedIdentity.lastName || personIdentity.lastName || existingContact?.lastName || '',
  }
  const fallbackLocation = parseLocation(person?.location)
  const location = sanitizeText(
    enriched?.location ||
      [sanitizeText(enriched?.city || person?.city || fallbackLocation.city), sanitizeText(enriched?.state || person?.state || fallbackLocation.state), sanitizeText(enriched?.country || person?.country || '')]
        .filter(Boolean)
        .join(', ')
  ) || ''
  const email = sanitizeText(enriched?.email || person?.email || existingContact?.email || '') || ''
  const linkedinUrl = normalizeLinkedin(enriched?.linkedin || person?.linkedin || existingContact?.linkedin || '')
  const title = sanitizeText(enriched?.jobTitle || person?.title || existingContact?.title || '') || ''
  const photoUrl = resolvePhotoUrl(enriched, person, existingMetadata, existingContact) || ''
  const phones = Array.isArray(normalizedPhones) ? normalizedPhones : []
  const firstPhoneType = sanitizeText(phones[0]?.type || '').toLowerCase()
  const inferredPrimaryPhoneField =
    firstPhoneType.includes('mobile')
      ? 'mobile'
      : firstPhoneType.includes('direct') || firstPhoneType.includes('work')
        ? 'workDirectPhone'
        : firstPhoneType.includes('other')
          ? 'otherPhone'
          : ''
  const primaryPhoneField = sanitizeText(existingContact?.primaryPhoneField || inferredPrimaryPhoneField) || null

  return {
    id: personId,
    apolloPersonId: personId,
    crmId: crmId || null,
    name: resolvedIdentity.name,
    firstName: resolvedIdentity.firstName || null,
    lastName: resolvedIdentity.lastName || null,
    title: title || null,
    email: email || null,
    status: email ? 'verified' : (sanitizeText(existingContact?.status || '') || 'unverified'),
    isMonitored: Boolean(crmId || existingContact?.crmId || existingContact?.isMonitored),
    location: location || null,
    linkedin: linkedinUrl || null,
    photoUrl: photoUrl || null,
    phone: phones[0]?.number || sanitizeText(existingContact?.phone || '') || null,
    mobile: phones.find((entry) => (entry?.type || '').toLowerCase().includes('mobile'))?.number || sanitizeText(existingContact?.mobile || '') || null,
    workPhone: phones.find((entry) => (entry?.type || '').toLowerCase().includes('direct') || (entry?.type || '').toLowerCase().includes('work'))?.number || sanitizeText(existingContact?.workPhone || '') || null,
    companyPhone: sanitizeText(existingContact?.companyPhone || '') || null,
    otherPhone: sanitizeText(existingContact?.otherPhone || '') || null,
    directPhone: sanitizeText(existingContact?.directPhone || '') || null,
    primaryPhoneField,
    phones,
    source: crmId || existingContact?.crmId ? 'crm' : 'apollo',
    metadata: {
      ...(existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}),
      apollo_person_id: personId,
      source: 'Apollo Organizational Intelligence',
      photoUrl: photoUrl || null,
      photo_url: photoUrl || null,
      avatarUrl: photoUrl || null,
      avatar_url: photoUrl || null,
      apollo_revealed_phones: phones,
      primaryPhoneField,
    },
  }
}

function contactCacheKey(contact) {
  const nameKey = buildNameKey(contact?.firstName, contact?.lastName)
  return (
    sanitizeText(contact?.id || '') ||
    sanitizeText(contact?.crmId || '') ||
    sanitizeText(contact?.apolloPersonId || contact?.apollo_person_id || '') ||
    sanitizeText(contact?.email || '').toLowerCase() ||
    sanitizeText(contact?.linkedin || contact?.linkedinUrl || '').toLowerCase() ||
    nameKey ||
    sanitizeText(contact?.name || '').toLowerCase()
  )
}

function mergePhoneEntries(primary, secondary) {
  const out = []
  const seen = new Set()

  const add = (entry) => {
    if (!entry) return
    const number = typeof entry === 'string'
      ? formatPhoneForContact(entry)
      : formatPhoneForContact(entry?.number || entry?.sanitized_number || entry?.raw_number || '')
    if (!number) return
    const type = typeof entry === 'string' ? '' : sanitizeText(entry?.type || entry?.type_cd || '').toLowerCase()
    const key = `${number}|${type}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(typeof entry === 'string' ? { number, type } : { number, type })
  }

  ;[...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])].forEach(add)
  return out
}

function mergeApolloCacheContact(existing, next) {
  const mergedPhones = mergePhoneEntries(next?.phones || [], existing?.phones || [])
  const mergedPhoto = resolvePhotoUrl(next, existing) || sanitizeText(next?.photoUrl || existing?.photoUrl || '') || ''
  const mergedStatus = sanitizeText(next?.status || '') === 'verified' || sanitizeText(existing?.status || '') === 'verified'
    ? 'verified'
    : sanitizeText(next?.status || existing?.status || '') || 'unverified'

  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...(next && typeof next === 'object' ? next : {}),
    id: sanitizeText(next?.id || existing?.id || ''),
    crmId: sanitizeText(next?.crmId || existing?.crmId || '') || null,
    apolloPersonId: sanitizeText(next?.apolloPersonId || next?.apollo_person_id || existing?.apolloPersonId || existing?.apollo_person_id || '') || null,
    name: sanitizeText(next?.name || existing?.name || '') || 'Contact',
    firstName: sanitizeText(next?.firstName || existing?.firstName || '') || '',
    lastName: sanitizeText(next?.lastName || existing?.lastName || '') || '',
    title: sanitizeText(next?.title || existing?.title || '') || '',
    email: sanitizeText(next?.email || existing?.email || '') || 'N/A',
    linkedin: sanitizeText(next?.linkedin || existing?.linkedin || '') || '',
    location: sanitizeText(next?.location || existing?.location || '') || '',
    photoUrl: mergedPhoto || '',
    phone: sanitizeText(next?.phone || existing?.phone || '') || '',
    mobile: sanitizeText(next?.mobile || existing?.mobile || '') || '',
    workPhone: sanitizeText(next?.workPhone || existing?.workPhone || '') || '',
    companyPhone: sanitizeText(next?.companyPhone || existing?.companyPhone || '') || '',
    otherPhone: sanitizeText(next?.otherPhone || existing?.otherPhone || '') || '',
    directPhone: sanitizeText(next?.directPhone || existing?.directPhone || '') || '',
    phones: mergedPhones,
    status: mergedStatus,
    isMonitored: Boolean(next?.isMonitored || existing?.isMonitored || next?.crmId || existing?.crmId),
    source: next?.source || existing?.source || ((next?.crmId || existing?.crmId) ? 'crm' : 'apollo'),
  }
}

function mergeApolloCacheContacts(existingContacts, nextContact) {
  const byKey = new Map()
  const extras = []

  const insert = (contact) => {
    const key = contactCacheKey(contact)
    if (!key) {
      extras.push(contact)
      return
    }

    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, contact)
      return
    }

    byKey.set(key, mergeApolloCacheContact(current, contact))
  }

  ;(Array.isArray(existingContacts) ? existingContacts : []).forEach(insert)
  if (nextContact) insert(nextContact)

  return [...extras, ...byKey.values()]
}

async function persistApolloSearchCache({
  accountId,
  accountRow,
  existingRows,
  cacheContact,
}) {
  if (!supabaseAdmin) return

  const existing = Array.isArray(existingRows) ? existingRows.filter((row) => row && typeof row === 'object') : []
  const existingData = existing
    .map((row) => row.data && typeof row.data === 'object' ? row.data : null)
    .filter(Boolean)

  const bestExisting = existingData.find((data) => data.company && typeof data.company === 'object') || null
  const company = buildCompanySummary(accountRow, bestExisting?.company || null)
  const companyDomain = sanitizeText(company.domain || '') || extractDomain(accountRow?.domain || accountRow?.website || '')
  const companyName = sanitizeText(company.name || accountRow?.name || '') || ''
  const keys = []

  if (accountId) keys.push(`ACCOUNT_${accountId}`)
  if (companyDomain && !keys.includes(companyDomain)) keys.push(companyDomain)
  if (companyName && !keys.includes(companyName)) keys.push(companyName)

  if (keys.length === 0) return

  const existingContacts = existingData.flatMap((data) => Array.isArray(data.contacts) ? data.contacts : [])
  const contacts = mergeApolloCacheContacts(existingContacts, cacheContact)
  const timestamp = Date.now()
  const searchTerm = typeof bestExisting?.searchTerm === 'string' ? bestExisting.searchTerm : undefined
  const currentPage = typeof bestExisting?.currentPage === 'number' ? bestExisting.currentPage : 1
  const cacheData = {
    company: bestExisting?.company && typeof bestExisting.company === 'object' ? bestExisting.company : company,
    contacts,
    timestamp,
    searchTerm,
    currentPage,
    source: 'extension-reveal',
    stale: contacts.length === 0,
    stale_until: contacts.length === 0 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
  }

  const rows = keys.map((key) => ({
    key,
    data: cacheData,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabaseAdmin
    .from('apollo_searches')
    .upsert(rows, { onConflict: 'key' })

  if (error) {
    throw error
  }
}

function normalizeContactRow(row) {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const identity = buildIdentityName({
    firstName: row?.firstName,
    lastName: row?.lastName,
    name: row?.name,
  })

  const phones = [
    sanitizeText(row?.mobile),
    sanitizeText(row?.workPhone),
    sanitizeText(row?.phone),
    sanitizeText(row?.companyPhone),
    sanitizeText(row?.otherPhone),
    sanitizeText(row?.directPhone),
  ].filter(Boolean)

  return {
    id: sanitizeText(row?.id),
    crmId: sanitizeText(row?.id) || null,
    apolloPersonId: sanitizeText(metadata?.apollo_person_id) || null,
    name: identity.name || 'Contact',
    firstName: identity.firstName || null,
    lastName: identity.lastName || null,
    title: sanitizeText(row?.title) || null,
    email: sanitizeText(row?.email) || null,
    linkedin: sanitizeText(row?.linkedinUrl) || null,
    location: [sanitizeText(row?.city), sanitizeText(row?.state)].filter(Boolean).join(', ') || null,
    photoUrl: resolvePhotoUrl(metadata) || null,
    phone: sanitizeText(row?.phone) || null,
    mobile: sanitizeText(row?.mobile) || null,
    workPhone: sanitizeText(row?.workPhone) || null,
    companyPhone: sanitizeText(row?.companyPhone) || null,
    otherPhone: sanitizeText(row?.otherPhone) || null,
    directPhone: sanitizeText(row?.directPhone) || null,
    primaryPhoneField: sanitizeText(row?.primaryPhoneField || metadata?.primaryPhoneField) || null,
    phones,
    isMonitored: true,
    source: 'crm',
  }
}

function buildApiOrigin(req) {
  const host = sanitizeText(req.headers['x-forwarded-host'] || req.headers.host)
  if (!host) return 'https://www.nodalpoint.io'
  const protocolHeader = sanitizeText(req.headers['x-forwarded-proto'] || '')
  const protocol = protocolHeader || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https')
  return `${protocol}://${host}`
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
    const person = body.person && typeof body.person === 'object' ? body.person : {}
    const syncPhonesOnly = body.syncPhonesOnly === true
    const revealEmails = body.revealEmails !== false
    const revealPhones = body.revealPhones === true

    const personId = sanitizeText(person?.id || person?.contactId || person?.person_id || body.personId)
    if (!personId) {
      res.status(400).json({ error: 'Missing Apollo person id.' })
      return
    }

    const accountId = sanitizeText(body.accountId || person?.accountId || '') || null
    const personIdentity = buildIdentityName({
      firstName: person?.firstName || person?.first_name,
      lastName: person?.lastName || person?.last_name,
      name: person?.name,
    })
    let accountRow = null
    if (accountId) {
      const { data } = await supabaseAdmin
        .from('accounts')
        .select('id, name, domain, website, description, logo_url, city, state, country, employees, revenue, industry, phone, linkedin_url, address, zip')
        .eq('id', accountId)
        .maybeSingle()
      accountRow = data || null
    }

    let enriched = null
    let normalizedPhones = []

    if (syncPhonesOnly) {
      normalizedPhones = normalizePhoneEntries(body.phones || [])
    } else {
      const origin = buildApiOrigin(req)
      const enrichResp = await fetch(`${origin}/api/apollo/enrich`, {
        method: 'POST',
        headers: {
          Authorization: req.headers.authorization || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contactIds: [personId],
          contacts: [{
            id: personId,
            firstName: personIdentity.firstName || undefined,
            lastName: personIdentity.lastName || undefined,
            name: personIdentity.name || undefined,
            email: sanitizeText(person?.email) || undefined,
            linkedin: normalizeLinkedin(person?.linkedin) || undefined,
          }],
          company: {
            domain: extractDomain(person?.domain || person?.companyDomain || person?.website || ''),
            name: sanitizeText(person?.companyName || body.companyName || ''),
          },
          firstName: personIdentity.firstName || undefined,
          lastName: personIdentity.lastName || undefined,
          name: personIdentity.name || undefined,
          email: sanitizeText(person?.email) || undefined,
          linkedinUrl: normalizeLinkedin(person?.linkedin) || undefined,
          title: sanitizeText(person?.title) || undefined,
          revealEmails,
          revealPhones,
        }),
      })

      const enrichJson = await enrichResp.json().catch(() => ({}))
      if (!enrichResp.ok) {
        const reason = sanitizeText(enrichJson?.message || enrichJson?.error) || `Apollo enrich failed (${enrichResp.status})`
        throw new Error(reason)
      }

      enriched = Array.isArray(enrichJson?.contacts) ? enrichJson.contacts[0] || null : null
      normalizedPhones = normalizePhoneEntries(enriched?.phones || [])
    }

    const enrichedIdentity = buildIdentityName({
      firstName: enriched?.firstName,
      lastName: enriched?.lastName,
      name: enriched?.fullName || enriched?.name,
    })

    const email = sanitizeText(enriched?.email || person?.email) || ''
    const linkedinUrl = normalizeLinkedin(enriched?.linkedin || person?.linkedin) || ''
    const title = sanitizeText(enriched?.jobTitle || person?.title) || ''

    const fallbackLocation = parseLocation(person?.location)
    const city = sanitizeText(enriched?.city || fallbackLocation.city) || ''
    const state = sanitizeText(enriched?.state || fallbackLocation.state) || ''

    const existing = await findExistingContact({
      personId,
      email,
      linkedinUrl,
      firstName: enrichedIdentity.firstName || personIdentity.firstName,
      lastName: enrichedIdentity.lastName || personIdentity.lastName,
      accountId,
    })

    const ownerId = sanitizeText(existing?.ownerId || auth.id || auth.user?.email) || null
    const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
    const photoUrl = resolvePhotoUrl(enriched, person, existingMetadata) || ''
    const { patch: phonePatch, extras: overflowPhones } = assignPhones(normalizedPhones)
    const now = new Date().toISOString()

    const payload = {
      accountId: accountId || existing?.accountId || null,
      firstName: enrichedIdentity.firstName || personIdentity.firstName || null,
      lastName: enrichedIdentity.lastName || personIdentity.lastName || null,
      name: enrichedIdentity.name || personIdentity.name || [personIdentity.firstName, personIdentity.lastName].filter(Boolean).join(' ') || 'Contact',
      title: title || null,
      email: email || null,
      linkedinUrl: linkedinUrl || null,
      city: city || null,
      state: state || null,
      ownerId,
      status: 'active',
      ...phonePatch,
      metadata: {
        ...existingMetadata,
        source: 'Apollo Organizational Intelligence',
        apollo_person_id: personId,
        apollo_revealed_phones: normalizedPhones,
        apollo_overflow_phones: overflowPhones,
        original_apollo_data: enriched || existingMetadata?.original_apollo_data || null,
        photoUrl: photoUrl || existingMetadata?.photoUrl || existingMetadata?.photo_url || null,
        photo_url: photoUrl || existingMetadata?.photo_url || existingMetadata?.photoUrl || null,
        avatarUrl: photoUrl || existingMetadata?.avatarUrl || existingMetadata?.avatar_url || null,
        avatar_url: photoUrl || existingMetadata?.avatar_url || existingMetadata?.avatarUrl || null,
      },
      updatedAt: now,
    }

    const contactId = sanitizeText(existing?.id) || crypto.randomUUID()

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('contacts')
        .update(payload)
        .eq('id', existing.id)

      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('contacts')
        .insert({
          id: contactId,
          ...payload,
          createdAt: now,
        })

      if (error) throw error
    }

    const { data: updatedContact, error: readError } = await supabaseAdmin
      .from('contacts')
      .select('id, accountId, firstName, lastName, name, email, title, linkedinUrl, phone, mobile, workPhone, companyPhone, otherPhone, primaryPhoneField, city, state, metadata')
      .eq('id', contactId)
      .maybeSingle()

    if (readError || !updatedContact) {
      throw readError || new Error('Contact reveal sync failed to reload.')
    }

    const normalizedContact = normalizeContactRow(updatedContact)
    const pendingPhone = !syncPhonesOnly && revealPhones && normalizedPhones.length === 0

    let existingCacheRows = []
    try {
      const cacheCompany = buildCompanySummary(accountRow, null)
      const cacheKeys = []
      if (accountId) cacheKeys.push(`ACCOUNT_${accountId}`)
      if (cacheCompany.domain) cacheKeys.push(cacheCompany.domain)
      if (cacheCompany.name) cacheKeys.push(cacheCompany.name)

      if (cacheKeys.length > 0) {
        const { data } = await supabaseAdmin
          .from('apollo_searches')
          .select('key, data')
          .in('key', cacheKeys)
        existingCacheRows = Array.isArray(data) ? data : []
      }
    } catch (cacheLookupError) {
      console.warn('[Extension Reveal Contact] Apollo cache lookup failed:', cacheLookupError?.message || cacheLookupError)
    }

    const apolloCacheContact = buildApolloCacheContact({
      personId,
      crmId: normalizedContact.id,
      person,
      enriched,
      normalizedPhones,
      existingContact: normalizedContact,
      existingMetadata,
    })

    try {
      await persistApolloSearchCache({
        accountId,
        accountRow,
        existingRows: existingCacheRows,
        cacheContact: apolloCacheContact,
      })
    } catch (cachePersistError) {
      console.warn('[Extension Reveal Contact] Failed to persist Apollo cache:', cachePersistError?.message || cachePersistError)
    }

    res.status(200).json({
      success: true,
      contact: normalizedContact,
      apolloPersonId: personId,
      pendingPhone,
    })
  } catch (error) {
    console.error('[Extension Reveal Contact] Error:', error)
    res.status(500).json({
      error: 'Org intelligence reveal failed',
      message: error.message,
    })
  }
}
