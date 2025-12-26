/**
 * Apollo Organization Search Endpoint
 * Proxies requests to Apollo's /mixed_companies/search endpoint
 * Used for the Prospecting page to find new accounts
 */

import fs from 'fs';
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
    
    // DEBUG: Write to a file we can definitely read
    fs.writeFileSync('./apollo-debug.json', JSON.stringify(searchData, null, 2));
    
    // DEBUG: Log the keys and a sample to see what we're getting
    logger.warn('[Apollo Search Orgs] Response Keys:', Object.keys(searchData));
    if (searchData.organizations && searchData.organizations.length > 0) {
      logger.warn('[Apollo Search Orgs] Full Sample Org:', JSON.stringify(searchData.organizations[0], null, 2));
    }
    if (searchData.accounts && searchData.accounts.length > 0) {
       logger.warn('[Apollo Search Orgs] Full Sample Account:', JSON.stringify(searchData.accounts[0], null, 2));
    }
    
    // Map response to a clean format for the frontend
    const organizations = (searchData.organizations || []).map(org => {
      // Robust location extraction
      let location = '';
      if (org.location?.city || org.location?.state || org.location?.country) {
        location = formatLocation(org.location.city, org.location.state, org.location.country);
      } else if (org.city || org.state || org.country) {
        location = formatLocation(org.city, org.state, org.country);
      } else {
        location = org.raw_address || '';
      }

      return {
        id: org.id,
        name: org.name,
        domain: org.primary_domain || org.domain,
        website: org.website_url,
        linkedin: org.linkedin_url,
        logoUrl: org.logo_url,
        description: org.short_description || org.seo_description,
        location: location,
        employees: org.estimated_num_employees || org.employee_count,
        industry: org.industry || (org.industries || [])[0] || org.industry_category,
        keywords: org.keywords,
        phone: org.phone,
        facebook: org.facebook_url,
        twitter: org.twitter_url
      };
    });

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
