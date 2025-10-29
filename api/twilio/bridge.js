import twilio from 'twilio';
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
    const startTime = Date.now();
    console.log(`[Bridge] Request started at ${new Date().toISOString()}`);
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    try {
        const { target, callerId } = req.query; // Accept callerId from query params
        const { CallSid, From, To } = req.body;
        
        console.log(`[Bridge] Connecting agent call to target: ${target}, CallSid: ${CallSid}, callerId: ${callerId || 'default'}`);
        
        // Ensure absolute base URL for Twilio callbacks (prefer headers)
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const envBase = process.env.PUBLIC_BASE_URL || '';
        const base = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm-792458658491.us-south1.run.app');
        
        if (!target) {
            // No target specified, just say hello
            const twiml = new VoiceResponse();
            twiml.say('Hello from Power Choosers CRM. No target specified.');
            
            const xml = twiml.toString();
            res.setHeader('Content-Type', 'text/xml');
            res.writeHead(200);
            res.end(xml);
            return;
        }
        
        // Use dynamic caller ID: callerId from query param, fallback to env var
        const dynamicCallerId = callerId || process.env.TWILIO_PHONE_NUMBER || '+18176630380';
        
        // Seed the Calls API with correct phone context for this CallSid
        const apiCallStart = Date.now();
        try {
            const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
            const businessPhone = dynamicCallerId;
            const target10 = norm(target);
            const payload = {
                callSid: CallSid,
                to: target,
                from: dynamicCallerId, // Use dynamic caller ID
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
            console.log(`[Bridge] API call completed in ${Date.now() - apiCallStart}ms`);
        } catch(_) {
            console.log(`[Bridge] API call failed in ${Date.now() - apiCallStart}ms`);
        }

        // Create TwiML to bridge the call
        const twimlStart = Date.now();
        const twiml = new VoiceResponse();
        // Outbound PSTN leg: enable TwiML dual-channel recording on the Dialed number
        
        // Dial the target number immediately without any intro message
        const dial = twiml.dial({
            callerId: dynamicCallerId, // Use dynamic caller ID from query param
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
        
        console.log(`[Bridge] TwiML generated to connect to ${target} in ${Date.now() - twimlStart}ms`);
        
        // Send TwiML response (log for verification)
        const xml = twiml.toString();
        try { console.log('[Bridge TwiML]', xml); } catch(_) {}
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(200);
        res.end(xml);
        return;
        
        const totalTime = Date.now() - startTime;
        console.log(`[Bridge] Total processing time: ${totalTime}ms`);
        
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`[Bridge] Error after ${errorTime}ms:`, error);
        
        // Return error TwiML
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error connecting your call.');
        
        const xml = twiml.toString();
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(500);
        res.end(xml);
        return;
    }
}
