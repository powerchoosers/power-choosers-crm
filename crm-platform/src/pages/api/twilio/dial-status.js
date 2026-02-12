// Dial status callback: start dual-channel recording on the bridged child leg
import twilio from 'twilio';
import logger from '../_logger.js';

export default async function handler(req, res) {
  // Twilio posts x-www-form-urlencoded data for dial status callbacks
  try {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    let body = req.body;
    
    // Robust body parsing for different content types
    if (typeof body === 'string') {
      try { 
        if (ct.includes('application/json')) {
          body = JSON.parse(body); 
        }
      } catch(_) {}
      
      if (typeof body === 'string') {
        try { 
          const params = new URLSearchParams(body);
          const obj = {};
          for (const [key, value] of params.entries()) {
            obj[key] = value;
          }
          body = obj;
        } catch(_) {}
      }
    }
    
    if (!body || typeof body !== 'object') {
      body = req.query || {};
    }

    // Extract CRM context from query parameters
    let contactId, accountId;
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || req.headers['x-forwarded-host'] || '';
      const requestUrl = new URL(req.url, `${protocol}://${host}`);
      contactId = requestUrl.searchParams.get('contactId');
      accountId = requestUrl.searchParams.get('accountId');
    } catch (_) {}

    // Determine the dial status event - prioritize more specific status fields
    const event = (body.DialCallStatus || body.CallStatus || body.DialStatus || body.CallStatusEvent || '').toLowerCase();
    const parentSid = body.ParentCallSid || body.CallSid || '';
    const childSid = body.DialCallSid || '';
    
    // Prefer starting recordings on the PARENT call for reliable dual-channel capture
    const targetSid = parentSid || childSid;
    
    logger.debug('[TwilioWebhook] Dial status event received', { 
      event, 
      parentSid, 
      childSid,
      targetSid,
      from: body.From, 
      to: body.To,
      direction: body.Direction 
    });

    // Handle call completion events - terminate all related legs when any leg completes
    if (event === 'completed' && (parentSid || childSid)) {
      logger.info('[TwilioWebhook] Call completed event detected - terminating all related legs', {
        parentSid,
        childSid,
        from: body.From,
        to: body.To
      });
      
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        
        if (accountSid && authToken) {
          const client = twilio(accountSid, authToken);
          const callSidsToTerminate = [];
          
          // Collect all CallSids to terminate
          if (parentSid) callSidsToTerminate.push(parentSid);
          if (childSid && childSid !== parentSid) callSidsToTerminate.push(childSid);
          
          // Find all related calls (parent and children)
          if (parentSid) {
            try {
              const children = await client.calls.list({ parentCallSid: parentSid, limit: 20 });
              for (const child of children) {
                if (child.status !== 'completed' && child.status !== 'canceled') {
                  callSidsToTerminate.push(child.sid);
                }
              }
            } catch (fetchError) {
              logger.warn('[TwilioWebhook] Could not fetch child calls for termination', { error: fetchError.message });
            }
          }
          
          // Terminate all related legs
          for (const sid of callSidsToTerminate) {
            try {
              const call = await client.calls(sid).fetch();
              if (call.status !== 'completed' && call.status !== 'canceled') {
                await client.calls(sid).update({ status: 'completed' });
                logger.info('[TwilioWebhook] Terminated call leg on completed event', {
                  callSid: sid,
                  direction: call.direction,
                  from: call.from,
                  to: call.to
                });
              }
            } catch (termError) {
              // Ignore errors for calls already completed
              if (termError.code !== 20404) {
                logger.error('[TwilioWebhook] Error terminating call leg', {
                  callSid: sid,
                  error: termError.message
                });
              }
            }
          }

          // Post to /api/calls on completion if we have CRM context
          // This ensures browser-initiated calls show up in the dossier log
          try {
            // Compute absolute base URL
            const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host || '';
            const envBase = process.env.PUBLIC_BASE_URL || '';
            const base = host ? `${proto}://${host}` : (envBase || 'https://nodalpoint.io');

            const payload = {
              callSid: parentSid || childSid,
              to: body.To,
              from: body.From,
              status: 'completed',
              duration: parseInt(body.DialCallDuration || body.CallDuration || '0', 10),
              contactId,
              accountId,
              source: 'dial-status'
            };

            logger.log(`[Dial-Status] Posting completed call to /api/calls: ${payload.callSid}`);
            await fetch(`${base}/api/calls`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).catch(err => {
              logger.warn('[Dial-Status] Failed posting to /api/calls:', err?.message);
            });
          } catch (innerError) {
            logger.warn('[Dial-Status] Error preparing /api/calls post:', innerError?.message);
          }
        }
      } catch (error) {
        logger.error('[TwilioWebhook] Error in call completion termination logic', {
          error: error.message,
          parentSid,
          childSid
        });
      }
    }

    // Start dual-channel recording when answered/in-progress/completed (to catch edge cases)
    // IMPORTANT: Only start REST API recording if NO TwiML DialVerb recording exists to avoid interference
    if ((event === 'in-progress' || event === 'answered' || event === 'completed') && targetSid) {
      logger.debug('[TwilioWebhook] Event triggered, checking for DialVerb recordings');
      
      // Wait 5 seconds for TwiML recording to appear in REST API, then check for DialVerb recording
      setTimeout(async () => {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        // Compute absolute base URL from request headers first; fallback to env
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const envBase = process.env.PUBLIC_BASE_URL || '';
        const baseUrl = host ? `${proto}://${host}` : (envBase || 'https://nodalpoint.io');
        
        if (accountSid && authToken) {
          const client = twilio(accountSid, authToken);
          
          // Build a candidate list of call SIDs to try, prioritizing PSTN child legs
          const candidates = new Set();
          const pstnCandidates = new Set();
          
          // Identify if provided child is PSTN (not client)
          if (childSid) {
            const isChildPstn = body.To && body.From && 
                              !body.To.startsWith('client:') && 
                              !body.From.startsWith('client:') &&
                              body.Direction === 'outbound-dial';
            if (isChildPstn) {
              pstnCandidates.add(childSid);
              logger.log('[Dial-Status] Identified PSTN child leg:', childSid, 'To:', body.To);
            } else {
              candidates.add(childSid);
            }
          }
          if (parentSid) candidates.add(parentSid);
          
          // Discover children of the parent and separate PSTN vs client legs
          try {
            if (parentSid) {
              const kids = await client.calls.list({ parentCallSid: parentSid, limit: 10 });
              for (const k of kids) {
                const isClient = (k.from || '').startsWith('client:') || (k.to || '').startsWith('client:');
                const isPstn = !isClient && k.direction === 'outbound-dial';
                if (isPstn) {
                  pstnCandidates.add(k.sid);
                  logger.log('[Dial-Status] Found PSTN child leg:', k.sid, 'To:', k.to, 'Direction:', k.direction);
                } else {
                  candidates.add(k.sid);
                }
              }
              logger.log('[Dial-Status] Discovered child legs:', kids.map(c => ({ sid: c.sid, from: c.from, to: c.to, direction: c.direction, isPstn: !((c.from || '').startsWith('client:') || (c.to || '').startsWith('client:')) && c.direction === 'outbound-dial' })));
            }
          } catch (discErr) {
            logger.log('[Dial-Status] Child discovery failed:', discErr?.message);
          }
          
          // Try to start a dual-channel recording on the first candidate that succeeds
          // Prioritize PSTN child legs first, then other candidates
          let started = false; let startedOn = ''; let channelsSeen = 0;
          const pstnList = Array.from(pstnCandidates);
          const candList = [...pstnList, ...Array.from(candidates)];
          
          logger.log('[Dial-Status] Candidate priority order:', { pstnFirst: pstnList, others: Array.from(candidates) });
          for (let i = 0; i < candList.length; i++) {
            const sid = candList[i];
            try {
              // Check specifically for DialVerb recordings (TwiML dual-channel)
              const existing = await client.calls(sid).recordings.list({ limit: 5 });
              logger.log('[Dial-Status] Existing recordings on', sid, ':', existing.map(r => ({ 
                sid: r.sid, 
                channels: r.channels, 
                status: r.status, 
                source: r.source,
                track: r.track 
              })));
              
              // Skip REST API fallback if DialVerb recording exists (TwiML dual-channel)
              const hasDialVerbRecording = existing.some(r => r.source === 'DialVerb' && r.status !== 'stopped');
              if (hasDialVerbRecording) { 
                logger.log('[Dial-Status] DialVerb recording already exists on', sid, '- skipping REST API fallback to avoid interference'); 
                started = true; 
                startedOn = sid; 
                channelsSeen = 2; 
                break; 
              }
              
              const hasDual = existing.some(r => (Number(r.channels) || 0) === 2 && r.status !== 'stopped');
              if (hasDual) { logger.log('[Dial-Status] Dual recording already active on', sid); started = true; startedOn = sid; channelsSeen = 2; break; }

              // If some mono recording is active, stop it so we can start dual
              const active = existing.find(r => r.status !== 'stopped');
              if (active && (Number(active.channels) || 0) === 1) {
                try {
                  await client.calls(sid).recordings('Twilio.CURRENT').update({ status: 'stopped' });
                  logger.log('[Dial-Status] ⏹️ Stopped active mono recording on', sid, '->', active.sid);
                } catch (stopErr) {
                  logger.log('[Dial-Status] Could not stop active recording on', sid, ':', stopErr?.message);
                }
              }

              const rec = await client.calls(sid).recordings.create({
                recordingChannels: 'dual',
                recordingTrack: 'both',
                recordingStatusCallback: baseUrl + '/api/twilio/recording',
                recordingStatusCallbackMethod: 'POST'
              });
              logger.log('[Dial-Status] ➕ start result:', { sid: rec.sid, channels: rec.channels, source: rec.source, track: rec.track, callSid: sid });
              const ch = Number(rec.channels) || 0;
              if (ch === 2) { started = true; startedOn = sid; channelsSeen = 2; break; }
              // If mono came back, try the next candidate after stopping this one
              channelsSeen = Math.max(channelsSeen, ch);
              try {
                await client.calls(sid).recordings(rec.sid).update({ status: 'stopped' });
                logger.log('[Dial-Status] ⏹️ Immediately stopped mono recording', rec.sid, 'on', sid, 'and trying next candidate');
              } catch(_) {}
            } catch (tryErr) {
              logger.log('[Dial-Status] Try start on', sid, 'failed:', tryErr?.message);
            }
          }
          
          if (started) {
            logger.log('[Dial-Status] ✅ Started recording on', startedOn, '(dual confirmed)');
            // [REMOVED] Webhook telemetry logging - was causing excessive Firestore writes (~2-3 per call)
            // Recording status is tracked via recording callbacks and call records
          } else {
            logger.warn('[Dial-Status] ❌ Unable to start dual recording (last channels seen:', channelsSeen, ')');
            // [REMOVED] Webhook telemetry logging - was causing excessive Firestore writes
            // Failures are logged to console for debugging
          }
        } else {
          logger.warn('[Dial-Status] Missing Twilio credentials');
        }
      } catch (e) { 
        logger.warn('[Dial-Status] Failed to start recording:', e?.message); 
      }
      }, 5000); // 5-second delay as recommended by Twilio
    } else if (!childSid && event === 'answered') {
      logger.warn('[Dial-Status] No DialCallSid available for recording - Dial may not be configured properly');
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  } catch (e) {
    logger.error('[Dial-Status] Error:', e);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
}


