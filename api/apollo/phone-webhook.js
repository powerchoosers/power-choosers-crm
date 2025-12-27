/**
 * Apollo Phone Number Webhook Endpoint
 * 
 * Apollo sends phone numbers asynchronously to this webhook URL.
 * We store them temporarily in memory and optionally persist to Firebase.
 */

import { cors } from './_utils.js';
import logger from '../_logger.js';
import { db } from '../_firebase.js';

// In-memory fallback (only for local dev without Firestore)
const memoryStore = new Map();

// Store phone data for 30 minutes
const PHONE_DATA_TTL_MS = 30 * 60 * 1000;

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
    logger.log('[Apollo Phone Webhook] 📞 Received webhook request');
    
    // Apollo sends the phone data in the request body
    const phoneData = req.body;

    if (!phoneData || !phoneData.person) {
      logger.warn('[Apollo Phone Webhook] ⚠️ No person data in webhook payload');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook payload - no person data' }));
      return;
    }

    const personId = phoneData.person.id;
    if (!personId) {
      logger.warn('[Apollo Phone Webhook] ⚠️ No person ID in webhook payload');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook payload - no person ID' }));
      return;
    }

    // Extract phone numbers
    const phones = phoneData.person.phone_numbers || [];
    
    logger.log(`[Apollo Phone Webhook] ✅ Received ${phones.length} phone(s) for person: ${personId}`);
    
    const payload = {
      personId,
      phones,
      receivedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + PHONE_DATA_TTL_MS).toISOString()
    };

    // Store in Firestore (distributed state)
    if (db) {
      try {
        await db.collection('apollo_phones').doc(personId).set(payload);
        logger.log('[Apollo Phone Webhook] ✓ Saved to Firestore:', personId);
      } catch (dbError) {
        logger.error('[Apollo Phone Webhook] ❌ Firestore save error:', dbError);
        // Fallback to memory
        memoryStore.set(personId, payload);
      }
    } else {
      // Fallback to memory for local dev
      memoryStore.set(personId, payload);
      logger.log('[Apollo Phone Webhook] ! Saved to memory store (Firestore unavailable):', personId);
    }

    // Respond to Apollo
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      message: 'Phone numbers received',
      personId
    }));

  } catch (error) {
    logger.error('[Apollo Phone Webhook] ❌ Error processing webhook:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }));
  }
}

// Export function to retrieve phone data (asynchronous)
export async function getPhoneData(personId) {
  // Try Firestore first
  if (db) {
    try {
      const doc = await db.collection('apollo_phones').doc(personId).get();
      if (doc.exists) {
        const data = doc.data();
        // Check expiry
        if (new Date(data.expiresAt) > new Date()) {
          return data;
        } else {
          logger.log('[Apollo Phone Webhook] 🧹 Found expired data in Firestore for:', personId);
          // Optional: delete expired doc
          db.collection('apollo_phones').doc(personId).delete().catch(() => {});
          return null;
        }
      }
    } catch (e) {
      logger.error('[Apollo Phone Webhook] getPhoneData Firestore error:', e);
    }
  }

  // Fallback to memory store
  const data = memoryStore.get(personId);
  if (data && new Date(data.expiresAt) > new Date()) {
    return data;
  }
  
  return null;
}
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






