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

  // Handle GET requests immediately with 200 OK and XML Hangup (to silence "Okay")
  if (req.method === 'GET') {
    const twiml = new VoiceResponse();
    twiml.hangup();

    // Ensure XML content type to prevent Twilio TTS fallback
    res.setHeader('Content-Type', 'text/xml');
    res.writeHead(200);
    res.end(twiml.toString());
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

    // ================================================================
    // STEP 1: LOG TO SUPABASE *BEFORE* responding to Twilio.
    // ================================================================
    if (CallSid) {
      try {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host || req.headers['x-forwarded-host'] || '';
        const requestUrl = new URL(req.url, `${protocol}://${host}`);
        const contactId = requestUrl.searchParams.get('contactId');
        const accountId = requestUrl.searchParams.get('accountId');
        const agentId = requestUrl.searchParams.get('agentId');
        const agentEmail = requestUrl.searchParams.get('agentEmail');
        const targetPhoneFromQuery = requestUrl.searchParams.get('targetPhone');

        const { upsertCallInSupabase } = await import('../calls.js');
        await upsertCallInSupabase({
          callSid: DialCallSid || CallSid,
          status: 'completed',
          duration: parseInt(DialCallDuration || '0', 10),
          contactId: contactId || null,
          accountId: accountId || null,
          agentId: agentId || null,
          agentEmail: agentEmail || null,
          targetPhone: targetPhoneFromQuery || body.To || '',
          source: 'dial-complete'
        }).catch(err => {
          logger.error('[DialComplete] Supabase log failed:', err?.message);
        });
        logger.log('[DialComplete] ✅ Final state logged to Supabase');
      } catch (logErr) {
        logger.error('[DialComplete] Error logging call:', logErr?.message);
      }
    }

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
