/**
 * Apollo Organization Search Endpoint
 * Proxies requests to Apollo's /mixed_companies/search endpoint
 * Used for the Prospecting page to find new accounts
 */

import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL, formatLocation } from './_utils.js';
import logger from '../_logger.js';

/**
 * Simple SIC code to industry name mapping
 * @param {string} code - SIC code
 * @returns {string|null} - Industry name or null
 */
function sicToIndustry(code) {
  if (!code) return null;
  const mapping = {
    '7371': 'Software Development',
    '7372': 'Software Products',
    '7373': 'IT Systems Design',
    '7374': 'Data Processing',
    '7375': 'Information Services',
    '8742': 'Management Consulting',
    '7311': 'Advertising',
    '7011': 'Hospitality/Hotels',
    '7900': 'Amusement & Recreation',
    '519': 'Wholesale Trade',
    '72111': 'Hotels & Motels' // This is NAICS but often found in same fields
  };
  return mapping[code] || null;
}

/**
 * Enrich organization data using Apollo Enrichment API
 * @param {string} domain - Organization domain
 * @param {string} apiKey - Apollo API key
 * @returns {Promise<Object|null>} - Enriched data or null
 */
async function enrichOrganization(domain, apiKey) {
  if (!domain) return null;
  try {
    const url = `${APOLLO_BASE_URL}/organizations/enrich?domain=${encodeURIComponent(domain)}`;
    const resp = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      }
    });

    if (!resp.ok) {
      logger.error(`[Apollo Enrichment] Error for ${domain}:`, resp.status);
      return null;
    }

    const data = await resp.json();
    return data.organization || null;
  } catch (error) {
    logger.error(`[Apollo Enrichment] Failed for ${domain}:`, error.message);
    return null;
  }
}

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const { 
      page = 1, 
      per_page = 10, 
      q_organization_name,
      q_organization_keyword_tags,
      organization_locations,
      organization_num_employees_ranges,
      revenue_range
    } = req.body || {};

    const APOLLO_API_KEY = getApiKey();
    
    // Build Apollo search request
    const searchBody = {
      page,
      per_page: Math.min(per_page, 100),
      q_organization_name,
      q_organization_keyword_tags, // Industry/Keywords
      organization_locations,
      organization_num_employees_ranges,
      revenue_range
    };

    // Remove undefined keys
    Object.keys(searchBody).forEach(key => 
      searchBody[key] === undefined && delete searchBody[key]
    );
    
    logger.log('[Apollo Search Orgs] Request:', JSON.stringify(searchBody));
    
    const searchUrl = `${APOLLO_BASE_URL}/mixed_companies/search`;
    const searchResp = await fetchWithRetry(searchUrl, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify(searchBody)
    });

    if (!searchResp.ok) {
      const text = await searchResp.text();
      logger.error('[Apollo Search Orgs] Error:', searchResp.status, text);
      res.writeHead(searchResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo search error', 
        details: text 
      }));
      return;
    }

    const searchData = await searchResp.json();
    
    // Map response to a clean format for the frontend
    const rawOrgs = searchData.organizations || [];
    const rawAccounts = searchData.accounts || [];

    // Use accounts as the base if organizations is empty, otherwise try to merge or use both
    const combinedData = [];
    const seenDomains = new Set();

    // Map Accounts first (often richer data in mixed search)
    rawAccounts.forEach(acc => {
      const domain = acc.domain;
      if (domain) seenDomains.add(domain.toLowerCase());

      let location = formatLocation(acc.organization_city, acc.organization_state, acc.organization_country);
      if (!location) {
        location = acc.formatted_address || acc.organization_raw_address || '';
      }

      // Robust industry detection
      let industry = acc.industry || acc.industry_category || (acc.industries || [])[0];
      if (!industry && acc.sic_codes && acc.sic_codes.length > 0) {
        const mapped = sicToIndustry(acc.sic_codes[0]);
        industry = mapped || `SIC: ${acc.sic_codes[0]}`;
      } else if (!industry && acc.naics_codes && acc.naics_codes.length > 0) {
        const mapped = sicToIndustry(acc.naics_codes[0]);
        industry = mapped || `NAICS: ${acc.naics_codes[0]}`;
      }

      combinedData.push({
        id: acc.id,
        name: acc.name,
        domain: domain,
        website: acc.website_url,
        linkedin: acc.linkedin_url,
        logoUrl: acc.logo_url,
        description: acc.short_description,
        location: location,
        employees: acc.employee_count || acc.estimated_num_employees || null, // STRICT: No growth metrics
        industry: industry,
        keywords: acc.keywords,
        phone: acc.phone || (acc.primary_phone ? acc.primary_phone.number : null),
        facebook: acc.facebook_url,
        twitter: acc.twitter_url,
        source: 'account'
      });
    });

    // Map Organizations (if not already in combinedData by domain)
    rawOrgs.forEach(org => {
      const domain = org.primary_domain || org.domain;
      if (domain && seenDomains.has(domain.toLowerCase())) return;
      if (domain) seenDomains.add(domain.toLowerCase());

      let location = '';
      if (org.location?.city || org.location?.state || org.location?.country) {
        location = formatLocation(org.location.city, org.location.state, org.location.country);
      } else if (org.city || org.state || org.country) {
        location = formatLocation(org.city, org.state, org.country);
      } else {
        location = org.raw_address || '';
      }

      // Robust industry detection
      let industry = org.industry || (org.industries || [])[0] || org.industry_category;
      if (!industry && org.sic_codes && org.sic_codes.length > 0) {
        const mapped = sicToIndustry(org.sic_codes[0]);
        industry = mapped || `SIC: ${org.sic_codes[0]}`;
      } else if (!industry && org.naics_codes && org.naics_codes.length > 0) {
        const mapped = sicToIndustry(org.naics_codes[0]);
        industry = mapped || `NAICS: ${org.naics_codes[0]}`;
      }

      combinedData.push({
        id: org.id,
        name: org.name,
        domain: domain,
        website: org.website_url,
        linkedin: org.linkedin_url,
        logoUrl: org.logo_url,
        description: org.short_description || org.seo_description,
        location: location,
        employees: org.estimated_num_employees || org.employee_count || null, // STRICT: No growth metrics
        industry: industry,
        keywords: org.keywords,
        phone: org.phone || (org.primary_phone ? org.primary_phone.number : null),
        facebook: org.facebook_url,
        twitter: org.twitter_url,
        source: 'organization'
      });
    });

    // --- ENRICHMENT STEP ---
    // Identify organizations missing critical data that have a domain
    const toEnrich = combinedData.filter(org => 
      org.domain && (!org.industry || !org.employees)
    ).slice(0, 10); // Limit to 10 enrichments per search to save credits/time

    if (toEnrich.length > 0) {
      logger.log(`[Apollo Search Orgs] Enriching ${toEnrich.length} organizations...`);
      
      // Enrich in parallel
      const enrichmentPromises = toEnrich.map(async (org) => {
        const enriched = await enrichOrganization(org.domain, APOLLO_API_KEY);
        if (enriched) {
          // Update industry if missing or if enriched is better (human-readable)
          if (enriched.industry) {
            org.industry = enriched.industry;
          } else if (!org.industry && enriched.sic_codes?.[0]) {
             const mapped = sicToIndustry(enriched.sic_codes[0]);
             org.industry = mapped || `SIC: ${enriched.sic_codes[0]}`;
          }

          // Update employees (prefer estimated_num_employees from enrichment)
          org.employees = enriched.estimated_num_employees || enriched.employee_count || org.employees;
          
          // Supplement other fields if missing
          if (!org.description) org.description = enriched.short_description || enriched.seo_description;
          if (!org.location) {
             org.location = formatLocation(enriched.city, enriched.state, enriched.country) || enriched.raw_address;
          }
        }
      });

      await Promise.all(enrichmentPromises);
    }
    // --- END ENRICHMENT STEP ---

    const organizations = combinedData;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      organizations,
      pagination: searchData.pagination
    }));

  } catch (error) {
    logger.error('[Apollo Search Orgs] Server Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: error.message 
    }));
  }
}
