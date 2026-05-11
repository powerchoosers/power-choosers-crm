// Vercel serverless function to provide Google Maps config without exposing secrets in source code
import { cors } from '../_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const sendJson = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };

  if (req.method !== 'GET') {
    sendJson(405, { error: 'Method not allowed' });
    return;
  }

  try {
    // Read from environment variables configured in Vercel
    const apiKey = process.env.GOOGLE_MAPS_API || '';
    const mapId = process.env.GOOGLE_MAP_ID || '';

    sendJson(200, { apiKey, mapId });
    return;
  } catch (e) {
    sendJson(200, { apiKey: '', mapId: '' });
    return;
  }
};



