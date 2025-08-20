const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

export default function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { To, From, CallSid } = req.body;
        
        console.log(`[Voice Webhook] Outbound call to ${To} from ${From}, CallSid: ${CallSid}`);
        
        // Your business phone number for caller ID
        const callerId = process.env.TWILIO_PHONE_NUMBER || '+18176630380';
        
        // Create TwiML response
        const twiml = new VoiceResponse();
        
        // Dial the target number with your business number as caller ID
        twiml.dial({
            callerId: callerId,
            timeout: 30,
            // Anti-spam configurations
            answerOnBridge: true,
            hangupOnStar: false,
            timeLimit: 14400, // 4 hours max call duration
            // Enable call recording for AI insights
            record: 'record-from-answer',
            recordingStatusCallback: `${process.env.VERCEL_URL || 'https://power-choosers-crm.vercel.app'}/api/twilio/recording`
        }, To);
        
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
