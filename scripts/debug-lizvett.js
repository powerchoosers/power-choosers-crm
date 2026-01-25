
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function findLizvett() {
  console.log('Searching for "Lizvett"...');

  // Search by text search if possible, or just fetch all and filter (since dataset is small < 2000)
  // Let's try to find by partial match on common fields first
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .ilike('metadata->>ownerId', '%Lizvett%') // Just a guess, probably not here
    .or(`name.ilike.%Lizvett%,firstName.ilike.%Lizvett%,email.ilike.%Lizvett%,metadata->>name.ilike.%Lizvett%`);

  if (error) {
    console.log('Error searching:', error);
    // Fallback: fetch latest 100 and filter manually in JS if ILIKE fails on some columns
    return;
  }

  if (data && data.length > 0) {
    console.log(`Found ${data.length} matches.`);
    data.forEach(c => {
        console.log('--- Record ---');
        console.log('ID:', c.id);
        console.log('Name:', c.name);
        console.log('First:', c.firstName);
        console.log('Last:', c.lastName);
        console.log('Email:', c.email);
        console.log('Metadata:', JSON.stringify(c.metadata, null, 2));
        console.log('----------------');
    });
  } else {
    console.log('No direct matches found via OR query. Trying manual scan of recent records...');
    const { data: allData } = await supabase.from('contacts').select('*').limit(500);
    const manualMatches = allData.filter(c => JSON.stringify(c).toLowerCase().includes('lizvett'));
    console.log(`Found ${manualMatches.length} manual matches.`);
    manualMatches.forEach(c => {
        console.log('--- Record (Manual) ---');
        console.log('ID:', c.id);
        console.log('Raw JSON:', JSON.stringify(c, null, 2));
        console.log('----------------');
    });
  }
}

findLizvett();
