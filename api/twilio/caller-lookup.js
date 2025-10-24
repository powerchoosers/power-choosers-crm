import twilio from 'twilio';
import { cors } from '../_cors.js';

export default async function handler(req, res) {
    cors(req, res);
    
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
        
        // Check for Twilio credentials
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
            console.error('[Caller Lookup] Missing Twilio credentials');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Twilio credentials not configured',
                details: 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing'
            }));
            return;
        }
        
        const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        
        console.log('[Caller Lookup] Looking up:', phoneNumber);
        
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
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: result
        }));
        return;
        
    } catch (error) {
        console.error('[Caller Lookup] Error:', error);
        
        // Handle specific Twilio errors
        if (error.code === 20404) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Phone number not found',
                code: 'NOT_FOUND'
            }));
            return;
        }
        
        if (error.code === 20003) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Authentication failed',
                code: 'AUTH_ERROR',
                details: 'Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN'
            }));
            return;
        }
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            error: 'Failed to lookup caller information',
            details: error.message,
            code: error.code || 'UNKNOWN'
        }));
    }
};
