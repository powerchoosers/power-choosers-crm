export default async function handler(req, res) {
    // Only allow POST requests
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
        
        console.log(`[Status Callback] Call ${CallSid} status: ${CallStatus}`);
        console.log(`  From: ${From} → To: ${To}`);
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
