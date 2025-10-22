import { URLSearchParams } from 'url';

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { 
    res.writeHead(200);
    res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.end();
return;
return;
return;
    return true; 
  }
  return false;
}

function parseBody(req) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { if (ct.includes('application/json')) return JSON.parse(b); } catch(_) {}
    try { const params = new URLSearchParams(b); const out = {}; for (const [k,v] of params) out[k]=v; return out; } catch(_) {}
  }
  return {};
}

function pick(obj, keys, d='') { for (const k of keys) { if (obj && obj[k] != null && obj[k] !== '') return obj[k]; } return d; }
function toArr(v){ return Array.isArray(v)?v:(v? [v]:[]); }

function normalizeSupplierTokens(s){
  try {
    if (!s) return '';
    let out = String(s);
    out = out.replace(/\bT\s*X\s*U\b/gi, 'TXU');
    out = out.replace(/\bN\s*R\s*G\b/gi, 'NRG');
    out = out.replace(/\bT\s*X\s*you\b/gi, 'TXU');
    return out;
  } catch(_) { return String(s||''); }
}

function canonicalizeSupplierName(s){
  if (!s) return '';
  const raw = normalizeSupplierTokens(s).trim();
  const key = raw.replace(/[^a-z0-9]/gi,'').toLowerCase();
  const map = {
    'txu':'TXU', 'txuenergy':'TXU',
    'nrg':'NRG',
    'reliant':'Reliant', 'reliantenergy':'Reliant',
    'constellation':'Constellation',
    'directenergy':'Direct Energy',
    'greenmountain':'Green Mountain', 'greenmountainenergy':'Green Mountain',
    'cirro':'Cirro',
    'engie':'Engie',
    'shellenergy':'Shell Energy',
    'championenergy':'Champion Energy', 'champion':'Champion Energy',
    'gexa':'Gexa',
    'taraenergy':'Tara Energy', 'apg&e':'APG & E', 'apge':'APG & E',
  };
  return map[key] || raw;
}

export default async function handler(req, res){
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = parseBody(req) || {};
    // Twilio Operator payloads are flexible; allow nesting under Payload.Result
    const op = body.Payload?.Result || body.result || body || {};

    // Attempt to identify callSid from multiple places
    const callSid = pick(body, ['CallSid','callSid','call_sid','customerKey','customer_key','customer_key_sid']) || pick(op, ['CallSid','callSid','call_sid','customerKey']);
    if (!callSid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing callSid' }));
      return;
    }

    // Build aiInsights by normalizing snake_case to camelCase
    const contractIn = op.contract || {};
    const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    let supplierRaw = pick(contractIn, ['supplier','utility'], '');
    supplierRaw = canonicalizeSupplierName(supplierRaw);
    if (supplierRaw && WEEKDAYS.includes(String(supplierRaw).toLowerCase())) supplierRaw = '';

    const contract = {
      currentRate: pick(contractIn, ['currentRate','current_rate','rate']) || '',
      rateType: pick(contractIn, ['rateType','rate_type']) || '',
      supplier: supplierRaw,
      contractEnd: pick(contractIn, ['contractEnd','contract_end','endDate']) || '',
      usageKWh: pick(contractIn, ['usage_k_wh','usageK_wh','usageKWh','usage']) || '',
      contractLength: pick(contractIn, ['contractLength','contract_length']) || ''
    };

    const aiInsights = {
      source: 'twilio-operator',
      sentiment: pick(op, ['sentiment'], 'Unknown'),
      disposition: pick(op, ['disposition'], ''),
      keyTopics: toArr(pick(op, ['key_topics','keyTopics'], [])),
      nextSteps: toArr(pick(op, ['next_steps','nextSteps'], [])),
      painPoints: toArr(pick(op, ['pain_points','painPoints'], [])),
      budget: pick(op, ['budget'], ''),
      timeline: pick(op, ['timeline'], ''),
      contract,
      flags: {
        recordingDisclosure: !!pick(op.flags||{}, ['recording_disclosure','recordingDisclosure'], false),
        escalationRequest: !!pick(op.flags||{}, ['escalation_request','escalationRequest'], false),
        doNotContact: !!pick(op.flags||{}, ['do_not_contact','doNotContact'], false),
        nonEnglish: !!pick(op.flags||{}, ['non_english','nonEnglish'], false),
        voicemailDetected: !!pick(op.flags||{}, ['voicemail_detected','voicemailDetected'], false),
        callTransfer: !!pick(op.flags||{}, ['call_transfer','callTransfer'], false)
      },
      entities: toArr(op.entities || []),
      summary: pick(op, ['summary','conversation_summary','Conversation Summary'], '')
    };

    // Post into central calls store
    const base = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app';
    await fetch(`${base}/api/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callSid, aiInsights })
    }).catch(()=>{});

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  } catch (e) {
    console.error('[Operator Webhook] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process operator webhook', details: e?.message }));
    return;
  }
}


