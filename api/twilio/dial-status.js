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
    
    console.log('[Dial-Status]', { 
      event, 
      parentSid, 
      childSid, 
      from: body.From, 
      to: body.To,
      direction: body.Direction 
    });

    // Start dual-channel recording on the child leg when call is answered or in-progress
    // This is a fallback in case Dial's built-in recording doesn't work
    if ((event === 'in-progress' || event === 'answered') && childSid) {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        
        if (accountSid && authToken) {
          const client = twilio(accountSid, authToken);
          
          // Check if recording already exists, if not start dual-channel recording
          const existingRecordings = await client.calls(childSid).recordings.list({ limit: 1 });
          
          if (existingRecordings.length === 0) {
            await client.calls(childSid).recordings.create({
              recordingChannels: 'dual',
              recordingTrack: 'both',
              recordingStatusCallback: (process.env.PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL}` || 'https://power-choosers-crm.vercel.app') + '/api/twilio/recording',
              recordingStatusCallbackMethod: 'POST'
            });
            console.log('[Dial-Status] ✅ Started DUAL-CHANNEL recording for child leg', childSid);
          } else {
            console.log('[Dial-Status] 📝 Recording already exists for child leg', childSid, 'channels:', existingRecordings[0]?.channels || 'unknown');
            
            // If existing recording is mono, try to start a dual-channel one
            if (existingRecordings[0]?.channels === 1) {
              try {
                await client.calls(childSid).recordings.create({
                  recordingChannels: 'dual',
                  recordingTrack: 'both',
                  recordingStatusCallback: (process.env.PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL}` || 'https://power-choosers-crm.vercel.app') + '/api/twilio/recording',
                  recordingStatusCallbackMethod: 'POST'
                });
                console.log('[Dial-Status] ✅ Started additional DUAL-CHANNEL recording to override mono', childSid);
              } catch (e) {
                console.log('[Dial-Status] ⚠️ Could not start additional recording:', e.message);
              }
            }
          }
        } else {
          console.warn('[Dial-Status] Missing Twilio credentials');
        }
      } catch (e) { 
        console.warn('[Dial-Status] Failed to start recording on child leg:', e?.message); 
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


