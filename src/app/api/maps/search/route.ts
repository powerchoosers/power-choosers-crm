import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  // Try to get key from env, fallback to a hardcoded check or error
  // Note: ideally this should be in process.env
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error('Google Maps API key missing in environment variables');
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 });
  }

  try {
    // Use Google Places API (New) Text Search
    // We request specific fields to minimize cost and latency
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.formattedAddress,places.nationalPhoneNumber,places.location,places.name'
      },
      body: JSON.stringify({
        textQuery: query
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Places API error:', data);
      return NextResponse.json({ error: data.error?.message || 'Failed to fetch places' }, { status: response.status });
    }
    
    const place = data.places?.[0];

    if (!place) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      address: place.formattedAddress,
      phone: place.nationalPhoneNumber,
      location: place.location,
      placeName: place.name
    });

  } catch (error) {
    console.error('Maps Search Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
