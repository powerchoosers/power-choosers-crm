
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function debugLizvett() {
  console.log('--- Debugging Lizvett ---');
  
  // Try to find any record containing "Lizvett" in any text field
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .or('name.ilike.%Lizvett%,firstName.ilike.%Lizvett%,lastName.ilike.%Lizvett%,email.ilike.%Lizvett%,metadata->>name.ilike.%Lizvett%')
    .limit(5);

  if (error) {
    console.error('Supabase Error:', error);
    return;
  }

  if (data.length === 0) {
    console.log('No "Lizvett" found via ILIKE. Fetching recent contacts to scan manually...');
    const { data: all } = await supabase.from('contacts').select('*').order('created_at', { ascending: false }).limit(200);
    const found = all.filter(c => JSON.stringify(c).toLowerCase().includes('lizvett'));
    console.log(`Manual scan found ${found.length} records.`);
    found.forEach(printRecord);
  } else {
    console.log(`Found ${data.length} records via ILIKE.`);
    data.forEach(printRecord);
  }
}

function printRecord(c) {
  console.log('\n---------------------------------------------------');
  console.log('ID:', c.id);
  console.log('Name (root):', c.name);
  console.log('FirstName (root):', c.firstName);
  console.log('LastName (root):', c.lastName);
  console.log('Email:', c.email);
  console.log('Metadata:', JSON.stringify(c.metadata, null, 2));
  console.log('---------------------------------------------------\n');
}

debugLizvett();
