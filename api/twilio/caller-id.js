import twilio from 'twilio';
import logger from '../_logger.js';

// CORS middleware
function corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    next();
}

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Phone number required' }));
            return;
        }
        
        const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        
        // Register caller ID to reduce spam detection
        const callerIdValidation = await client.validationRequests.create({
            phoneNumber: phoneNumber,
            friendlyName: 'Power Choosers CRM Business Line'
        });
        
        logger.log('[Caller ID] Validation request created:', callerIdValidation.sid);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            validationCode: callerIdValidation.validationCode,
            message: 'Caller ID validation initiated'
        }));
        
    } catch (error) {
        logger.error('[Caller ID] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            error: 'Failed to initiate caller ID validation',
            details: error.message 
        }));
        return;
    }
}
