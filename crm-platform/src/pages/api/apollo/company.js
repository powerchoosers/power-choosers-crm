/**
 * Apollo Company Enrichment Endpoint
 * Replaces Lusha /api/lusha/company endpoint
 * Uses Apollo's Organization Enrichment API (domain-based) for accurate company data
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

    if (!domain && !companyId && !company) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing required parameter: domain, companyId, or company name required for enrichment'
      }));
      return;
    }

    const APOLLO_API_KEY = getApiKey();

    // ============================================================================
    // PRIMARY METHOD: Organization Enrichment by Domain (most accurate!)
    // Apollo's Organization Enrichment endpoint supports domain-based lookups
    // This eliminates name-matching issues and uses domain as source of truth
    // ============================================================================

    if (domain) {
      const normalizedDomain = normalizeDomain(domain);
      const enrichUrl = `${APOLLO_BASE_URL}/organizations/enrich?domain=${encodeURIComponent(normalizedDomain)}`;

      const enrichResp = await fetchWithRetry(enrichUrl, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'X-Api-Key': APOLLO_API_KEY
        }
      });

      if (enrichResp.ok) {
        const enrichData = await enrichResp.json();

        if (enrichData.organization) {
          const companyData = mapApolloCompanyToLushaFormat(enrichData.organization);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(companyData));
          return;
        }
      } else if (enrichResp.status === 404) {
        // Return minimal company data instead of error
        // This allows contacts search to proceed with domain/name filters
        const minimalCompany = {
          id: null,
          name: company || '',
          domain: normalizedDomain,
          website: `https://${normalizedDomain}`,
          description: '',
          employees: '',
          industry: '',
          city: '',
          state: '',
          country: '',
          address: '',
          companyPhone: '',
          location: '',
          linkedin: '',
          logoUrl: null,
          foundedYear: '',
          revenue: '',
          companyType: '',
          _notFoundInApollo: true
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(minimalCompany));
        return;
      } else {
        // Return minimal data on error to allow contacts search
        const minimalCompany = {
          id: null,
          name: company || '',
          domain: normalizedDomain,
          website: `https://${normalizedDomain}`,
          description: '',
          employees: '',
          industry: '',
          city: '',
          state: '',
          country: '',
          address: '',
          companyPhone: '',
          location: '',
          linkedin: '',
          logoUrl: null,
          foundedYear: '',
          revenue: '',
          companyType: '',
          _notFoundInApollo: true
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(minimalCompany));
        return;
      }
    }

    // ============================================================================
    // FALLBACK METHOD: Enrichment by Company ID
    // Used when widget extracts company ID from contact data
    // ============================================================================

    if (companyId) {
      const enrichUrlWithId = `${APOLLO_BASE_URL}/organizations/${companyId}`;

      const enrichResp = await fetchWithRetry(enrichUrlWithId, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'X-Api-Key': APOLLO_API_KEY
        }
      });

      if (enrichResp.ok) {
        const enrichData = await enrichResp.json();

        if (enrichData.organization) {
          const companyData = mapApolloCompanyToLushaFormat(enrichData.organization);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(companyData));
          return;
        }
      }
    }

    // ============================================================================
    // FALLBACK METHOD: Search by Company Name
    // Used when domain is missing (e.g. from search results)
    // ============================================================================

    if (company) {
      const searchUrl = `${APOLLO_BASE_URL}/organizations/search`;
      const searchResp = await fetchWithRetry(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': APOLLO_API_KEY
        },
        body: JSON.stringify({
          q_organization_name: company,
          page: 1,
          per_page: 1
        })
      });

      if (searchResp.ok) {
        const searchData = await searchResp.json();
        if (searchData.organizations && searchData.organizations.length > 0) {
          const org = searchData.organizations[0];
          const companyData = mapApolloCompanyToLushaFormat(org);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(companyData));
          return;
        }
      }
    }

    // If we get here, both methods failed
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Unable to enrich company data',
      details: 'Domain or company ID required'
    }));

  } catch (e) {
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
    zip: apolloOrg.postal_code || '',
    country: apolloOrg.country || '',
    address: apolloOrg.raw_address || apolloOrg.street_address || '',
    companyPhone: apolloOrg.phone || apolloOrg.sanitized_phone || (apolloOrg.primary_phone && apolloOrg.primary_phone.number) || '',
    location: formatLocation(apolloOrg.city, apolloOrg.state, apolloOrg.country),
    linkedin: apolloOrg.linkedin_url || '',
    logoUrl: apolloOrg.logo_url || null,
    foundedYear: apolloOrg.founded_year || '',
    revenue: apolloOrg.annual_revenue_printed || formatRevenue(apolloOrg.annual_revenue),
    companyType: (apolloOrg.industries && apolloOrg.industries[0]) || ''
  };
}
