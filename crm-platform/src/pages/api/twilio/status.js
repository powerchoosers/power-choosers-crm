import twilio from 'twilio';
import logger from '../_logger.js';

export default async function handler(req, res) {
    // Accept GET for quick verification; Twilio will POST status updates
    if (req.method === 'GET') {
        try {
            logger.debug('[TwilioWebhook] Status GET request', { host: req.headers.host });
        } catch (_) {}
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    try {
        // Normalize body: Twilio often sends application/x-www-form-urlencoded
        const ct = (req.headers['content-type'] || '').toLowerCase();
        let body = req.body;
        if (typeof body === 'string') {
            try { if (ct.includes('application/json')) body = JSON.parse(body); } catch(_) {}
            if (typeof body === 'string') {
                try {
                    const params = new URLSearchParams(body);
                    const o = {}; for (const [k,v] of params.entries()) o[k] = v; body = o;
                } catch(_) {}
            }
        }
        if (!body || typeof body !== 'object') body = {};

        // Extract CRM context from query parameters
        let contactId, accountId;
        try {
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host || req.headers['x-forwarded-host'] || '';
            const requestUrl = new URL(req.url, `${protocol}://${host}`);
            contactId = requestUrl.searchParams.get('contactId');
            accountId = requestUrl.searchParams.get('accountId');
        } catch (_) {}

        const {
            CallSid,
            CallStatus,
            To,
            From,
            Duration,
            RecordingUrl,
            CallDuration
        } = body;
        
        const sig = req.headers['x-twilio-signature'] || null;
        logger.debug('[TwilioWebhook] Twilio status callback received', { 
            callSid: CallSid, 
            status: CallStatus,
            from: From,
            to: To,
            duration: Duration || CallDuration
        });
        logger.debug('[TwilioWebhook] Status callback details', { 
            host: req.headers.host,
            hasSignature: !!sig,
            payloadSize: JSON.stringify(body).length
        });

        // Handle call completion - terminate all related legs when any leg completes
        if (CallStatus === 'completed' && CallSid) {
            logger.info('[TwilioWebhook] Call completed event in status callback - terminating all related legs', {
                callSid: CallSid,
                from: From,
                to: To
            });
            
            try {
                const accountSid = process.env.TWILIO_ACCOUNT_SID;
                const authToken = process.env.TWILIO_AUTH_TOKEN;
                
                if (accountSid && authToken) {
                    const client = twilio(accountSid, authToken);
                    const callSidsToTerminate = [CallSid];
                    
                    // Find all related calls (children of this call)
                    try {
                        const children = await client.calls.list({ parentCallSid: CallSid, limit: 20 });
                        for (const child of children) {
                            if (child.status !== 'completed' && child.status !== 'canceled') {
                                callSidsToTerminate.push(child.sid);
                            }
                        }
                    } catch (fetchError) {
                        logger.warn('[TwilioWebhook] Could not fetch child calls for termination', { error: fetchError.message });
                    }
                    
                    // Also check if this is a child call and terminate parent
                    try {
                        const call = await client.calls(CallSid).fetch();
                        if (call.parentCallSid && call.parentCallSid !== CallSid) {
                            callSidsToTerminate.push(call.parentCallSid);
                        }
                    } catch (fetchError) {
                        // Ignore if call not found
                    }
                    
                    // Terminate all related legs
                    for (const sid of callSidsToTerminate) {
                        if (sid === CallSid) continue; // Already completed
                        try {
                            const call = await client.calls(sid).fetch();
                            if (call.status !== 'completed' && call.status !== 'canceled') {
                                await client.calls(sid).update({ status: 'completed' });
                                logger.info('[TwilioWebhook] Terminated related call leg', {
                                    callSid: sid,
                                    direction: call.direction,
                                    from: call.from,
                                    to: call.to
                                });
                            }
                        } catch (termError) {
                            // Ignore errors for calls already completed
                            if (termError.code !== 20404) {
                                logger.error('[TwilioWebhook] Error terminating related call leg', {
                                    callSid: sid,
                                    error: termError.message
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error('[TwilioWebhook] Error in status callback termination logic', {
                    error: error.message,
                    callSid: CallSid
                });
            }
        }

        // Compute absolute base URL once
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || '';
        const base = host ? `${proto}://${host}` : (envBase || 'https://nodalpoint.io');

        // Precompute targetPhone/businessPhone for early visibility on UI
        const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
        const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
          .split(',').map(norm).filter(Boolean);
        const to10 = norm(To);
        const from10 = norm(From);
        const isBiz = (p) => !!p && envBiz.includes(p);
        const businessPhone = isBiz(to10) ? To : (isBiz(from10) ? From : (envBiz[0] || ''));
        const targetPhone = isBiz(to10) && !isBiz(from10) ? from10 : (isBiz(from10) && !isBiz(to10) ? to10 : (to10 || from10));

        // Fallback: attempt to start a dual-channel recording when the call is answered/in-progress
        // This complements the /api/twilio/dial-status path and covers cases where Dial callbacks are missed
        async function startDualIfNeeded() {
            try {
                const event = String(CallStatus || '').toLowerCase();
                if (!(event === 'answered' || event === 'in-progress' || event === 'completed')) return;

                const accountSid = process.env.TWILIO_ACCOUNT_SID;
                const authToken = process.env.TWILIO_AUTH_TOKEN;
                if (!accountSid || !authToken) { logger.warn('[Status] Missing Twilio creds; cannot start recording'); return; }
                const client = twilio(accountSid, authToken);
                const baseUrl = process.env.PUBLIC_BASE_URL || 'https://nodalpoint.io';

                // Build candidate list with PSTN priority similar to /api/twilio/dial-status
                // PSTN legs = non-client endpoints with direction outbound-dial
                const candidates = new Set();
                const pstnCandidates = new Set();
                const DialCallSid = body.DialCallSid || body.DialCallSid0 || body.DialSid || '';
                const looksLikeSid = (sid) => sid && /^CA[0-9a-f]{32}$/i.test(String(sid));
                const isClient = (v) => typeof v === 'string' && v.startsWith('client:');
                // Classify provided Dial child if available
                if (looksLikeSid(DialCallSid)) {
                    const childLooksPstn = (body.To && body.From && !isClient(body.To) && !isClient(body.From) && String(body.Direction||'').toLowerCase() === 'outbound-dial');
                    if (childLooksPstn) {
                        pstnCandidates.add(DialCallSid);
                        logger.log('[Status] Identified PSTN Dial child:', DialCallSid, 'To:', body.To);
                    } else {
                        candidates.add(DialCallSid);
                    }
                }
                // Add parent at lower priority
                if (looksLikeSid(CallSid)) candidates.add(CallSid);

                try {
                    if (CallSid) {
                        const kids = await client.calls.list({ parentCallSid: CallSid, limit: 10 });
                        // Separate PSTN vs others for priority ordering
                        for (const k of kids) {
                            const kidIsClient = (k.from || '').startsWith('client:') || (k.to || '').startsWith('client:');
                            const isPstn = !kidIsClient && String(k.direction||'').toLowerCase() === 'outbound-dial';
                            if (isPstn) pstnCandidates.add(k.sid); else candidates.add(k.sid);
                        }
                        logger.log('[Status] Discovered child legs:', kids.map(c => ({ sid: c.sid, from: c.from, to: c.to, direction: c.direction, isPstn: !(String(c.from||'').startsWith('client:') || String(c.to||'').startsWith('client:')) && String(c.direction||'').toLowerCase()==='outbound-dial' })));
                    }
                } catch (discErr) {
                    logger.log('[Status] Child discovery failed:', discErr?.message);
                }

                const pstnList = Array.from(pstnCandidates);
                const ordered = [...pstnList, ...Array.from(candidates)];
                logger.log('[Status] Candidate priority order:', { pstnFirst: pstnList, others: Array.from(candidates) });

                        // Try candidates in priority order; skip if DialVerb recording exists to avoid interference
                        for (const sid of ordered) {
                            try {
                                const existing = await client.calls(sid).recordings.list({ limit: 5 });
                                const hasDialVerbRecording = existing.some(r => r.source === 'DialVerb' && r.status !== 'stopped');
                                if (hasDialVerbRecording) { 
                                    logger.log('[Status] DialVerb recording already exists on', sid, '- skipping REST API fallback to avoid interference'); 
                                    return; 
                                }
                                const hasDual = existing.some(r => (Number(r.channels) || 0) === 2 && r.status !== 'stopped');
                                if (hasDual) { logger.log('[Status] Dual recording already active on', sid); return; }

                        // Safety: stop active mono recording so dual can start
                        const active = existing.find(r => r.status !== 'stopped');
                        if (active && (Number(active.channels) || 0) === 1) {
                            try {
                                await client.calls(sid).recordings('Twilio.CURRENT').update({ status: 'stopped' });
                                logger.log('[Status] ⏹️ Stopped active mono recording on', sid, '->', active.sid);
                            } catch (stopErr) {
                                logger.log('[Status] Could not stop active recording on', sid, ':', stopErr?.message);
                            }
                        }

                        const rec = await client.calls(sid).recordings.create({
                            recordingChannels: 'dual',
                            recordingTrack: 'both',
                            recordingStatusCallback: baseUrl + '/api/twilio/recording',
                            recordingStatusCallbackMethod: 'POST'
                        });
                        logger.log('[Status] Started recording via REST on', sid, '→', { recordingSid: rec.sid, channels: rec.channels, source: rec.source, track: rec.track });
                        return; // Stop after first success
                    } catch (tryErr) {
                        logger.log('[Status] Could not start recording on', sid, ':', tryErr?.message);
                    }
                }

                if (!candidates.size) logger.log('[Status] No candidate call SIDs to start recording on');
            } catch (e) {
                logger.log('[Status] startDualIfNeeded error:', e?.message);
            }
        }
        await startDualIfNeeded();

        // [REMOVED] Webhook telemetry logging - was causing excessive Firestore writes (~10-15 per call)
        // Only essential call data is now logged to /api/calls collection on 'completed' status
        
        // Handle different call statuses
        switch (CallStatus) {
            case 'ringing':
                logger.log(`  📞 Call is ringing...`);
                // [REMOVED] Early upsert to match "only post on completion" requirement
                break;
            case 'in-progress':
                logger.log(`  📞 Call answered and in progress`);
                // [REMOVED] Early upsert to match "only post on completion" requirement
                break;
            case 'completed':
                const duration = Duration || CallDuration || '0';
                logger.log(`  ✅ Call completed. Duration: ${duration}s`);
                if (RecordingUrl) {
                    logger.log(`  🎵 Recording: ${RecordingUrl}`);
                }
                break;
            case 'busy':
                logger.log(`  📵 Line busy`);
                break;
            case 'no-answer':
                logger.log(`  📵 No answer`);
                break;
            case 'failed':
                logger.log(`  ❌ Call failed`);
                break;
            case 'canceled':
                logger.log(`  ❌ Call canceled`);
                break;
            default:
                logger.log(`  ℹ️ Status: ${CallStatus}`);
        }
        
        // Upsert into central /api/calls on completed status with full fields
        // Previously wrote on every status change (initiated, ringing, in-progress, etc.) = ~8-10 writes per call
        // Now only writes once when call completes = ~1 write per call (88% reduction)
        try {
            if (CallStatus === 'completed') {
                // targetPhone/businessPhone precomputed above

                try {
                    const body = {
                        callSid: CallSid,
                        to: To,
                        from: From,
                        status: CallStatus,
                        duration: parseInt((Duration || CallDuration || '0'), 10),
                        targetPhone: targetPhone || undefined,
                        businessPhone: businessPhone || undefined,
                        contactId,
                        accountId
                    };
                    if (RecordingUrl) {
                        body.recordingUrl = RecordingUrl.endsWith('.mp3') ? RecordingUrl : `${RecordingUrl}.mp3`;
                    }
                    await fetch(`${base}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    }).catch(() => {});
                    
                    // Auto-trigger transcription for completed calls with recordings
                    if (RecordingUrl) {
                        logger.log(`[Status] Auto-triggering transcription for completed call: ${CallSid}`);
                        // Trigger transcription in background (don't wait for response)
                        fetch(`${base}/api/process-call`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ callSid: CallSid })
                        }).catch(err => {
                            logger.warn(`[Status] Failed to trigger transcription for ${CallSid}:`, err?.message);
                        });
                    }
                } catch (innerError) {
                    logger.warn('[Status] Failed posting to /api/calls (inner):', innerError?.message);
                }
            }
        } catch (e) {
            logger.warn('[Status] Failed posting to /api/calls:', e?.message);
        }

        // If call completed and RecordingUrl not provided, try to fetch the recording via Twilio API
        try {
            if (CallStatus === 'completed' && !RecordingUrl && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                let foundUrl = '';
                let foundRecSid = '';
                // 1) Try parent CallSid first
                try {
                    const recs = await client.recordings.list({ callSid: CallSid, limit: 5 });
                    const best = (recs || []).find(r => (Number(r.channels)||0) === 2) || (recs || [])[0];
                    if (best) {
                        foundRecSid = best.sid;
                        foundUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${foundRecSid}.mp3`;
                        logger.log(`[Status] Found parent-leg recording for ${CallSid}: ${foundUrl}`);
                    }
                } catch(_) {}
                // 2) If not found on parent, look on child legs (PSTN priority)
                if (!foundUrl) {
                    try {
                        const kids = await client.calls.list({ parentCallSid: CallSid, limit: 10 });
                        // Prefer dual-channel
                        for (const k of kids) {
                            try {
                                const rs = await client.recordings.list({ callSid: k.sid, limit: 5 });
                                const best = (rs || []).find(r => (Number(r.channels)||0) === 2) || null;
                                if (best) {
                                    foundRecSid = best.sid;
                                    foundUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${foundRecSid}.mp3`;
                                    logger.log(`[Status] Found child-leg recording for ${CallSid} on ${k.sid}: ${foundUrl}`);
                                    break;
                                }
                            } catch(_) {}
                        }
                    } catch(_) {}
                }
                if (foundUrl) {
                    const payload = {
                        callSid: CallSid,
                        status: 'completed',
                        duration: Duration || CallDuration,
                        recordingUrl: foundUrl,
                        recordingSid: foundRecSid,
                        contactId,
                        accountId,
                        timestamp: new Date().toISOString()
                    };
                    await fetch(`${base}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }).catch(() => {});
                } else {
                    logger.log(`[Status] No recordings found yet for ${CallSid} on parent or children`);
                }
            }
        } catch (err) {
            logger.warn('[Status] Error while fetching recording by CallSid:', err?.message);
        }
        
        // Always respond with 200 OK
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
        
    } catch (error) {
        logger.error('Status callback error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error processing status callback');
        return;
    }
}
