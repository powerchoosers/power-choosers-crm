// Twilio Dial Complete Handler
// Handles when a bridged call completes to prevent automatic retry

import twilio from 'twilio';
import logger from '../_logger.js';
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
  // Twilio generally POSTs to this endpoint, but we allow GET for health checks or debugging
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Handle GET requests immediately with 200 OK
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  try {
    // robust body parsing similar to status.js
    let body = req.body;
    const ct = (req.headers['content-type'] || '').toLowerCase();

    if (typeof body === 'string') {
      try {
        if (ct.includes('application/json')) {
          body = JSON.parse(body);
        }
      } catch (_) { }

      if (typeof body === 'string') {
        try {
          const params = new URLSearchParams(body);
          const obj = {};
          for (const [key, value] of params.entries()) {
            obj[key] = value;
          }
          body = obj;
        } catch (_) { }
      }
    }

    if (!body || typeof body !== 'object') {
      body = req.query || {};
    }

    const { CallSid, DialCallStatus, DialCallDuration, DialCallSid } = body;

    logger.log('[DialComplete] Call completed:', {
      callSid: CallSid,
      childCallSid: DialCallSid,
      status: DialCallStatus,
      duration: DialCallDuration
    });

    // Create TwiML response that ENDS the call without retry
    const twiml = new VoiceResponse();

    // Different responses based on dial outcome
    // We strictly use <Hangup/> to ensure call ends cleanly without system messages
    switch (DialCallStatus) {
      case 'completed':
      case 'answered':
        twiml.hangup();
        break;

      case 'busy':
        twiml.say('The number you called is busy.');
        twiml.hangup();
        break;

      case 'no-answer':
        twiml.say('No answer.');
        twiml.hangup();
        break;

      case 'failed':
        twiml.say('Call failed.');
        twiml.hangup();
        break;

      default:
        // For unknown statuses or cancellations, just hang up silently
        logger.log('[DialComplete] Unhandled status:', DialCallStatus);
        twiml.hangup();
        break;
    }

    const xml = twiml.toString();
    res.setHeader('Content-Type', 'text/xml');
    res.writeHead(200);
    res.end(xml);
    return;

  } catch (error) {
    logger.error('[DialComplete] Error:', error);

    // CRITICAL: Always return 200 OK with valid TwiML to prevent "Application Error" audio
    const twiml = new VoiceResponse();
    twiml.hangup();

    const xml = twiml.toString();
    res.setHeader('Content-Type', 'text/xml');
    res.writeHead(200);
    res.end(xml);
    return;
  }
}
