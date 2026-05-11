/**
 * Apollo Phone Number Webhook Endpoint
 *
 * Apollo sends phone numbers asynchronously to this webhook URL.
 * we update the linked contact in Supabase so the number appears on the
 * contact dossier even if the user left the page (background link).
 */

import { cors, formatPhoneForContact, requireApolloWebhookSecret } from './_utils.js';
import { supabaseAdmin } from '@/lib/supabase';

// Store phone data for 30 minutes
const PHONE_DATA_TTL_MS = 30 * 60 * 1000;

function mapPhonesToContactUpdate(phones) {
  const normalized = (Array.isArray(phones) ? phones : [])
    .map((p) => {
      const raw = p?.sanitized_number || p?.raw_number;
      const number = formatPhoneForContact(raw);
      if (!number) return null;
      const type = String(p?.type || p?.type_cd || '').toLowerCase();
      return { number, type };
    })
    .filter(Boolean);

  const seen = new Set();
  const unique = [];
  normalized.forEach((p) => {
    const key = `${p.number}|${p.type || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(p);
  });

  const update = {};
  const extras = [];
  const slots = { mobile: false, work: false, other: false };

  unique.forEach((p) => {
    if (p.type.includes('mobile')) {
      if (!slots.mobile) {
        update.mobile = p.number;
        update.phone = p.number;
        slots.mobile = true;
      } else {
        extras.push(p);
      }
      return;
    }

    if (p.type.includes('direct') || p.type.includes('work')) {
      if (!slots.work) {
        update.workPhone = p.number;
        slots.work = true;
      } else {
        extras.push(p);
      }
      return;
    }

    if (!slots.other) {
      update.otherPhone = p.number;
      slots.other = true;
    } else {
      extras.push(p);
    }
  });

  if (!update.mobile && unique[0]?.number) {
    update.mobile = unique[0].number;
  }
  if (!update.phone) {
    update.phone = update.mobile || unique[0]?.number || update.workPhone || update.otherPhone || '';
  }

  return { update, unique, extras };
}

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;

  console.log('[phone-webhook] Received webhook call:', {
    method: req.method,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : []
  });

  // Only accept POST requests from Apollo
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!requireApolloWebhookSecret(req, res)) return;

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

    // Link phones to contact in Supabase (background: works even if user left the page)
    if (personId && Array.isArray(phones) && phones.length > 0 && supabaseAdmin) {
      try {
        // 1. Store in Supabase persistent cache for polling (fixes Vercel statelessness)
        await supabaseAdmin.from('apollo_searches').upsert({
          key: `webhook_phone_${personId}`,
          data: payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

        // 2. Direct update to contact record
        const { data: contactRow } = await supabaseAdmin
          .from('contacts')
          .select('id, metadata')
          .eq('metadata->>apollo_person_id', personId)
          .maybeSingle();

        console.log('[phone-webhook] Contact lookup result:', {
          personId,
          foundContact: !!contactRow,
          contactId: contactRow?.id,
          phonesCount: phones.length
        });

        if (contactRow?.id) {
          const { update, unique, extras } = mapPhonesToContactUpdate(phones);
          
          console.log('[phone-webhook] Phone mapping result:', {
            contactId: contactRow.id,
            update,
            unique,
            extras
          });
          
          const existingMetadata = (contactRow.metadata && typeof contactRow.metadata === 'object') ? contactRow.metadata : {};
          update.metadata = {
            ...existingMetadata,
            apollo_revealed_phones: unique,
            apollo_overflow_phones: extras
          };

          if (Object.keys(update).length > 0) {
            update.updatedAt = new Date().toISOString();
            const { error: updateError } = await supabaseAdmin.from('contacts').update(update).eq('id', contactRow.id);
            
            console.log('[phone-webhook] Contact update result:', {
              contactId: contactRow.id,
              success: !updateError,
              error: updateError?.message
            });
          }
        } else {
          console.log('[phone-webhook] No contact found with apollo_person_id:', personId);
        }
      } catch (dbErr) {
        console.error('[phone-webhook] Supabase operations failed:', dbErr);
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
// Now queries Supabase instead of memory to support Vercel serverless
export async function getPhoneData(personId) {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('apollo_searches')
      .select('data')
      .eq('key', `webhook_phone_${personId}`)
      .maybeSingle();

    if (error || !data?.data) return null;

    const payload = data.data;
    if (payload.expiresAt && new Date(payload.expiresAt) > new Date()) {
      return payload;
    }
    return null;
  } catch (err) {
    console.error('[phone-webhook] getPhoneData failed:', err);
    return null;
  }
}




