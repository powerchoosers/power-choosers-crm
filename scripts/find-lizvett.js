
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log('Fetching all contacts to search for Lizvett...');
  const { data: allContacts, error } = await supabase.from('contacts').select('*');
  
  if (error) {
    console.error('Error fetching contacts:', error);
    return;
  }

  const lizvett = allContacts.filter(c => JSON.stringify(c).toLowerCase().includes('lizvett'));
  
  console.log(`Found ${lizvett.length} records matching 'lizvett'`);
  lizvett.forEach(c => {
      console.log('------------------------------------------------');
      console.log(JSON.stringify(c, null, 2));
  });
}

main();
