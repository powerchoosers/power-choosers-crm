// Twilio Dial Complete Handler
// Handles when a bridged call completes to prevent automatic retry

import twilio from 'twilio';
import logger from '../_logger.js';
import { supabaseAdmin } from '../../../lib/supabase.ts';
import { getVoicemailGreetingForTwilioNumber, resolveUserForBusinessNumber } from '../../../lib/voicemail.ts';
const VoiceResponse = twilio.twiml.VoiceResponse;

function toText(value) {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

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
      body = req.query;
    }

    const { CallSid, DialCallStatus, DialCallDuration, DialCallSid } = body;
    const normalizedDialStatus = String(DialCallStatus || '').toLowerCase();
    const parseOptionalInt = (value) => {
      const parsed = parseInt(String(value ?? ''), 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || req.headers['x-forwarded-host'] || '';
    const requestUrl = new URL(req.url || '/', `${protocol}://${host || 'localhost'}`);
    const contactId = requestUrl.searchParams.get('contactId');
    const contactName = requestUrl.searchParams.get('contactName');
    const contactTitle = requestUrl.searchParams.get('contactTitle');
    const accountId = requestUrl.searchParams.get('accountId');
    const accountName = requestUrl.searchParams.get('accountName');
    const agentId = requestUrl.searchParams.get('agentId');
    const agentEmail = requestUrl.searchParams.get('agentEmail');
    const targetPhoneFromQuery = requestUrl.searchParams.get('targetPhone');
    const businessPhoneFromQuery = requestUrl.searchParams.get('businessPhone');
    const businessPhoneSidFromQuery = requestUrl.searchParams.get('businessPhoneSid');
    const powerDialSessionId = requestUrl.searchParams.get('powerDialSessionId');
    const powerDialBatchId = requestUrl.searchParams.get('powerDialBatchId');
    const powerDialBatchIndex = parseOptionalInt(requestUrl.searchParams.get('powerDialBatchIndex'));
    const powerDialBatchSize = parseOptionalInt(requestUrl.searchParams.get('powerDialBatchSize'));
    const powerDialTargetIndex = parseOptionalInt(requestUrl.searchParams.get('powerDialTargetIndex'));
    const powerDialTargetCount = parseOptionalInt(requestUrl.searchParams.get('powerDialTargetCount'));
    const powerDialSourceLabel = requestUrl.searchParams.get('powerDialSourceLabel');
    const powerDialSelectedCount = parseOptionalInt(requestUrl.searchParams.get('powerDialSelectedCount'));
    const powerDialDialableCount = parseOptionalInt(requestUrl.searchParams.get('powerDialDialableCount'));
    const isPowerDialBatch = Boolean(powerDialSessionId || powerDialBatchId || powerDialTargetCount != null);
    const businessPhoneSidFromBody = toText(body.ToSid || body.BusinessPhoneSid || body.businessPhoneSid || body.toSid || body.to_sid || '');
    const businessPhoneFromBody = toText(body.To || body.BusinessPhone || body.businessPhone || body.to || '');

    // ================================================================
    // STEP 1: LOG TO SUPABASE *BEFORE* responding to Twilio.
    // ================================================================
    if (CallSid) {
      try {
        let resolvedTargetPhone = targetPhoneFromQuery || body.DialedNumber || body.Called || body.To || body.From || '';

        if ((!resolvedTargetPhone || String(resolvedTargetPhone).startsWith('client:') || String(resolvedTargetPhone).startsWith('AP')) && DialCallSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
          try {
            const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const childCall = await client.calls(DialCallSid).fetch();
            resolvedTargetPhone = childCall?.to || childCall?.from || resolvedTargetPhone;
          } catch (fetchErr) {
            logger.warn('[DialComplete] Failed to resolve child call phone:', fetchErr?.message || fetchErr);
          }
        }

        const { upsertCallInSupabase } = await import('../calls.js');
        await upsertCallInSupabase({
          callSid: DialCallSid || CallSid,
          status: 'completed',
          duration: parseInt(DialCallDuration || '0', 10),
          contactId: contactId || null,
          contactName: contactName || null,
          contactTitle: contactTitle || null,
          accountId: accountId || null,
          accountName: accountName || null,
          agentId: agentId || null,
          agentEmail: agentEmail || null,
          targetPhone: resolvedTargetPhone || '',
          businessPhone: businessPhoneFromBody || businessPhoneFromQuery || undefined,
          powerDialSessionId: powerDialSessionId || null,
          powerDialBatchId: powerDialBatchId || null,
          powerDialBatchIndex,
          powerDialBatchSize,
          powerDialTargetIndex,
          powerDialTargetCount,
          powerDialSourceLabel: powerDialSourceLabel || null,
          powerDialSelectedCount,
          powerDialDialableCount,
          source: 'dial-complete'
        }).catch(err => {
          logger.error('[DialComplete] Supabase log failed:', err?.message);
        });
      } catch (logErr) {
        logger.error('[DialComplete] Error logging call:', logErr?.message);
      }
    }

    // Create TwiML response that ENDS the call without retry
    const twiml = new VoiceResponse();
    let voicemailGreeting = null;
    const voicemailDropRequested = ['1', 'true', 'yes', 'on'].includes(
      String(requestUrl.searchParams.get('voicemailDrop') || requestUrl.searchParams.get('playVoicemail') || '').toLowerCase()
    );
    const isOutboundDial = Boolean(targetPhoneFromQuery);
    // Inbound unanswered calls can still use the saved greeting.
    // Outbound calls should only play a greeting when voicemail drop was explicitly requested.
    const shouldPlayVoicemail = !isPowerDialBatch &&
      ['no-answer', 'busy', 'canceled', 'failed'].includes(normalizedDialStatus) &&
      (!isOutboundDial || voicemailDropRequested);

    if (shouldPlayVoicemail) {
      try {
        const candidateNumber = businessPhoneFromQuery || businessPhoneFromBody || targetPhoneFromQuery || body.To || body.From || '';
        const voicemailCandidates = [
          businessPhoneSidFromQuery,
          businessPhoneSidFromBody,
          businessPhoneFromQuery,
          businessPhoneFromBody,
          candidateNumber,
          targetPhoneFromQuery,
          body.To,
          body.From,
        ].map((value) => toText(value)).filter(Boolean);
        const { data: users, error } = await supabaseAdmin
          .from('users')
          .select('id, email, settings')
          .limit(1000);

        if (error) {
          logger.warn('[DialComplete] Failed to load users for voicemail lookup:', error.message);
        } else {
          const matchedUser = resolveUserForBusinessNumber(users, candidateNumber);
          const settings = matchedUser?.settings || {};
          for (const identifier of voicemailCandidates) {
            voicemailGreeting = getVoicemailGreetingForTwilioNumber(settings, identifier);
            if (voicemailGreeting?.publicUrl) {
              break;
            }
          }
        }
      } catch (lookupError) {
        logger.warn('[DialComplete] Voicemail lookup error:', lookupError?.message || lookupError);
      }
    }

    // Different responses based on dial outcome
    // We strictly use <Hangup/> to ensure call ends cleanly without system messages
    if (shouldPlayVoicemail) {
      if (voicemailGreeting?.publicUrl) {
        twiml.play(voicemailGreeting.publicUrl)
        twiml.hangup()
      } else {
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
