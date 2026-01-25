
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Explicitly use ANON

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkLizvettAnon() {
  console.log('Checking Lizvett with ANON KEY...');
  const targetId = '0rWdaR0wX5FmwBjwQZNw';

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', targetId)
    .single();

  if (error) {
    console.log('Error (Anon):', error);
    return;
  }

  console.log('--- Record (Anon Key) ---');
  console.log('ID:', data.id);
  console.log('Name:', data.name);
  console.log('FirstName:', data.firstName);
  console.log('LastName:', data.lastName);
  console.log('-------------------------');
}

checkLizvettAnon();
