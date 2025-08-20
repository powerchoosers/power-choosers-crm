export default function handler(req, res) {
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
        
        // Optional: Save call data to your database (Firestore)
        // This is perfect for updating your CRM's call history
        /*
        if (typeof saveCallToFirestore !== 'undefined') {
            await saveCallToFirestore({
                callSid: CallSid,
                status: CallStatus,
                from: From,
                to: To,
                duration: Duration || CallDuration,
                recordingUrl: RecordingUrl,
                timestamp: new Date()
            });
        }
        */
        
        // Always respond with 200 OK
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('Status callback error:', error);
        res.status(500).send('Error processing status callback');
    }
}
