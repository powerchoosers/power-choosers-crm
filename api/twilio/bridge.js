const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { target } = req.query;
        const { CallSid, From, To } = req.body;
        
        console.log(`[Bridge] Connecting agent call to target: ${target}, CallSid: ${CallSid}`);
        
        // Ensure absolute base URL for Twilio callbacks (avoid preview domains that require auth)
        const base = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm.vercel.app';
        
        if (!target) {
            // No target specified, just say hello
            const twiml = new VoiceResponse();
            twiml.say('Hello from Power Choosers CRM. No target specified.');
            
            res.setHeader('Content-Type', 'text/xml');
            res.status(200).send(twiml.toString());
            return;
        }
        
        // Create TwiML to bridge the call
        const twiml = new VoiceResponse();
        // Also ensure parent call is recording dual via REST (best-effort)
        try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            if (accountSid && authToken && CallSid) {
                const client = twilio(accountSid, authToken);
                await client.calls(CallSid).recordings.create({
                    recordingChannels: 'dual',
                    recordingTrack: 'both',
                    recordingStatusCallback: `${base}/api/twilio/recording`,
                    recordingStatusCallbackMethod: 'POST'
                }).catch(()=>{});
            }
        } catch(_) {}
        
        // Dial the target number immediately without any intro message
        const dial = twiml.dial({
            callerId: process.env.TWILIO_PHONE_NUMBER || '+18176630380',
            timeout: 30,
            answerOnBridge: true,  // This ensures proper audio bridging
            hangupOnStar: false,
            timeLimit: 14400,      // 4 hours max call duration
            // Return to our handler after dial completes
            action: `${base}/api/twilio/dial-complete`,
            statusCallback: `${base}/api/twilio/dial-status`,
            statusCallbackEvent: 'initiated ringing answered completed',
            statusCallbackMethod: 'POST',
            // TwiML recording flags
            record: 'record-from-answer',
            recordingStatusCallback: `${base}/api/twilio/recording`,
            recordingStatusCallbackMethod: 'POST',
            recordingChannels: 'dual',
            recordingTrack: 'both'
        });
        
        // Add the target number with no retry logic
        dial.number(target);
        
        // action already set in Dial options
        
        console.log(`[Bridge] TwiML generated to connect to ${target}`);
        
        // Send TwiML response (log for verification)
        const xml = twiml.toString();
        try { console.log('[Bridge TwiML]', xml); } catch(_) {}
        res.setHeader('Content-Type', 'text/xml');
        res.status(200).send(xml);
        
    } catch (error) {
        console.error('Bridge webhook error:', error);
        
        // Return error TwiML
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error connecting your call.');
        
        res.setHeader('Content-Type', 'text/xml');
        res.status(500).send(twiml.toString());
    }
}
