// Example: /api/twilio/token endpoint
// This generates access tokens for browser-to-phone calling

const twilio = require('twilio');

// Your Twilio credentials (use environment variables in production)
const ACCOUNT_SID = 'your_account_sid_here';  // From Twilio Console
const AUTH_TOKEN = 'your_auth_token_here';    // From Twilio Console
const TWIML_APP_SID = 'AP20de2f36d77ff97669eb6ce8cb7d3820'; // Your TwiML App SID

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

// Express.js example
app.get('/api/twilio/token', (req, res) => {
    try {
        const identity = req.query.identity || 'agent';
        
        // Create access token
        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;
        
        const token = new AccessToken(
            ACCOUNT_SID,
            'your_api_key_sid',      // Create API Key in Twilio Console
            'your_api_key_secret',   // API Key Secret
            { identity: identity }
        );
        
        // Grant voice capabilities
        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: TWIML_APP_SID, // Your TwiML App SID
            incomingAllow: false // Set to true if you want to receive calls
        });
        
        token.addGrant(voiceGrant);
        
        res.json({
            token: token.toJwt(),
            identity: identity
        });
        
    } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate token',
            message: error.message 
        });
    }
});

// Alternative: Serverless function (Vercel/Netlify)
export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const identity = req.query.identity || 'agent';
        
        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;
        
        const token = new AccessToken(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_API_KEY_SID,
            process.env.TWILIO_API_KEY_SECRET,
            { identity: identity }
        );
        
        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
            incomingAllow: false
        });
        
        token.addGrant(voiceGrant);
        
        res.json({
            token: token.toJwt(),
            identity: identity
        });
        
    } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate token',
            message: error.message 
        });
    }
}
