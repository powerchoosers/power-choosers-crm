// CRM phone number search endpoint
// Searches contacts and accounts by phone number across multiple fields
// Migrated from Firestore to Supabase (PostgreSQL)

import { cors } from './_cors.js';
import { supabaseAdmin, requireUser } from '@/lib/supabase';
import logger from './_logger.js';

// In-memory fallback is not feasible for global search across all data, 
// so we only support Supabase or return empty.
const isSupabaseEnabled = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// Normalize phone to last 10 digits for comparison
function norm10(v) {
  try {
    return (v == null ? '' : String(v)).replace(/\D/g, '').slice(-10);
  } catch (_) {
    return '';
  }
}

export default async function handler(req, res) {
  cors(req, res);

  // Handle non-GET methods gracefully
  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      success: false,
      message: 'Phone search is currently disabled'
    }));
    return;
  }

  try {
    const { user, isAdmin } = await requireUser(req);
    if (!isAdmin && !user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const phoneNumber = urlObj.searchParams.get('phone');

    logger.log('[Search] Incoming request for phone:', phoneNumber);

    if (!phoneNumber) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        success: false,
        contact: null,
        account: null
      }));
      return;
    }

    const searchDigits = norm10(phoneNumber);

    if (!searchDigits || searchDigits.length < 10) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid phone number' }));
      return;
    }

    logger.log('[Search] Normalized search digits:', searchDigits);

    if (!isSupabaseEnabled) {
      logger.error('[Search] Supabase not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Database not available',
        details: 'Supabase credentials missing'
      }));
      return;
    }

    let contactResult = null;
    let accountResult = null;

    // Search Contacts
    try {
      logger.log('[Search] Querying contacts by phone fields...');

      const orQuery = `mobile.eq.${searchDigits},workPhone.eq.${searchDigits},otherPhone.eq.${searchDigits},phone.eq.${searchDigits}`;

      let query = supabaseAdmin
        .from('contacts')
        .select(`
          id, 
          firstName, 
          lastName, 
          title, 
          email, 
          mobile, 
          workPhone, 
          otherPhone, 
          phone, 
          accountId,
          city,
          state,
          accounts ( name, domain, logo_url )
        `)
        .or(orQuery);

      if (!isAdmin) {
        query = query.eq('ownerId', user.email);
      }

      const { data: contacts, error } = await query.limit(1);

      if (!error && contacts && contacts.length > 0) {
        const data = contacts[0];
        logger.log('[Search] Found matching contact:', data.id);

        contactResult = {
          id: data.id,
          contactId: data.id,
          name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          title: data.title || '',
          email: data.email || '',
          mobile: data.mobile || '',
          workDirectPhone: data.workPhone || '',
          otherPhone: data.otherPhone || '',
          // Use joined account data if available
          account: data.accounts?.name || '',
          accountId: data.accountId || '',
          city: data.city || '',
          state: data.state || '',
          domain: data.accounts?.domain || '',
          logoUrl: data.accounts?.logo_url || ''
        };
      } else if (error) {
        // If error is likely due to missing columns, we might try a fallback or just log it.
        // For now, we assume the schema is correct.
        logger.warn('[Search] Contact search error (possibly missing columns):', error.message);
      }
    } catch (e) {
      logger.error('[Search] Error searching contacts:', e.message);
    }

    // Search Accounts (if no contact found, or even if found? Legacy logic searched both but prioritized contact return)
    // Legacy logic: if contactResult -> return it. If not -> return accountResult.

    if (!contactResult) {
      try {
        logger.log('[Search] Querying accounts by phone fields...');

        const orQueryAccount = `phone.eq.${searchDigits}`;

        const { data: accounts, error } = await supabaseAdmin
          .from('accounts')
          .select('id, name, phone, city, state, domain, logo_url')
          .or(orQueryAccount)
          .limit(1);

        if (!error && accounts && accounts.length > 0) {
          const data = accounts[0];
          logger.log('[Search] Found matching account:', data.id);

          accountResult = {
            id: data.id,
            accountId: data.id,
            name: data.name || '',
            companyPhone: data.phone || '',
            city: data.city || '',
            state: data.state || '',
            domain: data.domain || '',
            logoUrl: data.logo_url || ''
          };
        }
      } catch (e) {
        logger.error('[Search] Error searching accounts:', e.message);
      }
    }

    // Return results
    if (contactResult) {
      logger.log('[Search] Returning contact result');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        contact: contactResult,
        account: accountResult || null
      }));
      return;
    }

    if (accountResult) {
      logger.log('[Search] Returning account result');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        contact: null,
        account: accountResult
      }));
      return;
    }

    logger.log('[Search] No results found - returning 404');
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Phone number not found in CRM'
    }));
    return;

  } catch (error) {
    logger.error('[Search] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Search failed',
      details: error.message
    }));
    return;
  }
}
