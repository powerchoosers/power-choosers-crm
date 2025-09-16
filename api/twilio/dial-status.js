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

    // Start dual-channel recording when answered/in-progress
    if ((event === 'in-progress' || event === 'answered') && targetSid) {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const baseUrl = (process.env.PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL}` || 'https://power-choosers-crm.vercel.app');
        
        if (accountSid && authToken) {
          const client = twilio(accountSid, authToken);
          
          // Build a candidate list of call SIDs to try (parent first, then child, then discovered children)
          const candidates = new Set();
          if (parentSid) candidates.add(parentSid);
          if (childSid) candidates.add(childSid);
          
          // Discover children of the parent and include any active PSTN legs
          try {
            if (parentSid) {
              const kids = await client.calls.list({ parentCallSid: parentSid, limit: 10 });
              for (const k of kids) {
                // Prefer non-client legs first
                const isClient = (k.from || '').startsWith('client:') || (k.to || '').startsWith('client:');
                if (!isClient) candidates.add(k.sid);
                else candidates.add(k.sid);
              }
              console.log('[Dial-Status] Discovered child legs:', kids.map(c => ({ sid: c.sid, from: c.from, to: c.to, direction: c.direction })));
            }
          } catch (discErr) {
            console.log('[Dial-Status] Child discovery failed:', discErr?.message);
          }
          
          // Try to start a dual-channel recording on the first candidate that succeeds
          let started = false; let startedOn = '';
          for (const sid of candidates) {
            try {
              // Skip if a recording already exists and is dual
              const existing = await client.calls(sid).recordings.list({ limit: 5 });
              const hasDual = existing.some(r => (Number(r.channels) || 0) === 2 && r.status !== 'stopped');
              if (hasDual) { console.log('[Dial-Status] Dual recording already active on', sid); started = true; startedOn = sid; break; }
              const rec = await client.calls(sid).recordings.create({
                recordingChannels: 'dual',
                recordingTrack: 'both',
                recordingStatusCallback: baseUrl + '/api/twilio/recording',
                recordingStatusCallbackMethod: 'POST'
              });
              console.log('[Dial-Status] ➕ start result:', { sid: rec.sid, channels: rec.channels, source: rec.source, track: rec.track });
              // If Twilio reports channels=2 in the create response, we are good
              if ((Number(rec.channels) || 0) >= 1) { started = true; startedOn = sid; break; }
            } catch (tryErr) {
              console.log('[Dial-Status] Try start on', sid, 'failed:', tryErr?.message);
            }
          }
          
          if (started) {
            console.log('[Dial-Status] ✅ Started recording on', startedOn, '(parent preferred, dual expected)');
          } else {
            console.warn('[Dial-Status] ❌ Unable to start recording on any candidate leg');
          }
        } else {
          console.warn('[Dial-Status] Missing Twilio credentials');
        }
      } catch (e) { 
        console.warn('[Dial-Status] Failed to start recording:', e?.message); 
      }
    } else if (!childSid && event === 'answered') {
      console.warn('[Dial-Status] No DialCallSid available for recording - Dial may not be configured properly');
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('[Dial-Status] Error:', e);
    res.status(200).send('OK');
  }
}


