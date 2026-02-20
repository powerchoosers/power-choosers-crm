// Status callback: log calls and handle recording fallback
import twilio from 'twilio';
import logger from '../_logger.js';
import { upsertCallInSupabase } from '../calls.js';

export default async function handler(req, res) {
    // Accept GET for quick verification
    if (req.method === 'GET') {
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
        // --- Parse body (Twilio sends application/x-www-form-urlencoded) ---
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

        // --- Extract CRM context from query parameters ---
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
            DialCallSid
        } = body;

        // Full raw body dump for debugging
        logger.log('[Status] RAW BODY:', JSON.stringify(body));
        logger.log('[Status] Event:', CallStatus, '| CallSid:', CallSid, '| To:', To, '| From:', From, '| agentEmail:', agentEmail);

        // ================================================================
        // Skip browser parent legs. These have From=client:agent and To=""
        // which creates duplicate records with no useful phone data.
        // The CHILD leg (actual PSTN call) is logged by dial-complete.js
        // and dial-status.js, which now receive proper POST data via the
        // www.nodalpoint.io canonical domain (no more 307 redirect).
        // ================================================================
        const isBrowserParentLeg = (From || '').startsWith('client:') || (To || '').startsWith('client:');
        if (isBrowserParentLeg) {
            logger.log(`[Status] Skipping browser parent leg ${CallSid} (From=${From}, To=${To})`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
        }


        // ================================================================
        // STEP 1: LOG TO SUPABASE — Do this BEFORE res.end()
        // We log all states (initiated, ringing, etc.) to ensure visibility.
        // ================================================================
        if (CallSid) {
            try {
                const correctedDuration = parseInt(DialCallDuration || Duration || CallDuration || '0', 10);
                const event = (CallStatus || 'initiated').toLowerCase();

                const bodyPayload = {
                    callSid: CallSid,
                    // For browser parent legs: To="" and From="client:agent" in the body
                    // Use query params (targetPhone) for the actual dialed number
                    to: (isBrowserParentLeg ? targetPhoneFromQuery : To) || targetPhoneFromQuery || To || '',
                    from: (isBrowserParentLeg && (!From || From.startsWith('client:'))) ? '' : From,
                    status: event,
                    duration: correctedDuration,
                    targetPhone: targetPhoneFromQuery || undefined,
                    contactId,
                    accountId,
                    agentId,
                    agentEmail,
                    source: 'status-v3'
                };

                if (RecordingUrl) {
                    bodyPayload.recordingUrl = RecordingUrl.endsWith('.mp3') ? RecordingUrl : `${RecordingUrl}.mp3`;
                }

                // If it's a completion event, mark it as completed
                if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(event)) {
                    bodyPayload.status = 'completed';
                }

                logger.log(`[Status] Logging call state [${event}]:`, CallSid);

                await upsertCallInSupabase(bodyPayload).catch(err => {
                    logger.error('[Status] upsertCallInSupabase failed:', err?.message);
                });

                logger.log(`[Status] ✅ Call state [${event}] logged:`, CallSid);
            } catch (logErr) {
                logger.error('[Status] Error logging call:', logErr?.message);
            }
        }

        // ================================================================
        // NOW respond 200 to Twilio — after the upsert is complete.
        // ================================================================
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');

        // ================================================================
        // STEP 2: Recording fallback
        // ================================================================
        if (CallStatus === 'completed' && !RecordingUrl && CallSid) {
            setTimeout(async () => {
                try {
                    const accountSid = process.env.TWILIO_ACCOUNT_SID;
                    const authToken = process.env.TWILIO_AUTH_TOKEN;
                    if (!accountSid || !authToken) return;

                    const client = twilio(accountSid, authToken);
                    let foundUrl = '';
                    let foundRecSid = '';

                    try {
                        const recs = await client.recordings.list({ callSid: CallSid, limit: 5 });
                        const best = (recs || []).find(r => (Number(r.channels) || 0) === 2) || (recs || [])[0];
                        if (best) {
                            foundRecSid = best.sid;
                            foundUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${foundRecSid}.mp3`;
                        }
                    } catch (_) { }

                    if (!foundUrl) {
                        try {
                            const kids = await client.calls.list({ parentCallSid: CallSid, limit: 5 });
                            for (const k of kids) {
                                try {
                                    const rs = await client.recordings.list({ callSid: k.sid, limit: 5 });
                                    const best = (rs || []).find(r => (Number(r.channels) || 0) === 2) || null;
                                    if (best) {
                                        foundRecSid = best.sid;
                                        foundUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${foundRecSid}.mp3`;
                                        break;
                                    }
                                } catch (_) { }
                            }
                        } catch (_) { }
                    }

                    if (foundUrl) {
                        await upsertCallInSupabase({
                            callSid: CallSid,
                            status: 'completed',
                            duration: Duration || CallDuration,
                            recordingUrl: foundUrl,
                            recordingSid: foundRecSid,
                            agentId,
                            agentEmail,
                            targetPhone: targetPhoneFromQuery || undefined,
                            source: 'status-recording-fallback'
                        }).catch(() => { });
                        logger.log('[Status] Recording fallback attached to:', CallSid, foundRecSid);
                    }
                } catch (err) {
                    logger.warn('[Status] Recording fallback error:', err?.message);
                }
            }, 2000);
        }

        // ================================================================
        // STEP 3: Start dual-channel recording for in-progress calls
        // (fire-and-forget via setTimeout)
        // ================================================================
        if ((CallStatus === 'in-progress' || CallStatus === 'answered') && CallSid) {
            setTimeout(async () => {
                try {
                    const accountSid = process.env.TWILIO_ACCOUNT_SID;
                    const authToken = process.env.TWILIO_AUTH_TOKEN;
                    if (!accountSid || !authToken) return;

                    const client = twilio(accountSid, authToken);
                    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://nodal-point-network.vercel.app';

                    const candidates = [];
                    if (DialCallSid && /^CA[0-9a-f]{32}$/i.test(DialCallSid)) candidates.push(DialCallSid);
                    if (/^CA[0-9a-f]{32}$/i.test(CallSid)) candidates.push(CallSid);

                    for (const sid of candidates) {
                        try {
                            const existing = await client.calls(sid).recordings.list({ limit: 5 });
                            const hasDialVerb = existing.some(r => r.source === 'DialVerb' && r.status !== 'stopped');
                            const hasDual = existing.some(r => (Number(r.channels) || 0) === 2 && r.status !== 'stopped');
                            if (hasDialVerb || hasDual) return;

                            await client.calls(sid).recordings.create({
                                recordingChannels: 'dual',
                                recordingTrack: 'both',
                                recordingStatusCallback: baseUrl + '/api/twilio/recording',
                                recordingStatusCallbackMethod: 'POST'
                            });
                            logger.log('[Status] Started dual recording on:', sid);
                            return;
                        } catch (_) { }
                    }
                } catch (e) {
                    logger.warn('[Status] Recording start error:', e?.message);
                }
            }, 3000);
        }

        // Auto-trigger transcription for completed calls with recordings
        if (CallStatus === 'completed' && RecordingUrl) {
            const envBase = process.env.PUBLIC_BASE_URL || 'https://nodal-point-network.vercel.app';
            fetch(`${envBase}/api/process-call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid: CallSid })
            }).catch(() => { });
        }

        return;
    } catch (error) {
        logger.error('[Status] Unhandled error:', error?.message);
        try {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
        } catch (_) { }
        return;
    }
}
