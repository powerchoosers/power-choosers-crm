import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const { data } = await supabaseAdmin
      .from('market_telemetry')
      .select('prices, grid, timestamp')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return res.status(200).json(data ?? { prices: null, grid: null, timestamp: null })
  } catch (err) {
    console.error('[portal/market]', err)
    return res.status(200).json({ prices: null, grid: null, timestamp: null })
  }
}
