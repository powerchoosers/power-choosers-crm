import { cors } from '../_cors.js';
import twilio from 'twilio';

// Vercel serverless handler with proper CORS and error handling
export default async (req, res) => {
  if (cors(req, res)) return; // handle OPTIONS
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
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
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing Twilio credentials',
        message: 'Please configure TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_KEY_SECRET environment variables'
      }));
      return;
    }
    if (!appSid) {
      console.error('[Token] Missing TwiML App SID');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing TwiML App SID',
        message: 'Please configure TWILIO_TWIML_APP_SID in your environment to match the TwiML App with the correct Voice URL.'
      }));
      return;
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token: token.toJwt(),
      identity: identity
    }));
    return;
    
  } catch (error) {
    console.error('[Token] Generation error:', error);
    // Always return JSON, even on error
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to generate token',
      message: error.message 
    }));
    return;
  }
}
