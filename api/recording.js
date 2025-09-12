// Proxy Twilio recordings with auth and CORS

export default async function handler(req, res) {
  // Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url = (req.query && (req.query.url || req.query.u)) || (req.body && req.body.url);
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(500).json({ error: 'Missing Twilio credentials' });
    }

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const twilioResp = await fetch(url, { headers: { Authorization: authHeader } });
    if (!twilioResp.ok) {
      return res.status(twilioResp.status).json({ error: `Failed to fetch recording (${twilioResp.status})` });
    }

    // Stream through with original content-type to avoid any quality loss
    const contentType = twilioResp.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Pipe the body without re-encoding
    const reader = twilioResp.body.getReader();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        function push() {
          reader.read().then(({ done, value }) => {
            if (done) { controller.close(); return; }
            controller.enqueue(value);
            push();
          });
        }
        push();
      }
    });

    return new Response(stream).arrayBuffer().then(buf => {
      res.status(200).send(Buffer.from(buf));
    });
  } catch (err) {
    console.error('[Recording Proxy] Error:', err);
    res.status(500).json({ error: 'Recording proxy failed', message: err?.message });
  }
}
