const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

export default function handler(req, res) {
    // Allow GET or POST (Twilio Console may be configured for either)
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Read params from body (POST) or query (GET)
        const src = req.method === 'POST' ? (req.body || {}) : (req.query || {});
        const To = src.To || src.to;
        const From = src.From || src.from;
        const CallSid = src.CallSid || src.callSid;
        
        console.log(`[Voice Webhook] Outbound call to ${To} from ${From || 'N/A'}, CallSid: ${CallSid || 'N/A'} (method: ${req.method})`);
        
        // Your business phone number for caller ID
        const callerId = process.env.TWILIO_PHONE_NUMBER || '+18176630380';
        
        // Ensure absolute base URL for Twilio callbacks
        const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';

        // Create TwiML response
        const twiml = new VoiceResponse();
        
        // Dial the target number with your business number as caller ID
        const dial = twiml.dial({
            callerId: callerId,
            timeout: 30,
            // Anti-spam configurations
            answerOnBridge: true,
            hangupOnStar: false,
            timeLimit: 14400, // 4 hours max call duration
            // Recording disabled temporarily to fix voice transmission issue
            // record: 'record-from-answer-dual',  // Use this instead if you need recording
            // recordingStatusCallback: `${base}/api/twilio/recording`,
            // recordingStatusCallbackEvent: 'completed',
            // Add action URL to track call completion
            action: `${base}/api/twilio/status`
        });
        
        if (To) {
            dial.number(To);
        } else {
            // If no To provided, respond with a helpful message to avoid 31000
            twiml.say('Missing destination number.');
        }
        
        console.log(`[Voice] TwiML generated for call to ${To}`);
        
        // Send TwiML response
        res.setHeader('Content-Type', 'text/xml');
        res.status(200).send(twiml.toString());
        
    } catch (error) {
        console.error('Voice webhook error:', error);
        
        // Return error TwiML
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error processing your call.');
        
        res.setHeader('Content-Type', 'text/xml');
        res.status(500).send(twiml.toString());
    }
}
