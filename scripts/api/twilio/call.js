const twilio = require('twilio');

const handler = async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { to, from, agent_phone } = req.body;
        
        if (!to) {
            return res.status(400).json({ error: 'Missing "to" parameter' });
        }
        
        console.log(`[Call API] Server call request: ${to}`);
        
        // Twilio credentials from environment
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER || '+18176630380';
        const agentPhone = agent_phone || '+19728342317'; // Your personal phone
        
        if (!accountSid || !authToken) {
            return res.status(500).json({ 
                error: 'Missing Twilio credentials',
                message: 'Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN'
            });
        }
        
        const client = twilio(accountSid, authToken);
        
        // Improved call bridging approach
        // This will call your phone first, then connect to the target with proper audio handling
        const call = await client.calls.create({
            from: twilioPhone,
            to: agentPhone, // Call your phone first
            url: `${req.headers.host ? `https://${req.headers.host}` : 'https://power-choosers-crm-792458658491.us-south1.run.app'}/api/twilio/bridge?target=${encodeURIComponent(to)}`,
            method: 'POST',
            statusCallback: `${req.headers.host ? `https://${req.headers.host}` : 'https://power-choosers-crm-792458658491.us-south1.run.app'}/api/twilio/status`,
            statusCallbackMethod: 'POST',
            // Add timeout to prevent hanging calls
            timeout: 30,
            // Ensure proper call handling
            machineDetection: 'Enable'
        });
        
        console.log(`[Call API] Call initiated: ${call.sid}`);
        
        res.json({
            success: true,
            callSid: call.sid,
            message: 'Call initiated - your phone will ring first'
        });
        
    } catch (error) {
        console.error('Server call error:', error);
        res.status(500).json({
            error: 'Failed to initiate call',
            message: error.message
        });
    }
}

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  return await fn(req, res)
}

module.exports = allowCors(handler)
