/**
 * Apollo Company Search Endpoint
 * Replaces Lusha /api/lusha/company endpoint
 * Maps Apollo organization data to Lusha format with bonus company phone & address
 */

import { cors, fetchWithRetry, normalizeDomain, getApiKey, APOLLO_BASE_URL, formatLocation, formatEmployeeRange, formatRevenue } from './_utils.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const { domain, company, companyId } = req.query || {};
    
    if (!domain && !company && !companyId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing required parameter: domain, company, or companyId' 
      }));
      return;
    }

    const APOLLO_API_KEY = getApiKey();
    
    // Build Apollo search request
    const searchBody = {};
    
    if (domain) {
      const normalizedDomain = normalizeDomain(domain);
      searchBody.q_organization_domains = [normalizedDomain];
    } else if (company) {
      searchBody.q_organization_name = company;
    } else if (companyId) {
      searchBody.organization_ids = [companyId];
    }
    
    // Set page size to 1 since we only need the first result
    searchBody.page = 1;
    searchBody.per_page = 1;
    
    console.log('[Apollo Company] Search request:', JSON.stringify(searchBody, null, 2));
    
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
      console.error('[Apollo Company] Search error:', searchResp.status, text);
      res.writeHead(searchResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo company search error', 
        details: text 
      }));
      return;
    }

    const searchData = await searchResp.json();
    
    console.log('[Apollo Company] Search response:', JSON.stringify(searchData, null, 2));
    
    if (!searchData.organizations || searchData.organizations.length === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Company not found' 
      }));
      return;
    }

    const apolloOrg = searchData.organizations[0];
    
    // Map to Lusha format with bonus company phone & address fields
    const companyData = mapApolloCompanyToLushaFormat(apolloOrg);
    
    console.log('[Apollo Company] Mapped company data:', JSON.stringify(companyData, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(companyData));
  } catch (e) {
    console.error('[Apollo Company] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: e.message 
    }));
  }
}

function mapApolloCompanyToLushaFormat(apolloOrg) {
  const derivedDomain = apolloOrg.primary_domain || normalizeDomain(apolloOrg.website_url || '');
  const website = apolloOrg.website_url || (derivedDomain ? `https://${derivedDomain}` : '');
  
  return {
    id: apolloOrg.id,
    name: apolloOrg.name || '',
    domain: derivedDomain,
    website: website,
    description: apolloOrg.short_description || apolloOrg.seo_description || '',
    employees: formatEmployeeRange(apolloOrg.estimated_num_employees),
    industry: apolloOrg.industry || (apolloOrg.industries && apolloOrg.industries[0]) || '',
    city: apolloOrg.city || '',
    state: apolloOrg.state || '',
    country: apolloOrg.country || '',
    address: apolloOrg.raw_address || apolloOrg.street_address || '',
    companyPhone: apolloOrg.phone || apolloOrg.sanitized_phone || (apolloOrg.primary_phone && apolloOrg.primary_phone.number) || '',
    location: formatLocation(apolloOrg.city, apolloOrg.state, apolloOrg.country),
    linkedin: apolloOrg.linkedin_url || '',
    logoUrl: apolloOrg.logo_url || null,
    foundedYear: apolloOrg.founded_year || '',
    revenue: apolloOrg.annual_revenue_printed || '',
    companyType: (apolloOrg.industries && apolloOrg.industries[0]) || ''
  };
}


