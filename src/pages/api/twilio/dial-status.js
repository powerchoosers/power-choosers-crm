// Dial status callback: log completed calls and start dual-channel recording
import twilio from 'twilio';
import logger from '../_logger.js';
import { upsertCallInSupabase } from '../calls.js';

export default async function handler(req, res) {
  try {
    // --- Parse body (Twilio posts x-www-form-urlencoded) ---
    const ct = (req.headers['content-type'] || '').toLowerCase();
    let body = req.body;

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
          for (const [key, value] of params.entries()) obj[key] = value;
          body = obj;
        } catch (_) { }
      }
    }

    if (!body || typeof body !== 'object') body = req.query || {};

    // --- Extract CRM context from query params (passed by voice.js) ---
    let contactId = '', accountId = '', agentId = '', agentEmail = '', targetPhoneFromQuery = '';
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || req.headers['x-forwarded-host'] || '';
      const requestUrl = new URL(req.url, `${protocol}://${host}`);
      contactId = requestUrl.searchParams.get('contactId') || '';
      accountId = requestUrl.searchParams.get('accountId') || '';
      agentId = requestUrl.searchParams.get('agentId') || '';
      agentEmail = requestUrl.searchParams.get('agentEmail') || '';
      targetPhoneFromQuery = requestUrl.searchParams.get('targetPhone') || '';
    } catch (_) { }

    // --- Parse event details ---
    // For <Number statusCallback>: body.CallStatus is the child leg status,
    // body.CallSid is the PARENT (browser leg), body.DialCallSid is the child (PSTN leg)
    const event = (body.DialCallStatus || body.CallStatus || '').toLowerCase();
    const parentSid = body.CallSid || ''; // parent browser leg SID
    const childSid = body.DialCallSid || ''; // child PSTN leg SID (has real phone numbers)

    // For logging purposes, prefer child PSTN sid; fall back to parent
    const logCallSid = childSid || parentSid;

    logger.log('[Dial-Status] Event received:', {
      event,
      parentSid,
      childSid,
      logCallSid,
      To: body.To,
      From: body.From,
      DialCallDuration: body.DialCallDuration,
      CallStatus: body.CallStatus,
      DialCallStatus: body.DialCallStatus,
      agentEmail,
      contactId,
      accountId
    });

    // ================================================================
    // STEP 1: LOG COMPLETED CALL — Do this FIRST before any other work
    // ================================================================
    if (event === 'completed' && logCallSid) {
      try {
        // For <Number statusCallback>:
        //   body.To = the dialed phone number (e.g. +19728342317)
        //   body.From = the Twilio caller ID number (e.g. +18176630380)
        // These are the real phone numbers on the PSTN child leg context.
        let resolvedTo = body.To || '';
        let resolvedFrom = body.From || '';
        let resolvedDuration = parseInt(body.DialCallDuration || body.CallDuration || '0', 10);

        const isClientId = (v) => !v || String(v).startsWith('client:') || String(v).startsWith('AP');

        // Only fetch from Twilio if phone numbers are missing/invalid (rare case)
        if (isClientId(resolvedTo) || isClientId(resolvedFrom)) {
          logger.warn('[Dial-Status] Phone numbers not in body, attempting Twilio REST fetch fallback');
          try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            if (accountSid && authToken && childSid) {
              const client = twilio(accountSid, authToken);
              const childCall = await client.calls(childSid).fetch();
              if (childCall && !isClientId(childCall.to)) {
                resolvedTo = childCall.to;
                resolvedFrom = childCall.from;
                const d = parseInt(childCall.duration || '0', 10);
                if (d > resolvedDuration) resolvedDuration = d;
                logger.log(`[Dial-Status] Fetched from Twilio: to=${resolvedTo}, from=${resolvedFrom}`);
              }
            }
          } catch (fetchErr) {
            logger.warn('[Dial-Status] Twilio fetch fallback failed:', fetchErr?.message);
          }
        }

        // Last resort: use targetPhone from query string
        if (isClientId(resolvedTo) && targetPhoneFromQuery) {
          resolvedTo = targetPhoneFromQuery;
        }

        const payload = {
          callSid: logCallSid,
          to: resolvedTo,
          from: resolvedFrom,
          status: 'completed',
          duration: resolvedDuration,
          contactId: contactId || null,
          accountId: accountId || null,
          agentId: agentId || null,
          agentEmail: agentEmail || null,
          targetPhone: targetPhoneFromQuery || resolvedTo || '',
          source: 'dial-status'
        };

        logger.log('[Dial-Status] Upserting completed call:', {
          sid: logCallSid,
          to: resolvedTo,
          from: resolvedFrom,
          duration: resolvedDuration,
          agentEmail,
          contactId,
          accountId
        });

        await upsertCallInSupabase(payload).catch(err => {
          logger.error('[Dial-Status] upsertCallInSupabase failed:', err?.message);
        });

        logger.log('[Dial-Status] ✅ Call logged to Supabase:', logCallSid);
      } catch (logErr) {
        logger.error('[Dial-Status] Error logging call:', logErr?.message);
      }
    }

    // ================================================================
    // STEP 2: Respond 200 immediately to Twilio so it doesn't time out
    // ================================================================
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');

    // ================================================================
    // STEP 3: Start dual-channel recording (after response, fire-and-forget)
    // Only attempt if TwiML DialVerb recording isn't already handling it
    // ================================================================
    if ((event === 'answered' || event === 'in-progress') && (childSid || parentSid)) {
      const targetSid = childSid || parentSid;
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (accountSid && authToken) {
        // Fire after 3 seconds to let the TwiML DialVerb recording kick in first
        setTimeout(async () => {
          try {
            const client = twilio(accountSid, authToken);
            const proto = 'https';
            const envBase = process.env.PUBLIC_BASE_URL || '';
            const baseUrl = envBase || 'https://nodal-point-network.vercel.app';

            // Check if DialVerb recording already exists
            const existing = await client.calls(targetSid).recordings.list({ limit: 5 });
            const hasDialVerb = existing.some(r => r.source === 'DialVerb' && r.status !== 'stopped');
            const hasDual = existing.some(r => Number(r.channels) === 2 && r.status !== 'stopped');

            if (hasDialVerb || hasDual) {
              logger.log('[Dial-Status] Recording already active on', targetSid, '- skipping REST API fallback');
              return;
            }

            const rec = await client.calls(targetSid).recordings.create({
              recordingChannels: 'dual',
              recordingTrack: 'both',
              recordingStatusCallback: baseUrl + '/api/twilio/recording',
              recordingStatusCallbackMethod: 'POST'
            });
            logger.log('[Dial-Status] Started recording:', rec.sid, 'channels:', rec.channels, 'on:', targetSid);
          } catch (recErr) {
            logger.warn('[Dial-Status] Recording start failed (non-critical):', recErr?.message);
          }
        }, 3000);
      }
    }

    return;
  } catch (e) {
    logger.error('[Dial-Status] Unhandled error:', e?.message);
    try {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } catch (_) { }
    return;
  }
}
