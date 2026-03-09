// Places text search for address/name. Used by Satellite Uplink and AccountUplinkCard.
// Calls Mapbox Search Box for POI names and falls back to the Geocoding API when necessary.
import { cors } from '../_cors.js';

const sendJson = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const buildLocationPayload = (feature) => {
  const coordinates = feature?.geometry?.coordinates || feature?.center;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  return {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
  };
};

const runSearchBox = async (query, apiKey) => {
  const params = new URLSearchParams({
    q: query,
    access_token: apiKey,
    limit: '1',
  });
  const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params}`);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Search Box request failed: ${errorBody}`);
  }
  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature) return null;
  return {
    feature,
    address: feature.place_name,
  };
};

const runGeocoding = async (query, apiKey) => {
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${apiKey}&limit=1`
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Geocoding request failed: ${errorBody}`);
  }
  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature) return null;
  return {
    feature,
    address: feature.place_name,
  };
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const query = url.searchParams.get('q');
  if (!query) {
    sendJson(res, 400, { error: 'Query parameter "q" is required' });
    return;
  }

  const apiKey = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!apiKey) {
    console.error('Mapbox API token missing');
    sendJson(res, 500, { error: 'Mapbox API token not configured' });
    return;
  }

  try {
    let searchResult = await runSearchBox(query, apiKey);
    if (!searchResult) {
      searchResult = await runGeocoding(query, apiKey);
    }

    if (!searchResult) {
      sendJson(res, 200, { found: false });
      return;
    }

    const locationPayload = buildLocationPayload(searchResult.feature);
    if (!locationPayload) {
      sendJson(res, 200, { found: false });
      return;
    }

    sendJson(res, 200, {
      found: true,
      address: searchResult.address,
      phone: null,
      location: locationPayload,
      placeName: searchResult.feature.text || searchResult.feature.properties?.name,
    });
  } catch (error) {
    console.error('Maps Search Error:', error);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
