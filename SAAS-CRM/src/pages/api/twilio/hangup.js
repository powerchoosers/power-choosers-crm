// Twilio Call Hangup API
// Terminates an active Twilio call by CallSid

import twilio from 'twilio';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { callSid, callSids } = req.body;

  // Support both single callSid and array of callSids for multi-leg termination
  const callSidsToTerminate = callSids || (callSid ? [callSid] : []);

  if (!callSidsToTerminate || callSidsToTerminate.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing callSid or callSids parameter' }));
    return;
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      logger.error('[Hangup] Missing Twilio credentials');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error' }));
      return;
    }

    const twilioClient = twilio(accountSid, authToken);

    logger.log('[Hangup] Terminating call(s):', callSidsToTerminate);

    // Terminate all related call legs
    const results = [];
    const errors = [];

    for (const sid of callSidsToTerminate) {
      if (!sid) continue;
      
      try {
        // Fetch the call to get all child legs
        const call = await twilioClient.calls(sid).fetch();
        
        // Terminate this call
        await twilioClient.calls(sid).update({
          status: 'completed'
        });
        
        results.push({
          callSid: sid,
          status: 'completed',
          direction: call.direction
        });
        
        logger.log('[Hangup] Terminated call:', sid, call.direction);
        
        // If this is a parent call, find and terminate all children
        try {
          const children = await twilioClient.calls.list({ parentCallSid: sid, limit: 20 });
          for (const child of children) {
            if (child.status !== 'completed' && child.status !== 'canceled') {
              try {
                await twilioClient.calls(child.sid).update({ status: 'completed' });
                results.push({
                  callSid: child.sid,
                  status: 'completed',
                  direction: child.direction,
                  parentSid: sid
                });
                logger.log('[Hangup] Terminated child call:', child.sid, child.direction);
              } catch (childError) {
                logger.error('[Hangup] Error terminating child call:', child.sid, childError.message);
                errors.push({ callSid: child.sid, error: childError.message });
              }
            }
          }
        } catch (childrenError) {
          logger.warn('[Hangup] Could not fetch children for:', sid, childrenError.message);
        }
        
      } catch (error) {
        // Handle specific Twilio errors
        if (error.code === 20404) {
          logger.log('[Hangup] Call not found (may already be completed):', sid);
          results.push({ callSid: sid, status: 'not-found', message: 'Call already completed or not found' });
        } else {
          logger.error('[Hangup] Error terminating call:', sid, error.message);
          errors.push({ callSid: sid, error: error.message, code: error.code });
        }
      }
    }

    logger.log('[Hangup] Termination complete:', {
      terminated: results.length,
      errors: errors.length,
      results: results.map(r => ({ sid: r.callSid, status: r.status }))
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      terminated: results.length,
      errors: errors.length,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
      message: `Terminated ${results.length} call leg(s)`
    }));

  } catch (error) {
    logger.error('[Hangup] Error terminating call:', error);
    
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
