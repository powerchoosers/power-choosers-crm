// Supabase-backed Calls API (GET recent calls, POST upsert by Call SID)
// Migrated from Firestore to Supabase (PostgreSQL)
import { cors } from './_cors.js';
import { supabaseAdmin, requireUser } from '@/lib/supabase';
import { resolveToCallSid, isCallSid } from './_twilio-ids.js';
import logger from './_logger.js';

// In-memory fallback store (for local/dev when Supabase isn't configured)
const memoryStore = new Map();

const isSupabaseEnabled = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    contactName: call.contactName || '',

    // Ownership fields (required for client-side scoping + KPI widget)
    ownerId: call.ownerId || call.agentEmail || call.userEmail || '',
    assignedTo: call.assignedTo || call.ownerId || call.agentEmail || call.userEmail || '',
    createdBy: call.createdBy || call.ownerId || call.agentEmail || call.userEmail || '',
    agentEmail: call.agentEmail || call.ownerId || call.userEmail || '',
    userEmail: call.userEmail || call.agentEmail || call.ownerId || ''
  };
}

// Map Supabase row to camelCase object (calls table uses camelCase columns)
function mapSupabaseToCall(row) {
  if (!row) return {};
  return {
    id: row.id,
    callSid: row.callSid,
    to: row.to,
    from: row.from,
    status: row.status,
    duration: row.duration,
    timestamp: row.timestamp,
    direction: row.direction,
    recordingUrl: row.recordingUrl,
    recordingSid: row.recordingSid,
    transcript: row.transcript,
    summary: row.summary,
    aiInsights: row.aiInsights,
    accountId: row.accountId,
    contactId: row.contactId,
    createdAt: row.createdAt,
    ...row.metadata // Spread any extra metadata
  };
}

// Map camelCase object to Supabase snake_case row
function mapCallToSupabase(call) {
  const metadata = { ...call };
  // Remove core fields from metadata to avoid duplication
  const coreFields = [
    'id', 'callSid', 'twilioSid', 'to', 'from', 'status', 'duration', 'durationSec',
    'timestamp', 'callTime', 'outcome', 'transcript', 'formattedTranscript', 'aiSummary',
    'aiInsights', 'recordingUrl', 'recordingChannels', 'recordingTrack', 'recordingSource',
    'conversationalIntelligence', 'accountId', 'accountName', 'contactId', 'contactName',
    'targetPhone', 'businessPhone', 'source', 'ownerId', 'assignedTo', 'createdBy',
    'agentEmail', 'userEmail', 'updatedAt', 'createdAt'
  ];
  coreFields.forEach(field => delete metadata[field]);

  return {
    id: call.id || call.callSid,
    callSid: call.callSid || call.id,
    from: call.from,
    to: call.to,
    status: call.status,
    duration: call.duration || call.durationSec || 0,
    timestamp: call.timestamp || call.callTime || new Date().toISOString(),
    direction: call.direction || (pickBusinessAndTarget(call).direction),
    recordingUrl: call.recordingUrl,
    recordingSid: call.recordingSid,
    transcript: call.transcript,
    summary: call.aiSummary,
    aiInsights: call.aiInsights,
    accountId: call.accountId || null,
    contactId: call.contactId || null,
    ownerId: call.ownerId || null,
    createdAt: call.createdAt || call.timestamp || new Date().toISOString(),
    metadata: {
      outcome: call.outcome || deriveOutcome(call),
      accountName: call.accountName,
      contactName: call.contactName,
      targetPhone: call.targetPhone,
      businessPhone: call.businessPhone,
      recordingChannels: call.recordingChannels,
      recordingTrack: call.recordingTrack,
      recordingSource: call.recordingSource,
      conversationalIntelligence: call.conversationalIntelligence,
      source: call.source,
      ...metadata
    }
  };
}

function norm10(v) {
  try { return (v == null ? '' : String(v)).replace(/\D/g, '').slice(-10); } catch (_) { return ''; }
}

function pickBusinessAndTarget({ to, from, targetPhone, businessPhone }) {
  const to10 = norm10(to);
  const from10 = norm10(from);
  const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
    .split(',').map(norm10).filter(Boolean);
  const isBiz = (p) => !!p && envBiz.includes(p);
  const biz = businessPhone || (isBiz(to10) ? to : (isBiz(from10) ? from : ''));
  const tgt = targetPhone || (isBiz(to10) && !isBiz(from10) ? from10 : (isBiz(from10) && !isBiz(to10) ? to10 : (to10 || from10)));

  // Logical direction: if From is a known business number, it's outbound.
  // Otherwise, if To is a known business number, it's inbound.
  const direction = isBiz(from10) ? 'outbound' : (isBiz(to10) ? 'inbound' : 'outbound');

  return { businessPhone: biz || '', targetPhone: tgt || '', direction };
}

async function getCallsFromSupabase(limit = 0, offset = 0, callSid = null, ownerId = null) {
  if (!isSupabaseEnabled) return null;

  let query = supabaseAdmin
    .from('calls')
    .select('*')
    .order('timestamp', { ascending: false });

  if (callSid) {
    query = query.eq('id', callSid);
  }

  if (ownerId) {
    // Filter by ownerId, assignedTo, or createdBy for Agents
    query = query.or(`ownerId.eq.${ownerId},assignedTo.eq.${ownerId},createdBy.eq.${ownerId}`);
  }

  if (limit > 0) {
    query = query.limit(limit);
  }

  if (offset > 0) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Supabase fetch error:', error);
    return [];
  }

  return data.map(row => normalizeCallForResponse(mapSupabaseToCall(row)));
}

export async function upsertCallInSupabase(payload) {
  if (!isSupabaseEnabled) return null;

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
    } catch (_) { }
  }
  if (!isCallSid(callId)) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1f8f3489-3694-491c-a2fd-b2e7bd6a92e0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'calls.js:upsertCallInSupabase', message: 'Upsert skipped invalid callSid', data: { callId }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H4' }) }).catch(() => { });
    // #endregion
    // No valid Call SID → do not persist
    return null;
  }

  // Compute normalized phone context (for enrichment only; do NOT merge across calls)
  const context = pickBusinessAndTarget({
    to: payload.to,
    from: payload.from,
    targetPhone: payload.targetPhone,
    businessPhone: payload.businessPhone
  });

  // Extract user identifier for ownership (prioritize UUID if available)
  const userEmail = (payload.userEmail || payload.agentEmail || '').toLowerCase().trim();
  const userId = payload.agentId || payload.userId || '';

  // Fetch current state to merge
  const { data: currentData } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('id', callId)
    .single();

  const current = currentData ? mapSupabaseToCall(currentData) : {};

  const primaryId = callId;

  // CRM context passthrough
  let finalContactId = payload.contactId != null ? payload.contactId : current.contactId;
  let finalContactName = payload.contactName != null ? payload.contactName : current.contactName;

  // AUTO-LINKING: If no contact is linked, try to find one by phone number
  if (!finalContactId && (payload.to || payload.from)) {
    const phoneCandidates = [payload.to, payload.from].filter(p => p && p.length > 5);
    for (const phone of phoneCandidates) {
      const { data: match } = await supabaseAdmin
        .from('contacts')
        .select('id, name')
        .or(`mobile.eq.${phone},workPhone.eq.${phone},phone.eq.${phone},otherPhone.eq.${phone}`)
        .limit(1)
        .maybeSingle();

      if (match) {
        finalContactId = match.id;
        finalContactName = match.name;
        logger.log(`[Calls API] Auto-linked call ${primaryId} to contact ${match.name} (${match.id}) via phone ${phone}`);
        break;
      }
    }
  }

  const merged = {
    ...current,
    id: primaryId,
    callSid: primaryId,
    twilioSid: primaryId,
    to: payload.to != null ? payload.to : current.to,
    from: payload.from != null ? payload.from : current.from,
    status: payload.status || current.status || 'initiated',
    duration: Math.max(payload.duration || 0, payload.durationSec || 0, current.duration || 0),
    durationSec: Math.max(payload.duration || 0, payload.durationSec || 0, current.durationSec || 0, current.duration || 0),
    timestamp: current.timestamp || payload.callTime || payload.timestamp || nowIso,
    callTime: payload.callTime || current.callTime || current.timestamp || nowIso,
    outcome: payload.outcome || current.outcome || deriveOutcome({ ...current, ...payload }),
    transcript: payload.transcript != null ? payload.transcript : current.transcript,
    formattedTranscript: payload.formattedTranscript != null ? payload.formattedTranscript : current.formattedTranscript,
    aiInsights: payload.aiInsights != null ? payload.aiInsights : current.aiInsights || null,
    aiSummary: payload.aiSummary != null ? payload.aiSummary : current.aiSummary,
    recordingUrl: payload.recordingUrl || current.recordingUrl,
    recordingChannels: payload.recordingChannels != null ? payload.recordingChannels : current.recordingChannels,
    recordingTrack: payload.recordingTrack != null ? payload.recordingTrack : current.recordingTrack,
    recordingSource: payload.recordingSource != null ? payload.recordingSource : current.recordingSource,
    conversationalIntelligence: (payload.conversationalIntelligence != null ? payload.conversationalIntelligence : (payload.aiInsights && payload.aiInsights.conversationalIntelligence)) != null ? (payload.conversationalIntelligence || (payload.aiInsights && payload.aiInsights.conversationalIntelligence)) : current.conversationalIntelligence,

    // CRM context passthrough
    accountId: payload.accountId != null ? payload.accountId : current.accountId,
    accountName: payload.accountName != null ? payload.accountName : current.accountName,
    contactId: finalContactId,
    contactName: finalContactName,
    targetPhone: (payload.targetPhone != null ? payload.targetPhone : (current.targetPhone || context.targetPhone)) || '',
    businessPhone: (payload.businessPhone != null ? payload.businessPhone : (current.businessPhone || context.businessPhone)) || '',
    direction: current.direction || payload.direction || context.direction || 'outbound',
    source: payload.source || current.source || 'unknown',

    updatedAt: nowIso,
    createdAt: current.createdAt || nowIso
  };

  // Ownership logic
  const hasExistingOwner = current.ownerId && current.ownerId.trim();
  const finalOwnerId = (userId && userId.trim())
    ? userId.trim()
    : ((userEmail && userEmail.trim())
      ? userEmail.toLowerCase().trim()
      : (hasExistingOwner ? current.ownerId : 'unassigned'));

  merged.ownerId = finalOwnerId;
  merged.assignedTo = finalOwnerId;
  merged.createdBy = current.createdBy || finalOwnerId;
  merged.agentEmail = userEmail || finalOwnerId;

  // Convert to DB row
  const dbRow = mapCallToSupabase(merged);

  // #region agent log
  console.log(`[Calls API] Supabase upsert payload for ${callId}:`, JSON.stringify(dbRow, null, 2));
  // #endregion

  const { error } = await supabaseAdmin
    .from('calls')
    .upsert(dbRow);

  // #region agent log
  console.log(`[Calls API] Supabase upsert result for ${callId}:`, { error: error ? error.message : 'success', status: error ? error.code : 'ok' });
  // #endregion
  if (error) {
    logger.error('Supabase upsert error:', error);
    return null;
  }

  return normalizeCallForResponse(merged);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  try {
    if (req.method === 'GET') {
      const { user, isAdmin } = await requireUser(req);
      const ownerId = isAdmin ? null : (user?.id || 'unauthorized');

      if (!isAdmin && !user) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // Optional filter by Call SID
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const callSid = urlObj.searchParams.get('callSid');
      const limit = parseInt(urlObj.searchParams.get('limit')) || 0;
      const offset = parseInt(urlObj.searchParams.get('offset')) || 0;

      if (isSupabaseEnabled) {
        if (callSid) {
          const calls = await getCallsFromSupabase(1, 0, callSid, ownerId);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, calls }));
          return;
        }

        // Support pagination
        const calls = await getCallsFromSupabase(limit || 50, offset, null, ownerId);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, calls, hasMore: calls.length === limit }));
        return;
      }

      // Fallback to memory store (Admins only for safety, or filter memory store)
      let calls = Array.from(memoryStore.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map(normalizeCallForResponse);

      if (!isAdmin) {
        calls = calls.filter(c => c.ownerId === user.id || c.assignedTo === user.id || c.createdBy === user.id);
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, calls }));
      return;
    }

    if (req.method === 'DELETE') {
      // Support bulk or single delete by Call SID (id)
      let body = (req.body && typeof req.body === 'object') ? req.body : {};
      if (!Object.keys(body).length) {
        try { body = await readJson(req); } catch (_) { body = {}; }
      }
      const ids = [];
      const pushId = (v) => { if (typeof v === 'string' && v.trim()) ids.push(v.trim()); };
      pushId(body.id);
      pushId(body.callSid);
      pushId(body.twilioSid);
      if (Array.isArray(body.ids)) body.ids.forEach(pushId);

      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const qId = urlObj.searchParams.get('id');
      const qCallSid = urlObj.searchParams.get('callSid');
      const qTwilio = urlObj.searchParams.get('twilioSid');
      [qId, qCallSid, qTwilio].forEach(pushId);

      const resolved = [];
      for (const raw of ids) {
        let sid = raw;
        if (!isCallSid(sid)) {
          try { sid = await resolveToCallSid({ callSid: raw, recordingSid: body.recordingSid, transcriptSid: body.transcriptSid }); } catch (_) { }
        }
        if (isCallSid(sid)) resolved.push(sid);
      }

      if (isSupabaseEnabled) {
        let deleted = 0;
        for (const sid of resolved) {
          try {
            const { error } = await supabaseAdmin.from('calls').delete().eq('id', sid);
            if (!error) deleted++;
          } catch (_) { }
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, deleted, requested: ids.length }));
        return;
      }

      // Memory fallback
      let deleted = 0;
      for (const sid of resolved) { if (memoryStore.has(sid)) { memoryStore.delete(sid); deleted++; } }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, deleted, requested: ids.length }));
      return;
    }

    if (req.method === 'POST') {
      const payload = (req.body && typeof req.body === 'object') ? req.body : await readJson(req);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1f8f3489-3694-491c-a2fd-b2e7bd6a92e0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'calls.js:POST entry', message: 'POST /api/calls received', data: { callSid: payload && payload.callSid, contactId: payload && payload.contactId, accountId: payload && payload.accountId, source: payload && payload.source }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H4' }) }).catch(() => { });
      // #endregion

      let callId = (payload.callSid && String(payload.callSid)) || '';
      if (!isCallSid(callId)) {
        try {
          callId = await resolveToCallSid({
            callSid: payload.callSid,
            recordingSid: payload.recordingSid,
            transcriptSid: payload.transcriptSid
          });
        } catch (_) { }
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1f8f3489-3694-491c-a2fd-b2e7bd6a92e0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'calls.js:afterResolve', message: 'Call SID resolution', data: { callId, isValid: isCallSid(callId), isSupabaseEnabled }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H4' }) }).catch(() => { });
      // #endregion

      if (isSupabaseEnabled) {
        const saved = await upsertCallInSupabase({ ...payload, callSid: callId || payload.callSid });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1f8f3489-3694-491c-a2fd-b2e7bd6a92e0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'calls.js:afterUpsert', message: 'Upsert result', data: { saved: !!saved }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H4,H5' }) }).catch(() => { });
        // #endregion
        if (!saved) {
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

      // Memory fallback upsert
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
        outcome: payload.outcome || existing.outcome || deriveOutcome({ ...existing, ...payload }),
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
      const payload = (req.body && typeof req.body === 'object') ? req.body : await readJson(req);
      const { callId, contactName, contactId } = payload;

      if (!callId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'callId is required' }));
        return;
      }

      if (isSupabaseEnabled) {
        try {
          const updateData = {};
          if (contactName) updateData.contact_name = contactName;
          if (contactId) updateData.contact_id = contactId;

          await supabaseAdmin
            .from('calls')
            .update(updateData)
            .eq('id', callId);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, updated: true }));
          return;
        } catch (error) {
          logger.error('Error updating call in Supabase:', error);
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
    logger.error('API Error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}
