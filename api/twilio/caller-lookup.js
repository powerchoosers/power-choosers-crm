const twilio = require('twilio');
const cors = require('../_cors');

export default async function handler(req, res) {
    cors(req, res);
    
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
        
        // Use Twilio Lookup API to get caller information
        const lookup = await client.lookups.v1.phoneNumbers(phoneNumber)
            .fetch({
                type: ['caller-name', 'carrier']
            });
        
        console.log('[Caller Lookup] Result:', lookup);
        
        const result = {
            phoneNumber: lookup.phoneNumber,
            callerName: lookup.callerName || null,
            carrier: lookup.carrier || null,
            countryCode: lookup.countryCode || null,
            nationalFormat: lookup.nationalFormat || null
        };
        
        res.status(200).json({
            success: true,
            data: result
        });
        
    } catch (error) {
        console.error('[Caller Lookup] Error:', error);
        
        // Handle specific Twilio errors
        if (error.code === 20404) {
            return res.status(404).json({ 
                error: 'Phone number not found',
                code: 'NOT_FOUND'
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to lookup caller information',
            details: error.message 
        });
    }
}
