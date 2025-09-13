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
        
        // Ensure absolute base URL for Twilio callbacks (avoid preview domains that require auth)
        const base = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm.vercel.app';
        
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
        
        // Dial the target number immediately without any intro message
        const dial = twiml.dial({
            callerId: process.env.TWILIO_PHONE_NUMBER || '+18176630380',
            timeout: 30,
            answerOnBridge: true,  // This ensures proper audio bridging
            hangupOnStar: false,
            timeLimit: 14400,      // 4 hours max call duration
            // Enable Twilio Voice Intelligence for real-time transcription and AI insights
            record: 'record-from-answer',
            recordingStatusCallback: `${base}/api/twilio/recording`,
            recordingStatusCallbackMethod: 'POST',
            // Enable Voice Intelligence for real-time transcription
            voiceIntelligence: true,
            voiceIntelligenceOptions: {
                voiceIntelligenceInsights: ['summary', 'sentiment', 'topics'],
                voiceIntelligenceInsightsCallback: `${base}/api/twilio/voice-intelligence`,
                voiceIntelligenceInsightsCallbackMethod: 'POST'
            }
        });
        
        // Add the target number with no retry logic
        dial.number(target);
        
        // CRITICAL: Set action URL to handle dial completion without retry
        // When the dial completes (target hangs up), this prevents automatic retry
        dial.action('/api/twilio/dial-complete');
        
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
