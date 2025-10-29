import twilio from 'twilio';
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
    // Allow GET or POST (Twilio Console may be configured for either)
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    try {
        // Read params from body (POST) or query (GET)
        const src = req.method === 'POST' ? (req.body || {}) : (req.query || {});
        const To = src.To || src.to; // For inbound, this is typically your Twilio number
        const From = src.From || src.from; // For inbound, this is the caller's number; for outbound, this is the selected caller ID
        const CallSid = src.CallSid || src.callSid;
        
        // Dynamic caller ID: Use From parameter if provided (for outbound calls), otherwise use fallback
        // For inbound calls, From will be the caller's number, so we'll use businessNumber as fallback
        const businessNumber = process.env.TWILIO_PHONE_NUMBER || '+18176630380';
        
        // Determine caller ID: for outbound browser calls, From will be the selected Twilio number
        // For inbound calls, From will be the caller's number, so we check if it matches our business number
        const digits = (s) => (s || '').toString().replace(/\D/g, '');
        const toDigits = digits(To);
        const businessDigits = digits(businessNumber);
        const isInboundToBusiness = toDigits && businessDigits && toDigits === businessDigits;
        
        // For outbound calls, use From as callerId (this is the selected Twilio number from settings)
        // For inbound calls, use businessNumber as callerId when dialing to browser client
        const callerIdForDial = isInboundToBusiness ? businessNumber : (From || businessNumber);
        
        // Ensure absolute base URL for Twilio callbacks (prefer headers)
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const envBase = process.env.PUBLIC_BASE_URL || '';
        const base = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm-792458658491.us-south1.run.app');

        console.log(`[Voice Webhook] From: ${From || 'N/A'} To: ${To || 'N/A'} CallSid: ${CallSid || 'N/A'} inbound=${isInboundToBusiness} callerId=${callerIdForDial}`);

        // Create TwiML response
        const twiml = new VoiceResponse();

        if (isInboundToBusiness) {
            // INBOUND CALL: Ring the browser client (identity: agent)
            // Enable dual-channel dial recording so Twilio produces 2-channel recordings directly
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
                // Dual-channel from answer
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording`,
                recordingStatusCallbackMethod: 'POST'
            });
            // Small prompt to keep caller informed
            twiml.say({ voice: 'alice' }, 'Please hold while we try to connect you.');
            
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
            // Use dynamic caller ID from From parameter (selected Twilio number from settings)
            const dial = twiml.dial({
                callerId: callerIdForDial, // Use selected number from settings, fallback to businessNumber
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                action: `${base}/api/twilio/dial-complete`,
                statusCallback: `${base}/api/twilio/dial-status`,
                statusCallbackEvent: 'initiated ringing answered completed',
                statusCallbackMethod: 'POST',
                // Dual-channel from answer
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording`,
                recordingStatusCallbackMethod: 'POST'
            });
            dial.number(To);
            console.log(`[Voice] Generated TwiML to dial number: ${To} with callerId: ${callerIdForDial}`);
        } else {
            // Fallback: no specific target
            twiml.say('Please hold while we try to connect you.');
            const dial = twiml.dial({
                callerId: callerIdForDial, // Use selected number from settings, fallback to businessNumber
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                // action must return TwiML; use dial-complete endpoint
                action: `${base}/api/twilio/dial-complete`,
                statusCallback: `${base}/api/twilio/dial-status`,
                statusCallbackEvent: 'initiated ringing answered completed',
                statusCallbackMethod: 'POST',
                // Dual-channel from answer
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording`,
                recordingStatusCallbackMethod: 'POST'
            });
            dial.client('agent');
        }
        
        // Send TwiML response
        const xml = twiml.toString();
        try { console.log('[Voice TwiML]', xml); } catch(_) {}
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(200);
        res.end(xml);
        return;
        
    } catch (error) {
        console.error('Voice webhook error:', error);
        
        // Return error TwiML
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error processing your call.');
        
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(500);
        res.end(twiml.toString());
        return;
    }
}
