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
            }catch(_){}
          }
        }
      }
    }catch(_){ }

    // Prefer provided recordingSid, then existing one from Firestore
    if (!recordingSid && existingRecordingSid) recordingSid = existingRecordingSid;

    // If still missing, try to resolve via Twilio by Call SID
    if (!recordingSid && callSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN){
      try{
        const recs = await client.recordings.list({ callSid, limit: 1 });
        if (Array.isArray(recs) && recs.length){
          recordingSid = recs[0].sid;
        }
      }catch(_){ }
    }

    if (!recordingSid){
      res.statusCode = 404; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: 'Recording not found for call', callSid }));
      return;
    }

    if (!ciTranscriptSid){
      const createArgs = serviceSid ? { serviceSid, channel: { media_properties: { source_sid: recordingSid } } } : { channel: { media_properties: { source_sid: recordingSid } } };
      const created = await client.intelligence.v2.transcripts.create(createArgs);
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
    res.statusCode = 500; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ error: 'Failed to request CI', details: e?.message }));
  }
}


