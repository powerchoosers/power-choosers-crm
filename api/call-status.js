// Call Status API - Efficient endpoint for checking if phone numbers, account IDs, or contact IDs have associated calls
// Returns lightweight boolean status without loading full call objects

import { cors } from './_cors.js';
import { db, admin } from './_firebase.js';

// Normalize phone number to last 10 digits
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

// Helper: per-user ownership check
function ownsDoc(data, ue) {
  try {
    const o = data && data.ownerId ? String(data.ownerId).toLowerCase() : '';
    const a = data && data.assignedTo ? String(data.assignedTo).toLowerCase() : '';
    const c = data && data.createdBy ? String(data.createdBy).toLowerCase() : '';
    return o === ue || a === ue || c === ue;
  } catch(_) { return false; }
}

// Check if a phone number has calls in Firestore
async function hasCallsForPhone(phone, db, userEmail, isAdmin) {
  if (!phone || phone.length !== 10) return false;
  
  try {
    if (db && db.collection) {
      // Prefer checking normalized targetPhone (stores last-10-digit number)
      const targetSnap = await db.collection('calls')
        .where('targetPhone', '==', phone)
        .limit(1)
        .get();

      if (!targetSnap.empty) {
        if (isAdmin) return true;
        const hit = targetSnap.docs.find(d => ownsDoc(d.data(), String(userEmail).toLowerCase()));
        if (hit) return true;
      }

      // Fallbacks for legacy records that may not have targetPhone set
      // Some older records may store 10-digit values in 'to'/'from'
      const toSnap = await db.collection('calls')
        .where('to', '==', phone)
        .limit(1)
        .get();

      if (!toSnap.empty) {
        if (isAdmin) return true;
        const hit = toSnap.docs.find(d => ownsDoc(d.data(), String(userEmail).toLowerCase()));
        if (hit) return true;
      }

      const fromSnap = await db.collection('calls')
        .where('from', '==', phone)
        .limit(1)
        .get();

      if (!fromSnap.empty) {
        if (isAdmin) return true;
        const hit = fromSnap.docs.find(d => ownsDoc(d.data(), String(userEmail).toLowerCase()));
        if (hit) return true;
      }
      return false;
    } else {
      // No Firestore available - return false (don't fall back to limited memory store)
      console.warn('[CallStatus] Firestore not available for phone check:', phone);
      return false;
    }
  } catch (error) {
    console.error('[CallStatus] Error checking phone:', phone, error);
    return false;
  }
}

// Check if an account ID has calls in Firestore
async function hasCallsForAccount(accountId, db, userEmail, isAdmin) {
  if (!accountId) return false;
  
  try {
    if (db && db.collection) {
      const snapshot = await db.collection('calls')
        .where('accountId', '==', accountId)
        .limit(1)
        .get();
      if (snapshot.empty) return false;
      if (isAdmin) return true;
      const hit = snapshot.docs.find(d => ownsDoc(d.data(), String(userEmail).toLowerCase()));
      return !!hit;
    } else {
      // No Firestore available - return false (don't fall back to limited memory store)
      console.warn('[CallStatus] Firestore not available for account check:', accountId);
      return false;
    }
  } catch (error) {
    console.error('[CallStatus] Error checking account:', accountId, error);
    return false;
  }
}

// Check if a contact ID has calls in Firestore
async function hasCallsForContact(contactId, db, userEmail, isAdmin) {
  if (!contactId) return false;
  
  try {
    if (db && db.collection) {
      const snapshot = await db.collection('calls')
        .where('contactId', '==', contactId)
        .limit(1)
        .get();
      if (snapshot.empty) return false;
      if (isAdmin) return true;
      const hit = snapshot.docs.find(d => ownsDoc(d.data(), String(userEmail).toLowerCase()));
      return !!hit;
    } else {
      // No Firestore available - return false (don't fall back to limited memory store)
      console.warn('[CallStatus] Firestore not available for contact check:', contactId);
      return false;
    }
  } catch (error) {
    console.error('[CallStatus] Error checking contact:', contactId, error);
    return false;
  }
}

// Helper function to parse query parameters from URL
function parseQueryParams(url) {
  const queryString = url.split('?')[1];
  if (!queryString) return {};

  return queryString.split('&').reduce((params, param) => {
    const [key, value] = param.split('=');
    params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    return params;
  }, {});
}

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    let phoneList = [];
    let accountIdList = [];
    let contactIdList = [];

    if (req.method === 'POST') {
      // Handle POST request with data in body
      const body = req.body || {};
      const phones = body.phones || [];
      const accountIds = body.accountIds || [];
      const contactIds = body.contactIds || [];

      phoneList = Array.isArray(phones) ? phones.map(p => normalizePhone(String(p).trim())).filter(p => p.length === 10) : [];
      accountIdList = Array.isArray(accountIds) ? accountIds.map(id => String(id).trim()).filter(Boolean) : [];
      contactIdList = Array.isArray(contactIds) ? contactIds.map(id => String(id).trim()).filter(Boolean) : [];
    } else {
      // Handle GET request with query parameters (Node.js HTTP doesn't have req.query)
      const queryParams = parseQueryParams(req.url || '');
      const phones = queryParams.phones || '';
      const accountIds = queryParams.accountIds || '';
      const contactIds = queryParams.contactIds || '';

      // Parse comma-separated values
      phoneList = phones ? phones.split(',').map(p => normalizePhone(p.trim())).filter(p => p.length === 10) : [];
      accountIdList = accountIds ? accountIds.split(',').map(id => id.trim()).filter(Boolean) : [];
      contactIdList = contactIds ? contactIds.split(',').map(id => id.trim()).filter(Boolean) : [];
    }

    // Auth: Require Firebase ID token; use for ownership scoping unless admin
    let userEmail = null;
    let isAdmin = false;
    try {
      const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
      if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice('Bearer '.length).trim();
        if (token) {
          const decoded = await admin.auth().verifyIdToken(token);
          userEmail = (decoded && decoded.email) ? String(decoded.email).toLowerCase() : null;
          isAdmin = userEmail === 'l.patterson@powerchoosers.com';
        }
      }
    } catch(_) { /* ignore */ }
    if (!userEmail) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const result = {};

    // Check phone numbers
    for (const phone of phoneList) {
      result[phone] = await hasCallsForPhone(phone, db, userEmail, isAdmin);
    }

    // Check account IDs
    for (const accountId of accountIdList) {
      result[accountId] = await hasCallsForAccount(accountId, db, userEmail, isAdmin);
    }

    // Check contact IDs
    for (const contactId of contactIdList) {
      result[contactId] = await hasCallsForContact(contactId, db, userEmail, isAdmin);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  } catch (error) {
    console.error('[CallStatus] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

