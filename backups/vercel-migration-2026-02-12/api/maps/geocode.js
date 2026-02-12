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

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
    process.env.GOOGLE_MAPS_API;

  if (!apiKey) {
    console.error('Google Maps API key missing');
    sendJson(500, { error: 'Google Maps API key not configured' });
    return;
  }

  try {
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.location,places.formattedAddress',
        },
        body: JSON.stringify({ textQuery: address }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Places API geocode error:', data);
      sendJson(response.status, { error: data.error?.message || 'Geocoding failed' });
      return;
    }

    const place = data.places?.[0];
    if (!place?.location) {
      sendJson(200, { found: false, lat: null, lng: null });
      return;
    }

    const lat = place.location.latitude ?? place.location.lat;
    const lng = place.location.longitude ?? place.location.lng;

    if (lat == null || lng == null) {
      sendJson(200, { found: false, lat: null, lng: null });
      return;
    }

    sendJson(200, {
      found: true,
      lat: Number(lat),
      lng: Number(lng),
      formattedAddress: place.formattedAddress,
    });
  } catch (error) {
    console.error('Geocode API Error:', error);
    sendJson(500, { error: 'Internal Server Error' });
  }
}
