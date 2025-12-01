import { cors } from '../_cors.js';
import twilio from 'twilio';
import logger from '../_logger.js';

// Helper function to parse query parameters from URL
function parseQueryParams(url) {
  const queryString = url.split('?')[1];
  if (!queryString) return {};

  return queryString.split('&').reduce((params, param) => {
    const [key, value] = param.split('=');
    params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    return params;
  }, {});
}

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Parse query parameters manually (Node.js HTTP doesn't have req.query)
    const queryParams = parseQueryParams(req.url || '');
    const identity = queryParams.identity || 'agent';

    logger.debug('[TwilioAuth] Token request received', {
      url: req.url,
      method: req.method,
      identity,
      timestamp: new Date().toISOString()
    });
    
    // Twilio credentials from environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const appSid = process.env.TWILIO_TWIML_APP_SID;
    
    // Validate required environment variables
    if (!accountSid || !apiKeySid || !apiKeySecret) {
      logger.error('[TwilioAuth] Missing Twilio credentials', { 
        hasAccountSid: !!accountSid, 
        hasApiKeySid: !!apiKeySid, 
        hasApiKeySecret: !!apiKeySecret 
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing Twilio credentials',
        message: 'Please configure TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_KEY_SECRET environment variables'
      }));
      return;
    }
    if (!appSid) {
      logger.error('[TwilioAuth] Missing TwiML App SID', { hasAppSid: !!appSid });
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
    
    logger.debug('[TwilioAuth] Token generated successfully', { identity });
    
    // Always return JSON
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token: token.toJwt(),
      identity: identity
    }));
    return;
    
  } catch (error) {
    logger.error('[TwilioAuth] Token generation failed', { 
      error: error.message,
      stack: error.stack 
    });
    // Always return JSON, even on error
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to generate token',
      message: error.message 
    }));
    return;
  }
}
