/**
 * Weather API — Google Maps Platform Weather API (current conditions).
 * Used by Active Context on account/contact dossier; location is always the account's.
 * GET /api/weather?lat=32.78&lng=-96.80
 *   or ?address=Dallas,%20TX
 *   or ?city=Dallas&state=TX
 */
import { cors } from './_cors.js';

const sendJson = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=600'); // 10 min
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENWEATHERMAP_API_KEY;

  if (!apiKey) {
    console.error('[Weather] OpenWeatherMap API key missing');
    sendJson(res, 500, { error: 'Weather API not configured. Please set OPENWEATHERMAP_API_KEY.' });
    return;
  }

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  let lat = url.searchParams.get('lat');
  let lng = url.searchParams.get('lng');
  const address = url.searchParams.get('address');
  const city = url.searchParams.get('city');
  const state = url.searchParams.get('state');
  const units = (url.searchParams.get('units') || 'IMPERIAL').toUpperCase();

  // Map units for OpenWeatherMap
  const owmUnits = units === 'IMPERIAL' ? 'imperial' : 'metric';

  // Resolve lat/lng: use provided coords or geocode from address or city+state
  if ((lat == null || lng == null || lat === '' || lng === '') && (address || (city && state))) {
    const geocodeQuery = address || [city, state].filter(Boolean).join(', ');
    try {
      // Resolve against the current request host (Next.js server)
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || 'localhost:3000';
      const geocodeUrl = `${protocol}://${host}/api/maps/geocode?address=${encodeURIComponent(geocodeQuery)}`;

      console.log(`[Weather] Resolving location via: ${geocodeUrl}`);
      const geoRes = await fetch(geocodeUrl, { method: 'GET' });
      const geo = await geoRes.json();
      if (geo?.found && geo.lat != null && geo.lng != null) {
        lat = String(geo.lat);
        lng = String(geo.lng);
      }
    } catch (e) {
      console.error('[Weather] Geocode failed:', e.message);
      sendJson(res, 502, { error: 'Could not resolve location', details: e.message });
      return;
    }
  }

  const numLat = lat != null && lat !== '' ? parseFloat(lat) : NaN;
  const numLng = lng != null && lng !== '' ? parseFloat(lng) : NaN;

  if (Number.isNaN(numLat) || Number.isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
    sendJson(res, 400, { error: 'Valid lat and lng (or address or city+state) required' });
    return;
  }

  try {
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${numLat}&lon=${numLng}&units=${owmUnits}&appid=${apiKey}`;
    const response = await fetch(weatherUrl);

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Weather] OpenWeatherMap API error', response.status, errBody);
      sendJson(res, response.status, {
        error: 'Weather API error',
        message: response.status === 401 ? 'API key invalid' : 'Failed to fetch weather data',
      });
      return;
    }

    const data = await response.json();

    // Mapping OWM data to our existing dashboard schema
    sendJson(res, 200, {
      temp: data.main?.temp != null ? Math.round(data.main.temp) : null,
      unit: units === 'IMPERIAL' ? 'FAHRENHEIT' : 'CELSIUS',
      feelsLike: data.main?.feels_like != null ? Math.round(data.main.feels_like) : null,
      condition: data.weather?.[0]?.description || '—',
      humidity: data.main?.humidity ?? null,
      windSpeed: data.wind?.speed ?? null,
      windSpeedUnit: units === 'IMPERIAL' ? 'mph' : 'm/s',
      windDirection: data.wind?.deg ?? null,
      isDaytime: data.dt > (data.sys?.sunrise || 0) && data.dt < (data.sys?.sunset || 0),
      uvIndex: null, // OWM 2.5 current weather doesn't include UV index; OneCall API does
      icon: data.weather?.[0]?.icon || null
    });
  } catch (e) {
    console.error('[Weather] Request failed:', e);
    sendJson(res, 500, { error: 'Failed to fetch weather', message: e.message });
  }
}
