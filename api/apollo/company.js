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
    // IMPORTANT: Apollo Organization Search does NOT support direct domain filtering!
    // We must use company name search or organization IDs
    const searchBody = {
      page: 1,
      per_page: 1
    };
    
    // Priority order: ID > Company Name > Domain (not supported, will fall back to name)
    if (companyId) {
      searchBody.organization_ids = [companyId];
      console.log('[Apollo Company] Searching by organization ID:', companyId);
    } else if (company) {
      searchBody.q_organization_name = company;
      console.log('[Apollo Company] Searching by company name:', company);
    } else if (domain) {
      // Domain-only search: Use company name derived from domain as fallback
      const domainParts = normalizeDomain(domain).split('.');
      const companyGuess = domainParts[0].replace(/-/g, ' ');
      searchBody.q_organization_name = companyGuess;
      console.log('[Apollo Company] No company name provided, guessing from domain:', domain, '-> ', companyGuess);
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing required parameter: domain, company, or companyId' 
      }));
      return;
    }
    
    console.log('[Apollo Company] Full search request:', JSON.stringify(searchBody, null, 2));
    
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
    
    console.log('[Apollo Company] Search response - found', searchData.organizations?.length || 0, 'organizations');
    
    if (!searchData.organizations || searchData.organizations.length === 0) {
      console.log('[Apollo Company] No organizations found for search');
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Company not found' 
      }));
      return;
    }

    let apolloOrg = searchData.organizations[0];
    
    // DOMAIN VERIFICATION: If we searched by company name but also have a domain,
    // verify the returned company's primary_domain matches (helps catch wrong matches)
    if (company && domain && apolloOrg.primary_domain) {
      const normalizedInputDomain = normalizeDomain(domain);
      const normalizedResultDomain = normalizeDomain(apolloOrg.primary_domain);
      
      if (normalizedInputDomain !== normalizedResultDomain) {
        console.log('[Apollo Company] ⚠️  Domain mismatch! Expected:', normalizedInputDomain, 'Got:', normalizedResultDomain);
        console.log('[Apollo Company] Checking remaining results for exact domain match...');
        
        // Try to find a better match in the remaining results
        const matchingOrg = searchData.organizations.find(org => 
          normalizeDomain(org.primary_domain || '') === normalizedInputDomain
        );
        
        if (matchingOrg) {
          console.log('[Apollo Company] ✅ Found exact domain match:', matchingOrg.name, '-', matchingOrg.primary_domain);
          apolloOrg = matchingOrg;
        } else {
          console.log('[Apollo Company] ⚠️  No exact domain match found, using first result:', apolloOrg.name);
        }
      } else {
        console.log('[Apollo Company] ✅ Domain verified:', normalizedResultDomain);
      }
    }
    
    // Map to Lusha format with bonus company phone & address fields
    const companyData = mapApolloCompanyToLushaFormat(apolloOrg);
    
    console.log('[Apollo Company] Final company data:', companyData.name, '-', companyData.domain);

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



