// Account-specific calls API - Returns only calls relevant to a specific account
// Much more efficient than loading all calls and filtering client-side

import { cors } from '../../_cors.js';
import { db, admin } from '../../_firebase.js';
import logger from '../../_logger.js';

// In-memory fallback store (for local/dev when Firestore isn't configured)
const memoryStore = new Map();

// Normalize phone number to last 10 digits
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

// Extract authenticated user email from Authorization: Bearer <idToken>
async function getRequestUserEmail(req) {
  try {
    const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice('Bearer '.length).trim();
    if (!token) return null;
    const decoded = await admin.auth().verifyIdToken(token);
    const email = (decoded && decoded.email) ? String(decoded.email).toLowerCase() : null;
    return email || null;
  } catch (_) { return null; }
}

const ADMIN_EMAIL = 'l.patterson@powerchoosers.com';

// Derive outcome from call status and duration
function deriveOutcome(call) {
  const status = (call.status || '').toLowerCase();
  const duration = call.durationSec || call.duration || 0;
  const answeredBy = (call.answeredBy || '').toLowerCase();
  
  // If we have an explicit outcome, use it
  if (call.outcome) return call.outcome;
  
  // Derive from status
  if (status === 'completed') {
    if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence') {
      return 'Voicemail';
    }
    return duration > 0 ? 'Connected' : 'No Answer';
  }
  
  if (status === 'no-answer' || status === 'no_answer') return 'No Answer';
  if (status === 'busy') return 'Busy';
  if (status === 'failed') return 'Failed';
  if (status === 'canceled' || status === 'cancelled') return 'Canceled';
  
  // Default
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
}

function normalizeCallForResponse(call) {
  // Normalize to the shape expected by front-end pages while preserving IDs for mapping
  return {
    id: call.id || call.callSid || call.twilioSid || '',
    callSid: call.callSid || call.twilioSid || call.id || '',
    twilioSid: call.twilioSid || call.callSid || call.id || '',
    to: call.to || '',
    from: call.from || '',
    status: call.status || '',
    duration: call.duration || call.durationSec || 0,
    timestamp: call.timestamp || call.callTime || new Date().toISOString(),
    callTime: call.callTime || call.timestamp || new Date().toISOString(),
    durationSec: call.durationSec != null ? call.durationSec : (call.duration || 0),
    outcome: call.outcome || deriveOutcome(call),
    transcript: call.transcript || '',
    formattedTranscript: call.formattedTranscript || call.formatted_transcript || '',
    aiSummary: (call.aiInsights && call.aiInsights.summary) || call.aiSummary || '',
    aiInsights: call.aiInsights || null,
    audioUrl: call.recordingUrl || call.audioUrl || '',
    conversationalIntelligence: call.conversationalIntelligence || (call.aiInsights && call.aiInsights.conversationalIntelligence) || null,
    // Recording SID for CI processing
    recordingSid: call.recordingSid || call.recording_id || '',
    // Provide phones used by front-end for precise mapping
    targetPhone: call.targetPhone || '',
    businessPhone: call.businessPhone || '',
    // Recording metadata for dual-channel display
    recordingChannels: call.recordingChannels != null ? String(call.recordingChannels) : '',
    recordingTrack: call.recordingTrack || '',
    recordingSource: call.recordingSource || '',
    // CRM linkage for detail pages
    accountId: call.accountId || '',
    accountName: call.accountName || '',
    contactId: call.contactId || '',
    contactName: call.contactName || ''
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS
    try {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // AuthN: require a valid Firebase ID token
      const userEmail = await getRequestUserEmail(req);
      const isAdmin = userEmail === ADMIN_EMAIL;
      if (!userEmail) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const { accountId } = req.query;
      if (!accountId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Account ID is required' }));
        return;
      }

      // Get limit parameter (default 50 for recent calls)
      const url = new URL(req.url, `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit')) || 50;

      let allCalls = [];

      if (db && db.collection) {
        // Get account data to find company phone and related contacts
        const accountDoc = await db.collection('accounts').doc(accountId).get();
        if (!accountDoc.exists) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Account not found' }));
          return;
        }

        const accountData = accountDoc.data();
        const companyPhone = normalizePhone(accountData.companyPhone || accountData.phone || accountData.primaryPhone || accountData.mainPhone);
        
        // Get related contacts for this account
        const contactsSnapshot = await db.collection('contacts')
          .where('accountId', '==', accountId)
          .get();
        
        const contactIds = [];
        const contactPhones = new Set();
        
        contactsSnapshot.forEach(doc => {
          const contactData = doc.data();
          contactIds.push(doc.id);
          
          // Collect contact phone numbers
          if (contactData.mobile) contactPhones.add(normalizePhone(contactData.mobile));
          if (contactData.workDirectPhone) contactPhones.add(normalizePhone(contactData.workDirectPhone));
          if (contactData.otherPhone) contactPhones.add(normalizePhone(contactData.otherPhone));
        });

        // Query 1: Calls with matching accountId
        const accountCallsSnapshot = await db.collection('calls')
          .where('accountId', '==', accountId)
          .orderBy('timestamp', 'desc')
          .limit(limit)
          .get();

        accountCallsSnapshot.forEach(doc => { allCalls.push({ id: doc.id, ...doc.data() }); });

        // Query 2: Calls to/from company phone
        if (companyPhone && companyPhone.length === 10) {
          contactPhones.add(companyPhone);
          const companyCallsSnapshot = await db.collection('calls')
            .where('to', '==', companyPhone)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

          companyCallsSnapshot.forEach(doc => { allCalls.push({ id: doc.id, ...doc.data() }); });

          const companyCallsFromSnapshot = await db.collection('calls')
            .where('from', '==', companyPhone)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

          companyCallsFromSnapshot.forEach(doc => { allCalls.push({ id: doc.id, ...doc.data() }); });
        }

        // Query 3: Calls with matching contactIds
        if (contactIds.length > 0) {
          // Firestore 'in' queries are limited to 10 items, so we need to batch them
          const batchSize = 10;
          for (let i = 0; i < contactIds.length; i += batchSize) {
            const batch = contactIds.slice(i, i + batchSize);
            const contactCallsSnapshot = await db.collection('calls')
              .where('contactId', 'in', batch)
              .orderBy('timestamp', 'desc')
              .limit(limit)
              .get();

            contactCallsSnapshot.forEach(doc => { allCalls.push({ id: doc.id, ...doc.data() }); });
          }
        }

        // Query 4: Calls to/from contact phone numbers
        if (contactPhones.size > 0) {
          const contactPhonesArray = Array.from(contactPhones);
          const batchSize = 10;
          
          for (let i = 0; i < contactPhonesArray.length; i += batchSize) {
            const batch = contactPhonesArray.slice(i, i + batchSize);
            
            const contactPhoneCallsSnapshot = await db.collection('calls')
              .where('to', 'in', batch)
              .orderBy('timestamp', 'desc')
              .limit(limit)
              .get();

            contactPhoneCallsSnapshot.forEach(doc => { allCalls.push({ id: doc.id, ...doc.data() }); });

            const contactPhoneCallsFromSnapshot = await db.collection('calls')
              .where('from', 'in', batch)
              .orderBy('timestamp', 'desc')
              .limit(limit)
              .get();

            contactPhoneCallsFromSnapshot.forEach(doc => { allCalls.push({ id: doc.id, ...doc.data() }); });
            const targetPhoneCallsSnapshot = await db.collection('calls')
              .where('targetPhone', 'in', batch)
              .orderBy('timestamp', 'desc')
              .limit(limit)
              .get();

            targetPhoneCallsSnapshot.forEach(doc => { allCalls.push({ id: doc.id, ...doc.data() }); });
          }
        }

      } else {
        // Fallback to memory store
        for (const [_, call] of memoryStore) {
          if (call.accountId === accountId) {
            allCalls.push(call);
          }
        }
      }

      // Enforce ownership on server side for non-admins
      if (!isAdmin) {
        const ue = String(userEmail).toLowerCase();
        allCalls = allCalls.filter(c => {
          const o = c && c.ownerId ? String(c.ownerId).toLowerCase() : '';
          const a = c && c.assignedTo ? String(c.assignedTo).toLowerCase() : '';
          const cr = c && c.createdBy ? String(c.createdBy).toLowerCase() : '';
          return o === ue || a === ue || cr === ue;
        });
      }

      // Remove duplicates and sort by timestamp
      const uniqueCalls = [];
      const seenIds = new Set();
      
      allCalls.forEach(call => {
        if (!seenIds.has(call.id)) {
          seenIds.add(call.id);
          uniqueCalls.push(call);
        }
      });

      // Sort by timestamp (newest first) and limit results
      uniqueCalls.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.callTime || 0).getTime();
        const timeB = new Date(b.timestamp || b.callTime || 0).getTime();
        return timeB - timeA;
      });

      const finalCalls = uniqueCalls.slice(0, limit).map(normalizeCallForResponse);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        ok: true, 
        calls: finalCalls,
        total: finalCalls.length,
        accountId: accountId
      }));

  } catch (error) {
    logger.error('[Account Calls API] Caught unhandled error:', error);
    if (error instanceof Error) { // Ensure it's an Error object
      logger.error('Error name:', error.name);
      logger.error('Error message:', error.message);
      logger.error('Error stack:', error.stack);
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error', details: error.message })); // Expose message to client for debugging
    // REMEMBER TO REMOVE `details` IN PRODUCTION!
  }
}

