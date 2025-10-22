// Proxy Twilio recordings with auth and CORS

export default async function handler(req, res) {
  // Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    let url = (req.query && (req.query.url || req.query.u)) || (req.body && req.body.url);
    if (!url || typeof url !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing Twilio credentials' }));
      return;
    }

    // Force dual-channel playback if not explicitly requested
    try {
      const u = new URL(url);
      if (!u.searchParams.has('RequestedChannels')) { u.searchParams.set('RequestedChannels', '2'); url = u.toString(); }
    } catch(_) {}

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const twilioResp = await fetch(url, { headers: { Authorization: authHeader } });
    if (!twilioResp.ok) {
      return res.writeHead(twilioResp.status, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: `Failed to fetch recording (${twilioResp.status})` }));
return;
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
      res.writeHead(200);
res.end(Buffer.from(buf);
return;);
    });
  } catch (err) {
    console.error('[Recording Proxy] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Recording proxy failed', message: err?.message }));
return;
  }
}
