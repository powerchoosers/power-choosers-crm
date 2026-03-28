import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser } from '@/lib/supabase'
import { buildOwnerDirectoryPayload } from '@/lib/admin/agent-progress'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireUser(req)
  if (!auth.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const payload = await buildOwnerDirectoryPayload()
    return res.status(200).json(payload)
  } catch (error) {
    console.error('Failed to load owner directory:', error)
    return res.status(500).json({ error: 'Failed to load owner directory' })
  }
}
