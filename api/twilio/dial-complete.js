// Twilio Dial Complete Handler
// Handles when a bridged call completes to prevent automatic retry

const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { CallSid, DialCallStatus, DialCallDuration, DialCallSid } = req.body;
    
    console.log('[DialComplete] Call completed:', {
      callSid: CallSid,
      childCallSid: DialCallSid,
      status: DialCallStatus,
      duration: DialCallDuration
    });

    // Fallback: Start dual-channel recording on child call if we have the DialCallSid
    if (DialCallSid && DialCallStatus === 'completed') {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (accountSid && authToken) {
          const client = twilio(accountSid, authToken);
          await client.calls(DialCallSid).recordings.create({
            recordingChannels: 'dual',
            recordingTrack: 'both',
            recordingStatusCallback: (process.env.PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL}` || 'https://power-choosers-crm.vercel.app') + '/api/twilio/recording',
            recordingStatusCallbackMethod: 'POST'
          });
          console.log('[DialComplete] Started dual recording for child leg', DialCallSid);
        }
      } catch (e) { 
        console.warn('[DialComplete] Failed to start recording on child leg:', e?.message); 
      }
    }

    // Create TwiML response that ENDS the call without retry
    const twiml = new VoiceResponse();
    
    // Different responses based on dial outcome
    switch (DialCallStatus) {
      case 'completed':
        console.log('[DialComplete] Call completed normally - ending call');
        // Don't say anything, just hang up
        twiml.hangup();
        break;
        
      case 'busy':
        console.log('[DialComplete] Target was busy - ending call');
        twiml.say('The number you called is busy.');
        twiml.hangup();
        break;
        
      case 'no-answer':
        console.log('[DialComplete] No answer - ending call');
        twiml.say('No answer.');
        twiml.hangup();
        break;
        
      case 'failed':
        console.log('[DialComplete] Call failed - ending call');
        twiml.say('Call failed.');
        twiml.hangup();
        break;
        
      default:
        console.log('[DialComplete] Unknown status:', DialCallStatus, '- ending call');
        twiml.hangup();
        break;
    }

    // Send TwiML response
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(twiml.toString());
    
  } catch (error) {
    console.error('[DialComplete] Error:', error);
    
    // Return hangup TwiML on error
    const twiml = new VoiceResponse();
    twiml.hangup();
    
    res.setHeader('Content-Type', 'text/xml');
    res.status(500).send(twiml.toString());
  }
}
