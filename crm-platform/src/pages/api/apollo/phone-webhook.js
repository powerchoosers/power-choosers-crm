/**
 * Apollo Phone Number Webhook Endpoint
 *
 * Apollo sends phone numbers asynchronously to this webhook URL.
 * we update the linked contact in Supabase so the number appears on the
 * contact dossier even if the user left the page (background link).
 */

import { cors, formatPhoneForContact } from './_utils.js';
import { supabaseAdmin } from '@/lib/supabase';

// In-memory fallback (only for local dev or temporary cache)
const memoryStore = new Map();

// Store phone data for 30 minutes
const PHONE_DATA_TTL_MS = 30 * 60 * 1000;

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;

  // Only accept POST requests from Apollo
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Apollo sends the phone data in the request body
    let phoneData = req.body;

    if (!phoneData || !phoneData.person) {
      if (phoneData && phoneData.id && (phoneData.phone_numbers || phoneData.email)) {
        phoneData = { person: phoneData };
      } else if (phoneData && phoneData.matches && phoneData.matches.length > 0) {
        phoneData = { person: phoneData.matches[0] };
      } else if (phoneData && phoneData.people && Array.isArray(phoneData.people) && phoneData.people.length > 0) {
        phoneData = { person: phoneData.people[0] };
      } else {
        res.status(400).json({ error: 'Invalid webhook payload' });
        return;
      }
    }

    const personId = phoneData.person.id;
    if (!personId) {
      res.status(400).json({ error: 'Invalid webhook payload - no person ID' });
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

    // Store in memory (temporary cache for active sessions)
    memoryStore.set(personId, payload);

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
          if (numbers[0]) {
            update.phone = numbers[0];
            update.mobile = numbers[0];
          }
          if (numbers[1]) update.workPhone = numbers[1];
          if (numbers[2]) update.otherPhone = numbers[2];

          if (Object.keys(update).length > 0) {
            update.updatedAt = new Date().toISOString();
            await supabaseAdmin.from('contacts').update(update).eq('id', contactRow.id);
          }
        }
      } catch (dbErr) {
        console.error('[phone-webhook] Supabase contact update failed:', dbErr);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Phone numbers received',
      personId
    });

  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}

// Export function to retrieve phone data (asynchronous)
export async function getPhoneData(personId) {
  const data = memoryStore.get(personId);
  if (data && new Date(data.expiresAt) > new Date()) {
    return data;
  }
  return null;
}

