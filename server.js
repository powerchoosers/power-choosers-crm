const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
// require('dotenv').config(); // Load environment variables from .env file - temporarily disabled
// SendGrid removed - using Gmail API via frontend

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

// Configuration
const PORT = process.env.PORT || 3000;
const LOCAL_DEV_MODE = process.env.NODE_ENV !== 'production';
const API_BASE_URL = process.env.API_BASE_URL || 'https://power-choosers-crm.vercel.app';
// Email sending now handled by Gmail API via frontend

// ---------------- Gemini API endpoints now proxied to Vercel ----------------

async function handleApiGeminiEmail(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Method not allowed' })); return; }
  
  // Proxy to Vercel deployment
  try {
    const body = await readJsonBody(req);
    const proxyUrl = `${API_BASE_URL}/api/gemini-email`;
    
    console.log('[Gemini Email] Proxying to:', proxyUrl);
    
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    // Attempt to parse JSON; if not JSON, forward raw text body
    const raw = await response.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch (_) {
      payload = { error: 'Upstream responded with non-JSON', body: raw };
    }
    
    console.log('[Gemini Email] Response status:', response.status);
    
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    console.error('[Gemini Email] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to proxy Gemini email request', message: error.message }));
  }
}

// Helper to read raw request body without JSON parsing (for Twilio webhooks)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5e6) { // 5MB guard for webhooks
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Proxy Twilio Voice webhook (returns TwiML XML)
async function handleApiTwilioVoice(req, res, parsedUrl) {
  try {
    const proxyUrl = `${API_BASE_URL}/api/twilio/voice${parsedUrl.search || ''}`;
    if (req.method === 'GET') {
      const upstream = await fetch(proxyUrl);
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'text/xml' });
      res.end(text);
      return;
    }
    if (req.method === 'POST') {
      const raw = await readRawBody(req);
      const contentType = req.headers['content-type'] || 'application/x-www-form-urlencoded';
      const upstream = await fetch(proxyUrl, { method: 'POST', headers: { 'Content-Type': contentType }, body: raw });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'text/xml' });
      res.end(text);
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (error) {
    console.error('[Twilio Voice] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// Proxy Twilio Recording status webhook
async function handleApiTwilioRecording(req, res) {
  try {
    const proxyUrl = `${API_BASE_URL}/api/twilio/recording`;
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const raw = await readRawBody(req);
    const contentType = req.headers['content-type'] || 'application/x-www-form-urlencoded';
    const upstream = await fetch(proxyUrl, { method: 'POST', headers: { 'Content-Type': contentType }, body: raw });
    const text = await upstream.text();
    // Twilio expects 200 JSON typically from our API
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
    res.end(text);
  } catch (error) {
    console.error('[Twilio Recording] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// Proxy Twilio Conversational Intelligence processing endpoint
async function handleApiTwilioConversationalIntelligence(req, res) {
  try {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const body = await readJsonBody(req);
    const upstream = await fetch(`${API_BASE_URL}/api/twilio/conversational-intelligence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await upstream.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { ok: false, body: text }; }
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    console.error('[Twilio CI] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// Proxy Twilio CI request (starts transcript processing) to Vercel
async function handleApiTwilioCIRequest(req, res) {
  try {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const body = await readJsonBody(req);
    const upstream = await fetch(`${API_BASE_URL}/api/twilio/ci-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await upstream.text();
    let payload; try { payload = text ? JSON.parse(text) : {}; } catch(_) { payload = { ok: false, body: text }; }
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    console.error('[Twilio CI Request] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// Proxy Twilio Conversational Intelligence webhook (Twilio -> our API)
async function handleApiTwilioConversationalIntelligenceWebhook(req, res) {
  try {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    // Twilio may send urlencoded or JSON; forward as-is
    const raw = await readRawBody(req);
    const contentType = req.headers['content-type'] || 'application/x-www-form-urlencoded';
    const upstream = await fetch(`${API_BASE_URL}/api/twilio/conversational-intelligence-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: raw
    });
    const text = await upstream.text();
    // Our upstream returns JSON
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
    res.end(text);
  } catch (error) {
    console.error('[Twilio CI Webhook] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

async function handleApiTwilioLanguageWebhook(req, res) {
  try {
    const parsedUrl = url.parse(req.url, true);
    const proxyUrl = `${API_BASE_URL}/api/twilio/language-webhook${parsedUrl.search || ''}`;
    if (req.method === 'GET') {
      const response = await fetch(proxyUrl);
      const raw = await response.text();
      // Twilio may not require a particular response body for GET callbacks; echo upstream
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json' });
      res.end(raw);
      return;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const raw = await response.text();
      let payload;
      try { payload = raw ? JSON.parse(raw) : {}; } catch (_) { payload = { ok: true, body: raw }; }
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (error) {
    console.error('[Twilio Language Webhook] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

async function handleApiTwilioVoiceIntelligence(req, res) {
  try {
    const parsedUrl = url.parse(req.url, true);
    const proxyUrl = `${API_BASE_URL}/api/twilio/voice-intelligence${parsedUrl.search || ''}`;
    
    const body = await readJsonBody(req);
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    console.error('[Twilio Voice Intelligence] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// Helper function for reading request body
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

// Twilio API endpoints (proxy to Vercel for production APIs)
async function handleApiTwilioToken(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const proxyUrl = `${API_BASE_URL}/api/twilio/token${parsedUrl.search || ''}`;
  
  try {
    const response = await fetch(proxyUrl);
    const raw = await response.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch (_) {
      payload = { error: 'Upstream responded with non-JSON', body: raw };
    }
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

async function handleApiTwilioCall(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const proxyUrl = `${API_BASE_URL}/api/twilio/call`;
    
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

async function handleApiTwilioAIInsights(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  try {
    const body = await readJsonBody(req);
    const proxyUrl = `${API_BASE_URL}/api/twilio/ai-insights`;
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch (_) { payload = { error: 'Upstream responded with non-JSON', body: raw }; }
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

async function handleApiCalls(req, res) {
  // Preserve query params when proxying to Vercel (e.g., ?callSid=...)
  const parsed = url.parse(req.url, true);
  const proxyBase = `${API_BASE_URL}/api/calls`;
  const proxyUrlGet = `${proxyBase}${parsed.search || ''}`;
  
  try {
    if (req.method === 'POST') {
      // Handle POST requests (logging calls)
      const body = await readJsonBody(req);
      const response = await fetch(proxyBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } else {
      // Handle GET requests (fetching calls) with query passthrough
      const response = await fetch(proxyUrlGet);
      const data = await response.json();
      
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// ---------------- Gemini API endpoints now proxied to Vercel ----------------

async function handleApiTxPrice(req, res, parsedUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Proxy to Vercel deployment since local server doesn't have API key
  try {
    const proxyUrl = `${API_BASE_URL}/api/tx-price${parsedUrl.search || ''}`;
    
    const response = await fetch(proxyUrl);
    const data = await response.json();
    
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    console.error('[TX Price] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to proxy TX price request', message: error.message }));
  }
}

// Proxy Twilio Poll CI Analysis (background analyzer)
async function handleApiTwilioPollCIAnalysis(req, res) {
  try {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const body = await readJsonBody(req);
    const upstream = await fetch(`${API_BASE_URL}/api/twilio/poll-ci-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await upstream.text();
    let payload; try { payload = text ? JSON.parse(text) : {}; } catch(_) { payload = { ok: false, body: text }; }
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    console.error('[Twilio Poll CI] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // CORS headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://powerchoosers.com',
    'https://www.powerchoosers.com'
  ];
  
  if (allowedOrigins.includes(origin) || LOCAL_DEV_MODE) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');

  // Parse the URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Preflight for API routes
  if (req.method === 'OPTIONS' && (
    pathname === '/api/twilio/token' ||
    pathname === '/api/twilio/call' ||
    pathname === '/api/twilio/voice' ||
    pathname === '/api/twilio/caller-lookup' ||
    pathname === '/api/calls' ||
    pathname === '/api/twilio/language-webhook' ||
    pathname === '/api/twilio/conversational-intelligence' ||
    pathname === '/api/twilio/conversational-intelligence-webhook' ||
    pathname === '/api/twilio/ci-request' ||
    pathname === '/api/twilio/poll-ci-analysis' ||
    pathname === '/api/twilio/recording' ||
    pathname === '/api/twilio/ai-insights' ||
    pathname === '/api/energy-news' ||
    pathname === '/api/search' ||
    pathname === '/api/tx-price' ||
    pathname === '/api/gemini-email' ||
    pathname === '/api/email/send' ||
    pathname === '/api/email/sendgrid-send' ||
    pathname.startsWith('/api/email/track/') ||
    pathname === '/api/email/webhook' ||
    pathname === '/api/email/sendgrid-webhook' ||
    pathname === '/api/email/stats' ||
    pathname === '/api/recording'
  )) {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // API routes (Twilio integration - proxy to Vercel)
  if (pathname === '/api/twilio/token') {
    return handleApiTwilioToken(req, res, parsedUrl);
  }
  if (pathname === '/api/twilio/call') {
    return handleApiTwilioCall(req, res);
  }
  if (pathname === '/api/twilio/voice') {
    return handleApiTwilioVoice(req, res, parsedUrl);
  }
  if (pathname === '/api/twilio/caller-lookup') {
    return handleApiTwilioCallerLookup(req, res);
  }
  if (pathname === '/api/twilio/language-webhook') {
    return handleApiTwilioLanguageWebhook(req, res);
  }
  if (pathname === '/api/twilio/voice-intelligence') {
    return handleApiTwilioVoiceIntelligence(req, res);
  }
  if (pathname === '/api/twilio/conversational-intelligence') {
    return handleApiTwilioConversationalIntelligence(req, res);
  }
  if (pathname === '/api/twilio/ci-request') {
    return handleApiTwilioCIRequest(req, res);
  }
  if (pathname === '/api/twilio/conversational-intelligence-webhook') {
    return handleApiTwilioConversationalIntelligenceWebhook(req, res);
  }
  if (pathname === '/api/twilio/poll-ci-analysis') {
    return handleApiTwilioPollCIAnalysis(req, res);
  }
  if (pathname === '/api/twilio/recording') {
    return handleApiTwilioRecording(req, res);
  }
  if (pathname === '/api/twilio/ai-insights') {
    return handleApiTwilioAIInsights(req, res);
  }
  if (pathname === '/api/calls') {
    return handleApiCalls(req, res);
  }
  if (pathname === '/api/recording') {
    return handleApiRecording(req, res, parsedUrl);
  }
  if (pathname === '/api/energy-news') {
    return handleApiEnergyNews(req, res);
  }
  if (pathname === '/api/search') {
    return handleApiSearch(req, res, parsedUrl);
  }
  if (pathname === '/api/tx-price') {
    return handleApiTxPrice(req, res, parsedUrl);
  }
  if (pathname === '/api/gemini-email') {
    return handleApiGeminiEmail(req, res);
  }
  
  // Email tracking routes
  if (pathname === '/api/email/send') {
    return handleApiSendEmail(req, res);
  }
  if (pathname === '/api/email/sendgrid-send') {
    return handleApiSendGridSend(req, res);
  }
  if (pathname.startsWith('/api/email/track/')) {
    return handleApiEmailTrack(req, res, parsedUrl);
  }
  if (pathname === '/api/email/update-tracking') {
    return handleApiEmailUpdateTracking(req, res);
  }
  if (pathname === '/api/email/tracking-events') {
    return handleApiEmailTrackingEvents(req, res);
  }
  if (pathname === '/api/email/webhook') {
    return handleApiEmailWebhook(req, res);
  }
  if (pathname === '/api/email/sendgrid-webhook') {
    return handleApiSendGridWebhook(req, res);
  }
  if (pathname === '/api/email/stats') {
    return handleApiEmailStats(req, res, parsedUrl);
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
              h1 { color: #ff6b35; margin-bottom: 1rem; }
              p { margin-bottom: 1rem; }
              a { color: #ff6b35; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="error-container">
              <h1>500 - Server Error</h1>
              <p>An error occurred while reading the file.</p>
              <p><a href="/">← Back to Power Choosers CRM</a></p>
            </div>
          </body>
          </html>
        `);
        return;
      }
      
      // Serve the file
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`[Server] Power Choosers CRM server running at http://localhost:${PORT}`);
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} is already in use. Try a different port.`);
  } else {
    console.error('[Server] Server error:', err);
  }
});

// Search endpoint: proxy to production for phone number lookups
async function handleApiSearch(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const proxyUrl = `${API_BASE_URL}/api/search${parsedUrl.search || ''}`;
  
  try {
    const response = await fetch(proxyUrl);
    const data = await response.json();
    
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// Twilio Caller ID lookup: proxy to production; accepts POST { phoneNumber }
async function handleApiTwilioCallerLookup(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  try {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    await new Promise((resolve) => req.on('end', resolve));
    let payload = {};
    try { payload = body ? JSON.parse(body) : {}; } catch (_) { payload = {}; }

    const proxyUrl = `${API_BASE_URL}/api/twilio/caller-lookup`;
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({ success: false }));
    res.writeHead(response.status || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Proxy error', message: error.message }));
  }
}

// Energy News endpoint: fetch Google News RSS for Texas energy topics, parse minimal fields
async function handleApiEnergyNews(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const rssUrl = 'https://news.google.com/rss/search?q=%28Texas+energy%29+OR+ERCOT+OR+%22Texas+electricity%22&hl=en-US&gl=US&ceid=US:en';
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'PowerChoosersCRM/1.0' } });
    const xml = await response.text();

    // Basic XML parsing without external deps: extract <item> blocks and inner fields
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) && items.length < 4) {
      const block = match[1];
      const getTag = (name) => {
        const r = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i');
        const m = r.exec(block);
        return m ? m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
      };
      const title = getTag('title');
      const link = getTag('link');
      const pubDate = getTag('pubDate');
      let publishedAt = '';
      try { publishedAt = new Date(pubDate).toISOString(); } catch (_) { publishedAt = ''; }
      // Skip if missing essentials
      if (!title || !link) continue;
      items.push({ title, url: link, publishedAt });
    }

    const payload = {
      lastRefreshed: new Date().toISOString(),
      items
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch energy news', message: error.message }));
  }
}

// Email tracking endpoints
async function handleApiSendEmail(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { to, subject, content, from } = body;

    if (!to || !subject || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
      return;
    }

    // Generate unique tracking ID
    const trackingId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create tracking pixel URL - handle both local and Vercel deployment
    const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const trackingPixelUrl = `${protocol}://${host}/api/email/track/${trackingId}`;
    
    // Inject tracking pixel into email content
    const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
    const emailContent = content + trackingPixel;

    // Store email record in database (you'll need to implement this with your database)
    const emailRecord = {
      id: trackingId,
      to: Array.isArray(to) ? to : [to],
      subject,
      content: emailContent,
      from: from || 'noreply@powerchoosers.com',
      sentAt: new Date().toISOString(),
      opens: [],
      replies: [],
      openCount: 0,
      replyCount: 0,
      status: 'sent'
    };

    // Save to Firebase (simulated for now - in production, you'd use Firebase Admin SDK)
    // In a real implementation, you would use Firebase Admin SDK here:
    // const admin = require('firebase-admin');
    // await admin.firestore().collection('emails').doc(trackingId).set(emailRecord);

    // Email sending is now handled by the frontend using Gmail API
    // This endpoint just stores the email record for tracking purposes
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      trackingId,
      message: 'Email record stored for tracking (actual sending handled by Gmail API)' 
    }));

  } catch (error) {
    console.error('[Email] Send error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to send email', message: error.message }));
  }
}

async function handleApiEmailTrack(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const trackingId = parsedUrl.pathname.split('/').pop();
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const referer = req.headers.referer || '';

    // Get deliverability settings from localStorage (simulated - in production, get from database)
    // For now, we'll use default settings that allow tracking
    const deliverabilitySettings = {
      enableTracking: true, // Default to enabled
      includeBulkHeaders: false,
      includeListUnsubscribe: false,
      includePriorityHeaders: false,
      forceGmailOnly: true,
      useBrandedHtmlTemplate: false,
      signatureImageEnabled: true
    };

    // If tracking is disabled, return pixel but don't track
    if (!deliverabilitySettings.enableTracking) {
      console.log('[Email] Tracking disabled by settings, returning pixel without tracking:', trackingId);
      const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': pixel.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(pixel);
      return;
    }

    // Detect common image proxy user agents (e.g., Gmail's GoogleImageProxy)
    const ua = String(userAgent).toLowerCase();
    const isGoogleProxy = ua.includes('googleimageproxy');
    const isGenericProxy = isGoogleProxy || ua.includes('proxy');

    // Create a unique session key for this user/email combination
    const sessionKey = `${trackingId}_${ip}_${isGenericProxy ? 'proxy' : userAgent}`;
    
    // Initialize tracking sessions if not exists
    if (!global.emailTrackingSessions) {
      global.emailTrackingSessions = new Map();
    }
    
    // Check if this session has already been tracked recently
    const now = Date.now();
    // Proxies can hammer the pixel repeatedly; use a long window for proxies
    const windowMs = isGenericProxy ? (12 * 60 * 60 * 1000) : 5000; // 12h for proxies, 5s for real clients
    const windowStart = now - windowMs;
    
    const existingSession = global.emailTrackingSessions.get(sessionKey);
    if (existingSession && existingSession.lastTracked > windowStart) {
      console.log('[Email] Session already tracked recently, skipping:', trackingId);
      // Still return the pixel but don't create duplicate events
    } else {
      // Create new tracking event
      const openEvent = {
        trackingId,
        openedAt: new Date().toISOString(),
        userAgent,
        ip,
        referer
      };
      
      // Store the session
      global.emailTrackingSessions.set(sessionKey, {
        lastTracked: now,
        openEvent
      });
      
      // Store the tracking event in memory for the client to pick up
      if (!global.emailTrackingEvents) {
        global.emailTrackingEvents = new Map();
      }
      
      const eventKey = `${trackingId}_open_${now}`;
      global.emailTrackingEvents.set(eventKey, {
        trackingId,
        type: 'open',
        data: openEvent,
        timestamp: new Date().toISOString()
      });
      
      console.log('[Email] New tracking event created:', trackingId, 'Session:', sessionKey);
    }

    // Return a 1x1 transparent pixel with proper headers
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    
    // Set cache headers based on deliverability settings and proxy detection
    const headers = {
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'X-Content-Type-Options': 'nosniff'
    };
    if (isGenericProxy) {
      // Encourage proxy to cache to avoid repeated refetches
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      // For real user agents, avoid caching so a true reopen can refetch
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    res.end(pixel);

  } catch (error) {
    console.error('[Email] Track error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to track email', message: error.message }));
  }
}

async function handleApiEmailUpdateTracking(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { trackingId, type, data } = body;

    if (!trackingId || !type) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: trackingId, type' }));
      return;
    }


    // Store the tracking event in a simple in-memory store
    // In production, this would be stored in a database
    if (!global.emailTrackingEvents) {
      global.emailTrackingEvents = new Map();
    }
    
    const eventKey = `${trackingId}_${type}`;
    global.emailTrackingEvents.set(eventKey, {
      trackingId,
      type,
      data,
      timestamp: new Date().toISOString()
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      message: 'Tracking update stored',
      trackingId,
      type
    }));

  } catch (error) {
    console.error('[Email] Update tracking error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to update tracking', message: error.message }));
  }
}

async function handleApiEmailTrackingEvents(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const events = global.emailTrackingEvents ? Array.from(global.emailTrackingEvents.values()) : [];
    
    // Clear events after reading so they are not reprocessed next poll
    if (global.emailTrackingEvents) {
      global.emailTrackingEvents.clear();
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      events,
      count: events.length
    }));

  } catch (error) {
    console.error('[Email] Get tracking events error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to get tracking events', message: error.message }));
  }
}

async function handleApiEmailWebhook(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { event, trackingId, data } = body;

    // Handle different webhook events
    switch (event) {
      case 'email_opened':
        // TODO: Update database with open event
        break;
      case 'email_replied':
        // TODO: Update database with reply event
        break;
      case 'email_bounced':
        // TODO: Update database with bounce event
        break;
      default:
        // Unknown webhook event
        break;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));

  } catch (error) {
    console.error('[Email] Webhook error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process webhook', message: error.message }));
  }
}

async function handleApiEmailStats(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const trackingId = parsedUrl.query.trackingId;
    
    if (!trackingId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing trackingId parameter' }));
      return;
    }

    // TODO: Fetch email stats from database
    // For now, return mock data
    const stats = {
      trackingId,
      openCount: 0,
      replyCount: 0,
      lastOpened: null,
      lastReplied: null,
      opens: [],
      replies: []
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));

  } catch (error) {
    console.error('[Email] Stats error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch email stats', message: error.message }));
  }
}

// SendGrid email sending handler
async function handleApiSendGridSend(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { to, subject, content, from, _deliverability } = body;

    if (!to || !subject || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
      return;
    }

    // Generate unique tracking ID
    const trackingId = `sendgrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create tracking pixel URL - handle both local and Vercel deployment
    const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const trackingPixelUrl = `${protocol}://${host}/api/email/track/${trackingId}`;
    
    // Inject tracking pixel into email content
    const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
    const emailContent = content + trackingPixel;

    // Prepare email data for SendGrid
    const emailData = {
      to,
      subject,
      content: emailContent,
      from: from || process.env.SENDGRID_FROM_EMAIL || 'noreply@powerchoosers.com',
      trackingId,
      _deliverability: _deliverability || {
        enableTracking: true,
        includeBulkHeaders: false,
        includeListUnsubscribe: false,
        includePriorityHeaders: false,
        forceGmailOnly: false,
        useBrandedHtmlTemplate: false,
        signatureImageEnabled: true
      }
    };

    console.log('[SendGrid] Sending email:', { to, subject, trackingId });

    // Import and use SendGrid service
    const { SendGridService } = await import('./api/email/sendgrid-service.js');
    const sendGridService = new SendGridService();
    const result = await sendGridService.sendEmail(emailData);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      trackingId: result.trackingId,
      messageId: result.messageId,
      message: 'Email sent successfully via SendGrid'
    }));

  } catch (error) {
    console.error('[SendGrid] Send error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to send email', 
      message: error.message 
    }));
  }
}

// Proxy Twilio recording audio to the browser
async function handleApiRecording(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const query = parsedUrl.query || {};
    const remoteUrl = query.url;
    if (!remoteUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing Twilio credentials on server' }));
      return;
    }

    const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
    const upstream = await fetch(remoteUrl, { headers: { Authorization: authHeader } });
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      res.writeHead(upstream.status, { 'Content-Type': 'text/plain' });
      res.end(txt || 'Failed to fetch recording');
      return;
    }

    // Stream audio back to the client
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-cache'
    });
    const reader = upstream.body.getReader();
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      return pump();
    });
    await pump();
  } catch (error) {
    console.error('[Server] /api/recording proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to proxy recording', message: error.message }));
  }
}

// SendGrid webhook handler
async function handleApiSendGridWebhook(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Proxy to Vercel deployment
    const body = await readJsonBody(req);
    const response = await fetch(`${API_BASE_URL}/api/email/sendgrid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const result = await response.text();
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(result);
  } catch (error) {
    console.error('[SendGrid Webhook] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// SendGrid inbound email handler
async function handleApiInboundEmail(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Proxy to Vercel deployment
    const body = await readJsonBody(req);
    const response = await fetch(`${API_BASE_URL}/api/email/inbound-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const result = await response.text();
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(result);
  } catch (error) {
    console.error('[Inbound Email] Proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// Main server function
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    // API Routes
    if (pathname.startsWith('/api/')) {
      // Gemini Email API
      if (pathname === '/api/gemini-email') {
        await handleApiGeminiEmail(req, res);
        return;
      }
      
      // Twilio API endpoints
      if (pathname === '/api/twilio/token') {
        await handleApiTwilioToken(req, res, parsedUrl);
        return;
      }
      
      if (pathname === '/api/twilio/voice') {
        await handleApiTwilioVoice(req, res, parsedUrl);
        return;
      }
      
      if (pathname === '/api/twilio/call') {
        await handleApiTwilioCall(req, res, parsedUrl);
        return;
      }
      
      if (pathname === '/api/twilio/conversational-intelligence-webhook') {
        await handleApiTwilioConversationalIntelligenceWebhook(req, res, parsedUrl);
        return;
      }
      
      if (pathname === '/api/twilio/language-webhook') {
        await handleApiTwilioLanguageWebhook(req, res, parsedUrl);
        return;
      }
      
      if (pathname === '/api/twilio/voice-intelligence') {
        await handleApiTwilioVoiceIntelligence(req, res, parsedUrl);
        return;
      }
      
      if (pathname === '/api/recording') {
        await handleApiRecording(req, res, parsedUrl);
        return;
      }
      
      // SendGrid API endpoints
      if (pathname === '/api/email/sendgrid-send') {
        await handleApiSendGridSend(req, res);
        return;
      }
      
      if (pathname === '/api/email/sendgrid-webhook') {
        await handleApiSendGridWebhook(req, res);
        return;
      }
      
      if (pathname === '/api/email/inbound-email') {
        await handleApiInboundEmail(req, res);
        return;
      }
      
      // If no API route matches, return 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
      return;
    }
    
    // Static file serving
    let filePath = pathname === '/' ? '/crm-dashboard.html' : pathname;
    filePath = path.join(__dirname, filePath);
    
    // Security check - prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    
    // Get file extension and set content type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Read and serve file
    const fileContent = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fileContent);
    
  } catch (error) {
    console.error('[Server] Error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`[Server] Power Choosers CRM server running at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});
