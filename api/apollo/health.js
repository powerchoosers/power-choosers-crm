/**
 * Apollo API Health Check Endpoint
 * Tests authentication with Apollo's health endpoint
 */

import { cors, getApiKey } from './_utils.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const APOLLO_API_KEY = getApiKey();
    
    // Test authentication with Apollo's health endpoint
    const healthUrl = 'https://api.apollo.io/v1/auth/health';
    logger.log('[Apollo Health] Testing authentication with:', healthUrl);
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      }
    });
    
    logger.log('[Apollo Health] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[Apollo Health] Authentication failed:', response.status, errorText);
      
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false,
        status: response.status,
        error: 'Authentication failed',
        details: errorText,
        message: response.status === 401 
          ? 'API key is invalid or not authorized. Check that APOLLO_API_KEY is set correctly.'
          : 'Apollo API error'
      }));
      return;
    }
    
    const data = await response.json();
    logger.log('[Apollo Health] Authentication successful:', data);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true,
      status: 200,
      message: 'Apollo API authentication successful',
      data: data
    }));
  } catch (e) {
    logger.error('[Apollo Health] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false,
      error: 'Server error', 
      details: e.message 
    }));
  }
}

