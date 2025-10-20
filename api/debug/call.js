// Debug endpoint to initiate a Twilio call
// Usage (GET): /api/debug/call?to=%2B19728342317&agent_phone=%2B19728342317
// Also accepts POST with JSON body { to, agent_phone }

const twilio = require('twilio');

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 200; return res.end(); }

  try {
    const src = req.method === 'GET' ? (req.query || {}) : (req.body || {});
    const to = src.to;
    const agentPhone = src.agent_phone || '+19728342317';

    if (!to) {
      res.statusCode = 400; return res.end(JSON.stringify({ error: 'Missing "to" parameter' }));
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER || '+18176630380';

    if (!accountSid || !authToken) {
      res.statusCode = 500; return res.end(JSON.stringify({ error: 'Missing Twilio credentials' }));
    }

    const client = twilio(accountSid, authToken);
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app';

    // Call agent first, then bridge to target via /api/twilio/bridge
    const call = await client.calls.create({
      from: twilioPhone,
      to: agentPhone,
      url: `${baseUrl}/api/twilio/bridge?target=${encodeURIComponent(to)}`,
      method: 'POST',
      statusCallback: `${baseUrl}/api/twilio/status`,
      statusCallbackMethod: 'POST',
      timeout: 30,
      machineDetection: 'Enable'
    });

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200; res.end(JSON.stringify({ ok: true, callSid: call.sid }));
  } catch (error) {
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: error?.message || String(error) }));
  }
};
