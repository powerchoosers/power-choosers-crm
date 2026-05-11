/**
 * GET /api/intelligence/prospect-radar
 * Returns active (undismissed, not-ingested) prospect_radar entries.
 */
import { supabaseAdmin } from '@/lib/supabase';
import { cors } from '../_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit) || 25, 50);

  try {
    if (!supabaseAdmin) {
      res.status(500).json({ error: 'Supabase not configured' });
      return;
    }

    // Excluded industries — not serviceable for commercial energy brokerage
    const EXCLUDED_INDUSTRY_PATTERNS = [
      'staffing', 'recruiting', 'recruitment',
      'business services', 'management consulting',
      'legal services', 'legal',
      'information technology', 'it services', 'software development',
      'software products', 'data processing', 'computer services',
    ];

    const { data: rawData, error } = await supabaseAdmin
      .from('prospect_radar')
      .select('id, apollo_org_id, name, domain, logo_url, industry, employee_count, annual_revenue_printed, city, state, address, zip, tdsp_zone, phone, linkedin_url, description, website, discovered_at')
      .is('dismissed_at', null)
      .is('ingested_at', null)
      .order('discovered_at', { ascending: false })
      .limit(limit * 3); // fetch extra to account for post-filter

    const data = (rawData || []).filter((p) => {
      if (!p.industry) return true; // keep unknown industries
      const lower = p.industry.toLowerCase();
      return !EXCLUDED_INDUSTRY_PATTERNS.some((ex) => lower.includes(ex));
    }).slice(0, limit);

    if (error) {
      console.error('[prospect-radar] Supabase error:', error);
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ prospects: data || [], count: (data || []).length });
  } catch (err) {
    console.error('[prospect-radar] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
