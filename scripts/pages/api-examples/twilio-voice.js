// Example: /api/twilio/voice endpoint
// This webhook returns TwiML instructions for outbound calls

const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

// Your Twilio phone number (the one that will show as caller ID)
const CALLER_ID = '+19728342317'; // Your business phone number

// Express.js example
app.post('/api/twilio/voice', (req, res) => {
    try {
        const { To, From, CallSid } = req.body;
        
        console.log(`[Voice Webhook] Outbound call to ${To} from ${From}, CallSid: ${CallSid}`);
        
        // Create TwiML response
        const twiml = new VoiceResponse();
        
        // Dial the target number
        twiml.dial({
            callerId: CALLER_ID,
            timeout: 30,
            record: 'record-from-answer' // Optional: record calls
        }, To);
        
        // Set correct content type and send response
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('Voice webhook error:', error);
        
        // Return error TwiML
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error processing your call.');
        
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// Alternative: Serverless function (Vercel/Netlify)
export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { To, From, CallSid } = req.body;
        
        console.log(`[Voice Webhook] Outbound call to ${To} from ${From}, CallSid: ${CallSid}`);
        
        // Create TwiML response
        const twiml = new VoiceResponse();
        
        // Dial the target number with your business number as caller ID
        twiml.dial({
            callerId: process.env.TWILIO_PHONE_NUMBER || '+19728342317',
            timeout: 30
        }, To);
        
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

// Example TwiML output:
// <?xml version="1.0" encoding="UTF-8"?>
// <Response>
//     <Dial callerId="+19728342317" timeout="30">+15551234567</Dial>
// </Response>
