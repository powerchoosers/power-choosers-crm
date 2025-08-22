const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

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
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';

console.log(`[Server] Starting in ${LOCAL_DEV_MODE ? 'development' : 'production'} mode`);
console.log(`[Server] API Base URL: ${API_BASE_URL}`);
if (!GOOGLE_API_KEY) {
  console.warn('[Server] GOOGLE_API_KEY is not set. /api/tx-price will return a placeholder until configured.');
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
    const data = await response.json();
    
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
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

async function handleApiCalls(req, res) {
  const proxyUrl = `${API_BASE_URL}/api/calls`;
  
  try {
    if (req.method === 'POST') {
      // Handle POST requests (logging calls)
      const body = await readJsonBody(req);
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } else {
      // Handle GET requests (fetching calls)
      const response = await fetch(proxyUrl);
      const data = await response.json();
      
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  }
}

// ---------------- Gemini-backed TX Price (commercial, energy only) ----------------
const txPriceCache = {
  price: null, // number (USD per kWh)
  lastUpdated: null, // ISO string
  source: 'gemini'
};

function isWeekend(d) {
  const day = d.getDay(); // 0 Sun .. 6 Sat
  return day === 0 || day === 6;
}

function nextWeekdayEightAM(from = new Date()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  // Set to today 8:00 AM
  d.setHours(8, 0, 0, 0);
  if (from >= d) {
    // already past 8 AM today, move to next day
    d.setDate(d.getDate() + 1);
  }
  // Skip weekends
  while (isWeekend(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

let txPriceTimer = null;
function scheduleTxPriceRefresh() {
  const now = new Date();
  const nextAt = nextWeekdayEightAM(now);
  const delay = Math.max(1000, nextAt - now);
  if (txPriceTimer) clearTimeout(txPriceTimer);
  txPriceTimer = setTimeout(async () => {
    try {
      await updateTxPriceFromGemini();
    } catch (e) {
      console.error('[TX Price] Scheduled refresh failed:', e.message);
    } finally {
      scheduleTxPriceRefresh();
    }
  }, delay);
  console.log(`[TX Price] Next scheduled refresh at: ${nextAt.toString()}`);
}

async function dynamicGeminiImport() {
  // ESM-only library; import dynamically in CJS
  const mod = await import('@google/generative-ai');
  return mod;
}

function extractDecimal(str) {
  // Find number like 0.0xx or 0.1xx etc
  const m = String(str).replace(/[, $]/g, '').match(/(0?\.[0-9]{2,4}|[1-9]\.[0-9]{2,4})/);
  return m ? parseFloat(m[1]) : null;
}

async function fetchTxPriceFromGemini() {
  if (!GOOGLE_API_KEY) {
    // Fallback placeholder if no API key
    return { price: 0.089, note: 'placeholder-no-api-key' };
  }
  const { GoogleGenerativeAI } = await dynamicGeminiImport();
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are a pricing assistant. Return ONLY a decimal number representing current typical fixed commercial electricity ENERGY charge rate in Texas (USD per kWh), excluding delivery/transmission/TDU fees. No text, no currency symbol, 3 decimal places. If uncertain, provide your best current market estimate. Example: 0.089`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const num = extractDecimal(text);
  if (!isFinite(num)) {
    throw new Error(`Gemini returned unparseable value: ${text}`);
  }
  // Clamp to reasonable bounds (0.03 .. 0.30)
  const clamped = Math.min(0.30, Math.max(0.03, num));
  return { price: Number(clamped.toFixed(3)) };
}

async function updateTxPriceFromGemini() {
  const { price } = await fetchTxPriceFromGemini();
  txPriceCache.price = price;
  txPriceCache.lastUpdated = new Date().toISOString();
  console.log(`[TX Price] Updated to $${price.toFixed(3)} per kWh at ${txPriceCache.lastUpdated}`);
  return txPriceCache;
}

async function handleApiTxPrice(req, res, parsedUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const wantsRefresh = parsedUrl.query && (parsedUrl.query.refresh === '1' || parsedUrl.query.refresh === 'true');
  try {
    if (wantsRefresh || !txPriceCache.price) {
      await updateTxPriceFromGemini();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      price: txPriceCache.price,
      lastUpdated: txPriceCache.lastUpdated,
      source: txPriceCache.source
    }));
  } catch (error) {
    console.error('[TX Price] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch TX price', message: error.message }));
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
    pathname === '/api/calls' ||
    pathname === '/api/energy-news' ||
    pathname === '/api/search' ||
    pathname === '/api/tx-price'
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
  if (pathname === '/api/calls') {
    return handleApiCalls(req, res);
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
  console.log(`[Server] Environment: ${LOCAL_DEV_MODE ? 'Development' : 'Production'}`);
  console.log(`[Server] Twilio API proxying to: ${API_BASE_URL}`);
  // Kick off initial load and schedule
  updateTxPriceFromGemini().catch(err => console.warn('[TX Price] Initial fetch failed:', err.message));
  scheduleTxPriceRefresh();
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
