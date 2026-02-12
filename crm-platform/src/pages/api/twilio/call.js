import twilio from 'twilio';
import { cors } from '../_cors.js';
import logger from '../_logger.js';

const handler = async function handler(req, res) {
    if (cors(req, res)) return; // handle OPTIONS
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        const { to, from, agent_phone, contactId, accountId } = req.body;

        logger.log('[Call Debug] Incoming call request:', {
            to,
            from,
            agent_phone,
            contactId,
            accountId,
            body: req.body,
            headers: req.headers,
            timestamp: new Date().toISOString()
        });

        if (!to) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing "to" parameter' }));
            return;
        }

        logger.log(`[Call API] Server call request: ${to}`);

        // Twilio credentials from environment
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        // Use 'from' parameter if provided (selected Twilio number), otherwise fallback to env var
        const twilioPhone = from || process.env.TWILIO_PHONE_NUMBER || '+18176630380';
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
        const baseUrl = process.env.PUBLIC_BASE_URL || 'https://nodal-point-network.vercel.app';

        // Build bridge URL with target, callerId (selected Twilio number), and CRM context
        let bridgeUrl = `${baseUrl}/api/twilio/bridge?target=${encodeURIComponent(to)}&callerId=${encodeURIComponent(twilioPhone)}`;
        if (contactId) bridgeUrl += `&contactId=${encodeURIComponent(contactId)}`;
        if (accountId) bridgeUrl += `&accountId=${encodeURIComponent(accountId)}`;

        // Build status callback URL with CRM context
        let statusCallbackUrl = `${baseUrl}/api/twilio/status`;
        const params = new URLSearchParams();
        if (contactId) params.append('contactId', contactId);
        if (accountId) params.append('accountId', accountId);
        const query = params.toString();
        if (query) statusCallbackUrl += `?${query}`;

        const call = await client.calls.create({
            from: twilioPhone,
            to: agentPhone, // Call your phone first
            url: bridgeUrl,
            method: 'POST',
            statusCallback: statusCallbackUrl,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            // Add timeout to prevent hanging calls
            timeout: 30,
            // Ensure proper call handling
            machineDetection: 'Enable'
        });

        logger.log(`[Call API] Call initiated: ${call.sid}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            callSid: call.sid,
            message: 'Call initiated - your phone will ring first'
        }));
        return;

    } catch (error) {
        logger.error('Server call error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Failed to initiate call',
            message: error.message
        }));
        return;
    }
}

export default handler
