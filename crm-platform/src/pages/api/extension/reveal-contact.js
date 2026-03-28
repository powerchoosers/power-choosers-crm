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

function normalizeLinkedin(value) {
  return sanitizeText(value).replace(/\/+$/, '')
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

  entries.forEach((entry) => {
    const type = sanitizeText(entry?.type).toLowerCase()

    if (type.includes('mobile')) {
      if (!slots.mobile) {
        patch.mobile = entry.number
        patch.phone = entry.number
        slots.mobile = true
      } else {
        extras.push(entry)
      }
      return
    }

    if (type.includes('direct') || type.includes('work')) {
      if (!slots.work) {
        patch.workPhone = entry.number
        slots.work = true
      } else {
        extras.push(entry)
      }
      return
    }

    if (!slots.other) {
      patch.otherPhone = entry.number
      slots.other = true
    } else {
      extras.push(entry)
    }
  })

  if (!patch.mobile && entries[0]?.number) {
    patch.mobile = entries[0].number
  }
  if (!patch.phone) {
    patch.phone = patch.mobile || entries[0]?.number || patch.workPhone || patch.otherPhone || ''
  }

  return { patch, extras }
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
    photoUrl: sanitizeText(
      metadata?.photoUrl ||
      metadata?.photo_url ||
      metadata?.original_apollo_data?.photoUrl
    ) || null,
    phone: sanitizeText(row?.phone) || null,
    mobile: sanitizeText(row?.mobile) || null,
    workPhone: sanitizeText(row?.workPhone) || null,
    companyPhone: sanitizeText(row?.companyPhone) || null,
    otherPhone: sanitizeText(row?.otherPhone) || null,
    directPhone: sanitizeText(row?.directPhone) || null,
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

  if (personId) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('id, accountId, ownerId, metadata')
      .eq('metadata->>apollo_person_id', personId)
      .maybeSingle()
    if (data) return data
  }

  if (email && accountId) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('id, accountId, ownerId, metadata')
      .eq('accountId', accountId)
      .eq('email', email)
      .maybeSingle()
    if (data) return data
  }

  if (email) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('id, accountId, ownerId, metadata')
      .eq('email', email)
      .maybeSingle()
    if (data) return data
  }

  if (linkedinUrl) {
    let query = supabaseAdmin
      .from('contacts')
      .select('id, accountId, ownerId, metadata')
      .eq('linkedinUrl', linkedinUrl)

    if (accountId) query = query.eq('accountId', accountId)
    const { data } = await query.maybeSingle()
    if (data) return data
  }

  if (accountId && firstName && lastName) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('id, accountId, ownerId, metadata')
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
    const photoUrl = sanitizeText(enriched?.photoUrl || person?.photoUrl || person?.photo_url) || ''

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
      .select('id, accountId, firstName, lastName, name, email, title, linkedinUrl, phone, mobile, workPhone, companyPhone, otherPhone, directPhone, city, state, metadata')
      .eq('id', contactId)
      .maybeSingle()

    if (readError || !updatedContact) {
      throw readError || new Error('Contact reveal sync failed to reload.')
    }

    const normalizedContact = normalizeContactRow(updatedContact)
    const pendingPhone = !syncPhonesOnly && revealPhones && normalizedPhones.length === 0

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

