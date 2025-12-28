/**
 * Apollo People Search Endpoint
 * Proxies requests to Apollo's /mixed_people/search endpoint
 * Used for the Prospecting page to find new contacts
 */

import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL, formatLocation } from './_utils.js';

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
      return null;
    }

    const data = await resp.json();
    return data.organization || null;
  } catch (error) {
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
      q_keywords,
      person_titles,
      person_locations,
      organization_ids,
      q_organization_domains,
      q_organization_name,
      organization_num_employees_ranges,
      revenue_range
    } = req.body || {};

    const APOLLO_API_KEY = getApiKey();
    
    // Build Apollo search request
    const searchBody = {
      page,
      per_page: Math.min(per_page, 100), // Apollo max is 100
      q_keywords,
      person_titles,
      person_locations,
      organization_ids,
      q_organization_domains,
      q_organization_name,
      organization_num_employees_ranges,
      revenue_range,
      // Default to finding emails if possible, but don't filter strictly by it unless requested
      // contact_email_status: ["verified"] // Optional: Uncomment to only show verified emails
    };

    // Remove undefined keys
    Object.keys(searchBody).forEach(key => 
      searchBody[key] === undefined && delete searchBody[key]
    );
    const searchUrl = `${APOLLO_BASE_URL}/mixed_people/search`;
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
      res.writeHead(searchResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo search error', 
        details: text 
      }));
      return;
    }

    const searchData = await searchResp.json();
    
    // Map response to a clean format for the frontend
    const people = (searchData.people || []).map(person => {
      // Robust location extraction
      let location = '';
      if (person.city || person.state || person.country) {
        location = formatLocation(person.city, person.state, person.country);
      } else if (person.organization?.city || person.organization?.state || person.organization?.country) {
        location = formatLocation(person.organization.city, person.organization.state, person.organization.country);
      } else {
        location = person.country || '';
      }

      const domain = person.organization?.primary_domain || person.organization?.domain;

      return {
        id: person.id,
        name: person.name || `${person.first_name} ${person.last_name}`,
        firstName: person.first_name,
        lastName: person.last_name,
        title: person.title || person.headline,
        company: person.organization?.name,
        companyId: person.organization_id,
        domain: domain,
        location: location,
        linkedin: person.linkedin_url,
        email: person.email, // Note: Often masked/null until enriched
        emailStatus: person.email_status,
        photoUrl: person.photo_url,
        seniority: person.seniority,
        departments: person.departments,
        organization: {
          id: person.organization?.id,
          name: person.organization?.name,
          domain: domain,
          logoUrl: person.organization?.logo_url,
          industry: person.organization?.industry || (person.organization?.industries || [])[0] || person.organization?.industry_category || (person.organization?.sic_codes?.[0] ? `SIC: ${person.organization.sic_codes[0]}` : null),
          employees: person.organization?.estimated_num_employees || person.organization?.employee_count || null, // STRICT: No growth metrics
          location: (person.organization && (person.organization.city || person.organization.state || person.organization.country))
            ? formatLocation(person.organization.city, person.organization.state, person.organization.country)
            : location // Fallback to person's location if org location is missing
        }
      };
    });

    // --- ENRICHMENT STEP (Optional/Limited for People) ---
    // Identify unique domains among people to enrich organization data
    const domainsToEnrich = [...new Set(people
      .filter(p => p.domain && (!p.organization.industry || !p.organization.employees))
      .map(p => p.domain)
    )].slice(0, 5); // Limit to 5 unique domains to save credits

    if (domainsToEnrich.length > 0) {
      const enrichmentMap = {};
      await Promise.all(domainsToEnrich.map(async (domain) => {
        const enriched = await enrichOrganization(domain, APOLLO_API_KEY);
        if (enriched) enrichmentMap[domain] = enriched;
      }));

      // Apply enriched data back to all people from those organizations
      people.forEach(person => {
        if (person.domain && enrichmentMap[person.domain]) {
          const enriched = enrichmentMap[person.domain];
          if (enriched.industry) person.organization.industry = enriched.industry;
          person.organization.employees = enriched.estimated_num_employees || enriched.employee_count || person.organization.employees;
          if (enriched.logo_url && !person.organization.logoUrl) person.organization.logoUrl = enriched.logo_url;
        }
      });
    }
    // --- END ENRICHMENT STEP ---

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      people,
      pagination: searchData.pagination
    }));

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: error.message 
    }));
  }
}
