/**
 * Apollo Organization Search Endpoint
 * Proxies requests to Apollo's /mixed_companies/search endpoint
 * Used for the Prospecting page to find new accounts
 */

import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL } from './_utils.js';
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
    const organizations = (searchData.organizations || []).map(org => ({
      id: org.id,
      name: org.name,
      domain: org.primary_domain || org.domain,
      website: org.website_url,
      linkedin: org.linkedin_url,
      logoUrl: org.logo_url,
      description: org.short_description || org.seo_description,
      location: org.location?.city ? `${org.location.city}, ${org.location.state || ''}, ${org.location.country || ''}` : (org.raw_address || ''),
      employees: org.estimated_num_employees,
      industry: org.industry || (org.industries || [])[0],
      keywords: org.keywords,
      phone: org.phone,
      facebook: org.facebook_url,
      twitter: org.twitter_url
    }));

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
