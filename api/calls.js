// Firestore-backed Calls API (GET recent calls, POST upsert by Call SID)
// Uses Firebase Admin via api/_firebase.js; falls back to in-memory map if Firestore unavailable

function corsMiddleware(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  next();
}

import { db } from './_firebase.js';
import { resolveToCallSid, isCallSid } from './_twilio-ids.js';

// In-memory fallback store (for local/dev when Firestore isn't configured)
const memoryStore = new Map();

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

function norm10(v) {
  try { return (v == null ? '' : String(v)).replace(/\D/g, '').slice(-10); } catch(_) { return ''; }
}

function pickBusinessAndTarget({ to, from, targetPhone, businessPhone }) {
  const to10 = norm10(to);
  const from10 = norm10(from);
  const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
    .split(',').map(norm10).filter(Boolean);
  const isBiz = (p) => !!p && envBiz.includes(p);
  const biz = businessPhone || (isBiz(to10) ? to : (isBiz(from10) ? from : ''));
  const tgt = targetPhone || (isBiz(to10) && !isBiz(from10) ? from10 : (isBiz(from10) && !isBiz(to10) ? to10 : (to10 || from10)));
  return { businessPhone: biz || '', targetPhone: tgt || '' };
}

async function getCallsFromFirestore(limit = 0) {
  if (!db) return null;
  let q = db.collection('calls').orderBy('timestamp', 'desc');
  if (limit && Number(limit) > 0) q = q.limit(Number(limit));
  const snap = await q.get();
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
  // Resolve a proper Twilio Call SID. Never create a document without a valid Call SID.
  let callId = (payload.callSid && String(payload.callSid)) || '';
  if (!isCallSid(callId)) {
    try {
      callId = await resolveToCallSid({
        callSid: payload.callSid,
        recordingSid: payload.recordingSid,
        transcriptSid: payload.transcriptSid
      });
    } catch (_) {}
  }
  if (!isCallSid(callId)) {
    // No valid Call SID → do not persist to Firestore
    return null;
  }

  // Compute normalized phone context (for enrichment only; do NOT merge across calls)
  const context = pickBusinessAndTarget({
    to: payload.to,
    from: payload.from,
    targetPhone: payload.targetPhone,
    businessPhone: payload.businessPhone
  });

  // Strict policy: upsert by Call SID only; do not cross-merge by phone pair
  // Try exact doc first
  const currentSnap = await db.collection('calls').doc(callId).get();
  const current = currentSnap.exists ? (currentSnap.data() || {}) : {};

  const primaryId = callId;

  const merged = {
    ...current,
    id: primaryId,
    callSid: primaryId,
    twilioSid: primaryId,
    to: payload.to != null ? payload.to : current.to,
    from: payload.from != null ? payload.from : current.from,
    status: payload.status || current.status || 'initiated',
    duration: payload.duration != null ? payload.duration : (current.duration || 0),
    durationSec: payload.durationSec != null ? payload.durationSec : (current.durationSec != null ? current.durationSec : (payload.duration || current.duration || 0)),
    timestamp: current.timestamp || payload.callTime || payload.timestamp || nowIso,
    callTime: payload.callTime || current.callTime || current.timestamp || nowIso,
        outcome: payload.outcome || current.outcome || deriveOutcome({...current, ...payload}),
    transcript: payload.transcript != null ? payload.transcript : current.transcript,
    formattedTranscript: payload.formattedTranscript != null ? payload.formattedTranscript : current.formattedTranscript,
    aiInsights: payload.aiInsights != null ? payload.aiInsights : current.aiInsights || null,
    aiSummary: payload.aiSummary != null ? payload.aiSummary : current.aiSummary,
    recordingUrl: payload.recordingUrl != null ? payload.recordingUrl : current.recordingUrl,
    recordingChannels: payload.recordingChannels != null ? payload.recordingChannels : current.recordingChannels,
    recordingTrack: payload.recordingTrack != null ? payload.recordingTrack : current.recordingTrack,
    recordingSource: payload.recordingSource != null ? payload.recordingSource : current.recordingSource,
    conversationalIntelligence: (payload.conversationalIntelligence != null ? payload.conversationalIntelligence : (payload.aiInsights && payload.aiInsights.conversationalIntelligence)) != null ? (payload.conversationalIntelligence || (payload.aiInsights && payload.aiInsights.conversationalIntelligence)) : current.conversationalIntelligence,

    // CRM context passthrough
    accountId: payload.accountId != null ? payload.accountId : current.accountId,
    accountName: payload.accountName != null ? payload.accountName : current.accountName,
    contactId: payload.contactId != null ? payload.contactId : current.contactId,
    contactName: payload.contactName != null ? payload.contactName : current.contactName,
    targetPhone: (payload.targetPhone != null ? payload.targetPhone : (current.targetPhone || context.targetPhone)) || '',
    businessPhone: (payload.businessPhone != null ? payload.businessPhone : (current.businessPhone || context.businessPhone)) || '',
    source: payload.source || current.source || 'unknown',
    updatedAt: nowIso,
    createdAt: current.createdAt || nowIso
  };

  await db.collection('calls').doc(primaryId).set(merged, { merge: true });

  return normalizeCallForResponse(merged);
}

export default async function handler(req, res) {
  corsMiddleware(req, res, () => {});

  try {
    if (req.method === 'GET') {
      // Optional filter by Call SID
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const callSid = urlObj.searchParams.get('callSid');
      const limit = parseInt(urlObj.searchParams.get('limit')) || 0;
      const offset = parseInt(urlObj.searchParams.get('offset')) || 0;

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

        // Support pagination with limit and offset
        let q = db.collection('calls').orderBy('timestamp', 'desc');
        if (limit > 0) {
          q = q.limit(limit);
        }
        if (offset > 0) {
          q = q.offset(offset);
        }
        
        const snap = await q.get();
        const calls = [];
        snap.forEach((doc) => {
          const data = doc.data() || {};
          calls.push(normalizeCallForResponse({ id: doc.id, ...data }));
        });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, calls, hasMore: calls.length === limit }));
        return;
      }

      // Fallback to memory store
      const calls = Array.from(memoryStore.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map(normalizeCallForResponse);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, calls }));
      return;
    }

    if (req.method === 'DELETE') {
      // Support bulk or single delete by Call SID (id)
      let body = {};
      try { body = await readJson(req); } catch(_) { body = {}; }
      const ids = [];
      const pushId = (v) => { if (typeof v === 'string' && v.trim()) ids.push(v.trim()); };
      pushId(body.id);
      pushId(body.callSid);
      pushId(body.twilioSid);
      if (Array.isArray(body.ids)) body.ids.forEach(pushId);
      // If no body (e.g., some clients send query ids), check query param
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const qId = urlObj.searchParams.get('id');
      const qCallSid = urlObj.searchParams.get('callSid');
      const qTwilio = urlObj.searchParams.get('twilioSid');
      [qId, qCallSid, qTwilio].forEach(pushId);

      // Resolve to valid Call SIDs; also keep raw ids list to purge legacy docs
      const resolved = [];
      for (const raw of ids) {
        let sid = raw;
        if (!isCallSid(sid)) {
          try { sid = await resolveToCallSid({ callSid: raw, recordingSid: body.recordingSid, transcriptSid: body.transcriptSid }); } catch(_) {}
        }
        if (isCallSid(sid)) resolved.push(sid);
      }

      if (db) {
        let deleted = 0;
        // Delete exact Call SID docs
        for (const sid of resolved) {
          try { await db.collection('calls').doc(sid).delete(); deleted++; } catch(_) {}
        }
        // Attempt cleanup of any legacy/non-SID ids that match raw inputs
        for (const raw of ids) {
          if (isCallSid(raw)) continue;
          try { await db.collection('calls').doc(raw).delete(); deleted++; } catch(_) {}
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, deleted, requested: ids.length }));
        return;
      }

      // Memory fallback
      let deleted = 0;
      for (const sid of resolved) { if (memoryStore.has(sid)) { memoryStore.delete(sid); deleted++; } }
      for (const raw of ids) { if (!isCallSid(raw) && memoryStore.has(raw)) { memoryStore.delete(raw); deleted++; } }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, deleted, requested: ids.length }));
      return;
    }

    if (req.method === 'POST') {
      const payload = await readJson(req);

      // Strict de-dup policy: only persist when we have a valid Twilio Call SID
      let callId = (payload.callSid && String(payload.callSid)) || '';
      if (!isCallSid(callId)) {
        try {
          callId = await resolveToCallSid({
            callSid: payload.callSid,
            recordingSid: payload.recordingSid,
            transcriptSid: payload.transcriptSid
          });
        } catch (_) {}
      }

      if (db) {
        const saved = await upsertCallInFirestore({ ...payload, callSid: callId || payload.callSid });
        if (!saved) {
          // No valid Call SID yet; acknowledge but do not create a row
          res.statusCode = 202;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, pending: true, reason: 'Awaiting valid Call SID' }));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, call: saved }));
        return;
      }

      // Memory fallback upsert: only by valid Call SID; no cross-call merging
      if (!isCallSid(callId)) {
        res.statusCode = 202;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, pending: true, reason: 'Awaiting valid Call SID' }));
        return;
      }

      const nowIso = new Date().toISOString();
      const context = pickBusinessAndTarget({ to: payload.to, from: payload.from, targetPhone: payload.targetPhone, businessPhone: payload.businessPhone });
      const primaryId = callId;
      const existing = memoryStore.get(primaryId) || {};
      const merged = {
        ...existing,
        id: primaryId,
        callSid: primaryId,
        twilioSid: primaryId,
        to: payload.to != null ? payload.to : existing.to,
        from: payload.from != null ? payload.from : existing.from,
        status: payload.status || existing.status || 'initiated',
        duration: payload.duration != null ? payload.duration : (existing.duration || 0),
        durationSec: payload.durationSec != null ? payload.durationSec : (existing.durationSec != null ? existing.durationSec : (payload.duration || existing.duration || 0)),
        timestamp: existing.timestamp || payload.callTime || payload.timestamp || nowIso,
        callTime: payload.callTime || existing.callTime || existing.timestamp || nowIso,
        outcome: payload.outcome || existing.outcome || deriveOutcome({...existing, ...payload}),
        transcript: payload.transcript != null ? payload.transcript : existing.transcript,
        formattedTranscript: payload.formattedTranscript != null ? payload.formattedTranscript : existing.formattedTranscript,
        aiInsights: payload.aiInsights != null ? payload.aiInsights : existing.aiInsights || null,
        aiSummary: payload.aiSummary != null ? payload.aiSummary : existing.aiSummary,
        recordingUrl: payload.recordingUrl != null ? payload.recordingUrl : existing.recordingUrl,
        recordingChannels: payload.recordingChannels != null ? payload.recordingChannels : existing.recordingChannels,
        recordingTrack: payload.recordingTrack != null ? payload.recordingTrack : existing.recordingTrack,
        recordingSource: payload.recordingSource != null ? payload.recordingSource : existing.recordingSource,
        businessPhone: context.businessPhone || existing.businessPhone || '',
        targetPhone: context.targetPhone || existing.targetPhone || '',
        source: payload.source || existing.source || 'unknown'
      };
      memoryStore.set(primaryId, merged);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, call: normalizeCallForResponse(merged) }));
      return;
    }

    if (req.method === 'PATCH') {
      const payload = await readJson(req);
      const { callId, contactName, contactId } = payload;

      if (!callId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'callId is required' }));
        return;
      }

      if (db) {
        // Update in Firestore
        try {
          const callRef = db.collection('calls').doc(callId);
          const updateData = {};
          if (contactName) updateData.contactName = contactName;
          if (contactId) updateData.contactId = contactId;
          
          await callRef.update(updateData);
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, updated: true }));
          return;
        } catch (error) {
          console.error('Error updating call in Firestore:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to update call' }));
          return;
        }
      }

      // Memory fallback update
      const existing = memoryStore.get(callId);
      if (existing) {
        if (contactName) existing.contactName = contactName;
        if (contactId) existing.contactId = contactId;
        memoryStore.set(callId, existing);
        
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, updated: true }));
        return;
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Call not found' }));
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


