/**
 * Apollo Phone Retrieval Endpoint
 * 
 * Used by the frontend to poll for phone numbers that were delivered asynchronously
 * to the phone-webhook endpoint.
 */

import { cors, requireApolloAuth } from './_utils.js';
import { getPhoneData } from './phone-webhook.js';
import { supabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  // Only accept GET requests
  
  const auth = await requireApolloAuth(req, res);
  if (!auth) return;

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
      // Check if contact was recently updated by webhook (within last 2 minutes)
      // This handles the case where webhook already updated the contact directly
      try {
        const { data: contact } = await supabaseAdmin
          .from('contacts')
          .select('id, metadata, mobile, workPhone, otherPhone, companyPhone, updatedAt')
          .eq('metadata->>apollo_person_id', personId)
          .maybeSingle();
        
        if (contact) {
          const updatedAt = new Date(contact.updatedAt);
          const now = new Date();
          const ageSeconds = (now.getTime() - updatedAt.getTime()) / 1000;
          
          // If contact was updated in last 2 minutes and has phones, assume webhook delivered them
          const hasPhones = !!(contact.mobile || contact.workPhone || contact.otherPhone);
          const recentlyUpdated = ageSeconds < 120;
          
          if (hasPhones && recentlyUpdated) {
            // Extract phones from contact record
            const phones = [];
            if (contact.mobile) phones.push({ sanitized_number: contact.mobile, type: 'mobile' });
            if (contact.workPhone) phones.push({ sanitized_number: contact.workPhone, type: 'work_direct' });
            if (contact.otherPhone) phones.push({ sanitized_number: contact.otherPhone, type: 'other' });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              ready: true, 
              phones,
              source: 'contact_record'
            }));
            return;
          }
        }
      } catch (err) {
        console.error('[phone-retrieve] Failed to check contact record:', err);
      }
      
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




