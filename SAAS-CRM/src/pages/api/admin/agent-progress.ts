import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser } from '@/lib/supabase'
import { buildAgentProgressReport } from '@/lib/admin/agent-progress'

function canViewAgentProgress(email?: string | null, isAdmin?: boolean) {
  const normalized = String(email || '').toLowerCase().trim()
  return !!isAdmin || normalized === 'dev@nodalpoint.io'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireUser(req)
  if (!auth.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!canViewAgentProgress(auth.email, auth.isAdmin)) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  try {
    const report = await buildAgentProgressReport()
    return res.status(200).json(report)
  } catch (error) {
    console.error('Failed to load agent progress:', error)
    return res.status(500).json({ error: 'Failed to load agent progress' })
  }
}
