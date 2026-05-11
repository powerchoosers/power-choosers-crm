/**
 * POST /api/intelligence/dismiss-prospect
 * Marks a prospect_radar entry as dismissed so it won't resurface.
 */
import { supabaseAdmin, requireUser } from '@/lib/supabase';
import { cors } from '../_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user } = await requireUser(req);
  if (!user) return;

  const { prospectId } = req.body || {};
  if (!prospectId) {
    res.status(400).json({ error: 'prospectId required' });
    return;
  }

  try {
    if (!supabaseAdmin) {
      res.status(500).json({ error: 'Supabase not configured' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('prospect_radar')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', prospectId);

    if (error) throw error;

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[dismiss-prospect] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
