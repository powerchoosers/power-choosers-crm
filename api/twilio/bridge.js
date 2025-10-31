import twilio from 'twilio';
import { cors } from '../_cors.js';
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
    // Handle CORS and OPTIONS requests
    if (cors(req, res)) return; // handle OPTIONS
    
    const startTime = Date.now();
    console.log(`[Bridge] Request started at ${new Date().toISOString()}`);
    
    // Only allow POST requests (but allow OPTIONS for CORS)
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
        
        // Validate and normalize target number format before adding to dial
        if (!target || target.trim().length === 0) {
            console.error('[Bridge] Invalid target number:', target);
            const errorTwiml = new VoiceResponse();
            errorTwiml.say('Sorry, there was an error. Invalid target number.');
            errorTwiml.hangup();
            const xml = errorTwiml.toString();
            res.setHeader('Content-Type', 'text/xml');
            res.writeHead(200);
            res.end(xml);
            return;
        }
        
        // Normalize target number to E.164 format if needed
        let normalizedTarget = target.trim();
        // If it doesn't start with +, try to normalize it
        if (!normalizedTarget.startsWith('+')) {
            // Remove all non-digits
            const digits = normalizedTarget.replace(/\D/g, '');
            if (digits.length === 10) {
                // US number without country code
                normalizedTarget = `+1${digits}`;
            } else if (digits.length === 11 && digits.startsWith('1')) {
                // US number with country code
                normalizedTarget = `+${digits}`;
            } else if (digits.length > 0) {
                // Assume it's a valid international number, add + if not present
                normalizedTarget = `+${digits}`;
            }
        }
        
        console.log(`[Bridge] Normalized target number: ${normalizedTarget} (from: ${target})`);
        
        // Add the target number with no retry logic
        dial.number(normalizedTarget);
        
        // action already set in Dial options
        
        console.log(`[Bridge] TwiML generated to connect to ${target} in ${Date.now() - twimlStart}ms`);
        
        // Send TwiML response (log for verification)
        const xml = twiml.toString();
        try { console.log('[Bridge TwiML]', xml); } catch(_) {}
        
        const totalTime = Date.now() - startTime;
        console.log(`[Bridge] Total processing time: ${totalTime}ms`);
        
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(200);
        res.end(xml);
        return;
        
    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`[Bridge] Error after ${errorTime}ms:`, error);
        console.error(`[Bridge] Error stack:`, error.stack);
        console.error(`[Bridge] Request details:`, {
            method: req.method,
            url: req.url,
            query: req.query,
            body: req.body,
            headers: req.headers
        });
        
        // Return error TwiML - MUST return 200 status for Twilio to process it
        // Returning 500 causes Twilio to show "application error" message
        try {
            const twiml = new VoiceResponse();
            twiml.say('Sorry, there was an error connecting your call. Please try again.');
            twiml.hangup();
            
            const xml = twiml.toString();
            res.setHeader('Content-Type', 'text/xml');
            res.writeHead(200); // Always return 200 for TwiML responses, even on error
            res.end(xml);
            return;
        } catch (twimlError) {
            console.error('[Bridge] Failed to generate error TwiML:', twimlError);
            // Last resort: return minimal valid TwiML
            res.setHeader('Content-Type', 'text/xml');
            res.writeHead(200);
            res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
            return;
        }
    }
}
