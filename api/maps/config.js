// Vercel serverless function to provide Google Maps config without exposing secrets in source code
import { cors } from '../_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    return res.writeHead(405, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Method not allowed' }));
return;
  }

  try {
    // Read from environment variables configured in Vercel
    const apiKey = process.env.GOOGLE_MAPS_API || '';
    const mapId = process.env.GOOGLE_MAP_ID || '';

    if (!apiKey) {
      return res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ apiKey: '', mapId }));
return;
    }

    // Never cache API key in CDN/browser
    res.setHeader('Cache-Control', 'no-store');
    return res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ apiKey, mapId }));
return;
  } catch (e) {
    return res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ apiKey: '', mapId: '' }));
return;
  }
};



