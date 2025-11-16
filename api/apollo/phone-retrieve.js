/**
 * Apollo Phone Number Retrieval Endpoint
 * 
 * Frontend polls this endpoint to check if phone numbers have been delivered
 * by Apollo to our webhook.
 */

import { cors } from './_utils.js';
import { getPhoneData, getAllPhoneData } from './phone-webhook.js';

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { personId, debug } = req.query;

    // Debug mode - return all stored phone data
    if (debug === 'true') {
      const allData = getAllPhoneData();
      console.log(`[Apollo Phone Retrieve] 🔍 Debug: ${allData.length} active phone records`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        debug: true,
        count: allData.length,
        data: allData 
      }));
      return;
    }

    // Normal mode - retrieve specific person's phones
    if (!personId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing personId parameter' }));
      return;
    }

    console.log(`[Apollo Phone Retrieve] 📞 Checking for phones: ${personId}`);

    const phoneData = getPhoneData(personId);

    if (!phoneData) {
      console.log(`[Apollo Phone Retrieve] ⏳ No phone data yet for: ${personId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        ready: false,
        message: 'Phone numbers not yet delivered by Apollo'
      }));
      return;
    }

    console.log(`[Apollo Phone Retrieve] ✅ Found ${phoneData.phones.length} phone(s) for: ${personId}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      ready: true,
      personId: phoneData.personId,
      phones: phoneData.phones,
      receivedAt: phoneData.receivedAt
    }));

  } catch (error) {
    console.error('[Apollo Phone Retrieve] ❌ Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }));
  }
}

