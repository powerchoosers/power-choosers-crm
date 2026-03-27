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

function getMetadataPhoneCandidates(metadata) {
  if (!metadata || typeof metadata !== 'object') return [];

  const candidates = [];
  const push = (val) => {
    if (val == null) return;
    if (Array.isArray(val)) {
      val.forEach(push);
      return;
    }
    candidates.push(String(val));
  };

  push(metadata.phone);
  push(metadata.mobile);
  push(metadata.workPhone);
  push(metadata.work_phone);
  push(metadata.companyPhone);
  push(metadata.company_phone);
  push(metadata.directPhone);
  push(metadata.direct_phone);
  push(metadata.workDirectPhone);
  push(metadata.otherPhone);
  push(metadata.other_phone);

  const general = metadata.general || {};
  push(general.phone);
  push(general.mobile);
  push(general.workPhone);
  push(general.companyPhone);
  push(general.directPhone);
  push(general.otherPhone);

  const contact = metadata.contact || {};
  push(contact.phone);
  push(contact.mobile);
  push(contact.workPhone);
  push(contact.companyPhone);
  push(contact.directPhone);
  push(contact.otherPhone);

  return candidates;
}

function contactMatchesPhone(contactRow, searchDigits) {
  const direct = [
    contactRow?.mobile,
    contactRow?.workPhone,
    contactRow?.otherPhone,
    contactRow?.companyPhone,
    contactRow?.directPhone,
    contactRow?.phone
  ];
  const metadataCandidates = getMetadataPhoneCandidates(contactRow?.metadata || {});
  return [...direct, ...metadataCandidates].some((v) => norm10(v) === searchDigits);
}

function accountMatchesPhone(accountRow, searchDigits) {
  const metadataCandidates = getMetadataPhoneCandidates(accountRow?.metadata || {});
  return [accountRow?.phone, ...metadataCandidates].some((v) => norm10(v) === searchDigits);
}

function applyLegacyOwnershipScope(query, user, isAdmin) {
  if (isAdmin) return query;

  const uid = user?.id ? String(user.id).trim() : '';
  const email = user?.email ? String(user.email).toLowerCase().trim() : '';

  if (uid && email) {
    return query.or(`ownerId.eq.${uid},ownerId.eq.${email},metadata->>ownerId.eq.${email},ownerId.is.null`);
  }
  if (uid) return query.or(`ownerId.eq.${uid},ownerId.is.null`);
  if (email) return query.or(`ownerId.eq.${email},metadata->>ownerId.eq.${email},ownerId.is.null`);
  return query;
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

      const orQuery = `mobile.eq.${searchDigits},workPhone.eq.${searchDigits},otherPhone.eq.${searchDigits},companyPhone.eq.${searchDigits},phone.eq.${searchDigits}`;

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
          companyPhone,
          phone, 
          metadata,
          accountId,
          city,
          state,
          accounts ( name, domain, logo_url, metadata, industry )
        `)
        .or(orQuery);

      query = applyLegacyOwnershipScope(query, user, isAdmin);

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
          industry: data.accounts?.industry || data.accounts?.metadata?.industry || '',
          avatarUrl: data.metadata?.photoUrl || data.metadata?.photo_url || data.metadata?.avatarUrl || data.metadata?.avatar_url || data.metadata?.original_apollo_data?.photoUrl || '',
          domain: data.accounts?.domain || data.accounts?.metadata?.domain || data.accounts?.metadata?.general?.domain || '',
          logoUrl: data.accounts?.logo_url || data.accounts?.metadata?.logo_url || data.accounts?.metadata?.logoUrl || ''
        };
      } else if (error) {
        // If error is likely due to missing columns, we might try a fallback or just log it.
        // For now, we assume the schema is correct.
        logger.warn('[Search] Contact search error (possibly missing columns):', error.message);
      }

      // Fallback path: if exact DB equality misses formatted numbers, normalize in memory.
      if (!contactResult) {
        logger.log('[Search] Contact exact-match miss; running normalized fallback scan...');
        let fallbackQuery = supabaseAdmin
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
            companyPhone,
            phone, 
            metadata,
            accountId,
            city,
            state,
            accounts ( name, domain, logo_url, metadata, industry )
          `)
          .or('mobile.not.is.null,workPhone.not.is.null,otherPhone.not.is.null,phone.not.is.null')
          .limit(2000);

        fallbackQuery = applyLegacyOwnershipScope(fallbackQuery, user, isAdmin);

        const { data: fallbackContacts, error: fallbackError } = await fallbackQuery;
        if (fallbackError) {
          logger.warn('[Search] Contact fallback scan failed:', fallbackError.message);
        } else if (Array.isArray(fallbackContacts) && fallbackContacts.length) {
          const matched = fallbackContacts.find((row) => contactMatchesPhone(row, searchDigits));
          if (matched) {
            logger.log('[Search] Contact fallback matched:', matched.id);
            contactResult = {
              id: matched.id,
              contactId: matched.id,
              name: `${matched.firstName || ''} ${matched.lastName || ''}`.trim(),
              firstName: matched.firstName || '',
              lastName: matched.lastName || '',
              title: matched.title || '',
              email: matched.email || '',
              mobile: matched.mobile || '',
              workDirectPhone: matched.workPhone || '',
              otherPhone: matched.otherPhone || '',
              account: matched.accounts?.name || '',
              accountId: matched.accountId || '',
              city: matched.city || '',
              state: matched.state || '',
              industry: matched.accounts?.industry || matched.accounts?.metadata?.industry || '',
              avatarUrl: matched.metadata?.photoUrl || matched.metadata?.photo_url || matched.metadata?.avatarUrl || matched.metadata?.avatar_url || matched.metadata?.original_apollo_data?.photoUrl || '',
              domain: matched.accounts?.domain || matched.accounts?.metadata?.domain || matched.accounts?.metadata?.general?.domain || '',
              logoUrl: matched.accounts?.logo_url || matched.accounts?.metadata?.logo_url || matched.accounts?.metadata?.logoUrl || ''
            };
          }
        }
      }
    } catch (e) {
      logger.error('[Search] Error searching contacts:', e.message);
    }

    // Search Accounts (if no contact found)
    if (!contactResult) {
      try {
        logger.log('[Search] Querying accounts by phone fields...');

        const orQueryAccount = `phone.eq.${searchDigits}`;

        let accountQuery = supabaseAdmin
          .from('accounts')
          .select('id, name, phone, city, state, industry, domain, logo_url, metadata')
          .or(orQueryAccount);

        accountQuery = applyLegacyOwnershipScope(accountQuery, user, isAdmin);

        const { data: accounts, error } = await accountQuery.limit(1);

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
            industry: data.industry || data.metadata?.industry || '',
            domain: data.domain || data.metadata?.domain || data.metadata?.general?.domain || '',
            logoUrl: data.logo_url || data.metadata?.logo_url || data.metadata?.logoUrl || ''
          };
        }

        if (!accountResult) {
          logger.log('[Search] Account exact-match miss; running normalized fallback scan...');
          let accountFallbackQuery = supabaseAdmin
            .from('accounts')
            .select('id, name, phone, city, state, industry, domain, logo_url, metadata')
            .or('phone.not.is.null')
            .limit(2000);

          accountFallbackQuery = applyLegacyOwnershipScope(accountFallbackQuery, user, isAdmin);

          const { data: fallbackAccounts, error: fallbackAccountError } = await accountFallbackQuery;
          if (fallbackAccountError) {
            logger.warn('[Search] Account fallback scan failed:', fallbackAccountError.message);
          } else if (Array.isArray(fallbackAccounts) && fallbackAccounts.length) {
            const matchedAccount = fallbackAccounts.find((row) => accountMatchesPhone(row, searchDigits));
            if (matchedAccount) {
              logger.log('[Search] Account fallback matched:', matchedAccount.id);
              accountResult = {
                id: matchedAccount.id,
                accountId: matchedAccount.id,
                name: matchedAccount.name || '',
                companyPhone: matchedAccount.phone || '',
                city: matchedAccount.city || '',
                state: matchedAccount.state || '',
                industry: matchedAccount.industry || matchedAccount.metadata?.industry || '',
                domain: matchedAccount.domain || matchedAccount.metadata?.domain || matchedAccount.metadata?.general?.domain || '',
                logoUrl: matchedAccount.logo_url || matchedAccount.metadata?.logo_url || matchedAccount.metadata?.logoUrl || ''
              };
            }
          }
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
