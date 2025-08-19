const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// MIME types for different file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

// --- Minimal config for Vonage Voice ---
// Provide these via env vars for security in production.
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID || 'e29347ed-7cb3-4d58-b461-6f47647760bf';
const VONAGE_NUMBER = process.env.VONAGE_NUMBER || '+14693518845'; // Your Vonage virtual number (E.164)
const AGENT_NUMBER = process.env.AGENT_NUMBER || '+14693518845';     // Number to ring first (your phone)
const VONAGE_PRIVATE_KEY_PATH = process.env.VONAGE_PRIVATE_KEY_PATH || path.join(__dirname, 'vonage.private.key');
// Public base URL of this server for Vonage webhooks (use ngrok for local dev)
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || null;

// Read private key (PEM) once if available
let VONAGE_PRIVATE_KEY = null;
try {
  if (fs.existsSync(VONAGE_PRIVATE_KEY_PATH)) {
    VONAGE_PRIVATE_KEY = fs.readFileSync(VONAGE_PRIVATE_KEY_PATH, 'utf8');
  }
} catch (e) {
  console.warn('Vonage private key not loaded:', e?.message || e);
}

function httpsRequestJson(options, payloadString) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        resolve({ status: resp.statusCode || 0, headers: resp.headers || {}, text: data });
      });
    });
    req.on('error', reject);
    if (payloadString) req.write(payloadString);
    req.end();
  });
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwtRS256(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  const signature = signer.sign(privateKeyPem);
  const encodedSignature = base64url(signature);
  return `${data}.${encodedSignature}`;
}

function createVonageAppJwt(ttlSeconds = 60 * 10) {
  if (!VONAGE_PRIVATE_KEY) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    application_id: VONAGE_APPLICATION_ID,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomBytes(8).toString('hex'),
  };
  return signJwtRS256(payload, VONAGE_PRIVATE_KEY);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) { // 1MB guard
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function handleApiVonageCall(req, res, parsedUrl) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  if (!PUBLIC_BASE_URL) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server not configured: PUBLIC_BASE_URL is required for Vonage webhooks' }));
    return;
  }
  if (!VONAGE_PRIVATE_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server not configured: Vonage private key not found. Set VONAGE_PRIVATE_KEY_PATH.' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const toRaw = (body.to || '').toString().trim();
    if (!toRaw) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing to number' }));
      return;
    }
    // Normalize to E.164 digits
    const to = toRaw.replace(/[^0-9+]/g, '');

    const jwt = createVonageAppJwt();
    if (!jwt) throw new Error('Failed to create Vonage JWT');

    const answerUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/answer?to=${encodeURIComponent(to)}`;
    const eventUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/event`;

    const payload = {
      to: [ { type: 'phone', number: AGENT_NUMBER } ], // ring the agent first
      from: { type: 'phone', number: VONAGE_NUMBER },
      answer_url: [ answerUrl ],
      event_url: [ eventUrl ]
    };

    const bodyStr = JSON.stringify(payload);
    const options = {
      method: 'POST',
      hostname: 'api.nexmo.com',
      path: '/v1/calls',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const resp = await httpsRequestJson(options, bodyStr);
    const ct = (resp.headers['content-type'] || '').toString();
    const isJson = ct.includes('application/json');
    const data = isJson ? JSON.parse(resp.text || '{}') : { raw: resp.text };

    if (!(resp.status >= 200 && resp.status < 300)) {
      res.writeHead(resp.status || 502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Vonage API error', status: resp.status, data }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e?.message || 'Internal error' }));
  }
}

async function handleWebhookAnswer(req, res, parsedUrl) {
  const q = parsedUrl.query || {};
  const to = (q.to || '').toString().replace(/[^0-9+]/g, '');
  const ncco = to
    ? [
        {
          action: 'connect',
          from: VONAGE_NUMBER,
          endpoint: [ { type: 'phone', number: to } ]
        }
      ]
    : [
        // If inbound to your Vonage number without a target, route to your agent number
        {
          action: 'connect',
          from: VONAGE_NUMBER,
          endpoint: [ { type: 'phone', number: AGENT_NUMBER } ]
        }
      ];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(ncco));
}

async function handleWebhookEvent(req, res) {
  try {
    const body = await readJsonBody(req);
    console.log('Vonage event:', body);
  } catch (_) {}
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

const server = http.createServer(async (req, res) => {
  // Parse the URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;
    
    // API routes (Vonage integration)
    if (pathname === '/api/vonage/call') {
        return handleApiVonageCall(req, res, parsedUrl);
    }
    if (pathname === '/webhooks/answer') {
        return handleWebhookAnswer(req, res, parsedUrl);
    }
    if (pathname === '/webhooks/event') {
        return handleWebhookEvent(req, res);
    }

    // Default to crm-dashboard.html for root requests
    if (pathname === '/') {
        pathname = '/crm-dashboard.html';
    }
    
    // Construct file path
    const filePath = path.join(__dirname, pathname);
    
    // Get file extension
    const ext = path.extname(filePath).toLowerCase();
    
    // Set default content type
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Check if file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // File not found
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>404 - Not Found</title>
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: #f8f9fa;
                            color: #343a40;
                        }
                        .error-container {
                            text-align: center;
                            padding: 2rem;
                            background: white;
                            border-radius: 8px;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        }
                        h1 { color: #ff6b35; margin-bottom: 1rem; }
                        p { margin-bottom: 1rem; }
                        a { color: #ff6b35; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <h1>404 - File Not Found</h1>
                        <p>The requested file <code>${pathname}</code> was not found.</p>
                        <p><a href="/">← Back to Power Choosers CRM</a></p>
                    </div>
                </body>
                </html>
            `);
            return;
        }
        
        // Read and serve the file
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>500 - Server Error</title>
                        <style>
                            body { 
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                height: 100vh;
                                margin: 0;
                                background: #f8f9fa;
                                color: #343a40;
                            }
                            .error-container {
                                text-align: center;
                                padding: 2rem;
                                background: white;
                                border-radius: 8px;
                                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                            }
                            h1 { color: #dc3545; margin-bottom: 1rem; }
                        </style>
                    </head>
                    <body>
                        <div class="error-container">
                            <h1>500 - Server Error</h1>
                            <p>Unable to read the requested file.</p>
                        </div>
                    </body>
                    </html>
                `);
                return;
            }
            
            // Set headers and send file
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(data);
        });
    });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
    console.log('🚀 Power Choosers CRM Server Started!');
    console.log(`📍 Server running at: http://${HOST}:${PORT}`);
    console.log(`🎯 CRM Dashboard: http://${HOST}:${PORT}/crm-dashboard.html`);
    console.log('📁 Serving files from:', __dirname);
    console.log('⏰ Server started at:', new Date().toLocaleString());
    console.log('\n✨ Ready to serve your Power Choosers CRM!');
    console.log('💡 Press Ctrl+C to stop the server');
});

// Handle server errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please try a different port or stop the existing server.`);
    } else {
        console.error('❌ Server error:', err);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Power Choosers CRM server...');
    server.close(() => {
        console.log('✅ Server stopped successfully');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server stopped successfully');
        process.exit(0);
    });
});
