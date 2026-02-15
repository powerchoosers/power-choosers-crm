// Call Status API - Efficient endpoint for checking if phone numbers, account IDs, or contact IDs have associated calls
// Returns lightweight boolean status without loading full call objects

import { cors } from './_cors.js';
import logger from './_logger.js';
import { supabaseAdmin, requireUser } from './_supabase.js';

// Normalize phone number to last 10 digits
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

// Check if a phone number has calls in Supabase
async function hasCallsForPhone(phone, userEmail, isAdmin) {
  if (!phone || phone.length !== 10) return false;

  try {
    // Check both 'from' and 'to' columns. 
    // In Supabase, we can't easily do OR filter across columns in a simple count query without complex filters,
    // so we'll check 'from' first, then 'to' if needed.

    // Check 'from'
    let query = supabaseAdmin
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .or(`from.ilike.%${phone},to.ilike.%${phone}`);

    if (!isAdmin) {
      // Basic ownership check via metadata or ownerId if available
      // For this lightweight check, we'll assume if it exists it's visible if it matches the number
      // but strictly we should check if the user has access.
      // In the current CRM, calls are generally shared if you have access to the contact/account.
    }

    const { count, error } = await query;
    if (error) throw error;
    return count > 0;
  } catch (error) {
    logger.error('[CallStatus] Error checking phone:', phone, error);
    return false;
  }
}

// Check if an account ID has calls in Supabase
async function hasCallsForAccount(accountId, userEmail, isAdmin) {
  if (!accountId) return false;

  try {
    const { count, error } = await supabaseAdmin
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('accountId', accountId);

    if (error) throw error;
    return count > 0;
  } catch (error) {
    logger.error('[CallStatus] Error checking account:', accountId, error);
    return false;
  }
}

// Check if a contact ID has calls in Supabase
async function hasCallsForContact(contactId, userEmail, isAdmin) {
  if (!contactId) return false;

  try {
    const { count, error } = await supabaseAdmin
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('contactId', contactId);

    if (error) throw error;
    return count > 0;
  } catch (error) {
    logger.error('[CallStatus] Error checking contact:', contactId, error);
    return false;
  }
}

// Helper function to parse query parameters from URL
function parseQueryParams(url) {
  const parts = url.split('?');
  if (parts.length < 2) return {};
  const queryString = parts[1];

  return queryString.split('&').reduce((params, param) => {
    const [key, value] = param.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    return params;
  }, {});
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    let phoneList = [];
    let accountIdList = [];
    let contactIdList = [];

    if (req.method === 'POST') {
      const body = req.body || {};
      const { phones, accountIds, contactIds } = body;

      phoneList = Array.isArray(phones) ? phones.map(p => normalizePhone(String(p).trim())).filter(p => p.length === 10) : [];
      accountIdList = Array.isArray(accountIds) ? accountIds.map(id => String(id).trim()).filter(Boolean) : [];
      contactIdList = Array.isArray(contactIds) ? contactIds.map(id => String(id).trim()).filter(Boolean) : [];
    } else {
      const queryParams = parseQueryParams(req.url || '');
      const { phones, accountIds, contactIds } = queryParams;

      phoneList = phones ? phones.split(',').map(p => normalizePhone(p.trim())).filter(p => p.length === 10) : [];
      accountIdList = accountIds ? accountIds.split(',').map(id => id.trim()).filter(Boolean) : [];
      contactIdList = contactIds ? contactIds.split(',').map(id => id.trim()).filter(Boolean) : [];
    }

    // Auth: Require user via Supabase
    const { email: userEmail } = await requireUser(req);
    if (!userEmail) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const isAdmin = userEmail === 'l.patterson@nodalpoint.io';

    const result = {};

    // Check phone numbers
    for (const phone of phoneList) {
      result[phone] = await hasCallsForPhone(phone, userEmail, isAdmin);
    }

    // Check account IDs
    for (const accountId of accountIdList) {
      result[accountId] = await hasCallsForAccount(accountId, userEmail, isAdmin);
    }

    // Check contact IDs
    for (const contactId of contactIdList) {
      result[contactId] = await hasCallsForContact(contactId, userEmail, isAdmin);
    }

    res.status(200).json(result);

  } catch (error) {
    logger.error('[CallStatus] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

