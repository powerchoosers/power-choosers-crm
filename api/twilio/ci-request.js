import twilio from 'twilio';
import { db } from '../_firebase.js';

function cors(req, res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if (req.method === 'OPTIONS'){ res.writeHead(200); res.end(); return true; }
  return false;
}

async function readJson(req){
  return await new Promise((resolve) =>{
    try{
      let b='';
      req.on('data', c=>{ b += c; });
      req.on('end', ()=>{ try{ resolve(b ? JSON.parse(b) : {}); }catch(_){ resolve({}); } });
      req.on('error', ()=> resolve({}));
    }catch(_){ resolve({}); }
  });
}

export default async function handler(req, res){
  if (cors(req,res)) return;
  if (req.method !== 'POST'){
    res.statusCode = 405; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try{
    const body = await readJson(req);
    const callSid = String(body.callSid || '').trim();
    let recordingSid = String(body.recordingSid || '').trim();
    const serviceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID || undefined;

    if (!callSid && !recordingSid){
      res.statusCode = 400; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: 'callSid or recordingSid is required' }));
      return;
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // If we already created a transcript for this call, return it
    let ciTranscriptSid = '';
    let existingRecordingSid = '';
    try{
      if (db && callSid){
        const snap = await db.collection('calls').doc(callSid).get();
        if (snap.exists){
          const data = snap.data() || {};
          if (data.ciTranscriptSid) ciTranscriptSid = String(data.ciTranscriptSid);
          if (data.recordingSid) existingRecordingSid = String(data.recordingSid);
          // Try to parse from recordingUrl if present
          if (!existingRecordingSid && data.recordingUrl){
            try{
              const m = String(data.recordingUrl).match(/Recordings\/([A-Z0-9]+)\.mp3/i);
              if (m && m[1]) existingRecordingSid = m[1];
            }catch(_){ }
          }
        }
      }
    }catch(_){ }

    // Prefer provided recordingSid, then existing one from Firestore
    if (!recordingSid && existingRecordingSid) recordingSid = existingRecordingSid;

    // Helper: select preferred recording (dual-channel + completed, most recent)
    async function selectPreferredRecordingByCall(callSid, maxAttempts = 5){
      const backoffs = [2000, 4000, 8000, 16000, 0]; // ~30s total
      for (let attempt = 0; attempt < Math.min(maxAttempts, backoffs.length); attempt++){
        try{
          const list = await client.recordings.list({ callSid, limit: 20 });
          const items = Array.isArray(list) ? list : [];
          if (items.length){
            // Try to find dual-channel first, then latest completed
            // Some SDKs expose channels on the list item; if not, we can fetch details lazily
            let dual = [];
            const others = [];
            for (const rec of items){
              const statusOk = !rec.status || String(rec.status).toLowerCase() === 'completed';
              if (!statusOk) { others.push(rec); continue; }
              let channels = rec.channels;
              if (channels == null){
                try { const fetched = await client.recordings(rec.sid).fetch(); channels = fetched?.channels; rec.source = rec.source || fetched?.source; } catch(_){ }
              }
              const isDual = String(channels||'') === '2';
              if (isDual){ dual.push(rec); } else { others.push(rec); }
            }
            const sortByDateDesc = (a,b)=> new Date(b.dateCreated||b.startTime||0) - new Date(a.dateCreated||a.startTime||0);
            if (dual.length){
              // Prefer source=Dial, then most recent
              const dial = dual.filter(r=> String(r.source||'').toLowerCase()==='dial').sort(sortByDateDesc);
              if (dial.length) return dial[0].sid;
              dual.sort(sortByDateDesc);
              return dual[0].sid;
            }
            // Fallback: any completed, most recent
            const completed = items.filter(r=> !r.status || String(r.status).toLowerCase()==='completed').sort(sortByDateDesc);
            if (completed.length){ return completed[0].sid; }
          }
        }catch(_){ }
        const baseDelay = backoffs[attempt] || 0;
        const jitter = baseDelay ? Math.floor(Math.random() * 1000) : 0; // add up to 1s jitter to avoid thundering herd
        const delay = baseDelay + jitter;
        if (delay) await new Promise(r => setTimeout(r, delay));
      }
      return '';
    }

    // If still missing, try to resolve via Twilio by Call SID with backoff
    if (!recordingSid && callSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN){
      recordingSid = await selectPreferredRecordingByCall(callSid, 5);
    }

    if (!recordingSid){
      res.statusCode = 404; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: 'Recording not found for call', callSid }));
      return;
    }

    if (!ciTranscriptSid){
      const createArgs = serviceSid ? { serviceSid, channel: { media_properties: { source_sid: recordingSid } }, customerKey: callSid } : { channel: { media_properties: { source_sid: recordingSid } }, customerKey: callSid };
      const idemKey = (callSid && recordingSid) ? `${callSid}-${recordingSid}` : undefined;
      const created = idemKey
        ? await client.intelligence.v2.transcripts.create(createArgs, { idempotencyKey: idemKey })
        : await client.intelligence.v2.transcripts.create(createArgs);
      ciTranscriptSid = created.sid;
    }

    // Persist request flags so webhook only processes allowed transcripts
    try{
      const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';
      await fetch(`${base}/api/calls`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          callSid,
          recordingSid,
          conversationalIntelligence: { transcriptSid: ciTranscriptSid, status: 'queued' },
          aiInsights: null,
          ciRequested: true,
          ciTranscriptSid: ciTranscriptSid
        })
      }).catch(()=>{});
    }catch(_){ }

    res.statusCode = 202; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ ok: true, transcriptSid: ciTranscriptSid, recordingSid }));
  }catch(e){
    console.error('[ci-request] Error:', e);
    const twilioCode = e && (e.code || e.status || e.statusCode);
    let friendly = 'Failed to request CI';
    if (twilioCode === 31000) friendly = 'Recording not found or not ready';
    else if (twilioCode === 31001) friendly = 'Recording is not dual-channel';
    else if (twilioCode === 31002) friendly = 'Recording is too short or empty';
    else if (twilioCode === 31003) friendly = 'Service temporarily unavailable';
    res.statusCode = (twilioCode && Number(twilioCode) >= 400 && Number(twilioCode) < 600) ? 400 : 500;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ error: friendly, details: e?.message, code: twilioCode }));
  }
}


