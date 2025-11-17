/**
 * Apollo Phone Number Webhook Endpoint
 * 
 * Apollo sends phone numbers asynchronously to this webhook URL.
 * We store them temporarily in memory and optionally persist to Firebase.
 */

import { cors } from './_utils.js';

// In-memory store for phone numbers (personId -> phone data)
// In production, you'd want to use Redis or Firebase
const phoneStore = new Map();

// Store phone data for 30 minutes before auto-cleanup
const PHONE_DATA_TTL = 30 * 60 * 1000;

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;

  // Only accept POST requests from Apollo
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    console.log('[Apollo Phone Webhook] 📞 Received webhook request');
    console.log('[Apollo Phone Webhook] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[Apollo Phone Webhook] Body:', JSON.stringify(req.body, null, 2));

    // Apollo sends the phone data in the request body
    const phoneData = req.body;

    if (!phoneData || !phoneData.person) {
      console.warn('[Apollo Phone Webhook] ⚠️ No person data in webhook payload');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook payload - no person data' }));
      return;
    }

    const personId = phoneData.person.id;
    if (!personId) {
      console.warn('[Apollo Phone Webhook] ⚠️ No person ID in webhook payload');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook payload - no person ID' }));
      return;
    }

    // Extract phone numbers
    const phones = phoneData.person.phone_numbers || [];
    
    console.log(`[Apollo Phone Webhook] ✅ Storing ${phones.length} phone(s) for person: ${personId}`);
    
    // Store in memory with timestamp
    phoneStore.set(personId, {
      personId,
      phones,
      receivedAt: Date.now(),
      expiresAt: Date.now() + PHONE_DATA_TTL
    });

    // Schedule cleanup
    setTimeout(() => {
      if (phoneStore.has(personId)) {
        console.log(`[Apollo Phone Webhook] 🧹 Cleaning up expired phone data for: ${personId}`);
        phoneStore.delete(personId);
      }
    }, PHONE_DATA_TTL);

    // Respond to Apollo
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      message: 'Phone numbers received',
      personId,
      phoneCount: phones.length
    }));

  } catch (error) {
    console.error('[Apollo Phone Webhook] ❌ Error processing webhook:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }));
  }
}

// Export function to retrieve phone data
export function getPhoneData(personId) {
  const data = phoneStore.get(personId);
  
  if (!data) {
    return null;
  }

  // Check if expired
  if (Date.now() > data.expiresAt) {
    phoneStore.delete(personId);
    return null;
  }

  return data;
}

// Export function to check all stored phone data (for debugging)
export function getAllPhoneData() {
  const now = Date.now();
  const active = [];
  
  phoneStore.forEach((data, personId) => {
    if (now <= data.expiresAt) {
      active.push(data);
    } else {
      phoneStore.delete(personId);
    }
  });
  
  return active;
}


