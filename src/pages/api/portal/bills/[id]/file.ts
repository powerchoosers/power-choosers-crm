import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { VAULT_BUCKET, resolvePortalAccount } from '@/lib/portal/server'

/** GET: a link to the original bill file that works for one minute. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const identity = await resolvePortalAccount(req)
  if (!identity) return res.status(401).json({ error: 'Unauthorized' })

  const id = String(req.query.id || '')
  if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(404).json({ error: 'Not found' })

  const { data: rows } = await supabaseAdmin
    .from('client_bills')
    .select('storage_path, file_name')
    .eq('id', id)
    .eq('account_id', identity.accountId)
    .limit(1)
  const bill = rows?.[0]
  if (!bill) return res.status(404).json({ error: 'Not found' })

  const { data, error } = await supabaseAdmin.storage.from(VAULT_BUCKET).createSignedUrl(bill.storage_path, 60)
  if (error || !data?.signedUrl) return res.status(500).json({ error: 'Could not open the file' })

  res.setHeader('Cache-Control', 'private, no-store')
  return res.status(200).json({ url: data.signedUrl, fileName: bill.file_name })
}
