import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { email } = await requireUser(req)
  if (!email) return res.status(401).json({ error: 'Unauthorized' })

  // Resolve contact → accountId
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, accountId')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (!contact?.accountId) {
    return res.status(200).json({ documents: [] })
  }

  // Fetch completed signature requests for this account
  const { data: requests } = await supabaseAdmin
    .from('signature_requests')
    .select('id, created_at, updated_at, signed_document_path, document:documents(name)')
    .eq('account_id', contact.accountId)
    .in('status', ['completed', 'signed'])
    .order('created_at', { ascending: false })

  if (!requests?.length) {
    return res.status(200).json({ documents: [] })
  }

  // Generate 1-hour signed download URLs for each executed contract
  const documents = await Promise.all(
    requests.map(async (r: any) => {
      let downloadUrl: string | null = null
      if (r.signed_document_path) {
        const { data } = await supabaseAdmin.storage
          .from('vault')
          .createSignedUrl(r.signed_document_path, 3600)
        downloadUrl = data?.signedUrl ?? null
      }
      return {
        id: r.id,
        name: r.document?.name ?? 'Executed Contract.pdf',
        signedAt: r.updated_at || r.created_at,
        downloadUrl,
      }
    })
  )

  return res.status(200).json({ documents })
}
