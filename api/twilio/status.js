import twilio from 'twilio';

export default async function handler(req, res) {
    // Accept GET for quick verification; Twilio will POST status updates
    if (req.method === 'GET') {
        try {
            console.log('[Status GET] Host:', req.headers.host, 'Query:', req.query || {});
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
        console.log(`[Status Callback] Call ${CallSid} status: ${CallStatus}`);
        console.log('  Host:', req.headers.host, 'Twilio-Signature:', sig);
        console.log(`  From: ${From} → To: ${To}`);
        console.log('  Raw body:', JSON.stringify(body).slice(0, 800));

        // Compute absolute base URL once
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || '';
        const base = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm-792458658491.us-south1.run.app');

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
                if (!accountSid || !authToken) { console.warn('[Status] Missing Twilio creds; cannot start recording'); return; }
                const client = twilio(accountSid, authToken);
                const baseUrl = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app';

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
                        console.log('[Status] Identified PSTN Dial child:', DialCallSid, 'To:', body.To);
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
                        console.log('[Status] Discovered child legs:', kids.map(c => ({ sid: c.sid, from: c.from, to: c.to, direction: c.direction, isPstn: !(String(c.from||'').startsWith('client:') || String(c.to||'').startsWith('client:')) && String(c.direction||'').toLowerCase()==='outbound-dial' })));
                    }
                } catch (discErr) {
                    console.log('[Status] Child discovery failed:', discErr?.message);
                }

                const pstnList = Array.from(pstnCandidates);
                const ordered = [...pstnList, ...Array.from(candidates)];
                console.log('[Status] Candidate priority order:', { pstnFirst: pstnList, others: Array.from(candidates) });

                        // Try candidates in priority order; skip if DialVerb recording exists to avoid interference
                        for (const sid of ordered) {
                            try {
                                const existing = await client.calls(sid).recordings.list({ limit: 5 });
                                const hasDialVerbRecording = existing.some(r => r.source === 'DialVerb' && r.status !== 'stopped');
                                if (hasDialVerbRecording) { 
                                    console.log('[Status] DialVerb recording already exists on', sid, '- skipping REST API fallback to avoid interference'); 
                                    return; 
                                }
                                const hasDual = existing.some(r => (Number(r.channels) || 0) === 2 && r.status !== 'stopped');
                                if (hasDual) { console.log('[Status] Dual recording already active on', sid); return; }

                        // Safety: stop active mono recording so dual can start
                        const active = existing.find(r => r.status !== 'stopped');
                        if (active && (Number(active.channels) || 0) === 1) {
                            try {
                                await client.calls(sid).recordings('Twilio.CURRENT').update({ status: 'stopped' });
                                console.log('[Status] ⏹️ Stopped active mono recording on', sid, '->', active.sid);
                            } catch (stopErr) {
                                console.log('[Status] Could not stop active recording on', sid, ':', stopErr?.message);
                            }
                        }

                        const rec = await client.calls(sid).recordings.create({
                            recordingChannels: 'dual',
                            recordingTrack: 'both',
                            recordingStatusCallback: baseUrl + '/api/twilio/recording',
                            recordingStatusCallbackMethod: 'POST'
                        });
                        console.log('[Status] Started recording via REST on', sid, '→', { recordingSid: rec.sid, channels: rec.channels, source: rec.source, track: rec.track });
                        return; // Stop after first success
                    } catch (tryErr) {
                        console.log('[Status] Could not start recording on', sid, ':', tryErr?.message);
                    }
                }

                if (!candidates.size) console.log('[Status] No candidate call SIDs to start recording on');
            } catch (e) {
                console.log('[Status] startDualIfNeeded error:', e?.message);
            }
        }
        await startDualIfNeeded();

        // [REMOVED] Webhook telemetry logging - was causing excessive Firestore writes (~10-15 per call)
        // Only essential call data is now logged to /api/calls collection on 'completed' status
        
        // Handle different call statuses
        switch (CallStatus) {
            case 'ringing':
                console.log(`  📞 Call is ringing...`);
                // Early upsert for badge visibility (minimal fields)
                try {
                    await fetch(`${base}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callSid: CallSid,
                            to: To,
                            from: From,
                            status: CallStatus,
                            targetPhone: targetPhone || undefined,
                            businessPhone: businessPhone || undefined
                        })
                    }).catch(()=>{});
                } catch(_) {}
                break;
            case 'in-progress':
                console.log(`  📞 Call answered and in progress`);
                // Early upsert for badge visibility (minimal fields)
                try {
                    await fetch(`${base}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callSid: CallSid,
                            to: To,
                            from: From,
                            status: CallStatus,
                            targetPhone: targetPhone || undefined,
                            businessPhone: businessPhone || undefined
                        })
                    }).catch(()=>{});
                } catch(_) {}
                break;
            case 'completed':
                const duration = Duration || CallDuration || '0';
                console.log(`  ✅ Call completed. Duration: ${duration}s`);
                if (RecordingUrl) {
                    console.log(`  🎵 Recording: ${RecordingUrl}`);
                }
                break;
            case 'busy':
                console.log(`  📵 Line busy`);
                break;
            case 'no-answer':
                console.log(`  📵 No answer`);
                break;
            case 'failed':
                console.log(`  ❌ Call failed`);
                break;
            case 'canceled':
                console.log(`  ❌ Call canceled`);
                break;
            default:
                console.log(`  ℹ️ Status: ${CallStatus}`);
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
                        businessPhone: businessPhone || undefined
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
                        console.log(`[Status] Auto-triggering transcription for completed call: ${CallSid}`);
                        // Trigger transcription in background (don't wait for response)
                        fetch(`${base}/api/process-call`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ callSid: CallSid })
                        }).catch(err => {
                            console.warn(`[Status] Failed to trigger transcription for ${CallSid}:`, err?.message);
                        });
                    }
                } catch (innerError) {
                    console.warn('[Status] Failed posting to /api/calls (inner):', innerError?.message);
                }
            }
        } catch (e) {
            console.warn('[Status] Failed posting to /api/calls:', e?.message);
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
                        console.log(`[Status] Found parent-leg recording for ${CallSid}: ${foundUrl}`);
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
                                    console.log(`[Status] Found child-leg recording for ${CallSid} on ${k.sid}: ${foundUrl}`);
                                    break;
                                }
                            } catch(_) {}
                        }
                    } catch(_) {}
                }
                if (foundUrl) {
                    await fetch(`${base}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ callSid: CallSid, recordingUrl: foundUrl })
                    }).catch(() => {});
                } else {
                    console.log(`[Status] No recordings found yet for ${CallSid} on parent or children`);
                }
            }
        } catch (err) {
            console.warn('[Status] Error while fetching recording by CallSid:', err?.message);
        }
        
        // Always respond with 200 OK
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
        
    } catch (error) {
        console.error('Status callback error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error processing status callback');
        return;
    }
}
