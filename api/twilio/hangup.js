// Twilio Call Hangup API
// Terminates an active Twilio call by CallSid

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { callSid } = req.body;

  if (!callSid) {
    return res.status(400).json({ error: 'Missing callSid parameter' });
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error('[Hangup] Missing Twilio credentials');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const twilio = require('twilio')(accountSid, authToken);

    console.log('[Hangup] Terminating call:', callSid);

    // Update the call to 'completed' status to terminate it
    const call = await twilio.calls(callSid).update({
      status: 'completed'
    });

    console.log('[Hangup] Call terminated successfully:', {
      callSid: call.sid,
      status: call.status,
      endTime: call.endTime
    });

    res.status(200).json({
      success: true,
      callSid: call.sid,
      status: call.status,
      message: 'Call terminated successfully'
    });

  } catch (error) {
    console.error('[Hangup] Error terminating call:', error);
    
    // Handle specific Twilio errors
    if (error.code === 20404) {
      return res.status(404).json({ 
        error: 'Call not found',
        message: 'The specified call does not exist or has already ended'
      });
    }
    
    if (error.code === 20003) {
      return res.status(403).json({ 
        error: 'Authentication failed',
        message: 'Invalid Twilio credentials'
      });
    }

    res.status(500).json({ 
      error: 'Failed to terminate call',
      message: error.message || 'Unknown error'
    });
  }
}
