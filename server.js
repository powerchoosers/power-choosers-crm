const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { URL } = require('url');

// MIME types for different file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

// --- Minimal config for Vonage Voice ---
// Provide these via env vars for security in production.
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID || '5b7c6b93-35aa-43d7-8223-53163f1e00c6';
const VONAGE_NUMBER = process.env.VONAGE_NUMBER || '+14693518845'; // Your Vonage virtual number (E.164)
const AGENT_NUMBER = process.env.AGENT_NUMBER || '+19728342317';     // Number to ring first (your phone)
const VONAGE_PRIVATE_KEY_PATH = process.env.VONAGE_PRIVATE_KEY_PATH || path.join(__dirname, 'private.key');
// Public base URL of this server for Vonage webhooks (use ngrok for local dev)
// For development, we need a URL that Vonage can reach
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || (
  process.env.NODE_ENV === 'production' ? 'https://powerchoosers.com' : null
);
// Google AI Studio API key (Gemini). If present, enables transcription + summary.
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || null;
// Recording controls
const RECORD_ENABLED = process.env.RECORD_ENABLED !== 'false';
const RECORD_SPLIT = process.env.RECORD_SPLIT || 'conversation';
const RECORD_FORMAT = process.env.RECORD_FORMAT || 'mp3';

// Read private key (PEM) once if available
let VONAGE_PRIVATE_KEY = null;
try {
  if (fs.existsSync(VONAGE_PRIVATE_KEY_PATH)) {
    VONAGE_PRIVATE_KEY = fs.readFileSync(VONAGE_PRIVATE_KEY_PATH, 'utf8');
  }
} catch (e) {
  console.warn('Vonage private key not loaded:', e?.message || e);
}

// Warn loudly if private key is missing (calls and JWT will fail)
if (!VONAGE_PRIVATE_KEY) {
  console.warn('WARNING: Vonage private key not loaded. Set VONAGE_PRIVATE_KEY_PATH and ensure the PEM exists.');
}

function httpsRequestJson(options, payloadString) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        resolve({ status: resp.statusCode || 0, headers: resp.headers || {}, text: data });
      });
    });
    req.on('error', reject);
    if (payloadString) req.write(payloadString);
    req.end();
  });
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwtRS256(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  const signature = signer.sign(privateKeyPem);
  const encodedSignature = base64url(signature);
  return `${data}.${encodedSignature}`;
}

function createVonageAppJwt(ttlSeconds = 60 * 10) {
  if (!VONAGE_PRIVATE_KEY) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    application_id: VONAGE_APPLICATION_ID,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomBytes(8).toString('hex'),
  };
  return signJwtRS256(payload, VONAGE_PRIVATE_KEY);
}

// Create a Client SDK (user) JWT for browser login
function createVonageClientJwt(username, ttlSeconds = 60 * 60) {
  if (!VONAGE_PRIVATE_KEY) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    application_id: VONAGE_APPLICATION_ID,
    sub: username || 'agent',
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomBytes(8).toString('hex'),
    acl: {
      paths: {
        '/*/users/**': {},
        '/*/conversations/**': {},
        '/*/sessions/**': {},
        '/*/devices/**': {},
        '/*/image/**': {},
        '/*/media/**': {},
        '/*/applications/**': {},
        '/*/push/**': {},
        '/*/knocking/**': {},
        '/*/rtc/**': {},
        '/*/legs/**': {}
      }
    }
  };
  return signJwtRS256(payload, VONAGE_PRIVATE_KEY);
}

async function handleApiVonageJwt(req, res, parsedUrl) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  if (!VONAGE_PRIVATE_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server not configured: Vonage private key not found' }));
    return;
  }
  const q = parsedUrl.query || {};
  let user = (q.user || '').toString().trim();
  let ttl = parseInt(q.ttl, 10);
  if (method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!user && body && typeof body.user === 'string') user = body.user.trim();
      if ((!ttl || isNaN(ttl)) && body && (typeof body.ttl === 'number' || typeof body.ttl === 'string')) ttl = parseInt(body.ttl, 10);
    } catch (_) { /* ignore body parse errors */ }
  }
  if (!user) user = 'agent';
  if (!ttl || isNaN(ttl) || ttl <= 0) ttl = 60 * 60;
  try {
    const token = createVonageClientJwt(user, ttl);
    if (!token) throw new Error('Failed to create JWT');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, user, ttl, token }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e?.message || 'Internal error' }));
  }
}

// Ensure a Vonage Client SDK user exists (idempotent create)
async function handleApiVonageEnsureUser(req, res, parsedUrl) {
  const method = req.method || 'GET';
  const q = parsedUrl.query || {};
  let user = (q.user || '').toString().trim();
  if (method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!user && body && typeof body.user === 'string') user = body.user.trim();
    } catch (_) { /* ignore body parse errors */ }
  }
  if (!user) user = 'agent';
  if (!VONAGE_PRIVATE_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server not configured: Vonage private key not found' }));
    return;
  }
  try {
    const jwt = createVonageAppJwt(60);
    if (!jwt) throw new Error('Failed to create Vonage app JWT');
    const payload = JSON.stringify({ name: user, display_name: user });
    const options = {
      method: 'POST',
      hostname: 'api.nexmo.com',
      path: '/v1/users',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const resp = await httpsRequestJson(options, payload);
    const status = resp.status || 0;
    // 201 Created or 200 OK -> created/ok
    if (status >= 200 && status < 300) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, user, created: status === 201 }));
      return;
    }
    // 409 Conflict -> user already exists, treat as success
    if (status === 409) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, user, created: false, note: 'exists' }));
      return;
    }
    // Other errors: bubble up limited detail
    let detail = '';
    try { detail = (resp.text || '').slice(0, 400); } catch (_) { detail = ''; }
    res.writeHead(status || 502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Vonage Users API error', status, detail }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e?.message || 'Internal error' }));
  }
}

// ---- Gemini integration helpers ----
async function fetchVonageRecordingBuffer(srcUrl) {
  const u = new URL(srcUrl);
  const jwt = createVonageAppJwt(60);
  if (!jwt) throw new Error('Missing Vonage JWT for recording fetch');
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      headers: { 'Authorization': `Bearer ${jwt}` }
    };
    const req = https.request(options, (resp) => {
      if ((resp.statusCode || 0) >= 400) {
        let errData = '';
        resp.on('data', (c) => { errData += c; });
        resp.on('end', () => reject(new Error(`Recording fetch failed ${resp.statusCode}: ${errData?.slice?.(0,200)}`)));
        return;
      }
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function geminiGenerateJsonFromAudioMp3(apiKey, audioBuffer) {
  const base64Audio = audioBuffer.toString('base64');
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: [
              'You are a helpful assistant that produces JSON only. The input is a phone sales call recording.',
              'Transcribe the call and provide a concise business summary.',
              'Return strictly JSON with keys: "transcript" (full plain text transcript) and "summary" (3-6 bullet sentences).'
            ].join(' ')
          },
          {
            inlineData: { mimeType: 'audio/mpeg', data: base64Audio }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json'
    }
  };

  const bodyStr = JSON.stringify(payload);
  const options = {
    method: 'POST',
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    }
  };
  const resp = await httpsRequestJson(options, bodyStr);
  if (!resp || (resp.status < 200 || resp.status >= 300)) {
    throw new Error(`Gemini API error ${resp?.status}: ${resp?.text?.slice?.(0,200)}`);
  }
  let data = {};
  try { data = JSON.parse(resp.text || '{}'); } catch (_) {}
  const cand = (data.candidates && data.candidates[0]) || null;
  const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
  const text = parts.map(p => p.text || '').join('').trim();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
  return parsed || { transcript: '', summary: text || '' };
}

async function transcribeAndSummarizeForCall(callId, recordingUrl) {
  if (!GOOGLE_API_KEY) return;
  if (!recordingUrl) return;
  try {
    const audio = await fetchVonageRecordingBuffer(recordingUrl);
    // Basic guard: limit to ~25MB
    if (audio.length > 25 * 1024 * 1024) throw new Error('Recording too large for inline request');
    const result = await geminiGenerateJsonFromAudioMp3(GOOGLE_API_KEY, audio);
    const rec = CALL_STORE.get(callId);
    if (rec) {
      if (result.transcript && typeof result.transcript === 'string') rec.transcript = result.transcript;
      if (result.summary && typeof result.summary === 'string') rec.aiSummary = result.summary;
      CALL_STORE.set(callId, rec);
      console.log('Gemini processed call', callId, { hasTranscript: !!rec.transcript, hasSummary: !!rec.aiSummary });
    }
  } catch (e) {
    console.warn('Gemini processing error:', e?.message || e);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) { // 1MB guard
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function handleApiVonageCall(req, res, parsedUrl) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  if (!PUBLIC_BASE_URL) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server not configured: PUBLIC_BASE_URL is required for Vonage webhooks' }));
    return;
  }
  if (!VONAGE_PRIVATE_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server not configured: Vonage private key not found. Set VONAGE_PRIVATE_KEY_PATH.' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const toRaw = (body.to || '').toString().trim();
    if (!toRaw) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing to number' }));
      return;
    }
    // Normalize to E.164 (US default): keep '+', else add +1 for 10-digit NANP or '+' for 11-digit starting with 1
    let to = toRaw.replace(/[^0-9+]/g, '');
    if (!to.startsWith('+')) {
      const digits = to.replace(/\D/g, '');
      if (digits.length === 10) {
        to = '+1' + digits;
      } else if (digits.length === 11 && digits.startsWith('1')) {
        to = '+' + digits;
      } else if (digits.length > 0) {
        // Fallback: prefix '+' to whatever digits we have
        to = '+' + digits;
      }
    }

    const jwt = createVonageAppJwt();
    if (!jwt) throw new Error('Failed to create Vonage JWT');

    const answerUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/answer?dst=${encodeURIComponent(to)}`;
    const eventUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/event`;

    const payload = {
      to: [ { type: 'phone', number: AGENT_NUMBER } ], // ring the agent first
      from: { type: 'phone', number: VONAGE_NUMBER },
      answer_url: [ answerUrl ],
      event_url: [ eventUrl ]
    };

    try {
      console.log('[api/vonage/call] toRaw=', toRaw, 'toNormalized=', to);
      console.log('[api/vonage/call] answer_url=', answerUrl);
      console.log('[api/vonage/call] event_url=', eventUrl);
      console.log('[api/vonage/call] agent=', AGENT_NUMBER, 'from(Vonage)=', VONAGE_NUMBER);
    } catch (_) {}

    if (AGENT_NUMBER === VONAGE_NUMBER) {
      try { console.warn('[api/vonage/call] WARNING: AGENT_NUMBER equals VONAGE_NUMBER. This can cause immediate hangup.'); } catch(_) {}
    }

    const bodyStr = JSON.stringify(payload);
    const options = {
      method: 'POST',
      hostname: 'api.nexmo.com',
      path: '/v1/calls',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const resp = await httpsRequestJson(options, bodyStr);
    try {
      console.log('[api/vonage/call] Vonage response status=', resp.status, 'bytes=', (resp.text||'').length);
    } catch (_) {}
    const ct = (resp.headers['content-type'] || '').toString();
    const isJson = ct.includes('application/json');
    const data = isJson ? JSON.parse(resp.text || '{}') : { raw: resp.text };

    if (!(resp.status >= 200 && resp.status < 300)) {
      res.writeHead(resp.status || 502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Vonage API error', status: resp.status, data }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e?.message || 'Internal error' }));
  }
}

function normalizeE164(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  let e164 = '';
  if (hasPlus) {
    e164 = '+' + digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    e164 = '+1' + digits.slice(1);
  } else if (digits.length === 10) {
    e164 = '+1' + digits;
  } else if (digits.length >= 8 && digits.length <= 15) {
    e164 = '+' + digits;
  } else {
    return '';
  }
  return /^\+\d{8,15}$/.test(e164) ? e164 : '';
}

async function handleWebhookAnswer(req, res, parsedUrl) {
  const q = parsedUrl.query || {};
  // Prefer our custom 'dst' param to avoid collisions with Vonage's own 'to'
  const rawParam = (q.dst || q.to || '').toString();
  // Some providers may append multiple values (e.g., "customer,agent"). Take the first non-agent.
  const candidates = rawParam.split(',').map(s => s.trim()).filter(Boolean);
  const pick = candidates.find(n => n && n !== AGENT_NUMBER) || candidates[0] || '';
  const to = normalizeE164(pick);
  const toRaw = rawParam;
  const host = (req.headers && req.headers.host) ? req.headers.host : '';
  const base = (PUBLIC_BASE_URL && PUBLIC_BASE_URL.replace(/\/$/, '')) || (host ? `https://${host}` : '');
  const recUrl = base ? `${base}/webhooks/recording` : '';
  // Build actions dynamically so recording can be disabled
  const actions = [];
  if (RECORD_ENABLED) {
    actions.push({ action: 'record', eventUrl: recUrl ? [ recUrl ] : undefined, split: RECORD_SPLIT, format: RECORD_FORMAT });
  }
  if (to) {
    actions.push({ action: 'connect', from: VONAGE_NUMBER, endpoint: [ { type: 'phone', number: to } ] });
  } else {
    // Inbound to Vonage number without target: route to agent
    actions.push({ action: 'connect', from: VONAGE_NUMBER, endpoint: [ { type: 'phone', number: AGENT_NUMBER } ] });
  }
  const ncco = actions;
  try {
    console.log('[answer] toRaw=', toRaw || '(none)', 'normalized=', to || '(invalid)', 'recUrl=', recUrl || '(none)', 'base=', base || '(none)');
    console.log('[answer] NCCO=', JSON.stringify(ncco));
  } catch (_) {}
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(ncco));
}

// --- In-memory call store for dev/demo ---
// Keyed by conversation_uuid when available, else by uuid
const CALL_STORE = new Map();

function upsertCallFromEvent(evt) {
  const id = evt.conversation_uuid || evt.conversation_uuid_from || evt.uuid || evt.call_uuid || evt.session_uuid || `unk_${Date.now()}`;
  const rec = CALL_STORE.get(id) || { id, events: [], to: null, from: null, startTime: null, endTime: null, durationSec: null, status: null, recordingUrl: null, transcript: '', aiSummary: '' };
  rec.events.push(evt);
  if (evt.to) rec.to = evt.to;
  if (evt.from) rec.from = evt.from;
  if (evt.timestamp && !rec.startTime && (evt.status === 'answered' || evt.status === 'started')) rec.startTime = evt.timestamp;
  if (evt.timestamp && (evt.status === 'completed' || evt.status === 'hangup' || evt.status === 'failed')) {
    rec.endTime = evt.timestamp;
  }
  if (rec.startTime && rec.endTime && !rec.durationSec) {
    try {
      const s = new Date(rec.startTime).getTime();
      const e = new Date(rec.endTime).getTime();
      if (!isNaN(s) && !isNaN(e) && e >= s) rec.durationSec = Math.round((e - s) / 1000);
    } catch (_) {}
  }
  if (evt.status) rec.status = evt.status;
  CALL_STORE.set(id, rec);
  return rec;
}

async function handleWebhookEvent(req, res) {
  try {
    const body = await readJsonBody(req);
    // Body may be a single event or already parsed
    if (body && typeof body === 'object') {
      upsertCallFromEvent(body);
      const label = body.event || body.status || 'event';
      const id = body.conversation_uuid || body.uuid || body.call_uuid;
      console.log('Vonage event:', label, 'id=', id);
      const severe = ['failed','rejected','busy','timeout','unanswered','hangup'];
      if (severe.includes(String(label).toLowerCase()) || severe.includes(String(body.status || '').toLowerCase())) {
        try { console.log('Vonage event detail:', JSON.stringify(body)); } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('Event webhook parse error:', e?.message || e);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

async function handleWebhookRecording(req, res) {
  try {
    const body = await readJsonBody(req);
    // Typical payload includes: recording_url, conversation_uuid, start_time, end_time
    const id = body.conversation_uuid || body.uuid || `rec_${Date.now()}`;
    const rec = CALL_STORE.get(id) || { id, events: [], transcript: '', aiSummary: '' };
    if (body.recording_url) rec.recordingUrl = body.recording_url;
    if (body.start_time) rec.startTime = rec.startTime || body.start_time;
    if (body.end_time) rec.endTime = body.end_time;
    if (!rec.durationSec && body.start_time && body.end_time) {
      try {
        const s = new Date(body.start_time).getTime();
        const e = new Date(body.end_time).getTime();
        if (!isNaN(s) && !isNaN(e) && e >= s) rec.durationSec = Math.round((e - s) / 1000);
      } catch (_) {}
    }
    CALL_STORE.set(id, rec);
    console.log('Recording webhook:', { id, recordingUrl: rec.recordingUrl });
    // Kick off async transcription + summary with Gemini, if configured
    if (rec.recordingUrl) {
      if (GOOGLE_API_KEY) {
        setImmediate(() => transcribeAndSummarizeForCall(id, rec.recordingUrl).catch(err => {
          console.warn('Gemini async task error:', err?.message || err);
        }));
      } else {
        console.log('Gemini disabled: GOOGLE_API_KEY not set');
      }
    }
  } catch (e) {
    console.warn('Recording webhook parse error:', e?.message || e);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

async function handleApiListCalls(req, res) {
  const base = Array.from(CALL_STORE.values());
  const calls = base
    .sort((a,b)=>{
      const ta = a.endTime || a.startTime || 0; const tb = b.endTime || b.startTime || 0;
      return String(tb).localeCompare(String(ta));
    })
    .slice(0, 200)
    .map(r => ({
      id: r.id,
      to: r.to || '',
      from: r.from || '',
      callTime: r.startTime || r.endTime || new Date().toISOString(),
      durationSec: r.durationSec || 0,
      outcome: r.status || '',
      audioUrl: r.recordingUrl || '',
      transcript: r.transcript || '',
      aiSummary: r.aiSummary || ''
    }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, calls }));
}

// Full call list with raw webhook events (read-only, diagnostics)
async function handleApiListCallsFull(req, res) {
  const base = Array.from(CALL_STORE.values());
  const calls = base
    .sort((a,b)=>{
      const ta = a.endTime || a.startTime || 0; const tb = b.endTime || b.startTime || 0;
      return String(tb).localeCompare(String(ta));
    })
    .slice(0, 50) // limit for safety
    .map(r => ({
      id: r.id,
      to: r.to || '',
      from: r.from || '',
      callTime: r.startTime || r.endTime || new Date().toISOString(),
      durationSec: r.durationSec || 0,
      outcome: r.status || '',
      audioUrl: r.recordingUrl || '',
      transcript: r.transcript || '',
      aiSummary: r.aiSummary || '',
      events: (r.events || []).slice(-30) // last up to 30 events per call
    }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, calls }));
}

async function handleApiProxyRecording(req, res, parsedUrl) {
  try {
    if (!VONAGE_PRIVATE_KEY) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server not configured for Vonage auth' }));
      return;
    }
    const q = parsedUrl.query || {};
    const src = (q.url || '').toString();
    if (!src) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url' }));
      return;
    }
    const u = new URL(src);
    const jwt = createVonageAppJwt(60);
    const options = {
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      headers: { 'Authorization': `Bearer ${jwt}` }
    };
    const upstream = https.request(options, (resp) => {
      const status = resp.statusCode || 500;
      const headers = resp.headers || {};
      const contentType = headers['content-type'] || 'audio/mpeg';
      res.writeHead(status, { 'Content-Type': contentType });
      resp.pipe(res);
    });
    upstream.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream error', detail: err?.message || String(err) }));
    });
    upstream.end();
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e?.message || 'Internal error' }));
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers (adjust origin as needed)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  // Parse the URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

    // Preflight for API and webhook routes
    if (req.method === 'OPTIONS' && (
      pathname === '/api/vonage/call' ||
      pathname === '/api/vonage/ensure_user' ||
      pathname === '/api/vonage/jwt' ||
      pathname === '/api/calls' ||
      pathname === '/api/calls_full' ||
      pathname === '/api/recording' ||
      pathname === '/webhooks/answer' ||
      pathname === '/webhooks/event' ||
      pathname === '/webhooks/recording'
    )) {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // API routes (Vonage integration)
    if (pathname === '/api/vonage/jwt') {
        return handleApiVonageJwt(req, res, parsedUrl);
    }
    if (pathname === '/api/vonage/ensure_user') {
        return handleApiVonageEnsureUser(req, res, parsedUrl);
    }
    if (pathname === '/api/vonage/call') {
        return handleApiVonageCall(req, res, parsedUrl);
    }
    if (pathname === '/api/calls') {
        return handleApiListCalls(req, res);
    }
    if (pathname === '/api/calls_full') {
        return handleApiListCallsFull(req, res);
    }
    if (pathname === '/webhooks/answer') {
        return handleWebhookAnswer(req, res, parsedUrl);
    }
    if (pathname === '/webhooks/event') {
        return handleWebhookEvent(req, res);
    }
    if (pathname === '/webhooks/recording') {
        return handleWebhookRecording(req, res);
    }
    if (pathname === '/api/recording') {
        return handleApiProxyRecording(req, res, parsedUrl);
    }

    // Default to crm-dashboard.html for root requests
    if (pathname === '/') {
        pathname = '/crm-dashboard.html';
    }
    
    // Construct file path
    const filePath = path.join(__dirname, pathname);
    
    // Get file extension
    const ext = path.extname(filePath).toLowerCase();
    
    // Set default content type
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Check if file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // File not found
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>404 - Not Found</title>
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: #f8f9fa;
                            color: #343a40;
                        }
                        .error-container {
                            text-align: center;
                            padding: 2rem;
                            background: white;
                            border-radius: 8px;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        }
                        h1 { color: #ff6b35; margin-bottom: 1rem; }
                        p { margin-bottom: 1rem; }
                        a { color: #ff6b35; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <h1>404 - File Not Found</h1>
                        <p>The requested file <code>${pathname}</code> was not found.</p>
                        <p><a href="/">← Back to Power Choosers CRM</a></p>
                    </div>
                </body>
                </html>
            `);
            return;
        }
        
        // Read and serve the file
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>500 - Server Error</title>
                        <style>
                            body { 
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                height: 100vh;
                                margin: 0;
                                background: #f8f9fa;
                                color: #343a40;
                            }
                            .error-container {
                                text-align: center;
                                padding: 2rem;
                                background: white;
                                border-radius: 8px;
                                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                            }
                            h1 { color: #dc3545; margin-bottom: 1rem; }
                        </style>
                    </head>
                    <body>
                        <div class="error-container">
                            <h1>500 - Server Error</h1>
                            <p>Unable to read the requested file.</p>
                        </div>
                    </body>
                    </html>
                `);
                return;
            }
            
            // Set headers and send file
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(data);
        });
    });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
    console.log('🚀 Power Choosers CRM Server Started!');
    console.log(`📍 Server running at: http://${HOST}:${PORT}`);
    console.log(`🎯 CRM Dashboard: http://${HOST}:${PORT}/crm-dashboard.html`);
    console.log('📁 Serving files from:', __dirname);
    console.log('⏰ Server started at:', new Date().toLocaleString());
    console.log('\n✨ Ready to serve your Power Choosers CRM!');
    console.log('💡 Press Ctrl+C to stop the server');
    // Telephony config summary
    try {
      const base = (PUBLIC_BASE_URL || '').replace(/\/$/, '');
      console.log('--- Vonage Telephony Config ---');
      console.log('Application ID:', VONAGE_APPLICATION_ID);
      console.log('Vonage Number:', VONAGE_NUMBER);
      console.log('Agent Number  :', AGENT_NUMBER);
      console.log('PUBLIC_BASE_URL:', PUBLIC_BASE_URL || '(unset)');
      console.log('Private Key Path:', VONAGE_PRIVATE_KEY_PATH);
      console.log('Private Key Loaded:', !!VONAGE_PRIVATE_KEY);
      console.log('Recording Enabled:', RECORD_ENABLED, 'Split:', RECORD_SPLIT, 'Format:', RECORD_FORMAT);
      if (PUBLIC_BASE_URL) {
        console.log('Answer Webhook  :', `${base}/webhooks/answer?dst=+1XXXXXXXXXX`);
        console.log('Event Webhook   :', `${base}/webhooks/event`);
        console.log('Recording Hook  :', `${base}/webhooks/recording`);
      }
      if (AGENT_NUMBER === VONAGE_NUMBER) {
        console.warn('WARNING: AGENT_NUMBER equals VONAGE_NUMBER. Update AGENT_NUMBER to your personal device.');
      }
    } catch (_) {}
});

// Handle server errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please try a different port or stop the existing server.`);
    } else {
        console.error('❌ Server error:', err);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Power Choosers CRM server...');
    server.close(() => {
        console.log('✅ Server stopped successfully');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server stopped successfully');
        process.exit(0);
    });
});
