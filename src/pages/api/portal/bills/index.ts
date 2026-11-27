import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { resolvePortalAccount } from '@/lib/portal/server'
import { CLIENT_BILL_COLUMNS } from '@/lib/portal/bills'

/** GET: every bill on file for the signed-in client's account, newest billing period first. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const identity = await resolvePortalAccount(req)
  if (!identity) return res.status(401).json({ error: 'Unauthorized' })

  const { data, error } = await supabaseAdmin
    .from('client_bills')
    .select(CLIENT_BILL_COLUMNS)
    .eq('account_id', identity.accountId)
    .order('period_end', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(120)

  if (error) {
    console.error('[Portal Bills] List failed:', error.message)
    return res.status(500).json({ error: 'Could not load your bills' })
  }
  return res.status(200).json({ bills: data || [] })
}
