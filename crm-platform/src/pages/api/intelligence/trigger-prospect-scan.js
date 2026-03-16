/**
 * POST /api/intelligence/trigger-prospect-scan
 * Manually triggers an Apollo prospect discovery scan.
 * Finds up to 25 net-new Texas deregulated-market companies
 * not already in the CRM accounts table or prospect_radar table,
 * and stores them in prospect_radar.
 */
import { supabaseAdmin, requireUser } from '@/lib/supabase';
import { cors } from '../_cors.js';
import { getApiKey, APOLLO_BASE_URL, fetchWithRetry } from '../apollo/_utils.js';

// ─── Deregulated ERCOT zones only ────────────────────────────────────────────
const DEREGULATED_LOCATIONS = [
  // Oncor
  { city: 'Dallas', tdsp: 'Oncor' },
  { city: 'Fort Worth', tdsp: 'Oncor' },
  { city: 'Arlington', tdsp: 'Oncor' },
  { city: 'Plano', tdsp: 'Oncor' },
  { city: 'Irving', tdsp: 'Oncor' },
  { city: 'McKinney', tdsp: 'Oncor' },
  { city: 'Frisco', tdsp: 'Oncor' },
  { city: 'Denton', tdsp: 'Oncor' },
  { city: 'Tyler', tdsp: 'Oncor' },
  { city: 'Wichita Falls', tdsp: 'Oncor' },
  { city: 'Waxahachie', tdsp: 'Oncor' },
  // CenterPoint
  { city: 'Houston', tdsp: 'CenterPoint' },
  { city: 'Pasadena', tdsp: 'CenterPoint' },
  { city: 'Pearland', tdsp: 'CenterPoint' },
  { city: 'Sugar Land', tdsp: 'CenterPoint' },
  { city: 'Baytown', tdsp: 'CenterPoint' },
  { city: 'Beaumont', tdsp: 'CenterPoint' },
  { city: 'Galveston', tdsp: 'CenterPoint' },
  // AEP Texas
  { city: 'Corpus Christi', tdsp: 'AEP Texas' },
  { city: 'Laredo', tdsp: 'AEP Texas' },
  { city: 'McAllen', tdsp: 'AEP Texas' },
  { city: 'Harlingen', tdsp: 'AEP Texas' },
  { city: 'Victoria', tdsp: 'AEP Texas' },
  // TNMP
  { city: 'Midland', tdsp: 'TNMP' },
  { city: 'Odessa', tdsp: 'TNMP' },
  { city: 'Pecos', tdsp: 'TNMP' },
  // LP&L — Lubbock (deregulated ERCOT since 2021)
  { city: 'Lubbock', tdsp: 'LP&L' },
];

// Rotate industry targets to get variety across manual/daily scans
const INDUSTRY_ROTATIONS = [
  ['manufacturing', 'industrial'],
  ['food and beverages', 'food processing'],
  ['logistics and supply chain', 'warehousing'],
  ['metals and mining', 'steel'],
  ['automotive', 'auto parts'],
  ['construction', 'building materials'],
  ['chemicals', 'plastics'],
  ['agriculture', 'farming'],
];

// Pick a deterministic rotation bucket based on current hour
// (changes each run so manual refreshes give fresh results)
function getRotationIndex() {
  return Math.floor(Date.now() / 3600000) % INDUSTRY_ROTATIONS.length;
}

function pickLocations(count = 5) {
  // Shuffle deterministically based on date
  const seed = Math.floor(Date.now() / 86400000);
  const shuffled = [...DEREGULATED_LOCATIONS].sort(
    (a, b) => ((seed * 7 + DEREGULATED_LOCATIONS.indexOf(a) * 13) % 97) -
              ((seed * 7 + DEREGULATED_LOCATIONS.indexOf(b) * 13) % 97)
  );
  return shuffled.slice(0, count);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user } = await requireUser(req);
  if (!user) return;

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Supabase not configured' });
    return;
  }

  try {
    const APOLLO_API_KEY = getApiKey();

    // ── 1. Get existing account domains + existing prospect apollo_org_ids ──
    const [{ data: existingAccounts }, { data: existingProspects }] = await Promise.all([
      supabaseAdmin.from('accounts').select('domain').not('domain', 'is', null),
      supabaseAdmin.from('prospect_radar').select('apollo_org_id').not('apollo_org_id', 'is', null),
    ]);

    const knownDomains = new Set(
      (existingAccounts || []).map((a) => (a.domain || '').toLowerCase().trim()).filter(Boolean)
    );
    const knownApolloIds = new Set(
      (existingProspects || []).map((p) => p.apollo_org_id).filter(Boolean)
    );

    // ── 2. Build Apollo search params ────────────────────────────────────────
    const rotationIdx = getRotationIndex();
    const industries = INDUSTRY_ROTATIONS[rotationIdx];
    const locations = pickLocations(5);
    const locationStrings = locations.map((l) => `${l.city}, Texas, United States`);

    const searchBody = {
      per_page: 25,
      page: 1,
      q_organization_keyword_tags: industries,
      organization_locations: locationStrings,
      organization_num_employees_ranges: ['50,250', '251,1000', '1001,2500'],
    };

    const searchResp = await fetchWithRetry(`${APOLLO_BASE_URL}/mixed_companies/search`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify(searchBody),
    });

    if (!searchResp.ok) {
      const text = await searchResp.text();
      console.error('[trigger-prospect-scan] Apollo error:', text);
      res.status(502).json({ error: 'Apollo search failed', details: text });
      return;
    }

    const searchData = await searchResp.json();
    const rawOrgs = [
      ...(searchData.organizations || []),
      ...(searchData.accounts || []),
    ];

    // ── 3. Dedupe and map to prospect_radar rows ──────────────────────────────
    const seenIds = new Set();
    const toInsert = [];

    for (const org of rawOrgs) {
      if (toInsert.length >= 25) break;

      const apolloId = org.id;
      const domain = (org.primary_domain || org.domain || '').toLowerCase().trim() || null;

      // Skip if already in CRM or already on radar
      if (apolloId && knownApolloIds.has(apolloId)) continue;
      if (domain && knownDomains.has(domain)) continue;
      if (apolloId && seenIds.has(apolloId)) continue;
      if (!org.name) continue;

      if (apolloId) seenIds.add(apolloId);

      // Determine TDSP zone from city match
      const orgCity = (org.organization_city || org.city || '').toLowerCase();
      const matchedLocation = DEREGULATED_LOCATIONS.find(
        (l) => l.city.toLowerCase() === orgCity
      );

      toInsert.push({
        apollo_org_id: apolloId || null,
        name: org.name,
        domain: domain || null,
        logo_url: org.logo_url || null,
        industry: org.industry || (org.industries || [])[0] || null,
        employee_count: org.estimated_num_employees || org.employee_count || null,
        annual_revenue_printed: org.annual_revenue_printed || null,
        city: org.organization_city || org.city || null,
        state: org.organization_state || org.state || 'Texas',
        tdsp_zone: matchedLocation?.tdsp || 'ERCOT',
        phone: org.phone || (org.primary_phone?.number) || null,
        linkedin_url: org.linkedin_url || null,
        description: org.short_description || org.seo_description || null,
        discovered_at: new Date().toISOString(),
      });
    }

    if (toInsert.length === 0) {
      res.status(200).json({ count: 0, message: 'No net-new prospects found in this rotation.' });
      return;
    }

    // ── 4. Upsert into prospect_radar (ignore conflicts on apollo_org_id) ───
    const { error: insertError } = await supabaseAdmin
      .from('prospect_radar')
      .upsert(toInsert, { onConflict: 'apollo_org_id', ignoreDuplicates: true });

    if (insertError) {
      console.error('[trigger-prospect-scan] Insert error:', insertError);
      res.status(500).json({ error: insertError.message });
      return;
    }

    console.log(`[trigger-prospect-scan] Inserted ${toInsert.length} net-new prospects`);
    res.status(200).json({ count: toInsert.length, industries, locations: locationStrings });

  } catch (err) {
    console.error('[trigger-prospect-scan] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
