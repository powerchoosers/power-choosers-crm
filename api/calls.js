// Firestore-backed Calls API (GET recent calls, POST upsert by Call SID)
// Uses Firebase Admin via api/_firebase.js; falls back to in-memory map if Firestore unavailable

function corsMiddleware(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  next();
}

const { db } = require('./_firebase');

// In-memory fallback store (for local/dev when Firestore isn't configured)
const memoryStore = new Map();

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    try {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); }
      });
      req.on('error', reject);
    } catch (e) { resolve({}); }
  });
}

function normalizeCallForResponse(call) {
  // Normalize to the shape expected by scripts/pages/calls.js mapping
  return {
    id: call.id || call.callSid || call.twilioSid || '',
    to: call.to || '',
    from: call.from || '',
    status: call.status || '',
    duration: call.duration || call.durationSec || 0,
    timestamp: call.timestamp || call.callTime || new Date().toISOString(),
    callTime: call.callTime || call.timestamp || new Date().toISOString(),
    durationSec: call.durationSec != null ? call.durationSec : (call.duration || 0),
    outcome: call.outcome || (call.status === 'completed' ? 'Connected' : ''),
    transcript: call.transcript || '',
    aiSummary: (call.aiInsights && call.aiInsights.summary) || call.aiSummary || '',
    aiInsights: call.aiInsights || null,
    audioUrl: call.recordingUrl || call.audioUrl || ''
  };
}

async function getCallsFromFirestore(limit = 50) {
  if (!db) return null;
  const snap = await db.collection('calls').orderBy('timestamp', 'desc').limit(limit).get();
  const rows = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    rows.push(normalizeCallForResponse({ id: doc.id, ...data }));
  });
  return rows;
}

async function upsertCallInFirestore(payload) {
  if (!db) return null;
  const nowIso = new Date().toISOString();
  const id = (payload.callSid && String(payload.callSid)) || (payload.twilioSid && String(payload.twilioSid)) || (payload.id && String(payload.id));
  const callId = id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const current = (await db.collection('calls').doc(callId).get()).data() || {};

  const merged = {
    ...current,
    id: callId,
    callSid: payload.callSid || current.callSid || callId,
    twilioSid: payload.callSid || payload.twilioSid || current.twilioSid || callId,
    to: payload.to != null ? payload.to : current.to,
    from: payload.from != null ? payload.from : current.from,
    status: payload.status || current.status || 'initiated',
    duration: payload.duration != null ? payload.duration : (current.duration || 0),
    durationSec: payload.durationSec != null ? payload.durationSec : (current.durationSec != null ? current.durationSec : (payload.duration || current.duration || 0)),
    timestamp: current.timestamp || payload.callTime || payload.timestamp || nowIso,
    callTime: payload.callTime || current.callTime || current.timestamp || nowIso,
    outcome: payload.outcome || current.outcome,
    transcript: payload.transcript != null ? payload.transcript : current.transcript,
    aiInsights: payload.aiInsights != null ? payload.aiInsights : current.aiInsights || null,
    aiSummary: payload.aiSummary != null ? payload.aiSummary : current.aiSummary,
    recordingUrl: payload.recordingUrl != null ? payload.recordingUrl : current.recordingUrl,

    // CRM context passthrough
    accountId: payload.accountId != null ? payload.accountId : current.accountId,
    accountName: payload.accountName != null ? payload.accountName : current.accountName,
    contactId: payload.contactId != null ? payload.contactId : current.contactId,
    contactName: payload.contactName != null ? payload.contactName : current.contactName,
    targetPhone: payload.targetPhone != null ? payload.targetPhone : current.targetPhone,
    businessPhone: payload.businessPhone != null ? payload.businessPhone : current.businessPhone,
    source: payload.source || current.source || 'unknown',
    updatedAt: nowIso,
    createdAt: current.createdAt || nowIso
  };

  await db.collection('calls').doc(callId).set(merged, { merge: true });
  return normalizeCallForResponse(merged);
}

export default async function handler(req, res) {
  corsMiddleware(req, res, () => {});

  try {
    if (req.method === 'GET') {
      // Optional filter by Call SID
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const callSid = urlObj.searchParams.get('callSid');

      if (db) {
        if (callSid) {
          const snap = await db.collection('calls').doc(callSid).get();
          if (snap.exists) {
            const data = snap.data() || {};
            const one = normalizeCallForResponse({ id: snap.id, ...data });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, calls: [one] }));
            return;
          } else {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, calls: [] }));
            return;
          }
        }

        const calls = await getCallsFromFirestore(50);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, calls }));
        return;
      }

      // Fallback to memory store
      const calls = Array.from(memoryStore.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 50)
        .map(normalizeCallForResponse);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, calls }));
      return;
    }

    if (req.method === 'POST') {
      const payload = await readJson(req);

      if (db) {
        const saved = await upsertCallInFirestore(payload);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, call: saved }));
        return;
      }

      // Memory fallback upsert
      const nowIso = new Date().toISOString();
      const id = (payload.callSid && String(payload.callSid)) || (payload.twilioSid && String(payload.twilioSid)) || (payload.id && String(payload.id));
      const callId = id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const existing = memoryStore.get(callId) || {};
      const merged = {
        ...existing,
        id: callId,
        callSid: payload.callSid || existing.callSid || callId,
        twilioSid: payload.callSid || payload.twilioSid || existing.twilioSid || callId,
        to: payload.to != null ? payload.to : existing.to,
        from: payload.from != null ? payload.from : existing.from,
        status: payload.status || existing.status || 'initiated',
        duration: payload.duration != null ? payload.duration : (existing.duration || 0),
        durationSec: payload.durationSec != null ? payload.durationSec : (existing.durationSec != null ? existing.durationSec : (payload.duration || existing.duration || 0)),
        timestamp: existing.timestamp || payload.callTime || payload.timestamp || nowIso,
        callTime: payload.callTime || existing.callTime || existing.timestamp || nowIso,
        outcome: payload.outcome || existing.outcome,
        transcript: payload.transcript != null ? payload.transcript : existing.transcript,
        aiInsights: payload.aiInsights != null ? payload.aiInsights : existing.aiInsights || null,
        aiSummary: payload.aiSummary != null ? payload.aiSummary : existing.aiSummary,
        recordingUrl: payload.recordingUrl != null ? payload.recordingUrl : existing.recordingUrl,
        source: payload.source || existing.source || 'unknown'
      };
      memoryStore.set(callId, merged);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, call: normalizeCallForResponse(merged) }));
      return;
    }

    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (error) {
    try {
      console.error('[api/calls] Error:', error);
    } catch (_) {}
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Internal server error' }));
  }
}


