// Call Status API - Efficient endpoint for checking if phone numbers, account IDs, or contact IDs have associated calls
// Returns lightweight boolean status without loading full call objects

import { cors } from './_cors.js';
import { db } from './_firebase.js';

// In-memory fallback store (for local/dev when Firestore isn't configured)
const memoryStore = new Map();

// Normalize phone number to last 10 digits
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

// Check if a phone number has calls in Firestore
async function hasCallsForPhone(phone, db) {
  if (!phone || phone.length !== 10) return false;
  
  try {
    if (db && db.collection) {
      // Query calls collection for this phone number
      const snapshot = await db.collection('calls')
        .where('to', '==', phone)
        .limit(1)
        .get();
      
      if (!snapshot.empty) return true;
      
      // Also check 'from' field
      const snapshot2 = await db.collection('calls')
        .where('from', '==', phone)
        .limit(1)
        .get();
      
      return !snapshot2.empty;
    } else {
      // Fallback to memory store
      for (const [_, call] of memoryStore) {
        if (normalizePhone(call.to) === phone || normalizePhone(call.from) === phone) {
          return true;
        }
      }
      return false;
    }
  } catch (error) {
    console.error('[CallStatus] Error checking phone:', phone, error);
    return false;
  }
}

// Check if an account ID has calls in Firestore
async function hasCallsForAccount(accountId, db) {
  if (!accountId) return false;
  
  try {
    if (db && db.collection) {
      const snapshot = await db.collection('calls')
        .where('accountId', '==', accountId)
        .limit(1)
        .get();
      
      return !snapshot.empty;
    } else {
      // Fallback to memory store
      for (const [_, call] of memoryStore) {
        if (call.accountId === accountId) {
          return true;
        }
      }
      return false;
    }
  } catch (error) {
    console.error('[CallStatus] Error checking account:', accountId, error);
    return false;
  }
}

// Check if a contact ID has calls in Firestore
async function hasCallsForContact(contactId, db) {
  if (!contactId) return false;
  
  try {
    if (db && db.collection) {
      const snapshot = await db.collection('calls')
        .where('contactId', '==', contactId)
        .limit(1)
        .get();
      
      return !snapshot.empty;
    } else {
      // Fallback to memory store
      for (const [_, call] of memoryStore) {
        if (call.contactId === contactId) {
          return true;
        }
      }
      return false;
    }
  } catch (error) {
    console.error('[CallStatus] Error checking contact:', contactId, error);
    return false;
  }
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
      // Handle GET request with query parameters (for backward compatibility)
      const url = new URL(req.url, `http://${req.headers.host}`);
      const phones = url.searchParams.get('phones') || '';
      const accountIds = url.searchParams.get('accountIds') || '';
      const contactIds = url.searchParams.get('contactIds') || '';

      // Parse comma-separated values
      phoneList = phones ? phones.split(',').map(p => normalizePhone(p.trim())).filter(p => p.length === 10) : [];
      accountIdList = accountIds ? accountIds.split(',').map(id => id.trim()).filter(Boolean) : [];
      contactIdList = contactIds ? contactIds.split(',').map(id => id.trim()).filter(Boolean) : [];
    }

    const result = {};

    // Check phone numbers
    for (const phone of phoneList) {
      result[phone] = await hasCallsForPhone(phone, db);
    }

    // Check account IDs
    for (const accountId of accountIdList) {
      result[accountId] = await hasCallsForAccount(accountId, db);
    }

    // Check contact IDs
    for (const contactId of contactIdList) {
      result[contactId] = await hasCallsForContact(contactId, db);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  } catch (error) {
    console.error('[CallStatus] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

