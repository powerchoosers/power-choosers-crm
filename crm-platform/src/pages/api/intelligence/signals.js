/**
 * GET /api/intelligence/signals
 * Returns the latest market intelligence signals from the database.
 * Query params:
 *   ?type=recon  → new_location, exec_hire, energy_rfp (RECONNAISSANCE tab)
 *   ?type=all    → everything
 *   ?limit=20    → default 20
 */

import { supabaseAdmin } from '@/lib/supabase';
import { cors } from '../_cors.js';

const RECON_TYPES = ['new_location', 'exec_hire', 'energy_rfp', 'sec_filing', 'expansion'];

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const type = req.query.type || 'recon';
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    try {
        if (!supabaseAdmin) {
            res.status(500).json({ error: 'Supabase not configured' });
            return;
        }

        let query = supabaseAdmin
            .from('market_intelligence')
            .select(`
        id,
        signal_type,
        headline,
        summary,
        entity_name,
        entity_domain,
        crm_account_id,
        crm_match_type,
        crm_match_score,
        source_url,
        relevance_score,
        created_at,
        accounts!market_intelligence_crm_account_id_fkey(id, name, domain)
      `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (type === 'recon') {
            query = query.in('signal_type', RECON_TYPES);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[signals] Supabase error:', error);
            res.status(500).json({ error: error.message });
            return;
        }

        // Cache for 15 minutes
        res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
        res.status(200).json({
            signals: data || [],
            count: (data || []).length,
            last_updated: new Date().toISOString()
        });

    } catch (err) {
        console.error('[signals] Error:', err);
        res.status(500).json({ error: err.message });
    }
}
