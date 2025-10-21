import twilio from 'twilio';

// CORS middleware
function corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
}

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number required' });
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
        
        console.log('[Caller ID] Validation request created:', callerIdValidation.sid);
        
        res.status(200).json({
            success: true,
            validationCode: callerIdValidation.validationCode,
            message: 'Caller ID validation initiated'
        });
        
    } catch (error) {
        console.error('[Caller ID] Error:', error);
        res.status(500).json({ 
            error: 'Failed to initiate caller ID validation',
            details: error.message 
        });
    }
}
