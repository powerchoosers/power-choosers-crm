/**
 * Apollo Usage Stats Endpoint
 * Replaces Lusha /api/lusha/usage endpoint
 * Maps Apollo usage stats to Lusha format for widget usage bar
 * Note: Requires master API key (not regular API key)
 */

import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL } from './_utils.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const APOLLO_API_KEY = getApiKey();
    
    console.log('[Apollo Usage] Fetching usage stats...');
    
    const usageUrl = `${APOLLO_BASE_URL}/usage_stats/api_usage_stats`;
    const usageResp = await fetchWithRetry(usageUrl, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify({}) // Empty body required for POST
    });

    if (!usageResp.ok) {
      const text = await usageResp.text();
      console.error('[Apollo Usage] API error:', usageResp.status, text);
      
      // If 403, likely not a master API key
      if (usageResp.status === 403) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Forbidden - API key may not have master key permissions',
          details: 'Usage stats endpoint requires a master API key'
        }));
        return;
      }
      
      res.writeHead(usageResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo usage API error', 
        details: text 
      }));
      return;
    }

    const usageData = await usageResp.json();
    
    console.log('[Apollo Usage] Raw response:', JSON.stringify(usageData, null, 2));
    
    // Map Apollo usage stats to Lusha format
    const response = mapApolloUsageToLushaFormat(usageData);
    
    console.log('[Apollo Usage] Mapped response:', JSON.stringify(response, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (e) {
    console.error('[Apollo Usage] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: e.message 
    }));
  }
}

function mapApolloUsageToLushaFormat(apolloUsage) {
  // Apollo returns rate limit stats per endpoint
  // Extract relevant endpoints for the widget
  const peopleSearchStats = apolloUsage['["api/v1/mixed_people", "search"]'] || {};
  const orgSearchStats = apolloUsage['["api/v1/mixed_companies", "search"]'] || {};
  const peopleMatchStats = apolloUsage['["api/v1/people", "match"]'] || {};
  
  // Calculate total consumed today
  const totalConsumed = 
    (peopleSearchStats.day?.consumed || 0) +
    (orgSearchStats.day?.consumed || 0) +
    (peopleMatchStats.day?.consumed || 0);
  
  // Get day limits
  const dailyLimit = 
    (peopleSearchStats.day?.limit || 6000) +
    (orgSearchStats.day?.limit || 6000) +
    (peopleMatchStats.day?.limit || 6000);
  
  // Map Apollo usage response to Lusha format
  const usage = {
    total: dailyLimit,
    used: totalConsumed,
    remaining: dailyLimit - totalConsumed,
    // Additional fields for compatibility
    credits: {
      total: dailyLimit,
      used: totalConsumed,
      limit: dailyLimit
    },
    // Include per-endpoint stats for debugging
    byEndpoint: {
      peopleSearch: peopleSearchStats,
      orgSearch: orgSearchStats,
      peopleMatch: peopleMatchStats
    }
  };
  
  const response = {
    usage: usage,
    headers: {
      'x-credits-used': totalConsumed,
      'x-credits-remaining': dailyLimit - totalConsumed
    }
  };
  
  return response;
}


