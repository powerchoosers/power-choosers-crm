import { cors } from '../_cors.js';
const twilio = require('twilio');

// Vercel serverless handler with proper CORS and error handling
export default async (req, res) => {
  if (cors(req, res)) return; // handle OPTIONS
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const identity = req.query.identity || 'agent';
    
    // Twilio credentials from environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const appSid = process.env.TWILIO_TWIML_APP_SID;
    
    // Validate required environment variables
    if (!accountSid || !apiKeySid || !apiKeySecret) {
      console.error('[Token] Missing Twilio credentials');
      return res.status(500).json({ 
        error: 'Missing Twilio credentials',
        message: 'Please configure TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_KEY_SECRET environment variables'
      });
    }
    if (!appSid) {
      console.error('[Token] Missing TwiML App SID');
      return res.status(500).json({
        error: 'Missing TwiML App SID',
        message: 'Please configure TWILIO_TWIML_APP_SID in your environment to match the TwiML App with the correct Voice URL.'
      });
    }
    
    // Create access token
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    
    const token = new AccessToken(
      accountSid,
      apiKeySid,
      apiKeySecret,
      { identity: identity }
    );
    
    // Grant voice capabilities
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: true // Allow browser to receive incoming calls
    });
    
    token.addGrant(voiceGrant);
    
    console.log(`[Token] Generated for identity: ${identity}`);
    
    // Always return JSON
    return res.status(200).json({
      token: token.toJwt(),
      identity: identity
    });
    
  } catch (error) {
    console.error('[Token] Generation error:', error);
    // Always return JSON, even on error
    return res.status(500).json({ 
      error: 'Failed to generate token',
      message: error.message 
    });
  }
}
