import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { VAULT_BUCKET, billFolder, resolvePortalAccount } from '@/lib/portal/server'
import { BillRejected, CLIENT_BILL_COLUMNS, ingestBill } from '@/lib/portal/bills'

export const config = { maxDuration: 60 }

/** POST { path, fileName }: check an uploaded file, file it as a bill, and read it. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const identity = await resolvePortalAccount(req)
  if (!identity) return res.status(401).json({ error: 'Unauthorized' })

  const path = String(req.body?.path || '')
  const incoming = `${billFolder(identity.accountId)}/incoming/`
  // Only this account's own upload slot, and only a plain file name inside it.
  if (!path.startsWith(incoming) || !/^[a-f0-9-]{36}\.(pdf|jpg|png)$/.test(path.slice(incoming.length))) {
    return res.status(400).json({ error: 'Unknown upload' })
  }

  const storage = supabaseAdmin.storage.from(VAULT_BUCKET)
  const { data: file, error: downloadError } = await storage.download(path)
  if (downloadError || !file) return res.status(400).json({ error: 'The upload did not arrive. Try again.' })

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await ingestBill({
      accountId: identity.accountId,
      source: 'upload',
      bytes,
      fileName: String(req.body?.fileName || 'bill'),
      uploadedByEmail: identity.email,
    })
    const { data: rows } = await supabaseAdmin.from('client_bills').select(CLIENT_BILL_COLUMNS).eq('id', result.billId).limit(1)
    return res.status(200).json({ bill: rows?.[0] || null, duplicate: result.duplicate })
  } catch (err) {
    if (err instanceof BillRejected) return res.status(400).json({ error: err.message })
    console.error('[Portal Bills] Process failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'We could not save that bill. Try again.' })
  } finally {
    await storage.remove([path]).catch(() => undefined)
  }
}
