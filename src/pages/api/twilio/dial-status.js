// Dial status callback: log completed calls and start dual-channel recording
import twilio from 'twilio';
import logger from '../_logger.js';
import { upsertCallInSupabase } from '../calls.js';
import { isVoicemailAnsweredBy } from '../../../lib/voice-outcomes.ts';
import { triggerOutboundVoicemailDrop } from '../../../lib/twilio-voicemail-drop.ts';

export default async function handler(req, res) {
  try {
    const parseOptionalInt = (value) => {
      const parsed = parseInt(String(value ?? ''), 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

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
    let contactId = '', contactName = '', contactTitle = '', accountId = '', accountName = '', agentId = '', agentEmail = '', targetPhoneFromQuery = '', businessPhoneFromQuery = '';
    let powerDialSessionId = '', powerDialBatchId = '', powerDialBatchIndex = null, powerDialBatchSize = null, powerDialTargetIndex = null, powerDialTargetCount = null, powerDialSourceLabel = '', powerDialSelectedCount = null, powerDialDialableCount = null;
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || req.headers['x-forwarded-host'] || '';
      const requestUrl = new URL(req.url, `${protocol}://${host}`);
      contactId = requestUrl.searchParams.get('contactId') || '';
      contactName = requestUrl.searchParams.get('contactName') || '';
      contactTitle = requestUrl.searchParams.get('contactTitle') || '';
      accountId = requestUrl.searchParams.get('accountId') || '';
      accountName = requestUrl.searchParams.get('accountName') || '';
      agentId = requestUrl.searchParams.get('agentId') || '';
      agentEmail = requestUrl.searchParams.get('agentEmail') || '';
      targetPhoneFromQuery = requestUrl.searchParams.get('targetPhone') || '';
      businessPhoneFromQuery = requestUrl.searchParams.get('businessPhone') || '';
      powerDialSessionId = requestUrl.searchParams.get('powerDialSessionId') || '';
      powerDialBatchId = requestUrl.searchParams.get('powerDialBatchId') || '';
      powerDialBatchIndex = parseOptionalInt(requestUrl.searchParams.get('powerDialBatchIndex'));
      powerDialBatchSize = parseOptionalInt(requestUrl.searchParams.get('powerDialBatchSize'));
      powerDialTargetIndex = parseOptionalInt(requestUrl.searchParams.get('powerDialTargetIndex'));
      powerDialTargetCount = parseOptionalInt(requestUrl.searchParams.get('powerDialTargetCount'));
      powerDialSourceLabel = requestUrl.searchParams.get('powerDialSourceLabel') || '';
      powerDialSelectedCount = parseOptionalInt(requestUrl.searchParams.get('powerDialSelectedCount'));
      powerDialDialableCount = parseOptionalInt(requestUrl.searchParams.get('powerDialDialableCount'));
    } catch (_) { }

    // --- Parse event details ---
    const event = (body.DialCallStatus || body.CallStatus || '').toLowerCase();
    const answeredBy = String(body.AnsweredBy || '').trim();
    const machineDetectionDuration = parseOptionalInt(body.MachineDetectionDuration);
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
    const shouldPersistIntermediateAnswer =
      (event === 'answered' || event === 'in-progress') &&
      Boolean(answeredBy || powerDialBatchId || powerDialSessionId);

    if (!isTerminal && !shouldPersistIntermediateAnswer) {
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
          contactName: contactName || null,
          contactTitle: contactTitle || null,
          accountId: accountId || null,
          accountName: accountName || null,
          agentId: agentId || null,
          agentEmail: agentEmail || null,
          targetPhone: targetPhoneFromQuery || resolvedTo || '',
          businessPhone: businessPhoneFromQuery || undefined,
          powerDialSessionId: powerDialSessionId || null,
          powerDialBatchId: powerDialBatchId || null,
          powerDialBatchIndex,
          powerDialBatchSize,
          powerDialTargetIndex,
          powerDialTargetCount,
          powerDialSourceLabel: powerDialSourceLabel || null,
          powerDialSelectedCount,
          powerDialDialableCount,
          answeredBy: answeredBy || null,
          machineDetectionDuration,
          source: 'dial-status-v3'
        };

        // If it's a completion event, mark it as completed
        if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(event)) {
          payload.status = 'completed';
          // Store the actual outcome in metadata if needed, though deriveOutcome handles it
        }

        const savedCall = await upsertCallInSupabase(payload).catch(err => {
          logger.error('[Dial-Status] upsertCallInSupabase failed:', err?.message);
          return null;
        });

        const existingVoicemailDropStatus = String(savedCall?.metadata?.voicemailDropStatus || '').toLowerCase();
        const voicemailDetected = isVoicemailAnsweredBy(answeredBy);
        const shouldTriggerVoicemailDrop =
          voicemailDetected &&
          !['dropped', 'missing-config', 'failed'].includes(existingVoicemailDropStatus);

        if (shouldTriggerVoicemailDrop) {
          const dropResult = await triggerOutboundVoicemailDrop({
            callSid: logCallSid,
            businessNumber: businessPhoneFromQuery || resolvedFrom || body.From || '',
            candidateIdentifiers: [
              businessPhoneFromQuery,
              resolvedFrom,
              body.From,
              body.To,
            ],
          }).catch((dropError) => ({
            status: 'failed',
            reason: dropError?.message || 'twilio-update-failed',
          }));

          await upsertCallInSupabase({
            callSid: logCallSid,
            source: 'dial-status-voicemail-drop',
            answeredBy: answeredBy || null,
            machineDetectionDuration,
            voicemailDropStatus: dropResult?.status || 'failed',
            voicemailDropAt: new Date().toISOString(),
            voicemailDropUrl: dropResult?.playUrl || null,
            metadata: {
              voicemailDropReason: dropResult?.reason || null,
            },
          }).catch(err => {
            logger.error('[Dial-Status] voicemail drop metadata update failed:', err?.message);
          });

          if (dropResult?.status === 'dropped') {
            logger.log('[Dial-Status] Voicemail drop initiated for call:', logCallSid);
          } else {
            logger.warn('[Dial-Status] Voicemail drop skipped:', {
              callSid: logCallSid,
              status: dropResult?.status,
              reason: dropResult?.reason,
            });
          }
        }

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
    if ((event === 'answered' || event === 'in-progress') && (childSid || parentSid) && !isVoicemailAnsweredBy(answeredBy)) {
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

            const callbackParams = new URLSearchParams();
            if (contactId) callbackParams.append('contactId', contactId);
            if (accountId) callbackParams.append('accountId', accountId);
            if (agentId) callbackParams.append('agentId', agentId);
            if (agentEmail) callbackParams.append('agentEmail', agentEmail);
            if (contactName) callbackParams.append('contactName', contactName);
            if (contactTitle) callbackParams.append('contactTitle', contactTitle);
            if (accountName) callbackParams.append('accountName', accountName);
            if (powerDialSessionId) callbackParams.append('powerDialSessionId', powerDialSessionId);
            if (powerDialBatchId) callbackParams.append('powerDialBatchId', powerDialBatchId);
            if (powerDialBatchIndex != null) callbackParams.append('powerDialBatchIndex', String(powerDialBatchIndex));
            if (powerDialBatchSize != null) callbackParams.append('powerDialBatchSize', String(powerDialBatchSize));
            if (powerDialSourceLabel) callbackParams.append('powerDialSourceLabel', powerDialSourceLabel);
            if (powerDialSelectedCount != null) callbackParams.append('powerDialSelectedCount', String(powerDialSelectedCount));
            if (powerDialDialableCount != null) callbackParams.append('powerDialDialableCount', String(powerDialDialableCount));
            if (targetPhoneFromQuery) callbackParams.append('targetPhone', targetPhoneFromQuery);
            if (businessPhoneFromQuery) callbackParams.append('businessPhone', businessPhoneFromQuery);
            const cbq = callbackParams.toString() ? `?${callbackParams.toString()}` : '';

            const rec = await client.calls(targetSid).recordings.create({
              recordingChannels: 'dual',
              recordingTrack: 'both',
              recordingStatusCallback: baseUrl + '/api/twilio/recording' + cbq,
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
