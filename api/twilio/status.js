export default async function handler(req, res) {
    // Accept GET for quick verification; Twilio will POST status updates
    if (req.method === 'GET') {
        try {
            console.log('[Status GET] Host:', req.headers.host, 'Query:', req.query || {});
        } catch (_) {}
        return res.status(200).send('OK');
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
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

        // Fallback: attempt to start a dual-channel recording when the call is answered/in-progress
        // This complements the /api/twilio/dial-status path and covers cases where Dial callbacks are missed
        async function startDualIfNeeded() {
            try {
                const event = String(CallStatus || '').toLowerCase();
                if (!(event === 'answered' || event === 'in-progress')) return;

                const accountSid = process.env.TWILIO_ACCOUNT_SID;
                const authToken = process.env.TWILIO_AUTH_TOKEN;
                if (!accountSid || !authToken) { console.warn('[Status] Missing Twilio creds; cannot start recording'); return; }
                const twilio = require('twilio');
                const client = twilio(accountSid, authToken);
                const baseUrl = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app');

                // Build candidate list: prefer DialCallSid (child PSTN), then parent CallSid, then discovered children
                const candidates = new Set();
                const DialCallSid = body.DialCallSid || body.DialCallSid0 || body.DialSid || '';
                if (DialCallSid && /^CA[0-9a-f]{32}$/i.test(DialCallSid)) candidates.add(DialCallSid);
                if (CallSid && /^CA[0-9a-f]{32}$/i.test(CallSid)) candidates.add(CallSid);

                try {
                    if (CallSid) {
                        const kids = await client.calls.list({ parentCallSid: CallSid, limit: 10 });
                        // Prefer non-client legs first
                        for (const k of kids) {
                            const isClient = (k.from || '').startsWith('client:') || (k.to || '').startsWith('client:');
                            if (!isClient) candidates.add(k.sid);
                        }
                        // Then add remaining client legs as last resort
                        for (const k of kids) {
                            const isClient = (k.from || '').startsWith('client:') || (k.to || '').startsWith('client:');
                            if (isClient) candidates.add(k.sid);
                        }
                        console.log('[Status] Discovered child legs:', kids.map(c => ({ sid: c.sid, from: c.from, to: c.to, direction: c.direction })));
                    }
                } catch (discErr) {
                    console.log('[Status] Child discovery failed:', discErr?.message);
                }

                // Try candidates in order; skip if dual already exists
                for (const sid of candidates) {
                    try {
                        const existing = await client.calls(sid).recordings.list({ limit: 5 });
                        const hasDual = existing.some(r => (Number(r.channels) || 0) === 2 && r.status !== 'stopped');
                        if (hasDual) { console.log('[Status] Dual recording already active on', sid); return; }
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

        // Log to Firestore (best-effort)
        try {
            const { db } = require('../_firebase');
            if (db) {
                await db.collection('twilio_webhooks').add({
                    type: 'status',
                    ts: new Date().toISOString(),
                    event: CallStatus,
                    body,
                    host: req.headers.host || null
                });
            }
        } catch (_) {}
        
        // Handle different call statuses
        switch (CallStatus) {
            case 'ringing':
                console.log(`  📞 Call is ringing...`);
                break;
            case 'in-progress':
                console.log(`  📞 Call answered and in progress`);
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
        
        // Upsert into central /api/calls so the UI stays in sync
        try {
            const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';
            const body = {
                callSid: CallSid,
                to: To,
                from: From,
                status: CallStatus,
                duration: parseInt((Duration || CallDuration || '0'), 10)
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
            if (CallStatus === 'completed' && RecordingUrl) {
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
        } catch (e) {
            console.warn('[Status] Failed posting to /api/calls:', e?.message);
        }

        // If call completed and RecordingUrl not provided, try to fetch the recording via Twilio API
        try {
            if (CallStatus === 'completed' && !RecordingUrl && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                const recs = await client.recordings.list({ callSid: CallSid, limit: 1 });
                if (recs && recs.length > 0) {
                    const recSid = recs[0].sid;
                    const full = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${recSid}.mp3`;
                    console.log(`[Status] Found recording for ${CallSid}: ${full}`);
                    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';
                    await fetch(`${base}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ callSid: CallSid, recordingUrl: full })
                    }).catch(() => {});
                } else {
                    console.log(`[Status] No recordings found yet for ${CallSid}`);
                }
            }
        } catch (err) {
            console.warn('[Status] Error while fetching recording by CallSid:', err?.message);
        }
        
        // Always respond with 200 OK
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('Status callback error:', error);
        res.status(500).send('Error processing status callback');
    }
}
