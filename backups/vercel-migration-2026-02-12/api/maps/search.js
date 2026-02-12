// Places text search for address/name. Used by Satellite Uplink and AccountUplinkCard.
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
  const query = url.searchParams.get('q');

  if (!query) {
    sendJson(400, { error: 'Query parameter "q" is required' });
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
          'X-Goog-FieldMask':
            'places.formattedAddress,places.nationalPhoneNumber,places.location,places.name',
        },
        body: JSON.stringify({ textQuery: query }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Places API error:', data);
      sendJson(response.status, {
        error: data.error?.message || 'Failed to fetch places',
      });
      return;
    }

    const place = data.places?.[0];
    if (!place) {
      sendJson(200, { found: false });
      return;
    }

    sendJson(200, {
      found: true,
      address: place.formattedAddress,
      phone: place.nationalPhoneNumber,
      location: place.location,
      placeName: place.name,
    });
  } catch (error) {
    console.error('Maps Search Error:', error);
    sendJson(500, { error: 'Internal Server Error' });
  }
}
