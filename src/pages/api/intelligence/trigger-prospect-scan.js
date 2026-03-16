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

// SIC/NAICS → human-readable industry (Apollo accounts don't have an `industry` field)
function resolveIndustry(org) {
  if (org.industry) return org.industry;
  if (org.industry_category) return org.industry_category;
  if ((org.industries || []).length > 0) return org.industries[0];
  const SIC_MAP = {
    '2000': 'Food Manufacturing', '2011': 'Meat Packing', '2013': 'Sausages & Prepared Meats',
    '2020': 'Dairy Products', '2041': 'Flour & Grain Mill', '2050': 'Bakery Products',
    '2080': 'Beverages', '2086': 'Bottled & Canned Soft Drinks',
    '2099': 'Food Preparations', '2100': 'Tobacco', '2200': 'Textile Mill Products',
    '2300': 'Apparel', '2400': 'Lumber & Wood', '2500': 'Furniture',
    '2600': 'Paper & Allied Products', '2650': 'Paperboard Containers',
    '2700': 'Printing & Publishing', '2800': 'Chemicals & Allied',
    '2860': 'Industrial Chemicals', '2869': 'Industrial Chemicals',
    '2900': 'Petroleum & Coal', '3000': 'Rubber & Plastics',
    '3100': 'Leather Products', '3200': 'Stone, Clay & Glass',
    '3300': 'Primary Metal Industries', '3310': 'Steel Works',
    '3400': 'Fabricated Metal', '3440': 'Fabricated Structural Metal',
    '3500': 'Industrial Machinery', '3559': 'Industrial Machinery',
    '3600': 'Electronic Equipment', '3670': 'Electronic Components',
    '3700': 'Transportation Equipment', '3710': 'Motor Vehicles',
    '3720': 'Aircraft', '3760': 'Guided Missiles',
    '3800': 'Instruments', '3900': 'Misc Manufacturing',
    '4200': 'Trucking & Warehousing', '4210': 'Trucking',
    '4220': 'Public Warehousing', '4400': 'Water Transportation',
    '4500': 'Air Transportation', '4600': 'Pipelines',
    '4800': 'Communications', '4900': 'Electric, Gas & Sanitary',
    '5000': 'Wholesale Trade', '5100': 'Wholesale Nondurable Goods',
    '5200': 'Building Materials', '5400': 'Food Stores',
    '5500': 'Auto Dealers', '5600': 'Apparel Stores',
    '5700': 'Furniture Stores', '5900': 'Retail Stores',
    '6000': 'Banking', '6100': 'Credit Agencies',
    '6200': 'Security Dealers', '6300': 'Insurance',
    '6500': 'Real Estate', '7000': 'Hotels & Lodging',
    '7200': 'Personal Services', '7300': 'Business Services',
    '7370': 'IT Services', '7371': 'Software Development',
    '7372': 'Software Products', '7374': 'Data Processing',
    '7500': 'Auto Repair Services', '7600': 'Misc Repair',
    '7800': 'Motion Picture', '7900': 'Amusement & Recreation',
    '8000': 'Health Services', '8040': 'Dental Offices',
    '8060': 'Hospitals', '8100': 'Legal Services',
    '8200': 'Educational Services', '8700': 'Engineering Services',
    '8742': 'Management Consulting', '9000': 'Government',
  };
  const codes = [...(org.sic_codes || []), ...(org.naics_codes || [])];
  for (const code of codes) {
    const str = String(code);
    // Try exact match first, then 4-digit, then 2-digit prefix
    if (SIC_MAP[str]) return SIC_MAP[str];
    if (SIC_MAP[str.slice(0, 4)]) return SIC_MAP[str.slice(0, 4)];
    if (SIC_MAP[str.slice(0, 2) + '00']) return SIC_MAP[str.slice(0, 2) + '00'];
  }
  return null;
}

// Enrich a handful of prospects missing employee_count via Apollo org enrichment
async function enrichMissingHeadcount(prospects, apiKey) {
  const toEnrich = prospects.filter((p) => (!p.employee_count || !p.description) && p.domain).slice(0, 10);
  if (toEnrich.length === 0) return;
  await Promise.all(
    toEnrich.map(async (p) => {
      try {
        const resp = await fetchWithRetry(
          `${APOLLO_BASE_URL}/organizations/enrich?domain=${encodeURIComponent(p.domain)}`,
          { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json', 'X-Api-Key': apiKey } }
        );
        if (!resp.ok) return;
        const data = await resp.json();
        const org = data.organization;
        if (!org) return;
        if (!p.employee_count) p.employee_count = org.estimated_num_employees || org.employee_count || null;
        if (!p.industry) p.industry = resolveIndustry(org);
        if (!p.annual_revenue_printed) p.annual_revenue_printed = org.annual_revenue_printed || org.organization_revenue_printed || null;
        if (!p.description) p.description = org.short_description || org.seo_description || null;
      } catch (_) { /* skip failed enrichments */ }
    })
  );
}

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

// Industries excluded from prospect radar — not serviceable for commercial energy brokerage
const EXCLUDED_INDUSTRIES = [
  'staffing', 'recruiting', 'recruitment', 'temp agency', 'employment agency',
  'business services', 'management consulting', 'consulting services',
  'legal services', 'law firm', 'attorneys', 'legal',
  'information technology', 'it services', 'software development', 'software products',
  'data processing', 'computer services', 'saas', 'tech services',
];

function isExcludedIndustry(industry) {
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return EXCLUDED_INDUSTRIES.some((ex) => lower.includes(ex));
}

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

      // Skip non-serviceable industries
      const resolvedIndustry = resolveIndustry(org);
      if (isExcludedIndustry(resolvedIndustry)) continue;

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
        website: org.website_url || (domain ? `https://${domain}` : null),
        logo_url: org.logo_url || null,
        industry: resolvedIndustry,
        // accounts return headcount in estimated_num_employees or employee_count
        employee_count: org.estimated_num_employees || org.employee_count || org.num_employees || null,
        // accounts use organization_revenue_printed; orgs use annual_revenue_printed
        annual_revenue_printed: org.organization_revenue_printed || org.annual_revenue_printed || null,
        city: org.organization_city || org.city || null,
        state: org.organization_state || org.state || 'Texas',
        tdsp_zone: matchedLocation?.tdsp || 'ERCOT',
        phone: org.phone || org.primary_phone?.number || null,
        linkedin_url: org.linkedin_url || null,
        description: org.short_description || org.seo_description || null,
        address: org.organization_raw_address || org.raw_address || org.street_address || org.organization_street_address || null,
        zip: org.organization_postal_code || org.postal_code || null,
        discovered_at: new Date().toISOString(),
      });
    }

    if (toInsert.length === 0) {
      res.status(200).json({ count: 0, message: 'No net-new prospects found in this rotation.' });
      return;
    }

    // ── 4. Enrich up to 5 prospects missing employee_count (Apollo accounts
    //       don't return headcount in search results — requires org enrichment) ──
    const APOLLO_API_KEY_FOR_ENRICH = getApiKey();
    await enrichMissingHeadcount(toInsert, APOLLO_API_KEY_FOR_ENRICH);

    // ── 5. Upsert — ON CONFLICT update so existing null rows get backfilled ──
    const { error: insertError } = await supabaseAdmin
      .from('prospect_radar')
      .upsert(toInsert, { onConflict: 'apollo_org_id', ignoreDuplicates: false });

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
