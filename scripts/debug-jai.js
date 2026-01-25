
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function debugJai() {
  console.log('Fetching Jai Guliani (0F3w1AA6H7VYj236Kncb) and Curt Olmstead (0QiHuBut3ct0pC5P9Sau)...');

  const { data, error } = await supabase
    .from('contacts')
    .select('*, accounts(name, domain, logo_url)')
    .in('id', ['0F3w1AA6H7VYj236Kncb', '0QiHuBut3ct0pC5P9Sau']);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nReturned ${data.length} records.\n`);

  data.forEach(item => {
    console.log('---------------------------------------------------');
    console.log(`ID: ${item.id}`);
    console.log('Keys present:', Object.keys(item).join(', '));
    console.log(`firstName: "${item.firstName}" (Type: ${typeof item.firstName})`);
    console.log(`lastName: "${item.lastName}" (Type: ${typeof item.lastName})`);
    console.log(`name: "${item.name}" (Type: ${typeof item.name})`);
    console.log(`firstname (lowercase): "${item.firstname}"`);
    console.log(`lastname (lowercase): "${item.lastname}"`);
    console.log('Metadata:', JSON.stringify(item.metadata, null, 2));
    
    // Simulate mapping logic
    const fName = item.firstName || item.firstname || item.FirstName || item.metadata?.firstName || item.metadata?.first_name;
    const lName = item.lastName || item.lastname || item.LastName || item.metadata?.lastName || item.metadata?.last_name;
    const fullName = [fName, lName].filter(Boolean).join(' ') || item.name || item.email || 'Unknown';
    
    console.log(`\nMAPPED NAME: "${fullName}"`);
  });
}

debugJai();
