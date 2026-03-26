import { cors } from '../_cors.js'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { trimText } from './_shared.js'

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

    const accountId = trimText(
      (Array.isArray(req.query?.accountId) ? req.query.accountId[0] : req.query?.accountId) ||
        req.body?.accountId ||
        ''
    )

    if (!accountId) {
      res.status(400).json({ error: 'Missing accountId' })
      return
    }

    let query = supabaseAdmin
      .from('contacts')
      .select(`
        *,
        accounts!contacts_accountId_fkey(name, domain, logo_url, website)
      `)
      .eq('accountId', accountId)
      .order('lastName', { ascending: true })
      .order('firstName', { ascending: true })
      .limit(50)

    query = applyLegacyOwnershipScope(query, auth.user, auth.isAdmin)

    const { data, error } = await query
    if (error) {
      console.warn('[Extension Contacts] Lookup failed:', error.message)
      res.status(500).json({ error: 'Contact lookup failed', message: error.message })
      return
    }

    res.status(200).json({
      success: true,
      contacts: Array.isArray(data) ? data : [],
    })
  } catch (error) {
    console.error('[Extension Contacts] Error:', error)
    res.status(500).json({
      error: 'Contact lookup failed',
      message: error.message,
    })
  }
}
