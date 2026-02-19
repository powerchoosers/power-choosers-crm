import twilio from 'twilio';
import logger from '../_logger.js';
import { upsertCallInSupabase } from '../calls.js';

export default async function handler(req, res) {
    // Accept GET for quick verification; Twilio will POST status updates
    if (req.method === 'GET') {
        try {
            logger.debug('[TwilioWebhook] Status GET request', { host: req.headers.host });
        } catch (_) { }
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
            try { if (ct.includes('application/json')) body = JSON.parse(body); } catch (_) { }
            if (typeof body === 'string') {
                try {
                    const params = new URLSearchParams(body);
                    const o = {}; for (const [k, v] of params.entries()) o[k] = v; body = o;
                } catch (_) { }
            }
        }
        if (!body || typeof body !== 'object') body = {};

        // Extract CRM context from query parameters
        let contactId, accountId, agentId, agentEmail, targetPhoneFromQuery;
        try {
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host || req.headers['x-forwarded-host'] || '';
            const requestUrl = new URL(req.url, `${protocol}://${host}`);
            contactId = requestUrl.searchParams.get('contactId');
            accountId = requestUrl.searchParams.get('accountId');
            agentId = requestUrl.searchParams.get('agentId');
            agentEmail = requestUrl.searchParams.get('agentEmail');
            targetPhoneFromQuery = requestUrl.searchParams.get('targetPhone');
        } catch (_) { }

        const {
            CallSid,
            CallStatus,
            To,
            From,
            CallDuration,
            Duration,
            RecordingUrl,
            DialCallDuration,
            DialCallSid,
            DialCallStatus
        } = body;

        let targetPhone = targetPhoneFromQuery || '';
        let businessPhone = '';

        // CRITICAL: Skip browser-side parent call legs.
        // When an agent makes an outbound call via the Twilio JS SDK, Twilio fires status
        // callbacks for TWO legs: (1) the parent "client:agent" leg (browser connection),
        // and (2) the child PSTN leg (real phone call). The parent leg has From=client:agent
        // and To="" with no useful context. We must skip it here. The child PSTN leg is
        // correctly logged by dial-status.js via the DialCallSid/DialCallStatus events.
        const isBrowserParentLeg = (From || '').startsWith('client:') || (To || '').startsWith('client:') || (!To && (From || '').startsWith('client:'));
        if (CallStatus === 'completed' && isBrowserParentLeg) {
            logger.log(`[Status] Skipping browser parent leg ${CallSid} (From=${From}, To=${To}) - will be logged by dial-status on PSTN child leg`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
        }

        // #region agent log
        if (CallStatus === 'completed') {
            console.log(`[Status] Completed event for ${CallSid}:`, {
                CallDuration,
                Duration,
                DialCallDuration,
                DialCallSid,
                DialCallStatus,
                agentId,
                agentEmail,
                From,
                To
            });
        }
        // #endregion

        const sig = req.headers['x-twilio-signature'] || null;
        logger.debug('[TwilioWebhook] Twilio status callback received', {
            callSid: CallSid,
            status: CallStatus,
            from: From,
            to: To,
            duration: Duration || CallDuration
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

                    // Find all related calls (parent and children)
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

                    for (const sid of callSidsToTerminate) {
                        try {
                            const call = await client.calls(sid).fetch();
                            if (call.status !== 'completed' && call.status !== 'canceled') {
                                await client.calls(sid).update({ status: 'completed' });
                            }
                        } catch (termError) {
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
        const base = host ? `${proto}://${host}` : (envBase || 'https://nodal-point-network.vercel.app');

        // Logic for dual-channel REST recording fallback if needed
        async function startDualIfNeeded() {
            try {
                if (CallStatus !== 'in-progress' && CallStatus !== 'answered') return;
                const accountSid = process.env.TWILIO_ACCOUNT_SID;
                const authToken = process.env.TWILIO_AUTH_TOKEN;
                if (!accountSid || !authToken) { logger.warn('[Status] Missing Twilio creds; cannot start recording'); return; }
                const client = twilio(accountSid, authToken);
                const baseUrl = process.env.PUBLIC_BASE_URL || 'https://nodal-point-network.vercel.app';

                // Build candidate list with PSTN priority similar to /api/twilio/dial-status
                // PSTN legs = non-client endpoints with direction outbound-dial
                const candidates = new Set();
                const pstnCandidates = new Set();
                const DialCallSidActual = body.DialCallSid || body.DialCallSid0 || body.DialSid || '';
                const looksLikeSid = (sid) => sid && /^CA[0-9a-f]{32}$/i.test(String(sid));
                const isClient = (v) => typeof v === 'string' && v.startsWith('client:');
                // Classify provided Dial child if available
                if (looksLikeSid(DialCallSidActual)) {
                    const childLooksPstn = (body.To && body.From && !isClient(body.To) && !isClient(body.From) && String(body.Direction || '').toLowerCase() === 'outbound-dial');
                    if (childLooksPstn) {
                        pstnCandidates.add(DialCallSidActual);
                    } else {
                        candidates.add(DialCallSidActual);
                    }
                }
                // Add parent at lower priority
                if (looksLikeSid(CallSid)) candidates.add(CallSid);

                try {
                    if (CallSid) {
                        const kids = await client.calls.list({ parentCallSid: CallSid, limit: 10 });
                        for (const k of kids) {
                            const kidIsClient = (k.from || '').startsWith('client:') || (k.to || '').startsWith('client:');
                            const isPstn = !kidIsClient && String(k.direction || '').toLowerCase() === 'outbound-dial';
                            if (isPstn) pstnCandidates.add(k.sid); else candidates.add(k.sid);
                        }
                    }
                } catch (discErr) { }

                const pstnList = Array.from(pstnCandidates);
                const ordered = [...pstnList, ...Array.from(candidates)];

                // Try candidates in priority order
                for (const sid of ordered) {
                    try {
                        const existing = await client.calls(sid).recordings.list({ limit: 5 });
                        const hasDialVerbRecording = existing.some(r => r.source === 'DialVerb' && r.status !== 'stopped');
                        if (hasDialVerbRecording) return;
                        const hasDual = existing.some(r => (Number(r.channels) || 0) === 2 && r.status !== 'stopped');
                        if (hasDual) return;

                        // Safety: stop active mono recording
                        const active = existing.find(r => r.status !== 'stopped');
                        if (active && (Number(active.channels) || 0) === 1) {
                            try {
                                await client.calls(sid).recordings('Twilio.CURRENT').update({ status: 'stopped' });
                            } catch (stopErr) { }
                        }

                        const rec = await client.calls(sid).recordings.create({
                            recordingChannels: 'dual',
                            recordingTrack: 'both',
                            recordingStatusCallback: baseUrl + '/api/twilio/recording',
                            recordingStatusCallbackMethod: 'POST'
                        });
                        return; // Stop after first success
                    } catch (tryErr) { }
                }
            } catch (e) {
                logger.log('[Status] startDualIfNeeded error:', e?.message);
            }
        }
        await startDualIfNeeded();

        // Handle different call statuses
        switch (CallStatus) {
            case 'completed': break;
            default: break;
        }

        // Upsert into central /api/calls on completed status with full fields
        try {
            if (CallStatus === 'completed') {
                let correctedDuration = parseInt((DialCallDuration || Duration || CallDuration || '0'), 10);
                // Attempt to fetch correct duration from child leg if duration is still very short (bridging only)
                try {
                    if (correctedDuration < 5 && (DialCallSid || CallSid)) {
                        const accountSid = process.env.TWILIO_ACCOUNT_SID;
                        const authToken = process.env.TWILIO_AUTH_TOKEN;
                        if (accountSid && authToken) {
                            const client = twilio(accountSid, authToken);
                            const targetForDuration = DialCallSid || CallSid;
                            const kids = await client.calls.list({ parentCallSid: targetForDuration, limit: 1 });
                            const child = kids.find(k => k.direction === 'outbound-dial') || (DialCallSid ? await client.calls(DialCallSid).fetch() : null);

                            if (child && child.duration) {
                                const childDuration = parseInt(child.duration, 10);
                                if (childDuration > correctedDuration) {
                                    correctedDuration = childDuration;
                                }
                            }
                        }
                    }
                } catch (durErr) { }

                try {
                    const bodyPayload = {
                        callSid: CallSid,
                        to: To,
                        from: From,
                        status: CallStatus,
                        duration: correctedDuration,
                        targetPhone: targetPhone || undefined,
                        businessPhone: businessPhone || undefined,
                        contactId,
                        accountId,
                        agentId,
                        agentEmail
                    };
                    if (RecordingUrl) {
                        bodyPayload.recordingUrl = RecordingUrl.endsWith('.mp3') ? RecordingUrl : `${RecordingUrl}.mp3`;
                    }
                    await upsertCallInSupabase(bodyPayload).catch(() => { });

                    // Auto-trigger transcription for completed calls with recordings
                    if (RecordingUrl) {
                        fetch(`${base}/api/process-call`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ callSid: CallSid })
                        }).catch(err => { });
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
                try {
                    const recs = await client.recordings.list({ callSid: CallSid, limit: 5 });
                    const best = (recs || []).find(r => (Number(r.channels) || 0) === 2) || (recs || [])[0];
                    if (best) {
                        foundRecSid = best.sid;
                        foundUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${foundRecSid}.mp3`;
                    }
                } catch (_) { }
                if (!foundUrl) {
                    try {
                        const kids = await client.calls.list({ parentCallSid: CallSid, limit: 10 });
                        for (const k of kids) {
                            try {
                                const rs = await client.recordings.list({ callSid: k.sid, limit: 5 });
                                const best = (rs || []).find(r => (Number(r.channels) || 0) === 2) || null;
                                if (best) {
                                    foundRecSid = best.sid;
                                    foundUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${foundRecSid}.mp3`;
                                    break;
                                }
                            } catch (_) { }
                        }
                    } catch (_) { }
                }
                if (foundUrl) {
                    const payload = {
                        callSid: CallSid,
                        status: 'completed',
                        duration: Duration || CallDuration,
                        recordingUrl: foundUrl,
                        recordingSid: foundRecSid,
                        agentId,
                        agentEmail,
                        targetPhone: targetPhone || undefined,
                        timestamp: new Date().toISOString()
                    };
                    await upsertCallInSupabase(payload).catch(() => { });
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
