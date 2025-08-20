const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

export default function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { target } = req.query;
        const { CallSid, From, To } = req.body;
        
        console.log(`[Bridge] Connecting agent call to target: ${target}, CallSid: ${CallSid}`);
        
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
        
        // Optional: Play a brief message to agent
        twiml.say('Connecting your call...');
        
        // Dial the target number
        const dial = twiml.dial({
            callerId: process.env.TWILIO_PHONE_NUMBER || '+18176630380',
            timeout: 30
        });
        dial.number(target);
        
        console.log(`[Bridge] TwiML generated to connect to ${target}`);
        
        // Send TwiML response
        res.setHeader('Content-Type', 'text/xml');
        res.status(200).send(twiml.toString());
        
    } catch (error) {
        console.error('Bridge webhook error:', error);
        
        // Return error TwiML
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error connecting your call.');
        
        res.setHeader('Content-Type', 'text/xml');
        res.status(500).send(twiml.toString());
    }
}
