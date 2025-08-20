const twilio = require('twilio');

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  return await fn(req, res)
}

module.exports = allowCors(async (req, res) => {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
      return res.status(200).end();
  }
  
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
      const appSid = process.env.TWILIO_TWIML_APP_SID || 'AP20de2f36d77ff97669eb6ce8cb7d3820';
      
      // Validate required environment variables
      if (!accountSid || !apiKeySid || !apiKeySecret) {
          return res.status(500).json({ 
              error: 'Missing Twilio credentials',
              message: 'Please configure TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_KEY_SECRET environment variables'
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
          incomingAllow: false // Set to true if you want to receive calls
      });
      
      token.addGrant(voiceGrant);
      
      console.log(`[Token] Generated for identity: ${identity}`);
      
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
})
