const { db } = require('./_firebase');

// CORS middleware
function corsMiddleware(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.statusCode = 200; res.end(); return;
  }
  next();
}

function isCallSid(s){ return typeof s === 'string' && /^CA[0-9a-zA-Z]{32}$/.test(s); }
function nowIso(){ return new Date().toISOString(); }

async function readJson(req){
  if (req.body && typeof req.body === 'object') return req.body;
  let data = '';
  await new Promise((resolve,reject)=>{ req.on('data', c=>{ data += c; if (data.length > 1e6) { reject(new Error('Payload too large')); } }); req.on('end', resolve); req.on('error', reject); });
  try { return data ? JSON.parse(data) : {}; } catch(_) { return {}; }
}

export default async function handler(req, res){
  corsMiddleware(req, res, () => {});

  try{
    // GET: list recent calls
    if (req.method === 'GET'){
      // If Firestore available, prefer it; else fallback to in-memory from scripts/api/calls.js not accessible here
      if (!db){
        res.status(200).json({ ok:true, calls: [] });
        return;
      }
      const q = await db.collection('calls').orderBy('timestamp', 'desc').limit(100).get();
      const out = [];
      q.forEach(doc=>{ const d = doc.data()||{}; out.push({ id: doc.id, ...d }); });
      res.status(200).json({ ok:true, calls: out });
      return;
    }

    // DELETE: delete by id or callSid
    if (req.method === 'DELETE'){
      const body = await readJson(req);
      const id = body.id || body.callSid || '';
      if (!id){ res.status(400).json({ ok:false, error:'Missing id or callSid' }); return; }
      if (!db){ res.status(500).json({ ok:false, error:'Firestore not available' }); return; }
      await db.collection('calls').doc(id).delete().catch(()=>{});
      res.status(200).json({ ok:true });
      return;
    }

    // POST: upsert by Call SID only (strict)
    if (req.method === 'POST'){
      const body = await readJson(req);
      const callSid = body.callSid || body.id || '';
      if (!callSid){ res.status(400).json({ ok:false, error:'callSid required' }); return; }

      // Enforce Twilio Call SID as the unique identifier if it matches; else accept provided id
      const id = isCallSid(callSid) ? callSid : callSid;

      const payload = {
        id,
        callSid: id,
        to: body.to || null,
        from: body.from || null,
        status: body.status || null,
        duration: body.duration != null ? Number(body.duration) : null,
        durationSec: body.duration != null ? Number(body.duration) : null,
        callTime: body.callTime || body.timestamp || nowIso(),
        timestamp: body.timestamp || body.callTime || nowIso(),
        accountId: body.accountId || null,
        accountName: body.accountName || null,
        contactId: body.contactId || null,
        contactName: body.contactName || null,
        transcript: body.transcript != null ? String(body.transcript) : undefined,
        aiInsights: body.aiInsights != null ? body.aiInsights : undefined,
        recordingUrl: body.recordingUrl || null,
        source: body.source || 'unknown',
        updatedAt: nowIso(),
        createdAt: nowIso()
      };
      // Clean undefined to preserve merge semantics
      Object.keys(payload).forEach(k=>{ if (payload[k] === undefined) delete payload[k]; });

      if (!db){
        // Without Firestore, return echo (prevents merging bug in memory-based fallback)
        res.status(200).json({ ok:true, call: payload });
        return;
      }

      // Use set without merge=false when new, merge=true when existing. Always unique doc id per Call SID.
      const ref = db.collection('calls').doc(id);
      const snap = await ref.get();
      if (snap.exists){
        await ref.set(payload, { merge: true });
      } else {
        await ref.set(payload, { merge: false });
      }
      const saved = (await ref.get()).data() || payload;
      res.status(200).json({ ok:true, call: { id, ...saved } });
      return;
    }

    res.status(405).json({ ok:false, error:'Method not allowed' });
  }catch(err){
    console.error('[api/calls] Error:', err);
    res.status(500).json({ ok:false, error:'Internal error', message: err?.message });
  }
}


