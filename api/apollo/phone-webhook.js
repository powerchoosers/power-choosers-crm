/**
 * Apollo Phone Number Webhook Endpoint
 *
 * Apollo sends phone numbers asynchronously to this webhook URL.
 * We store them temporarily in memory and optionally persist to Firebase.
 * We also update the linked contact in Supabase so the number appears on the
 * contact dossier even if the user left the page (background link).
 */

import { cors, formatPhoneForContact } from './_utils.js';
import { db } from '../_firebase.js';
import { supabaseAdmin } from '../_supabase.js';

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
    // Apollo sends the phone data in the request body
    let phoneData = req.body;

    if (!phoneData || !phoneData.person) {
      // Check if the body itself is the person object (sometimes Apollo sends flattened structure)
      if (phoneData && phoneData.id && (phoneData.phone_numbers || phoneData.email)) {
        phoneData = { person: phoneData };
      } else if (phoneData && phoneData.matches) {
         // Handle potential matches array
         if (phoneData.matches.length > 0) {
            phoneData = { person: phoneData.matches[0] };
         }
      } else if (phoneData && phoneData.people && Array.isArray(phoneData.people)) {
         // Handle people array (bulk enrichment format)
         if (phoneData.people.length > 0) {
            phoneData = { person: phoneData.people[0] };
         }
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid webhook payload - no person data' }));
        return;
      }
    }

    if (!phoneData.person) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook payload - structure found but empty' }));
      return;
    }

    const personId = phoneData.person.id;
    if (!personId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook payload - no person ID' }));
      return;
    }

    // Extract phone numbers
    const phones = phoneData.person.phone_numbers || [];

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
      } catch (dbError) {
        // Fallback to memory
        memoryStore.set(personId, payload);
      }
    } else {
      // Fallback to memory for local dev
      memoryStore.set(personId, payload);
    }

    // Link phones to contact in Supabase (background: works even if user left the page)
    if (personId && Array.isArray(phones) && phones.length > 0 && supabaseAdmin) {
      try {
        const { data: contactRow } = await supabaseAdmin
          .from('contacts')
          .select('id')
          .eq('metadata->>apollo_person_id', personId)
          .maybeSingle();
        if (contactRow?.id) {
          const numbers = phones
            .map(p => p.sanitized_number || p.raw_number)
            .filter(Boolean)
            .map(formatPhoneForContact)
            .filter(Boolean);
          const update = {};
          if (numbers[0]) update.phone = numbers[0];
          if (numbers[1]) update.mobile = numbers[1];
          if (numbers[2]) update.workPhone = numbers[2];
          if (Object.keys(update).length > 0) {
            update.updatedAt = new Date().toISOString();
            await supabaseAdmin.from('contacts').update(update).eq('id', contactRow.id);
          }
        }
      } catch (dbErr) {
        console.error('[phone-webhook] Supabase contact update failed:', dbErr);
      }
    }

    // Respond to Apollo
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Phone numbers received',
      personId
    }));

  } catch (error) {
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
          // Optional: delete expired doc
          db.collection('apollo_phones').doc(personId).delete().catch(() => {});
          return null;
        }
      }
    } catch (e) {
    }
  }

  // Fallback to memory store
  const data = memoryStore.get(personId);
  if (data && new Date(data.expiresAt) > new Date()) {
    return data;
  }
  
  return null;
}

