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
        const To = src.To || src.to; // For inbound, this is typically your Twilio number
        const From = src.From || src.from; // For inbound, this is the caller's number
        const CallSid = src.CallSid || src.callSid;
        
        // Your business phone number for caller ID
        const businessNumber = process.env.TWILIO_PHONE_NUMBER || '+18176630380';
        
        // Ensure absolute base URL for Twilio callbacks
        const base =
            (req.headers?.host ? `https://${req.headers.host}` : null) ||
            process.env.PUBLIC_BASE_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app');

        const digits = (s) => (s || '').toString().replace(/\D/g, '');
        const toDigits = digits(To);
        const businessDigits = digits(businessNumber);

        const isInboundToBusiness = toDigits && businessDigits && toDigits === businessDigits;
        console.log(`[Voice Webhook] From: ${From || 'N/A'} To: ${To || 'N/A'} CallSid: ${CallSid || 'N/A'} inbound=${isInboundToBusiness}`);

        // Create TwiML response
        const twiml = new VoiceResponse();

        if (isInboundToBusiness) {
            // INBOUND CALL: Ring the browser client (identity: agent)
            // Requires client token with incomingAllow: true and a connected browser
            const dial = twiml.dial({
                callerId: businessNumber,
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                action: `${base}/api/twilio/status`
            });
            dial.client('agent');
            console.log('[Voice] Generated TwiML to dial <Client>agent</Client>');
        } else if (To) {
            // OUTBOUND CALLBACK SCENARIO: Dial specific number provided
            const dial = twiml.dial({
                callerId: businessNumber,
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                action: `${base}/api/twilio/status`
            });
            dial.number(To);
            console.log(`[Voice] Generated TwiML to dial number: ${To}`);
        } else {
            // Fallback: no specific target
            twiml.say('Please hold while we try to connect you.');
            const dial = twiml.dial({
                callerId: businessNumber,
                timeout: 30,
                answerOnBridge: true
            });
            dial.client('agent');
        }
        
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
