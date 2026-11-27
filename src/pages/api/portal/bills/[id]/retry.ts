import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { resolvePortalAccount } from '@/lib/portal/server'
import { CLIENT_BILL_COLUMNS, readStoredBill } from '@/lib/portal/bills'

export const config = { maxDuration: 60 }

const MAX_ATTEMPTS = 4

/** POST: read a bill again after a failed or unclear first read. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const identity = await resolvePortalAccount(req)
  if (!identity) return res.status(401).json({ error: 'Unauthorized' })

  const id = String(req.query.id || '')
  if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(404).json({ error: 'Not found' })

  const { data: rows } = await supabaseAdmin
    .from('client_bills')
    .select('id, status, attempts')
    .eq('id', id)
    .eq('account_id', identity.accountId)
    .limit(1)
  const bill = rows?.[0]
  if (!bill) return res.status(404).json({ error: 'Not found' })
  if (bill.status === 'processing') return res.status(409).json({ error: 'This bill is being read right now.' })
  if ((bill.attempts || 0) >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'We have tried this bill several times. Your advisor can read it for you.' })
  }

  await readStoredBill(id)
  const { data: updated } = await supabaseAdmin.from('client_bills').select(CLIENT_BILL_COLUMNS).eq('id', id).limit(1)
  return res.status(200).json({ bill: updated?.[0] || null })
}
