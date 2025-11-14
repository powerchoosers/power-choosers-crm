/**
 * Apollo People Search Endpoint
 * Replaces Lusha /api/lusha/contacts endpoint
 * Maps Apollo person data to Lusha contact format
 */

import { cors, fetchWithRetry, normalizeDomain, getApiKey, APOLLO_BASE_URL, formatLocation } from './_utils.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const requestBody = req.body || {};
    
    // Extract parameters (matching Lusha format from widget)
    const { pages = {}, filters = {} } = requestBody;
    const page = pages.page !== undefined ? pages.page : 0;
    const size = pages.size !== undefined ? pages.size : 10;
    
    // Extract company filters
    const companyFilters = filters.companies?.include || {};
    const domains = companyFilters.domains || [];
    const companyIds = companyFilters.ids || [];
    const companyNames = companyFilters.names || [];
    
    if (domains.length === 0 && companyIds.length === 0 && companyNames.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing company filter: domains, ids, or names required' 
      }));
      return;
    }

    const APOLLO_API_KEY = getApiKey();
    
    // Build Apollo search request
    const searchBody = {
      page: page + 1, // Apollo uses 1-based pagination
      per_page: Math.min(size, 100) // Apollo max is 100
    };
    
    if (domains.length > 0) {
      const normalizedDomain = normalizeDomain(domains[0]);
      searchBody.organization_domains = [normalizedDomain];
    } else if (companyIds.length > 0) {
      searchBody.organization_ids = companyIds;
    } else if (companyNames.length > 0) {
      searchBody.q_organization_name = companyNames[0];
    }
    
    console.log('[Apollo Contacts] Search request:', JSON.stringify(searchBody, null, 2));
    
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
      console.error('[Apollo Contacts] Search error:', searchResp.status, text);
      res.writeHead(searchResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo people search error', 
        details: text 
      }));
      return;
    }

    const searchData = await searchResp.json();
    
    console.log('[Apollo Contacts] Search response:', searchData.people?.length || 0, 'contacts found');
    
    const apolloPeople = searchData.people || [];
    
    // Map Apollo people to Lusha contact format
    const mappedContacts = apolloPeople.map(mapApolloContactToLushaFormat);
    
    // Build response in Lusha format
    const response = {
      requestId: searchData.request_id || `apollo_search_${Date.now()}`,
      contacts: mappedContacts,
      pagination: {
        page: page,
        size: size,
        total: searchData.pagination?.total_entries || mappedContacts.length,
        totalPages: searchData.pagination?.total_pages || 1
      }
    };
    
    console.log('[Apollo Contacts] Returning', mappedContacts.length, 'mapped contacts');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (e) {
    console.error('[Apollo Contacts] Error:', e);
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
  
  // Extract emails
  const emails = [];
  if (apolloPerson.email) {
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
  
  return {
    contactId: apolloPerson.id,
    id: apolloPerson.id,
    firstName: apolloPerson.first_name || '',
    lastName: apolloPerson.last_name || '',
    fullName: apolloPerson.name || `${apolloPerson.first_name} ${apolloPerson.last_name}`.trim(),
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
    photoUrl: apolloPerson.photo_url || '',
    isSuccess: true
  };
}


