export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const {
            CallSid,
            CallStatus,
            To,
            From,
            Duration,
            RecordingUrl,
            CallDuration
        } = req.body;
        
        console.log(`[Status Callback] Call ${CallSid} status: ${CallStatus}`);
        console.log(`  From: ${From} → To: ${To}`);
        
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
            const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm-792458658491.us-south1.run.app';
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
        
        // Always respond with 200 OK
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('Status callback error:', error);
        res.status(500).send('Error processing status callback');
    }
}
