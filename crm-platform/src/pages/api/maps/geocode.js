// Server-side geocoding for address → lat/lng. Used by Satellite Uplink.
// Lives in root api/ so it is hit when Next.js rewrites /api/* to the backend.
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

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const address = url.searchParams.get('address') || url.searchParams.get('q');

  if (!address) {
    sendJson(400, { error: 'Query parameter "address" or "q" is required' });
    return;
  }

  const apiKey = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!apiKey) {
    console.error('Mapbox API token missing');
    sendJson(500, { error: 'Mapbox API token not configured' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${apiKey}&limit=1`
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Mapbox Geocoding API error:', data);
      sendJson(response.status, { error: data.message || 'Geocoding failed' });
      return;
    }

    const feature = data.features?.[0];
    if (!feature) {
      sendJson(200, { found: false, lat: null, lng: null });
      return;
    }

    // Mapbox returns [lng, lat]
    const [lng, lat] = feature.center || feature.geometry?.coordinates || [];

    if (lat == null || lng == null) {
      sendJson(200, { found: false, lat: null, lng: null });
      return;
    }

    sendJson(200, {
      found: true,
      lat: Number(lat),
      lng: Number(lng),
      formattedAddress: feature.place_name,
    });
  } catch (error) {
    console.error('Geocode API Error:', error);
    sendJson(500, { error: 'Internal Server Error' });
  }
}
