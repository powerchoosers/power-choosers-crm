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
    const mappedUsage = mapApolloUsageToLushaFormat(usageData);
    
    console.log('[Apollo Usage] Mapped usage:', JSON.stringify(mappedUsage, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mappedUsage));
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
  // Apollo returns detailed usage stats
  // We need to extract credits used and remaining
  
  // Apollo usage structure (from docs):
  // {
  //   "credits": {
  //     "email_credits": { "used": 100, "limit": 1000 },
  //     "export_credits": { "used": 50, "limit": 500 },
  //     "mobile_credits": { "used": 25, "limit": 250 }
  //   }
  // }
  
  const credits = apolloUsage.credits || {};
  
  // Sum up all credit types
  let totalUsed = 0;
  let totalLimit = 0;
  
  Object.keys(credits).forEach(creditType => {
    const creditInfo = credits[creditType] || {};
    totalUsed += creditInfo.used || 0;
    totalLimit += creditInfo.limit || 0;
  });
  
  const remaining = totalLimit - totalUsed;
  
  // Map to Lusha format for widget
  return {
    credits: {
      used: totalUsed,
      remaining: remaining,
      total: totalLimit,
      percentage: totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0
    },
    // Include breakdown for debugging
    breakdown: {
      email: credits.email_credits || { used: 0, limit: 0 },
      export: credits.export_credits || { used: 0, limit: 0 },
      mobile: credits.mobile_credits || { used: 0, limit: 0 }
    }
  };
}

