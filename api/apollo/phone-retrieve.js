/**
 * Apollo Phone Retrieval Endpoint
 * 
 * Used by the frontend to poll for phone numbers that were delivered asynchronously
 * to the phone-webhook endpoint.
 */

import { cors } from './_utils.js';
import { getPhoneData } from './phone-webhook.js';

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;
  
  // Only accept GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const { personId } = req.query || {};
    
    if (!personId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing personId parameter' }));
      return;
    }

    // Check if we have data in the store (asynchronous Firestore check)
    const phoneData = await getPhoneData(personId);
    
    if (phoneData) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        ready: true, 
        phones: phoneData.phones 
      }));
    } else {
      // Not found yet (or expired)
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        ready: false
      }));
    }
    
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }));
  }
}
