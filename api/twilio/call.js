import twilio from 'twilio';
import { cors } from '../_cors.js';

const handler = async function handler(req, res) {
    if (cors(req, res)) return; // handle OPTIONS
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    try {
        const { to, from, agent_phone } = req.body;
        
        if (!to) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing "to" parameter' }));
            return;
        }
        
        console.log(`[Call API] Server call request: ${to}`);
        
        // Twilio credentials from environment
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER || '+18176630380';
        const agentPhone = agent_phone || '+19728342317'; // Your personal phone
        
        if (!accountSid || !authToken) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Missing Twilio credentials',
                message: 'Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN'
            }));
            return;
        }
        
        const client = twilio(accountSid, authToken);
        
        // Improved call bridging approach
        // Always use production URL for webhooks to avoid preview-domain auth (401)
        const baseUrl = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app';
        
        const call = await client.calls.create({
            from: twilioPhone,
            to: agentPhone, // Call your phone first
            url: `${baseUrl}/api/twilio/bridge?target=${encodeURIComponent(to)}`,
            method: 'POST',
            statusCallback: `${baseUrl}/api/twilio/status`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            // Add timeout to prevent hanging calls
            timeout: 30,
            // Ensure proper call handling
            machineDetection: 'Enable'
        });
        
        console.log(`[Call API] Call initiated: ${call.sid}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            callSid: call.sid,
            message: 'Call initiated - your phone will ring first'
        }));
        return;
        
    } catch (error) {
        console.error('Server call error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Failed to initiate call',
            message: error.message
        }));
        return;
    }
}

export default handler
