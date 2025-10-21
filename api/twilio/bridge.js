import twilio from 'twilio';
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
        
        // Ensure absolute base URL for Twilio callbacks (prefer headers)
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const envBase = process.env.PUBLIC_BASE_URL || '';
        const base = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm-792458658491.us-south1.run.app');
        
        if (!target) {
            // No target specified, just say hello
            const twiml = new VoiceResponse();
            twiml.say('Hello from Power Choosers CRM. No target specified.');
            
            res.setHeader('Content-Type', 'text/xml');
            res.status(200).send(twiml.toString());
            return;
        }
        
        // Seed the Calls API with correct phone context for this CallSid
        try {
            const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
            const twilioBiz = process.env.TWILIO_PHONE_NUMBER || '+18176630380';
            const businessPhone = twilioBiz;
            const target10 = norm(target);
            const payload = {
                callSid: CallSid,
                to: target,
                from: twilioBiz,
                status: 'in-progress',
                targetPhone: target10,
                businessPhone
            };
            // Fire-and-forget; don't block TwiML
            fetch(`${base}/api/calls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(()=>{});
        } catch(_) {}

        // Create TwiML to bridge the call
        const twiml = new VoiceResponse();
        // Outbound PSTN leg: enable TwiML dual-channel recording on the Dialed number
        
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
            // TwiML dual-channel from answer
            record: 'record-from-answer-dual',
            recordingStatusCallback: `${base}/api/twilio/recording`,
            recordingStatusCallbackMethod: 'POST'
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
