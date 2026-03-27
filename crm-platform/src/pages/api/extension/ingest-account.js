import { cors } from '../_cors.js'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import {
  buildProspectServiceAddresses,
  enrichApolloOrganizationByDomain,
  formatProspectLocationLabel,
  normalizeOrganizationName,
} from '@/lib/apollo-prospect'
import { getApiKey } from '../apollo/_utils.js'
import { extractDomain, normalizeOrigin, trimText } from './_shared.js'

function parseTitleGuess(title) {
  const clean = trimText(title)
  if (!clean) return ''
  return clean.split(' | ')[0].split(' - ')[0].split(' • ')[0].trim()
}

function resolveAccountName(snapshot, enrichedOrg, domain) {
  const fallback = parseTitleGuess(snapshot?.title) || snapshot?.companyName || domain || 'Unknown Account'
  return normalizeOrganizationName(enrichedOrg?.name || snapshot?.name || fallback) || fallback
}

function buildMeters(address, city, state, zip) {
  const fullAddress = formatProspectLocationLabel({ address, city, state, zip })
  if (!fullAddress || fullAddress === 'Unknown Location') return []
  return [
    {
      id: crypto.randomUUID(),
      esiId: '',
      address: fullAddress,
      rate: '',
      endDate: '',
    },
  ]
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = trimText(value)
    if (text) return text
  }
  return ''
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
    const domain = extractDomain(snapshot?.origin || snapshot?.url || body.pageUrl || '')
    const apiKey = getApiKey()
    const enrichedOrg = domain ? await enrichApolloOrganizationByDomain({ domain }, apiKey) : null
    const pagePhone = Array.isArray(snapshot?.phones) ? trimText(snapshot.phones[0] || '') : ''

    const accountName = resolveAccountName(snapshot, enrichedOrg, domain)
    const website = pickFirstText(
      enrichedOrg?.website_url,
      body.website,
      snapshot?.website,
      normalizeOrigin(snapshot?.url || '') || '',
      domain ? `https://${domain}` : ''
    ) || null
    const accountIndustry = pickFirstText(
      enrichedOrg?.industry,
      Array.isArray(enrichedOrg?.industries) ? enrichedOrg.industries[0] : '',
      body.industry,
      snapshot?.industry
    ) || null
    const accountDescription = pickFirstText(
      enrichedOrg?.short_description,
      enrichedOrg?.seo_description,
      body.description,
      snapshot?.description
    ) || null
    const accountCity = pickFirstText(enrichedOrg?.city, body.city, snapshot?.city) || null
    const accountState = pickFirstText(enrichedOrg?.state, body.state, snapshot?.state) || null
    const accountCountry = pickFirstText(enrichedOrg?.country, body.country, snapshot?.country) || null
    const accountZip = pickFirstText(enrichedOrg?.postal_code, body.zip, snapshot?.zip) || null
    const accountAddress = pickFirstText(
      enrichedOrg?.formatted_address,
      enrichedOrg?.raw_address,
      enrichedOrg?.street_address,
      body.address,
      snapshot?.address
    ) || null
    const accountPhone = pickFirstText(
      enrichedOrg?.phone,
      enrichedOrg?.sanitized_phone,
      enrichedOrg?.primary_phone?.number,
      body.phone,
      body.pagePhone,
      pagePhone,
      snapshot?.phone
    ) || null
    const accountLinkedIn = pickFirstText(
      enrichedOrg?.linkedin_url,
      body.linkedin_url,
      snapshot?.linkedin_url,
      snapshot?.linkedin
    ) || null
    const accountLogo = pickFirstText(
      enrichedOrg?.logo_url,
      body.logo_url,
      snapshot?.logo_url,
      snapshot?.logoUrl
    ) || null
    const employeesRaw = enrichedOrg?.estimated_num_employees || enrichedOrg?.employee_count || body.employees || snapshot?.employees
    const employees = Number.isFinite(Number(employeesRaw)) ? Number(employeesRaw) : null
    const revenue = pickFirstText(
      enrichedOrg?.annual_revenue_printed,
      enrichedOrg?.organization_revenue_printed,
      body.revenue,
      snapshot?.revenue
    ) || null
    const serviceAddresses = buildProspectServiceAddresses({
      address: accountAddress,
      city: accountCity,
      state: accountState,
      country: accountCountry,
    })
    const meters = buildMeters(accountAddress, accountCity, accountState, accountZip)
    const now = new Date().toISOString()

    let existingId = null
    let existingRow = null

    if (domain) {
      const { data } = await supabaseAdmin.from('accounts').select('id, ownerId, metadata').eq('domain', domain).maybeSingle()
      if (data) {
        existingId = data.id
        existingRow = data
      }
    }

    if (!existingId && accountName) {
      const { data } = await supabaseAdmin.from('accounts').select('id, ownerId, metadata').ilike('name', accountName).maybeSingle()
      if (data) {
        existingId = data.id
        existingRow = data
      }
    }

    const accountId = existingId || crypto.randomUUID()
    const existingMetadata = existingRow?.metadata && typeof existingRow.metadata === 'object' ? existingRow.metadata : {}
    const nextMetadata = {
      ...existingMetadata,
      source: 'extension',
      source_page_url: trimText(snapshot?.url || body.pageUrl || '') || null,
      source_page_title: trimText(snapshot?.title || body.title || '') || null,
      apollo_org_id: enrichedOrg?.id || existingMetadata?.apollo_org_id || null,
      meters: meters.length > 0 ? meters : existingMetadata?.meters || [],
    }

    const payload = {
      name: accountName,
      domain: domain || null,
      website,
      industry: accountIndustry,
      description: accountDescription,
      employees,
      revenue,
      city: accountCity,
      state: accountState,
      country: accountCountry,
      address: accountAddress,
      zip: accountZip,
      logo_url: accountLogo,
      phone: accountPhone,
      linkedin_url: accountLinkedIn,
      ownerId: existingRow?.ownerId || auth.id || auth.user?.id || null,
      status: 'active',
      service_addresses: serviceAddresses,
      metadata: nextMetadata,
      updatedAt: now,
    }

    if (existingId) {
      const { error } = await supabaseAdmin.from('accounts').update(payload).eq('id', existingId)
      if (error) throw error
    } else {
      const { error } = await supabaseAdmin.from('accounts').insert({
        id: accountId,
        ...payload,
        createdAt: now,
      })
      if (error) throw error
    }

    const { data: account, error: readError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle()

    if (readError) throw readError

    res.status(200).json({
      success: true,
      existing: Boolean(existingId),
      accountId,
      account,
      enriched: Boolean(enrichedOrg),
      domain,
    })
  } catch (error) {
    console.error('[Extension Ingest Account] Error:', error)
    res.status(500).json({
      error: 'Account ingest failed',
      message: error.message,
    })
  }
}
