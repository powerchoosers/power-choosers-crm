const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let port = parseInt(process.env.PORT, 10) || 5500;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Simple CORS for API routes
  if (req.url.startsWith('/api/')) {
    // Allowlist CORS: prefer explicit origins; fall back to '*'
    const origin = req.headers.origin || '';
    const envList = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const defaultAllowed = [
      'https://powerchoosers.com',
      'https://www.powerchoosers.com',
      'http://localhost:5555',
      'http://localhost:5550'
    ];
    const allowed = new Set([...defaultAllowed, ...envList]);
    const isNgrok = /^(https?:\/\/)?[a-z0-9-]+\.(?:ngrok(?:-free)?\.app)$/i.test(origin);
    const isAllowed = allowed.has(origin) || isNgrok;
    try { console.log(`[CORS] ${req.method} ${req.url} origin=${origin} isAllowed=${isAllowed}`); } catch (_) {}
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      // Only allow credentials when a specific origin is echoed back (not with '*')
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      // Fallback for generic tools; do NOT set credentials with '*'
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    const reqHeaders = req.headers['access-control-request-headers'];
    res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', reqHeaders || 'Content-Type, Authorization, ngrok-skip-browser-warning');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      try { console.log(`[CORS] Preflight OK for ${origin}`); } catch (_) {}
      res.writeHead(204);
      return res.end();
    }
  }

  // Vonage call proxy
  if (req.url === '/api/vonage/call' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        // Normalize numbers to E.164 (assume US if 10/11 digits)
        function normalize(num) {
          const raw = String(num || '').trim();
          const digits = raw.replace(/\D/g, '');
          if (!digits) return '';
          if (digits.length === 10) return `+1${digits}`;
          if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
          return raw.startsWith('+') ? raw : `+${digits}`;
        }
        const toNumber = normalize(data.to);
        const fromNumber = normalize(data.from || process.env.VONAGE_FROM_NUMBER || '14693518845');
        const applicationId = process.env.VONAGE_APPLICATION_ID;
        // Prefer env var for private key; fallback to local file private.key
        const envKey = process.env.VONAGE_PRIVATE_KEY;
        let privateKey = envKey;
        if (!privateKey) {
          try {
            const keyPath = path.join(__dirname, 'private.key');
            privateKey = fs.readFileSync(keyPath, 'utf8');
          } catch (e) {
            // ignore
          }
        }

        if (!applicationId || !privateKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing VONAGE_APPLICATION_ID or private key (env VONAGE_PRIVATE_KEY or file private.key)' }));
        }
        if (!toNumber) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing destination number: to' }));
        }

        // Build Vonage JWT (RS256)
        function b64url(input) {
          return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        }
        const header = { alg: 'RS256', typ: 'JWT' };
        const now = Math.floor(Date.now() / 1000);
        const payload = {
          application_id: applicationId,
          iat: now,
          exp: now + 15 * 60,
          jti: crypto.randomBytes(16).toString('hex')
          // Optional: acl can be added if needed
        };
        const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
        const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
        const jwt = `${signingInput}.${signature.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

        const callPayload = {
          from: { type: 'phone', number: fromNumber },
          to: [{ type: 'phone', number: toNumber }],
          ncco: [
            { action: 'talk', language: 'en-US', style: '0', premium: false, text: 'Hello from Voice API' }
          ]
        };
        const postData = JSON.stringify(callPayload);

        const options = {
          hostname: 'api.nexmo.com',
          path: '/v1/calls',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const outReq = https.request(options, (outRes) => {
          let outBody = '';
          outRes.on('data', (d) => { outBody += d; });
          outRes.on('end', () => {
            try {
              console.log('Vonage POST /v1/calls status:', outRes.statusCode);
              if (outBody) {
                console.log('Vonage response body:', outBody);
              }
            } catch (_) {}
            res.writeHead(outRes.statusCode || 500, { 'Content-Type': 'application/json' });
            res.end(outBody);
          });
        });
        outReq.on('error', (e) => {
          try { console.error('Vonage upstream error:', e && e.message ? e.message : e); } catch (_) {}
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Upstream error', detail: e.message }));
        });
        outReq.write(postData);
        outReq.end();
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: e.message }));
      }
    });
    return;
  }

  // Vonage call status proxy: GET /api/vonage/call/status?uuid=...
  if (req.url.startsWith('/api/vonage/call/status') && req.method === 'GET') {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const uuid = u.searchParams.get('uuid');
      const applicationId = process.env.VONAGE_APPLICATION_ID;
      // Prefer env var for private key; fallback to local file private.key
      const envKey = process.env.VONAGE_PRIVATE_KEY;
      let privateKey = envKey;
      if (!privateKey) {
        try { privateKey = fs.readFileSync(path.join(__dirname, 'private.key'), 'utf8'); } catch (_) {}
      }

      if (!uuid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Missing uuid' }));
      }
      if (!applicationId || !privateKey) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Missing VONAGE_APPLICATION_ID or private key' }));
      }

      function b64url(input) {
        return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      }
      const header = { alg: 'RS256', typ: 'JWT' };
      const now = Math.floor(Date.now() / 1000);
      const payload = { application_id: applicationId, iat: now, exp: now + 15 * 60, jti: crypto.randomBytes(16).toString('hex') };
      const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
      const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
      const jwt = `${signingInput}.${signature.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

      const options = {
        hostname: 'api.nexmo.com',
        path: `/v1/calls/${encodeURIComponent(uuid)}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${jwt}` }
      };

      const outReq = https.request(options, (outRes) => {
        let outBody = '';
        outRes.on('data', (d) => { outBody += d; });
        outRes.on('end', () => {
          try {
            console.log('Vonage GET /v1/calls/:uuid status:', outRes.statusCode);
            if (outBody) console.log('Vonage status body:', outBody);
          } catch (_) {}
          res.writeHead(outRes.statusCode || 500, { 'Content-Type': 'application/json' });
          res.end(outBody);
        });
      });
      outReq.on('error', (e) => {
        try { console.error('Vonage status upstream error:', e && e.message ? e.message : e); } catch (_) {}
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upstream error', detail: e.message }));
      });
      outReq.end();
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error', detail: e.message }));
    }
    return;
  }

  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content, 'utf-8');
    }
  });
});

function startServer(p, attemptsLeft = 10) {
  server.listen(p, () => {
    console.log(`Server running at http://localhost:${p}/`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${p} in use, trying ${p + 1}...`);
      try { server.close(); } catch {}
      setTimeout(() => {
        startServer(p + 1, attemptsLeft - 1);
      }, 100);
    } else {
      console.error('Server failed to start:', err);
    }
  });
}

startServer(port);
