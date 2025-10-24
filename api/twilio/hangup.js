// Twilio Call Hangup API
// Terminates an active Twilio call by CallSid

import twilio from 'twilio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { callSid } = req.body;

  if (!callSid) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing callSid parameter' }));
    return;
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error('[Hangup] Missing Twilio credentials');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error' }));
      return;
    }

    const twilioClient = twilio(accountSid, authToken);

    console.log('[Hangup] Terminating call:', callSid);

    // Update the call to 'completed' status to terminate it
    const call = await twilioClient.calls(callSid).update({
      status: 'completed'
    });

    console.log('[Hangup] Call terminated successfully:', {
      callSid: call.sid,
      status: call.status,
      endTime: call.endTime
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      callSid: call.sid,
      status: call.status,
      message: 'Call terminated successfully'
    }));

  } catch (error) {
    console.error('[Hangup] Error terminating call:', error);
    
    // Handle specific Twilio errors
    if (error.code === 20404) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Call not found',
        message: 'The specified call does not exist or has already ended'
      }));
      return;
    }
    
    if (error.code === 20003) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Authentication failed',
        message: 'Invalid Twilio credentials'
      }));
      return;
    }

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to terminate call',
      message: error.message || 'Unknown error'
    }));
    return;
  }
}
