// Dial status callback: start dual-channel recording on the bridged child leg
const twilio = require('twilio');

export default async function handler(req, res) {
  // Twilio posts x-www-form-urlencoded data for dial status callbacks
  try {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    let body = req.body;
    
    // Robust body parsing for different content types
    if (typeof body === 'string') {
      try { 
        if (ct.includes('application/json')) {
          body = JSON.parse(body); 
        }
      } catch(_) {}
      
      if (typeof body === 'string') {
        try { 
          const params = new URLSearchParams(body);
          const obj = {};
          for (const [key, value] of params.entries()) {
            obj[key] = value;
          }
          body = obj;
        } catch(_) {}
      }
    }
    
    if (!body || typeof body !== 'object') {
      body = req.query || {};
    }

    // Determine the dial status event - prioritize more specific status fields
    const event = (body.DialCallStatus || body.CallStatus || body.DialStatus || body.CallStatusEvent || '').toLowerCase();
    const parentSid = body.ParentCallSid || body.CallSid || '';
    const childSid = body.DialCallSid || '';
    
    // Prefer starting recordings on the PARENT call for reliable dual-channel capture
    const targetSid = parentSid || childSid;
    
    console.log('[Dial-Status]', { 
      event, 
      parentSid, 
      childSid,
      targetSid,
      from: body.From, 
      to: body.To,
      direction: body.Direction 
    });

    // Start dual-channel recording when answered/in-progress/completed (to catch edge cases)
    // IMPORTANT: Only start REST API recording if NO TwiML DialVerb recording exists to avoid interference
    if ((event === 'in-progress' || event === 'answered' || event === 'completed') && targetSid) {
      console.log('[Dial-Status] Event triggered, will check for DialVerb recordings after 5-second delay...');
      
      // Wait 5 seconds for TwiML recording to appear in REST API, then check for DialVerb recording
      setTimeout(async () => {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        // Compute absolute base URL from request headers first; fallback to env
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const envBase = (process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''));
        const baseUrl = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm.vercel.app');
        
        if (accountSid && authToken) {
          const client = twilio(accountSid, authToken);
          
          // Build a candidate list of call SIDs to try, prioritizing PSTN child legs
          const candidates = new Set();
          const pstnCandidates = new Set();
          
          // Identify if provided child is PSTN (not client)
          if (childSid) {
            const isChildPstn = body.To && body.From && 
                              !body.To.startsWith('client:') && 
                              !body.From.startsWith('client:') &&
                              body.Direction === 'outbound-dial';
            if (isChildPstn) {
              pstnCandidates.add(childSid);
              console.log('[Dial-Status] Identified PSTN child leg:', childSid, 'To:', body.To);
            } else {
              candidates.add(childSid);
            }
          }
          if (parentSid) candidates.add(parentSid);
          
          // Discover children of the parent and separate PSTN vs client legs
          try {
            if (parentSid) {
              const kids = await client.calls.list({ parentCallSid: parentSid, limit: 10 });
              for (const k of kids) {
                const isClient = (k.from || '').startsWith('client:') || (k.to || '').startsWith('client:');
                const isPstn = !isClient && k.direction === 'outbound-dial';
                if (isPstn) {
                  pstnCandidates.add(k.sid);
                  console.log('[Dial-Status] Found PSTN child leg:', k.sid, 'To:', k.to, 'Direction:', k.direction);
                } else {
                  candidates.add(k.sid);
                }
              }
              console.log('[Dial-Status] Discovered child legs:', kids.map(c => ({ sid: c.sid, from: c.from, to: c.to, direction: c.direction, isPstn: !((c.from || '').startsWith('client:') || (c.to || '').startsWith('client:')) && c.direction === 'outbound-dial' })));
            }
          } catch (discErr) {
            console.log('[Dial-Status] Child discovery failed:', discErr?.message);
          }
          
          // Try to start a dual-channel recording on the first candidate that succeeds
          // Prioritize PSTN child legs first, then other candidates
          let started = false; let startedOn = ''; let channelsSeen = 0;
          const pstnList = Array.from(pstnCandidates);
          const candList = [...pstnList, ...Array.from(candidates)];
          
          console.log('[Dial-Status] Candidate priority order:', { pstnFirst: pstnList, others: Array.from(candidates) });
          for (let i = 0; i < candList.length; i++) {
            const sid = candList[i];
            try {
              // Check specifically for DialVerb recordings (TwiML dual-channel)
              const existing = await client.calls(sid).recordings.list({ limit: 5 });
              console.log('[Dial-Status] Existing recordings on', sid, ':', existing.map(r => ({ 
                sid: r.sid, 
                channels: r.channels, 
                status: r.status, 
                source: r.source,
                track: r.track 
              })));
              
              // Skip REST API fallback if DialVerb recording exists (TwiML dual-channel)
              const hasDialVerbRecording = existing.some(r => r.source === 'DialVerb' && r.status !== 'stopped');
              if (hasDialVerbRecording) { 
                console.log('[Dial-Status] DialVerb recording already exists on', sid, '- skipping REST API fallback to avoid interference'); 
                started = true; 
                startedOn = sid; 
                channelsSeen = 2; 
                break; 
              }
              
              const hasDual = existing.some(r => (Number(r.channels) || 0) === 2 && r.status !== 'stopped');
              if (hasDual) { console.log('[Dial-Status] Dual recording already active on', sid); started = true; startedOn = sid; channelsSeen = 2; break; }

              // If some mono recording is active, stop it so we can start dual
              const active = existing.find(r => r.status !== 'stopped');
              if (active && (Number(active.channels) || 0) === 1) {
                try {
                  await client.calls(sid).recordings('Twilio.CURRENT').update({ status: 'stopped' });
                  console.log('[Dial-Status] ⏹️ Stopped active mono recording on', sid, '->', active.sid);
                } catch (stopErr) {
                  console.log('[Dial-Status] Could not stop active recording on', sid, ':', stopErr?.message);
                }
              }

              const rec = await client.calls(sid).recordings.create({
                recordingChannels: 'dual',
                recordingTrack: 'both',
                recordingStatusCallback: baseUrl + '/api/twilio/recording',
                recordingStatusCallbackMethod: 'POST'
              });
              console.log('[Dial-Status] ➕ start result:', { sid: rec.sid, channels: rec.channels, source: rec.source, track: rec.track, callSid: sid });
              const ch = Number(rec.channels) || 0;
              if (ch === 2) { started = true; startedOn = sid; channelsSeen = 2; break; }
              // If mono came back, try the next candidate after stopping this one
              channelsSeen = Math.max(channelsSeen, ch);
              try {
                await client.calls(sid).recordings(rec.sid).update({ status: 'stopped' });
                console.log('[Dial-Status] ⏹️ Immediately stopped mono recording', rec.sid, 'on', sid, 'and trying next candidate');
              } catch(_) {}
            } catch (tryErr) {
              console.log('[Dial-Status] Try start on', sid, 'failed:', tryErr?.message);
            }
          }
          
          if (started) {
            console.log('[Dial-Status] ✅ Started recording on', startedOn, '(dual confirmed)');
            // Telemetry: log success to Firestore (best-effort)
            try {
              const { db } = require('../_firebase');
              if (db) {
                await db.collection('twilio_webhooks').add({
                  type: 'dial-status',
                  ts: new Date().toISOString(),
                  event,
                  started: true,
                  startedOn,
                  parentSid,
                  childSid,
                  pstnCandidates: pstnList,
                  otherCandidates: Array.from(candidates),
                  body
                });
              }
            } catch(_) {}
          } else {
            console.warn('[Dial-Status] ❌ Unable to start dual recording (last channels seen:', channelsSeen, ')');
            // Telemetry: log failure to Firestore (best-effort)
            try {
              const { db } = require('../_firebase');
              if (db) {
                await db.collection('twilio_webhooks').add({
                  type: 'dial-status',
                  ts: new Date().toISOString(),
                  event,
                  started: false,
                  parentSid,
                  childSid,
                  pstnCandidates: pstnList,
                  otherCandidates: Array.from(candidates),
                  lastChannelsSeen: channelsSeen,
                  body
                });
              }
            } catch(_) {}
          }
        } else {
          console.warn('[Dial-Status] Missing Twilio credentials');
        }
      } catch (e) { 
        console.warn('[Dial-Status] Failed to start recording:', e?.message); 
      }
      }, 5000); // 5-second delay as recommended by Twilio
    } else if (!childSid && event === 'answered') {
      console.warn('[Dial-Status] No DialCallSid available for recording - Dial may not be configured properly');
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('[Dial-Status] Error:', e);
    res.status(200).send('OK');
  }
}


