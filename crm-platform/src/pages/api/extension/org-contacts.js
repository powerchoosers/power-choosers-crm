import { cors } from '../_cors.js'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { extractDomain, trimText, unique } from './_shared.js'

function applyLegacyOwnershipScope(query, user, isAdmin) {
  if (isAdmin) return query

  const uid = trimText(user?.id || '') || ''
  const email = trimText(user?.email || '').toLowerCase().trim()

  if (uid && email) {
    return query.or(`ownerId.eq.${uid},ownerId.eq.${email},metadata->>ownerId.eq.${email},ownerId.is.null`)
  }
  if (uid) return query.or(`ownerId.eq.${uid},ownerId.is.null`)
  if (email) return query.or(`ownerId.eq.${email},metadata->>ownerId.eq.${email},ownerId.is.null`)
  return query
}

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

function buildIdentityName(input) {
  let name = sanitizeText(input?.name)
  let firstName = sanitizeText(input?.firstName || input?.first_name)
  let lastName = sanitizeText(input?.lastName || input?.last_name)

  if ((!firstName || !lastName) && name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (!firstName && parts.length > 0) firstName = parts[0]
    if (!lastName && parts.length > 1) lastName = parts.slice(1).join(' ')
  }

  if (!name) {
    name = [firstName, lastName].filter(Boolean).join(' ').trim()
  }

  return {
    name,
    firstName,
    lastName,
  }
}

function buildNameKey(firstName, lastName) {
  const first = sanitizeText(firstName).toLowerCase()
  const last = sanitizeText(lastName).toLowerCase()
  if (!first || !last) return ''
  return `${first}::${last}`
}

function normalizeLinkedin(value) {
  return sanitizeText(value).toLowerCase().replace(/\/+$/, '')
}

function normalizeApolloPhones(value) {
  const out = []
  if (!Array.isArray(value)) return out

  value.forEach((entry) => {
    if (typeof entry === 'string') {
      const text = sanitizeText(entry)
      if (text) out.push(text)
      return
    }
    if (!entry || typeof entry !== 'object') return
    const candidate = sanitizeText(entry.number || entry.sanitized_number || entry.raw_number)
    if (candidate) out.push(candidate)
  })

  return unique(out).slice(0, 6)
}

function normalizeCrmContactRow(row) {
  const identity = buildIdentityName(row || {})
  return {
    id: trimText(row?.id || ''),
    crmId: trimText(row?.id || ''),
    name: identity.name || 'Contact',
    firstName: identity.firstName || null,
    lastName: identity.lastName || null,
    title: sanitizeText(row?.title) || null,
    email: sanitizeText(row?.email) || null,
    linkedin: sanitizeText(row?.linkedinUrl) || null,
    location: [sanitizeText(row?.city), sanitizeText(row?.state)].filter(Boolean).join(', ') || null,
    photoUrl: resolvePhotoUrl(row) || null,
    phone: sanitizeText(row?.phone) || null,
    mobile: sanitizeText(row?.mobile) || null,
    workPhone: sanitizeText(row?.workPhone) || null,
    companyPhone: sanitizeText(row?.companyPhone) || null,
    otherPhone: sanitizeText(row?.otherPhone) || null,
    primaryPhoneField: sanitizeText(row?.primaryPhoneField || row?.metadata?.primaryPhoneField) || null,
    directPhone: sanitizeText(row?.directPhone) || null,
    phones: unique([
      sanitizeText(row?.mobile),
      sanitizeText(row?.workPhone),
      sanitizeText(row?.phone),
      sanitizeText(row?.companyPhone),
      sanitizeText(row?.otherPhone),
      sanitizeText(row?.directPhone),
    ].filter(Boolean)).slice(0, 6),
    isMonitored: true,
    source: 'crm',
  }
}

function normalizeApolloContactRow(raw, crmId) {
  const apolloId = sanitizeText(raw?.id || raw?.contactId || raw?.person_id)
  if (!apolloId) return null

  const identity = buildIdentityName(raw || {})
  const phones = normalizeApolloPhones(raw?.phones || raw?.phone_numbers || [])
  const primaryPhone = sanitizeText(raw?.phone || raw?.mobile || phones[0]) || null

  return {
    id: apolloId,
    crmId: sanitizeText(raw?.crmId || crmId || '') || null,
    name: identity.name || 'Contact',
    firstName: identity.firstName || null,
    lastName: identity.lastName || null,
    title: sanitizeText(raw?.title) || null,
    email: sanitizeText(raw?.email) || null,
    linkedin: sanitizeText(raw?.linkedin || raw?.linkedin_url) || null,
    location: sanitizeText(raw?.location) || null,
    photoUrl: resolvePhotoUrl(raw) || null,
    phone: primaryPhone,
    mobile: sanitizeText(raw?.mobile) || null,
    workPhone: sanitizeText(raw?.workPhone) || null,
    companyPhone: sanitizeText(raw?.companyPhone) || null,
    otherPhone: sanitizeText(raw?.otherPhone) || null,
    primaryPhoneField: sanitizeText(raw?.primaryPhoneField || raw?.metadata?.primaryPhoneField) || null,
    directPhone: sanitizeText(raw?.directPhone) || null,
    phones,
    isMonitored: Boolean(crmId),
    source: crmId ? 'crm' : 'apollo',
  }
}

function matchesQuery(contact, query) {
  const q = sanitizeText(query).toLowerCase()
  if (!q) return true

  const haystack = [
    sanitizeText(contact?.name),
    sanitizeText(contact?.firstName),
    sanitizeText(contact?.lastName),
    sanitizeText(contact?.title),
    sanitizeText(contact?.email),
    sanitizeText(contact?.linkedin),
    sanitizeText(contact?.location),
    ...(Array.isArray(contact?.phones) ? contact.phones.map((phone) => sanitizeText(phone)) : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(q)
}

function pickBestCache(rows, accountKey, domainKey, companyKey) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  if (accountKey) {
    const accountMatch = rows.find((row) => trimText(row?.key) === accountKey)
    if (accountMatch) return accountMatch
  }
  if (domainKey) {
    const domainMatch = rows.find((row) => trimText(row?.key).toLowerCase() === domainKey.toLowerCase())
    if (domainMatch) return domainMatch
  }
  if (companyKey) {
    const companyMatch = rows.find((row) => trimText(row?.key).toLowerCase() === companyKey.toLowerCase())
    if (companyMatch) return companyMatch
  }
  return rows[0]
}

export default async function handler(req, res) {
  if (cors(req, res)) return

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const auth = await requireUser(req)
    if (!auth.user && !auth.isAdmin) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const accountId = trimText(Array.isArray(req.query?.accountId) ? req.query.accountId[0] : req.query?.accountId || '')
    const domain = extractDomain(Array.isArray(req.query?.domain) ? req.query.domain[0] : req.query?.domain || '')
    const companyName = sanitizeText(Array.isArray(req.query?.companyName) ? req.query.companyName[0] : req.query?.companyName || '')
    const query = sanitizeText(Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q || '')

    const accountKey = accountId ? `ACCOUNT_${accountId}` : ''
    const keysToCheck = unique([accountKey, domain || '', companyName || ''].filter(Boolean))

    let cacheRows = []
    if (keysToCheck.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('apollo_searches')
        .select('key, data, created_at')
        .in('key', keysToCheck)
        .limit(10)

      if (error) {
        console.warn('[Extension Org Contacts] Apollo cache lookup failed:', error.message)
      } else if (Array.isArray(data)) {
        cacheRows = data
      }
    }

    const bestCache = pickBestCache(cacheRows, accountKey, domain || '', companyName || '')
    const cacheData = bestCache?.data && typeof bestCache.data === 'object' ? bestCache.data : null
    const cachedCompany = cacheData?.company && typeof cacheData.company === 'object' ? cacheData.company : null
    const cachedContacts = Array.isArray(cacheData?.contacts) ? cacheData.contacts : []

    let contactsQuery = supabaseAdmin
      .from('contacts')
      .select('id, accountId, firstName, lastName, name, email, title, linkedinUrl, phone, mobile, workPhone, companyPhone, otherPhone, primaryPhoneField, city, state, metadata')
      .limit(1000)

    if (accountId) {
      contactsQuery = contactsQuery.eq('accountId', accountId)
    }

    contactsQuery = applyLegacyOwnershipScope(contactsQuery, auth.user, auth.isAdmin)

    const { data: crmRows, error: crmError } = await contactsQuery
    if (crmError) {
      console.warn('[Extension Org Contacts] CRM contacts lookup failed:', crmError.message)
    }

    const emailToCrmId = new Map()
    const apolloIdToCrmId = new Map()
    const linkedinToCrmId = new Map()
    const nameToCrmId = new Map()
    const crmById = new Map()

    const normalizedCrm = Array.isArray(crmRows)
      ? crmRows
          .map((row) => normalizeCrmContactRow(row))
          .filter((row) => Boolean(row?.id))
      : []

    normalizedCrm.forEach((contact) => {
      crmById.set(contact.id, contact)
      const email = sanitizeText(contact.email).toLowerCase()
      if (email && !emailToCrmId.has(email)) emailToCrmId.set(email, contact.id)

      const linkedin = normalizeLinkedin(contact.linkedin)
      if (linkedin && !linkedinToCrmId.has(linkedin)) linkedinToCrmId.set(linkedin, contact.id)

      const nameKey = buildNameKey(contact.firstName, contact.lastName)
      if (nameKey && !nameToCrmId.has(nameKey)) nameToCrmId.set(nameKey, contact.id)
    })

    if (Array.isArray(crmRows)) {
      crmRows.forEach((row) => {
        const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        const apolloPersonId = sanitizeText(metadata?.apollo_person_id)
        const crmId = trimText(row?.id || '')
        if (apolloPersonId && crmId && !apolloIdToCrmId.has(apolloPersonId)) {
          apolloIdToCrmId.set(apolloPersonId, crmId)
        }
      })
    }

    const apolloMapped = cachedContacts
      .map((raw) => {
        const identity = buildIdentityName(raw || {})
        const apolloId = sanitizeText(raw?.id || raw?.contactId || raw?.person_id)
        const email = sanitizeText(raw?.email).toLowerCase()
        const linkedin = normalizeLinkedin(raw?.linkedin || raw?.linkedin_url)
        const nameKey = buildNameKey(identity.firstName, identity.lastName)

        const crmId =
          apolloIdToCrmId.get(apolloId) ||
          (email ? emailToCrmId.get(email) : undefined) ||
          (linkedin ? linkedinToCrmId.get(linkedin) : undefined) ||
          (nameKey ? nameToCrmId.get(nameKey) : undefined) ||
          null

        return normalizeApolloContactRow(raw, crmId)
      })
      .filter((contact) => Boolean(contact))
      .filter((contact) => matchesQuery(contact, query))

    const apolloOnlyContacts = apolloMapped
      .filter((contact) => !contact.crmId)
      .slice(0, 100)

    const crmContactIdsFromApollo = unique(apolloMapped.map((contact) => trimText(contact.crmId || '')).filter(Boolean))
    const crmContacts = unique([
      ...normalizedCrm.map((contact) => contact.id),
      ...crmContactIdsFromApollo,
    ])
      .map((id) => crmById.get(id))
      .filter((contact) => Boolean(contact))
      .filter((contact) => matchesQuery(contact, query))
      .slice(0, 100)

    res.status(200).json({
      success: true,
      company: cachedCompany || null,
      cacheKeyUsed: trimText(bestCache?.key || '') || null,
      crmContacts,
      apolloOnlyContacts,
      counts: {
        crm: crmContacts.length,
        apolloOnly: apolloOnlyContacts.length,
        apolloTotal: apolloMapped.length,
      },
    })
  } catch (error) {
    console.error('[Extension Org Contacts] Error:', error)
    res.status(500).json({
      error: 'Org contacts lookup failed',
      message: error.message,
    })
  }
}
