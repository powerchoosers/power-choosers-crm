const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
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
        
        // Ensure absolute base URL for Twilio callbacks (avoid preview domains)
        const base = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm.vercel.app';

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
            // Pass original caller number as custom parameter since Twilio client always shows business number as "From"
            const dial = twiml.dial({
                callerId: From || businessNumber, // Use caller's number, fallback to business number
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                // action must return TwiML; use dial-complete endpoint
                action: `${base}/api/twilio/dial-complete`,
                statusCallback: `${base}/api/twilio/dial-status`,
                statusCallbackEvent: 'initiated ringing answered completed',
                statusCallbackMethod: 'POST',
                // Do not record from parent leg; we start recording on the child leg via webhook
            });
            // Small prompt to keep caller informed
            try { twiml.say({ voice: 'alice' }, 'Please hold while we try to connect you.'); } catch(_) {}
            
            // Pass the original caller's number as a custom parameter
            const client = dial.client('agent');
            if (From && From !== businessNumber) {
                client.parameter({
                    name: 'originalCaller',
                    value: From
                });
            }
            
            console.log(`[Voice] Generated TwiML to dial <Client>agent</Client> with callerId: ${From || businessNumber}, originalCaller: ${From}`);
        } else if (To) {
            // OUTBOUND CALLBACK SCENARIO: Dial specific number provided
            const dial = twiml.dial({
                callerId: businessNumber,
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                action: `${base}/api/twilio/dial-complete`,
                statusCallback: `${base}/api/twilio/dial-status`,
                statusCallbackEvent: 'initiated ringing answered completed',
                statusCallbackMethod: 'POST',
                // Do not record from parent leg; we start recording on the child leg via webhook
            });
            dial.number(To);
            console.log(`[Voice] Generated TwiML to dial number: ${To}`);
        } else {
            // Fallback: no specific target
            twiml.say('Please hold while we try to connect you.');
            const dial = twiml.dial({
                callerId: businessNumber,
                timeout: 30,
                answerOnBridge: true,
                // action must return TwiML; use dial-complete endpoint
                action: `${base}/api/twilio/dial-complete`,
                statusCallback: `${base}/api/twilio/dial-status`,
                statusCallbackEvent: 'initiated ringing answered completed',
                statusCallbackMethod: 'POST',
                // Do not record from parent leg; we start recording on the child leg via webhook
            });
            dial.client('agent');
        }
        
        // Send TwiML response
        const xml = twiml.toString();
        try { console.log('[Voice TwiML]', xml); } catch(_) {}
        res.setHeader('Content-Type', 'text/xml');
        res.status(200).send(xml);
        
    } catch (error) {
        console.error('Voice webhook error:', error);
        
        // Return error TwiML
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error processing your call.');
        
        res.setHeader('Content-Type', 'text/xml');
        res.status(500).send(twiml.toString());
    }
}
