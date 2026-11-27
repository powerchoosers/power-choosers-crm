import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { BILL_MAX_BYTES, BILL_MIME_TYPES, VAULT_BUCKET, billFolder, resolvePortalAccount } from '@/lib/portal/server'

/**
 * POST: a one-time upload slot in the private vault bucket.
 * The browser sends the file straight to storage, so large bills do not pass through
 * a server function. Nothing is treated as a bill until /api/portal/bills/process
 * has checked the bytes.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const identity = await resolvePortalAccount(req)
  if (!identity) return res.status(401).json({ error: 'Unauthorized' })

  const mimeType = String(req.body?.mimeType || '')
  const size = Number(req.body?.size || 0)
  const extension = BILL_MIME_TYPES[mimeType]
  if (!extension) return res.status(400).json({ error: 'Upload a PDF, JPG, or PNG.' })
  if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'That file is empty.' })
  if (size > BILL_MAX_BYTES) return res.status(400).json({ error: 'That file is larger than 15 MB.' })

  const path = `${billFolder(identity.accountId)}/incoming/${randomUUID()}.${extension}`
  const { data, error } = await supabaseAdmin.storage.from(VAULT_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    console.error('[Portal Bills] Upload slot failed:', error?.message)
    return res.status(500).json({ error: 'Could not start the upload' })
  }
  return res.status(200).json({ path, token: data.token })
}
