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

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API;

  if (!apiKey) {
    console.error('[Weather] Google Maps API key missing');
    sendJson(res, 500, { error: 'Weather API not configured' });
    return;
  }

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  let lat = url.searchParams.get('lat');
  let lng = url.searchParams.get('lng');
  const address = url.searchParams.get('address');
  const city = url.searchParams.get('city');
  const state = url.searchParams.get('state');
  const units = (url.searchParams.get('units') || 'IMPERIAL').toUpperCase();

  // Resolve lat/lng: use provided coords or geocode from address or city+state
  if ((lat == null || lng == null || lat === '' || lng === '') && (address || (city && state))) {
    const geocodeQuery = address || [city, state].filter(Boolean).join(', ');
    try {
      const geoRes = await fetch(
        `http://127.0.0.1:${process.env.PORT || 3001}/api/maps/geocode?address=${encodeURIComponent(geocodeQuery)}`,
        { method: 'GET' }
      );
      const geo = await geoRes.json();
      if (geo?.found && geo.lat != null && geo.lng != null) {
        lat = String(geo.lat);
        lng = String(geo.lng);
      }
    } catch (e) {
      console.error('[Weather] Geocode failed:', e.message);
      sendJson(res, 502, { error: 'Could not resolve location' });
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
    const params = new URLSearchParams({
      key: apiKey,
      'location.latitude': String(numLat),
      'location.longitude': String(numLng),
    });
    if (units === 'IMPERIAL' || units === 'METRIC') {
      params.set('unitsSystem', units);
    }

    const weatherUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?${params.toString()}`;
    const response = await fetch(weatherUrl);

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Weather] API error', response.status, errBody);
      sendJson(res, response.status, {
        error: 'Weather API error',
        message: response.status === 403 ? 'Weather API not enabled or key invalid' : errBody.slice(0, 200),
      });
      return;
    }

    const data = await response.json();

    const temp = data.temperature;
    const feelsLike = data.feelsLikeTemperature;
    // Google returns weatherCondition.description as { text, languageCode }; extract string
    const rawDesc = data.weatherCondition?.description;
    const condition =
      (typeof data.weatherCondition === 'string' && data.weatherCondition) ||
      (typeof rawDesc === 'object' && rawDesc !== null && typeof rawDesc.text === 'string' ? rawDesc.text : null) ||
      (typeof rawDesc === 'string' && rawDesc ? rawDesc : null) ||
      data.weatherCondition?.text ||
      data.weatherCondition?.code ||
      '—';
    const humidity = data.relativeHumidity ?? null;
    const wind = data.wind;
    // API uses "degrees" for temperature value
    const tempVal = temp?.degrees ?? temp?.value ?? temp;
    const feelsVal = feelsLike?.degrees ?? feelsLike?.value ?? feelsLike;

    sendJson(res, 200, {
      temp: tempVal != null ? Number(tempVal) : null,
      unit: temp?.unit ?? (units === 'IMPERIAL' ? 'FAHRENHEIT' : 'CELSIUS'),
      feelsLike: feelsVal != null ? Number(feelsVal) : null,
      condition,
      humidity,
      windSpeed: wind?.speed?.value ?? wind?.speed ?? null,
      windSpeedUnit: wind?.speed?.unit ?? null,
      windDirection:
        wind?.direction?.degrees != null
          ? Number(wind.direction.degrees)
          : wind?.direction?.value != null
            ? Number(wind.direction.value)
            : null,
      isDaytime: data.isDaytime,
      uvIndex: data.uvIndex ?? null,
    });
  } catch (e) {
    console.error('[Weather] Request failed:', e);
    sendJson(res, 500, { error: 'Failed to fetch weather', message: e.message });
  }
}
