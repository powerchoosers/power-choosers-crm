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
    const lat = url.searchParams.get('lat');
    const lng = url.searchParams.get('lng');
    const limit = url.searchParams.get('limit') || '10';

    if (!lat || !lng) {
        sendJson(400, { error: 'Parameters "lat" and "lng" are required' });
        return;
    }

    const apiKey = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!apiKey) {
        sendJson(500, { error: 'Mapbox API token not configured' });
        return;
    }

    try {
        // Search for POIs around the given coordinates
        // We use categories like 'business', 'office', 'industrial' if we want company labels
        // Or just generic POI
        const query = 'business';
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${apiKey}&proximity=${lng},${lat}&types=poi&limit=${limit}`
        );

        const data = await response.json();

        if (!response.ok) {
            sendJson(response.status, { error: data.message || 'Nearby search failed' });
            return;
        }

        const results = (data.features || []).map(feature => {
            const [featLng, featLat] = feature.center || feature.geometry?.coordinates || [];
            return {
                id: feature.id,
                name: feature.text,
                address: feature.place_name,
                lat: featLat,
                lng: featLng,
                category: feature.properties?.category
            };
        });

        sendJson(200, {
            count: results.length,
            results
        });
    } catch (error) {
        console.error('Nearby API Error:', error);
        sendJson(500, { error: 'Internal Server Error' });
    }
}
