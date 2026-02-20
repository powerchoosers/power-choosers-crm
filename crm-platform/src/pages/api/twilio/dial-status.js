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

    // If body is empty but query has Twilio params, use query (redirect lost POST body)
    if (Object.keys(body).length === 0 && req.query && Object.keys(req.query).length > 0) {
      logger.warn('[Dial-Status] POST body was empty, falling back to query params');
      body = req.query;
    }

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
    const event = (body.DialCallStatus || body.CallStatus || '').toLowerCase();
    const callSidFromBody = body.CallSid || '';
    const dialCallSid = body.DialCallSid || '';
    const parentCallSid = body.ParentCallSid || '';

    const childSid = dialCallSid || (parentCallSid ? callSidFromBody : '');
    const parentSid = parentCallSid || (dialCallSid ? callSidFromBody : callSidFromBody);
    const logCallSid = childSid || callSidFromBody;

    // Full raw body dump for debugging
    logger.log('[Dial-Status] RAW BODY:', JSON.stringify(body));
    logger.log('[Dial-Status] Event:', event, '| logCallSid:', logCallSid, '| To:', body.To, '| From:', body.From, '| agent:', agentEmail);

    // ================================================================
    // Only log TERMINAL events to Supabase (completed, busy, no-answer,
    // failed, canceled). Intermediate states (initiated, ringing, answered)
    // are logged to console for debugging but NOT persisted — this prevents
    // the call showing at 0:00 in the Transmission Log before it's done.
    // ================================================================
    const terminalEvents = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
    const isTerminal = terminalEvents.includes(event);

    if (!isTerminal) {
      logger.log(`[Dial-Status] Skipping non-terminal event "${event}" for ${logCallSid}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }

    if (logCallSid) {
      try {
        let resolvedTo = body.To || '';
        let resolvedFrom = body.From || '';
        let resolvedDuration = parseInt(body.DialCallDuration || body.CallDuration || '0', 10);

        const isClientId = (v) => !v || String(v).startsWith('client:') || String(v).startsWith('AP');

        // Only fetch from Twilio if phone numbers are missing and it's a completion event
        if (event === 'completed' && (isClientId(resolvedTo) || isClientId(resolvedFrom))) {
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
              }
            }
          } catch (_) { }
        }

        // Last resort: use targetPhone from query string
        if (isClientId(resolvedTo) && targetPhoneFromQuery) {
          resolvedTo = targetPhoneFromQuery;
        }

        const payload = {
          callSid: logCallSid,
          to: resolvedTo,
          from: resolvedFrom,
          status: event || 'initiated',
          duration: resolvedDuration,
          contactId: contactId || null,
          accountId: accountId || null,
          agentId: agentId || null,
          agentEmail: agentEmail || null,
          targetPhone: targetPhoneFromQuery || resolvedTo || '',
          source: 'dial-status-v3'
        };

        // If it's a completion event, mark it as completed
        if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(event)) {
          payload.status = 'completed';
          // Store the actual outcome in metadata if needed, though deriveOutcome handles it
        }

        await upsertCallInSupabase(payload).catch(err => {
          logger.error('[Dial-Status] upsertCallInSupabase failed:', err?.message);
        });

        logger.log(`[Dial-Status] ✅ Call state [${event}] logged:`, logCallSid);
      } catch (logErr) {
        logger.error('[Dial-Status] Error logging call:', logErr?.message);
      }
    }

    // ================================================================
    // NOW respond 200 to Twilio — after the upsert is complete.
    // Twilio allows up to 15s for webhooks, and our upsert should
    // take < 2s. This guarantees the data is persisted.
    // ================================================================
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');

    // ================================================================
    // STEP 2: Start dual-channel recording (fire-and-forget AFTER response)
    // ================================================================
    if ((event === 'answered' || event === 'in-progress') && (childSid || parentSid)) {
      const targetSid = childSid || parentSid;
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (accountSid && authToken) {
        setTimeout(async () => {
          try {
            const client = twilio(accountSid, authToken);
            const baseUrl = process.env.PUBLIC_BASE_URL || 'https://nodal-point-network.vercel.app';

            const existing = await client.calls(targetSid).recordings.list({ limit: 5 });
            const hasDialVerb = existing.some(r => r.source === 'DialVerb' && r.status !== 'stopped');
            const hasDual = existing.some(r => Number(r.channels) === 2 && r.status !== 'stopped');

            if (hasDialVerb || hasDual) {
              logger.log('[Dial-Status] Recording already active on', targetSid);
              return;
            }

            const rec = await client.calls(targetSid).recordings.create({
              recordingChannels: 'dual',
              recordingTrack: 'both',
              recordingStatusCallback: baseUrl + '/api/twilio/recording',
              recordingStatusCallbackMethod: 'POST'
            });
            logger.log('[Dial-Status] Started recording:', rec.sid, 'on:', targetSid);
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
