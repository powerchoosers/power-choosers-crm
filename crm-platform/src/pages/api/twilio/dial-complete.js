// Twilio Dial Complete Handler
// Handles when a bridged call completes to prevent automatic retry

import twilio from 'twilio';
import logger from '../_logger.js';
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { CallSid, DialCallStatus, DialCallDuration, DialCallSid } = req.body;
    
    logger.log('[DialComplete] Call completed:', {
      callSid: CallSid,
      childCallSid: DialCallSid,
      status: DialCallStatus,
      duration: DialCallDuration
    });

    // Log completion details for debugging
    logger.log('[DialComplete] Dial operation completed:', {
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
        logger.log('[DialComplete] Call completed normally - ending call');
        // Don't say anything, just hang up
        twiml.hangup();
        break;
        
      case 'busy':
        logger.log('[DialComplete] Target was busy - ending call');
        twiml.say('The number you called is busy.');
        twiml.hangup();
        break;
        
      case 'no-answer':
        logger.log('[DialComplete] No answer - ending call');
        twiml.say('No answer.');
        twiml.hangup();
        break;
        
      case 'failed':
        logger.log('[DialComplete] Call failed - ending call');
        twiml.say('Call failed.');
        twiml.hangup();
        break;
        
      default:
        logger.log('[DialComplete] Unknown status:', DialCallStatus, '- ending call');
        twiml.hangup();
        break;
    }

    // Send TwiML response
    const xml = twiml.toString();
    res.setHeader('Content-Type', 'text/xml');
    res.writeHead(200);
    res.end(xml);
    return;
    
  } catch (error) {
    logger.error('[DialComplete] Error:', error);
    
    // Return hangup TwiML on error
    const twiml = new VoiceResponse();
    twiml.hangup();
    
    const xml = twiml.toString();
    res.setHeader('Content-Type', 'text/xml');
    res.writeHead(500);
    res.end(xml);
    return;
  }
}
