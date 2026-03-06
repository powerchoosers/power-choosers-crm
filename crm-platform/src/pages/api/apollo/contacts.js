/**
 * Apollo People Search Endpoint
 * Replaces Lusha /api/lusha/contacts endpoint
 * Maps Apollo person data to Lusha contact format
 */

import { cors, fetchWithRetry, normalizeDomain, getApiKey, APOLLO_BASE_URL, formatLocation, requireApolloAuth } from './_utils.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  
  const auth = await requireApolloAuth(req, res);
  if (!auth) return;

  try {
    const requestBody = req.body || {};
    
    // Extract parameters (matching Lusha format from widget)
    const { pages = {}, filters = {}, includePhotos = true } = requestBody;
    const page = pages.page !== undefined ? pages.page : 0;
    const size = pages.size !== undefined ? pages.size : 10;
    const personName = filters.person_name || ''; // New filter for name search
    
    // Extract company filters
    const companyFilters = filters.companies?.include || {};
    const domains = companyFilters.domains || [];
    const companyIds = companyFilters.ids || [];
    const companyNames = companyFilters.names || [];
    
    // Require at least one filter
    if (domains.length === 0 && companyIds.length === 0 && companyNames.length === 0 && !personName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing filter: company (domains, ids, names) or person_name required',
        requestId: `apollo_error_${Date.now()}`,
        contacts: [],
        pagination: { page: 0, size: 0, total: 0, totalPages: 0 }
      }));
      return;
    }

    const APOLLO_API_KEY = getApiKey();
    
    // Build Apollo search request
    const searchBody = {
      page: page + 1, // Apollo uses 1-based pagination
      per_page: Math.min(size, 100), // Apollo max is 100
      person_titles: [
        // Facilities & Energy
        'Facilities Director',
        'Facilities Manager',
        'Energy Manager',
        'Plant Operations',
        'Real Estate Manager',
        
        // Finance & Accounting
        'Controller',
        'CFO',
        'Chief Financial Officer',
        'VP of Finance',
        'Director of Finance',
        'Corporate Controller',
        'Accounting Manager',
        
        // Executive Leadership
        'CEO',
        'Chief Executive Officer',
        'President',
        'Owner',
        'Franchise Owner',
        'Managing Director',
        'COO',
        'Chief Operating Officer',
        'Executive Director',
        'General Manager',
        'GM',
        
        // Operations & Business
        'Business Office Manager',
        'Office Manager',
        'Business Administrator',
        'Sourcing',
        'Director of Supply Chain',
        'Manager of Supply Chain',
        'Cost Reduction Expert',
        
        // IT & Compliance
        'IT Director',
        'IT Manager',
        'Chief Compliance Officer',
        'Compliance Manager'
      ],
      include_similar_titles: true
    };

    // If searching by name, use q_keywords (which searches name, title, email)
    // BUT we keep the person_titles above to ensure we only find DECISION MAKERS matching that name
    if (personName) {
      searchBody.q_keywords = personName;
    }
    
    // COMBINED FILTERING STRATEGY:
    // Use BOTH company name AND domain together for best accuracy
    
    if (companyIds.length > 0) {
      // Priority 1: Company ID filtering (most accurate, requires Apollo company ID)
      searchBody.organization_ids = companyIds;
    } else {
      let filtersApplied = 0;
      
      if (domains.length > 0) {
        const normalizedDomains = domains.map(d => normalizeDomain(d)).filter(d => d);
        if (normalizedDomains.length > 0) {
          searchBody.q_organization_domains_list = normalizedDomains;
          filtersApplied++;
        }
      }

      // Fallback: If we have a company name but no ID/Domain, append it to keywords
      // q_organization_name is NOT a valid Apollo parameter
      if (companyNames.length > 0) {
        if (searchBody.q_keywords) {
          searchBody.q_keywords += ` "${companyNames[0]}"`;
        } else {
          searchBody.q_keywords = `"${companyNames[0]}"`;
        }
        filtersApplied++;
      }
      
      if (filtersApplied === 0 && !personName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'No valid company filters could be applied and no person name provided',
          requestId: `apollo_error_${Date.now()}`,
          contacts: [],
          pagination: { page: 0, size: 0, total: 0, totalPages: 0 }
        }));
        return;
      }
      
    }

    const searchUrl = `${APOLLO_BASE_URL}/mixed_people/api_search`;
    
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
      logger.error('[Apollo Search] Error:', searchResp.status, text);
      res.writeHead(searchResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({  
        error: 'Apollo people search error', 
        details: text,
        requestBody: searchBody // Return request body to help debug
      }));
      return;
    }

    const searchData = await searchResp.json();

    const apolloPeople = searchData.people || [];

    if (apolloPeople.length > 0) {
      // Optional lightweight enrichment pass to improve avatar coverage.
      // We request bulk_match with reveal flags disabled so this only hydrates profile fields.
      if (includePhotos) {
        try {
          const enrichedMap = new Map();
          const chunkSize = 10;

          for (let i = 0; i < apolloPeople.length; i += chunkSize) {
            const chunk = apolloPeople.slice(i, i + chunkSize);
            const details = chunk
              .map((p) => (p?.id ? { id: p.id } : null))
              .filter(Boolean);
            if (details.length === 0) continue;

            const bulkMatchUrl = `${APOLLO_BASE_URL}/people/bulk_match`;
            const bulkResp = await fetchWithRetry(bulkMatchUrl, {
              method: 'POST',
              headers: {
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json',
                'X-Api-Key': APOLLO_API_KEY
              },
              body: JSON.stringify({
                details,
                reveal_personal_emails: false,
                reveal_phone_number: false
              })
            });

            if (!bulkResp.ok) continue;
            const bulkData = await bulkResp.json();
            const matches = bulkData.matches || [];
            matches.forEach((match) => {
              if (match?.id) enrichedMap.set(match.id, match);
            });
          }

          apolloPeople.forEach((p, index) => {
            const enriched = p?.id ? enrichedMap.get(p.id) : null;
            if (enriched) {
              apolloPeople[index] = {
                ...p,
                photo_url: p.photo_url || enriched.photo_url || '',
                first_name: p.first_name || enriched.first_name || '',
                last_name: p.last_name || enriched.last_name || '',
                name: p.name || enriched.name || ''
              };
            }
          });
        } catch (_) {
          // Keep endpoint resilient: if enrichment fails, return base search results.
        }
      }
    }

    // Map Apollo people to Lusha contact format
    const mappedContacts = apolloPeople.map(mapApolloContactToLushaFormat);
    
    // Build response in Lusha format
    const response = {
      requestId: searchData.request_id || `apollo_search_${Date.now()}`,
      contacts: mappedContacts,
      pagination: {
        page: page,
        size: size,
        total: searchData.total_entries || searchData.pagination?.total_entries || mappedContacts.length,
        totalPages: searchData.pagination?.total_pages || Math.ceil((searchData.total_entries || mappedContacts.length) / size) || 1
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: e.message 
    }));
  }
}

function mapApolloContactToLushaFormat(apolloPerson) {
  // Extract phone numbers
  const phones = (apolloPerson.phone_numbers || [])
    .map(p => ({
      number: p.sanitized_number || p.raw_number,
      type: p.type || 'work'
    }));
  
  // Extract emails (filter out Apollo's placeholder emails)
  const emails = [];
  if (apolloPerson.email && !apolloPerson.email.includes('email_not_unlocked')) {
    emails.push({
      address: apolloPerson.email,
      type: 'work',
      status: apolloPerson.email_status
    });
  }
  
  // Check for specific phone types
  const hasMobilePhone = phones.some(p => 
    (p.type || '').toLowerCase().includes('mobile')
  );
  const hasDirectPhone = phones.some(p => 
    (p.type || '').toLowerCase().includes('direct') ||
    (p.type || '').toLowerCase().includes('work')
  );
  
  const firstName = apolloPerson.first_name || '';
  const lastName = apolloPerson.last_name || '';
  const fullName = apolloPerson.name || `${firstName} ${lastName}`.trim();
  const apolloId = apolloPerson.id || apolloPerson.person_id || apolloPerson.personId || '';

  return {
    contactId: apolloId,
    id: apolloId,
    firstName: firstName,
    lastName: lastName,
    fullName: fullName,
    jobTitle: apolloPerson.title || apolloPerson.headline || '',
    companyName: apolloPerson.organization?.name || '',
    companyId: apolloPerson.organization_id || '',
    fqdn: apolloPerson.organization?.primary_domain || '',
    emails: emails,
    phones: phones,
    email: emails[0]?.address || '',
    phone: phones[0]?.number || '',
    hasEmails: emails.length > 0,
    hasPhones: phones.length > 0,
    hasMobilePhone: hasMobilePhone,
    hasDirectPhone: hasDirectPhone,
    linkedin: apolloPerson.linkedin_url || '',
    location: formatLocation(apolloPerson.city, apolloPerson.state, apolloPerson.country),
    city: apolloPerson.city || '',
    state: apolloPerson.state || '',
    country: apolloPerson.country || '',
    industry: apolloPerson.organization?.industry || (apolloPerson.organization?.industries && apolloPerson.organization.industries[0]) || '',
    seniority: apolloPerson.seniority || '',
    // Department/functional area (if Apollo provides it)
    department: apolloPerson.department || '',
    photoUrl: apolloPerson.photo_url || '',
    isSuccess: true
  };
}




