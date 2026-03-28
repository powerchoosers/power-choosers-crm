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
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
    if (!id) {
      return res.status(400).json({ error: 'Missing agent id' })
    }

    const report = await buildAgentProgressReport()
    const normalizedId = decodeURIComponent(id)
    const owner = report.agents.find((row) => row.key === normalizedId || (row.aliases || []).includes(normalizedId))
    if (!owner) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    return res.status(200).json({
      generatedAt: report.generatedAt,
      totals: report.totals,
      agent: owner,
    })
  } catch (error) {
    console.error('Failed to load agent progress detail:', error)
    return res.status(500).json({ error: 'Failed to load agent progress detail' })
  }
}
