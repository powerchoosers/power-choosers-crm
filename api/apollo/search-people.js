/**
 * Apollo People Search Endpoint
 * Proxies requests to Apollo's /mixed_people/search endpoint
 * Used for the Prospecting page to find new contacts
 */

import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL, formatLocation } from './_utils.js';
import logger from '../_logger.js';

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
      organization_num_employees_ranges,
      revenue_range,
      // Default to finding emails if possible, but don't filter strictly by it unless requested
      // contact_email_status: ["verified"] // Optional: Uncomment to only show verified emails
    };

    // Remove undefined keys
    Object.keys(searchBody).forEach(key => 
      searchBody[key] === undefined && delete searchBody[key]
    );
    
    logger.log('[Apollo Search People] Request:', JSON.stringify(searchBody));
    
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
      logger.error('[Apollo Search People] Error:', searchResp.status, text);
      res.writeHead(searchResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo search error', 
        details: text 
      }));
      return;
    }

    const searchData = await searchResp.json();
    
    // DEBUG: Log the keys and a sample to see what we're getting
    logger.warn('[Apollo Search People] Response Keys:', Object.keys(searchData));
    if (searchData.people && searchData.people.length > 0) {
      logger.warn('[Apollo Search People] Sample Person:', JSON.stringify({
        id: searchData.people[0].id,
        name: searchData.people[0].name,
        title: searchData.people[0].title,
        organization: searchData.people[0].organization ? {
          name: searchData.people[0].organization.name,
          industry: searchData.people[0].organization.industry,
          location: searchData.people[0].organization.location
        } : null,
        city: searchData.people[0].city,
        state: searchData.people[0].state,
        country: searchData.people[0].country
      }, null, 2));
    }
    
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

      return {
        id: person.id,
        name: person.name || `${person.first_name} ${person.last_name}`,
        firstName: person.first_name,
        lastName: person.last_name,
        title: person.title || person.headline,
        company: person.organization?.name,
        companyId: person.organization_id,
        domain: person.organization?.primary_domain,
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
          domain: person.organization?.primary_domain,
          logoUrl: person.organization?.logo_url,
        }
      };
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      people,
      pagination: searchData.pagination
    }));

  } catch (error) {
    logger.error('[Apollo Search People] Server Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: error.message 
    }));
  }
}
