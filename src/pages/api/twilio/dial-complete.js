// Twilio Dial Complete Handler
// Handles when a bridged call completes to prevent automatic retry

import twilio from 'twilio';
import logger from '../_logger.js';
import { supabaseAdmin } from '../../../lib/supabase.ts';
import { getVoicemailGreeting, resolveUserForBusinessNumber } from '../../../lib/voicemail.ts';
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

    // If body is empty but query has Twilio params, use query (redirect lost POST body)
    if (Object.keys(body).length === 0 && req.query && Object.keys(req.query).length > 0) {
      logger.warn('[DialComplete] POST body was empty, falling back to query params');
      body = req.query;
    }

    const { CallSid, DialCallStatus, DialCallDuration, DialCallSid } = body;
    const normalizedDialStatus = String(DialCallStatus || '').toLowerCase();

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
        const businessPhoneFromQuery = requestUrl.searchParams.get('businessPhone');

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
          businessPhone: businessPhoneFromQuery || undefined,
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
    const shouldPlayVoicemail = ['no-answer', 'busy'].includes(normalizedDialStatus);
    let voicemailGreeting = null;

    if (shouldPlayVoicemail) {
      try {
        const candidateNumber = businessPhoneFromQuery || targetPhoneFromQuery || body.To || body.From || '';
        const { data: users, error } = await supabaseAdmin
          .from('users')
          .select('id, email, settings')
          .limit(1000);

        if (error) {
          logger.warn('[DialComplete] Failed to load users for voicemail lookup:', error.message);
        } else {
          const matchedUser = resolveUserForBusinessNumber(users, candidateNumber);
          voicemailGreeting = getVoicemailGreeting(matchedUser?.settings || {});
          logger.log('[DialComplete] Voicemail lookup:', {
            candidateNumber,
            matchedEmail: matchedUser?.email || null,
            hasGreeting: !!voicemailGreeting?.publicUrl
          });
        }
      } catch (lookupError) {
        logger.warn('[DialComplete] Voicemail lookup error:', lookupError?.message || lookupError);
      }
    }

    // Different responses based on dial outcome
    // We strictly use <Hangup/> to ensure call ends cleanly without system messages
    if (shouldPlayVoicemail) {
      if (voicemailGreeting?.publicUrl) {
        logger.log('[DialComplete] Playing voicemail greeting for unanswered call')
        twiml.play(voicemailGreeting.publicUrl)
        twiml.hangup()
      } else {
        logger.log('[DialComplete] No voicemail greeting found, using fallback unavailable message')
        twiml.say('The person you called is unavailable. Please try again later.')
        twiml.hangup()
      }
    } else {
      switch (DialCallStatus) {
        case 'completed':
        case 'answered':
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
