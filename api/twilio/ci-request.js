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

  // Compute absolute base URL once (prefer PUBLIC_BASE_URL for webhook callbacks)
  const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  const base = envBase || (host ? `${proto}://${host}` : 'https://power-choosers-crm.vercel.app');

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

    if (!serviceSid) {
      res.statusCode = 500; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: 'Conversational Intelligence service not configured. Missing TWILIO_INTELLIGENCE_SERVICE_SID environment variable.' }));
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
                try {
                  const fetched = await client.recordings(rec.sid).fetch();
                  channels = fetched?.channels;
                  rec.source = rec.source || fetched?.source;
                  // Capture duration when available for better ranking
                  if (rec.duration == null && fetched && (fetched.duration != null || fetched.durationSec != null)) {
                    rec.duration = fetched.duration != null ? Number(fetched.duration) : Number(fetched.durationSec);
                  }
                } catch(_){ }
              }
              const isDual = String(channels||'') === '2';
              if (isDual){ dual.push(rec); } else { others.push(rec); }
            }
            const sortByDurDescThenDate = (a,b)=>{
              const da = (a.duration != null ? Number(a.duration) : -1);
              const db = (b.duration != null ? Number(b.duration) : -1);
              if (db !== da) return db - da;
              const tb = new Date(b.dateCreated||b.startTime||0).getTime();
              const ta = new Date(a.dateCreated||a.startTime||0).getTime();
              return tb - ta;
            };
            const sortByDateDesc = (a,b)=> new Date(b.dateCreated||b.startTime||0) - new Date(a.dateCreated||a.startTime||0);
            if (dual.length){
              // Prefer source=Dial, then most recent
              const dial = dual.filter(r=> String(r.source||'').toLowerCase()==='dial').sort(sortByDurDescThenDate);
              if (dial.length) return dial[0].sid;
              dual.sort(sortByDurDescThenDate);
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
      console.log(`[CI Request] Looking up recording for call: ${callSid}`);
      recordingSid = await selectPreferredRecordingByCall(callSid, 5);
      console.log(`[CI Request] Found recording: ${recordingSid}`);
    }

    if (!recordingSid){
      console.error(`[CI Request] No recording found for call: ${callSid}`);
      res.statusCode = 404; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: 'Recording not found for call', callSid }));
      return;
    }

    console.log(`[CI Request] Using recording: ${recordingSid} for call: ${callSid}`);

    if (!ciTranscriptSid){
      // Determine channel mapping for proper speaker separation
      let agentChannelNum = 1; // Default to channel 1 for agent
      try {
        let callResource = null;
        try { callResource = await client.calls(callSid).fetch(); } catch(_) {}
        const fromStr = callResource?.from || '';
        const toStr = callResource?.to || '';
        const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
        const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
          .split(',').map(norm).filter(Boolean);
        const from10 = norm(fromStr);
        const to10 = norm(toStr);
        const isBiz = (p) => !!p && envBiz.includes(p);
        const fromIsClient = /^client:/i.test(fromStr);
        // Heuristic: Agent is the "from" leg when from is Voice SDK client or our business number; otherwise agent is the "to" leg
        const fromIsAgent = fromIsClient || isBiz(from10) || (!isBiz(to10) && fromStr && fromStr !== toStr);
        agentChannelNum = fromIsAgent ? 1 : 2;
        console.log(`[CI Request] Channel-role mapping: agent on channel ${agentChannelNum} (from=${fromStr}, to=${toStr})`);
      } catch (e) {
        console.warn('[CI Request] Failed to compute channel-role mapping, defaulting agent to channel 1:', e?.message);
      }

      // Create CI transcript with proper channel participants for speaker separation
      const webhookUrl = `${base}/api/twilio/conversational-intelligence-webhook`;
      
      const createArgs = { 
        serviceSid, 
        channel: { 
          media_properties: { source_sid: recordingSid },
          participants: [
            { role: 'Agent', channel_participant: agentChannelNum },
            { role: 'Customer', channel_participant: agentChannelNum === 1 ? 2 : 1 }
          ]
        }, 
        customerKey: callSid,
        webhookUrl: webhookUrl,
        webhookMethod: 'POST'
      };
      
      const idemKey = (callSid && recordingSid) ? `${callSid}-${recordingSid}` : undefined;
      const created = idemKey
        ? await client.intelligence.v2.transcripts.create(createArgs, { idempotencyKey: idemKey })
        : await client.intelligence.v2.transcripts.create(createArgs);
      ciTranscriptSid = created.sid;
      
      console.log(`[CI Request] Created transcript: ${ciTranscriptSid}, status: ${created.status}`);
      
      // Poll transcript status to ensure it's processing
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        try {
          const transcript = await client.intelligence.v2.transcripts(ciTranscriptSid).fetch();
          console.log(`[CI Request] Transcript ${ciTranscriptSid} status: ${transcript.status}`);
          
          if (transcript.status === 'completed') {
            console.log(`[CI Request] Transcript completed immediately: ${ciTranscriptSid}`);
            break;
          } else if (transcript.status === 'failed') {
            console.error(`[CI Request] Transcript failed: ${ciTranscriptSid}`, transcript);
            throw new Error(`Transcript processing failed: ${transcript.status}`);
          } else if (['queued', 'in-progress'].includes(transcript.status)) {
            console.log(`[CI Request] Transcript processing: ${transcript.status}`);
            break;
          }
        } catch (e) {
          console.warn(`[CI Request] Error checking transcript status (attempt ${attempts + 1}):`, e.message);
        }
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
      }
    }

    // Persist request flags so webhook only processes allowed transcripts
    try{
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
    res.end(JSON.stringify({ 
      ok: true, 
      transcriptSid: ciTranscriptSid, 
      recordingSid,
      message: 'Transcript processing started. Check status via webhook or polling.',
      webhookUrl: `${base}/api/twilio/conversational-intelligence-webhook`
    }));
  }catch(e){
    console.error('[ci-request] Error:', e);
    console.error('[ci-request] Error details:', {
      message: e?.message,
      code: e?.code,
      status: e?.status,
      statusCode: e?.statusCode,
      moreInfo: e?.moreInfo,
      details: e?.details
    });
    const twilioCode = e && (e.code || e.status || e.statusCode);
    let friendly = 'Failed to request CI';
    if (twilioCode === 31000) friendly = 'Recording not found or not ready';
    else if (twilioCode === 31001) friendly = 'Recording is not dual-channel';
    else if (twilioCode === 31002) friendly = 'Recording is too short or empty';
    else if (twilioCode === 31003) friendly = 'Service temporarily unavailable';
    else if (twilioCode === 20003) friendly = 'Authentication failed - check Twilio credentials';
    else if (twilioCode === 20404) friendly = 'Resource not found';
    else if (twilioCode === 21211) friendly = 'Invalid phone number format';
    res.statusCode = (twilioCode && Number(twilioCode) >= 400 && Number(twilioCode) < 600) ? 400 : 500;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ 
      error: friendly, 
      details: e?.message, 
      code: twilioCode,
      moreInfo: e?.moreInfo,
      fullError: e?.toString()
    }));
  }
}


