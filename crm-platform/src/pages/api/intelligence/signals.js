/**
 * GET /api/intelligence/signals
 * Returns the latest market intelligence signals from the database.
 * Query params:
 *   ?type=recon  → best-fit outreach signals for the dashboard
 *   ?type=all    → everything
 *   ?limit=20    → default 20
 */

import { supabaseAdmin } from '@/lib/supabase';
import { cors } from '../_cors.js';

const RECON_TYPES = ['new_location', 'exec_hire', 'energy_rfp', 'sec_filing', 'expansion'];
const SIGNAL_TYPE_WEIGHT = {
    energy_rfp: 100,
    sec_filing: 82,
    exec_hire: 76,
    new_location: 70,
    expansion: 62,
};

function parseNumericScore(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) return 0;
    if (score > 1) return Math.min(score / 10, 1);
    return Math.max(score, 0);
}

function calculateOutreachFit(signal) {
    const relevance = parseNumericScore(signal.relevance_score);
    const crmBoost = signal.crm_account_id ? 22 : 0;
    const matchBoost =
        signal.crm_match_type === 'exact_domain' ? 18 :
        signal.crm_match_type === 'fuzzy_name' ? 9 :
        0;
    const typeWeight = SIGNAL_TYPE_WEIGHT[signal.signal_type] || 50;

    const tdsp = signal.metadata?.tdsp_zone || '';
    const locationBoost = tdsp && tdsp !== 'ERCOT_Unknown' ? 6 : -4;

    const freshnessDays = Math.max((Date.now() - new Date(signal.created_at).getTime()) / 86400000, 0);
    const freshnessBoost = Math.max(12 - freshnessDays, 0) * 0.8;

    return Math.round(
        typeWeight +
        (relevance * 32) +
        crmBoost +
        matchBoost +
        locationBoost +
        freshnessBoost
    );
}

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const type = req.query.type || 'recon';
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const fetchLimit = Math.min(Math.max(limit * 4, 50), 100);

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
        metadata,
        created_at,
            accounts!market_intelligence_crm_account_id_fkey(id, name, domain)
      `)
            .order('created_at', { ascending: false })
            .limit(fetchLimit);

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
        const signals = (data || [])
            .map((signal) => ({
                ...signal,
                fit_score: calculateOutreachFit(signal),
            }))
            .sort((a, b) => {
                const scoreDelta = (b.fit_score || 0) - (a.fit_score || 0);
                if (scoreDelta !== 0) return scoreDelta;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            })
            .slice(0, limit);

        // Use the newest signal actually returned, not the top fit score row.
        const last_updated = signals.length > 0
            ? signals.reduce((latest, signal) => {
                return new Date(signal.created_at).getTime() > new Date(latest).getTime()
                    ? signal.created_at
                    : latest;
              }, signals[0].created_at)
            : null;
        res.status(200).json({
            signals,
            count: signals.length,
            last_updated,
        });

    } catch (err) {
        console.error('[signals] Error:', err);
        res.status(500).json({ error: err.message });
    }
}
