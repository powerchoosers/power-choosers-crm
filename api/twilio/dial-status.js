// Dial status callback: start dual-channel recording on the bridged child leg
const twilio = require('twilio');

export default async function handler(req, res) {
  // Twilio posts x-www-form-urlencoded
  try {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    let body = req.body;
    if (typeof body === 'string') {
      try { if (ct.includes('application/json')) body = JSON.parse(body); } catch(_) {}
      if (typeof body === 'string') {
        try { const p = new URLSearchParams(body); const o={}; for (const [k,v] of p.entries()) o[k]=v; body=o; } catch(_) {}
      }
    }
    if (!body || typeof body !== 'object') body = {};

    const event = (body.CallStatus || body.DialCallStatus || body.DialStatus || '').toLowerCase();
    const parentSid = body.CallSid || '';
    const childSid = body.DialCallSid || '';
    console.log('[Dial-Status]', { event, parentSid, childSid, from: body.From, to: body.To });

    if (event === 'in-progress' || event === 'answered') {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (accountSid && authToken && childSid) {
          const client = twilio(accountSid, authToken);
          await client.calls(childSid).recordings.create({
            recordingChannels: 'dual',
            recordingTrack: 'both',
            recordingStatusCallback: (process.env.PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL}` || 'https://power-choosers-crm.vercel.app') + '/api/twilio/recording',
            recordingStatusCallbackMethod: 'POST'
          });
          console.log('[Dial-Status] Started dual recording for child leg', childSid);
        }
      } catch (e) { console.warn('[Dial-Status] Failed to start recording on child leg:', e?.message); }
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('[Dial-Status] Error:', e);
    res.status(200).send('OK');
  }
}


