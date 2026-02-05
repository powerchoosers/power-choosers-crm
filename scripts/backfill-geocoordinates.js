import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleMapsKey = process.env.GOOGLE_MAPS_API;

if (!supabaseUrl || !supabaseKey || !googleMapsKey) {
  console.error('Missing required environment variables. Check .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function geocodeAddress(address) {
  if (!address) return null;
  
  try {
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleMapsKey,
          'X-Goog-FieldMask': 'places.location,places.formattedAddress',
        },
        body: JSON.stringify({ textQuery: address }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error(`Places API error for "${address}":`, data.error?.message || 'Unknown error');
      return null;
    }

    const place = data.places?.[0];
    if (!place?.location) return null;

    return {
      lat: place.location.latitude ?? place.location.lat,
      lng: place.location.longitude ?? place.location.lng,
      formattedAddress: place.formattedAddress
    };
  } catch (error) {
    console.error(`Fetch error for "${address}":`, error.message);
    return null;
  }
}

async function backfill() {
  console.log('--- INITIALIZING GEOCOORDINATE BACKFILL ---');

  // 1. BACKFILL ACCOUNTS
  console.log('\n[1/2] Processing Accounts...');
  const { data: accounts, error: accError } = await supabase
    .from('accounts')
    .select('id, name, address, city, state')
    .or('status.eq.CUSTOMER,status.eq.ACTIVE_LOAD,status.eq.active')
    .is('latitude', null);

  if (accError) {
    console.error('Error fetching accounts:', accError);
  } else {
    console.log(`Found ${accounts.length} accounts to geocode.`);
    for (const acc of accounts) {
      const query = acc.address || `${acc.name} ${acc.city || ''} ${acc.state || ''}`.trim();
      if (!query || query === acc.name) {
        console.log(`Skipping account "${acc.name}" - insufficient address data.`);
        continue;
      }

      console.log(`Geocoding Account: "${acc.name}" (${query})...`);
      const coords = await geocodeAddress(query);
      
      if (coords) {
        const { error: updError } = await supabase
          .from('accounts')
          .update({ 
            latitude: coords.lat, 
            longitude: coords.lng,
            // If we didn't have a street address but found one, save it
            ...( !acc.address ? { address: coords.formattedAddress } : {} )
          })
          .eq('id', acc.id);
        
        if (updError) console.error(`  Update failed:`, updError.message);
        else console.log(`  Success: ${coords.lat}, ${coords.lng}`);
      }
      
      // Delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 2. BACKFILL CONTACTS
  console.log('\n[2/2] Processing Contacts...');
  const { data: contacts, error: conError } = await supabase
    .from('contacts')
    .select('id, name, city, state')
    .is('latitude', null);

  if (conError) {
    console.error('Error fetching contacts:', conError);
  } else {
    console.log(`Found ${contacts.length} contacts to geocode.`);
    for (const con of contacts) {
      if (!con.city && !con.state) {
        // No point geocoding without any location data
        continue;
      }

      const query = `${con.city || ''} ${con.state || ''}`.trim();
      console.log(`Geocoding Contact: "${con.name}" (${query})...`);
      const coords = await geocodeAddress(query);
      
      if (coords) {
        const { error: updError } = await supabase
          .from('contacts')
          .update({ latitude: coords.lat, longitude: coords.lng })
          .eq('id', con.id);
        
        if (updError) console.error(`  Update failed:`, updError.message);
        else console.log(`  Success: ${coords.lat}, ${coords.lng}`);
      }
      
      // Delay
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log('\n--- BACKFILL COMPLETE ---');
}

backfill();
