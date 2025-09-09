const twilio = require('twilio');

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizeBody(req) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  const b = req.body;
  if (!b) return req.query || {};
  if (typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      if (ct.includes('application/json')) return JSON.parse(b);
    } catch(_) {}
    try {
      const params = new URLSearchParams(b);
      const out = {}; for (const [k,v] of params.entries()) out[k]=v; return out;
    } catch(_) {}
  }
  return b || {};
}

function extractAllTexts(obj) {
  const texts = [];
  const visit = (v) => {
    if (!v) return;
    if (typeof v === 'string') return; // skip bare strings; look for labeled keys
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (typeof v === 'object') {
      // Common transcript fields
      if (typeof v.transcriptText === 'string') texts.push(v.transcriptText);
      if (typeof v.transcript === 'string') texts.push(v.transcript);
      if (typeof v.text === 'string') texts.push(v.text);
      // Utterances/segments
      if (Array.isArray(v.utterances)) v.utterances.forEach(u=>{ if (u && (u.text || u.transcript)) texts.push(u.text||u.transcript); });
      if (Array.isArray(v.segments)) v.segments.forEach(s=>{ if (s && (s.text || s.transcript)) texts.push(s.text||s.transcript); });
      // Nested results/operators
      Object.values(v).forEach(visit);
    }
  };
  visit(obj);
  return texts.filter(Boolean);
}

async function resolveCallSidFromRecordingSid(recordingSid) {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token || !recordingSid) return null;
    const client = twilio(sid, token);
    const rec = await client.recordings(recordingSid).fetch();
    return rec && rec.callSid ? rec.callSid : null;
  } catch (e) {
    try { console.warn('[LanguageWebhook] resolve callSid failed:', e?.message); } catch(_) {}
    return null;
  }
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = normalizeBody(req);
    try { console.log('[LanguageWebhook] incoming body keys:', Object.keys(body || {})); } catch(_) {}

    // Try to locate relevant identifiers
    const callSid = body.CallSid || body.callSid || body.call_sid || body.call_id || null;
    let recordingSid = body.RecordingSid || body.recordingSid || body.recording_sid || null;
    const sourceSid = body.SourceSid || body.sourceSid || body.source_sid || body.Source || null; // e.g., RE... from Twilio Language

    // If sourceSid looks like a Recording SID, use it
    if (!recordingSid && typeof sourceSid === 'string' && /^RE[A-Za-z0-9]+$/.test(sourceSid)) {
      recordingSid = sourceSid; // best-effort map
    }

    // Extract transcript text from arbitrary payload
    const texts = extractAllTexts(body);
    const transcript = texts.length ? texts.join('\n') : '';

    // If we don't have a callSid, try to resolve via recording
    let finalCallSid = callSid || null;
    if (!finalCallSid && recordingSid) {
      finalCallSid = await resolveCallSidFromRecordingSid(recordingSid);
    }

    if (!finalCallSid && !transcript) {
      res.status(200).json({ ok: true, note: 'No callSid/recordingSid or transcript found' });
      return;
    }

    // Upsert into central /api/calls so UI can read transcript
    try {
      const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
      const base = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm.vercel.app');
      await fetch(`${base}/api/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callSid: finalCallSid || undefined,
          transcript: transcript || undefined,
          source: 'twilio-language-webhook',
          recordingSid: recordingSid || undefined
        })
      }).catch(()=>{});
      console.log('[LanguageWebhook] Posted transcript to /api/calls', { base, finalCallSid, recordingSid, gotText: !!transcript, textLen: (transcript||'').length });
    } catch (e) {
      console.warn('[LanguageWebhook] Failed to post to /api/calls:', e?.message);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[LanguageWebhook] error:', e);
    res.status(500).json({ error: 'Failed to handle language webhook', message: e?.message });
  }
}
