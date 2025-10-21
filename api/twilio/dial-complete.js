// Twilio Dial Complete Handler
// Handles when a bridged call completes to prevent automatic retry

import twilio from 'twilio';
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
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

    // Log completion details for debugging
    console.log('[DialComplete] Dial operation completed:', {
      parentCallSid: CallSid,
      childCallSid: DialCallSid,
      finalStatus: DialCallStatus,
      duration: DialCallDuration
    });
    
    // Note: We do NOT start recording here as the call is already completed
    // Recording should have been started during 'answered' or 'in-progress' status

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
