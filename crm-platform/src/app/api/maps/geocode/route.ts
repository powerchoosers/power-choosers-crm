import { NextResponse } from 'next/server';

/**
 * Server-side geocoding for address → lat/lng.
 * Works in production (no CORS / client API restrictions).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address') || searchParams.get('q');

  if (!address) {
    return NextResponse.json(
      { error: 'Query parameter "address" or "q" is required' },
      { status: 400 }
    );
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey) {
    console.error('Google Maps API key missing');
    return NextResponse.json(
      { error: 'Google Maps API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Use Places API (New) Text Search – same as /api/maps/search, returns location
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
      return NextResponse.json(
        { error: data.error?.message || 'Geocoding failed' },
        { status: response.status }
      );
    }

    const place = data.places?.[0];
    if (!place?.location) {
      return NextResponse.json({ found: false, lat: null, lng: null });
    }

    const lat = place.location.latitude ?? place.location.lat;
    const lng = place.location.longitude ?? place.location.lng;

    if (lat == null || lng == null) {
      return NextResponse.json({ found: false, lat: null, lng: null });
    }

    return NextResponse.json({
      found: true,
      lat: Number(lat),
      lng: Number(lng),
      formattedAddress: place.formattedAddress,
    });
  } catch (error) {
    console.error('Geocode API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
