// CORS utility for Node.js HTTP API endpoints
export function cors(req, res) {
  // Set CORS headers for all requests
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://powerchoosers.com',
    'https://www.powerchoosers.com',
    'https://power-choosers-crm-792458658491.us-south1.run.app'
  ];

  // When credentials are included, we cannot use '*'
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return true; // Early return for OPTIONS requests
  }

  return false; // Continue with handler for non-OPTIONS requests
}

// Alias for compatibility
export const corsMiddleware = cors;
