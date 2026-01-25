
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkQuery() {
  // Find Lizvett
  const { data, error } = await supabase
    .from('contacts')
    .select('*, accounts(name, domain, logo_url)')
    .eq('email', 'lizvett.alegria@optimumre.com')
    .single();

  if (error) {
    console.log('Error:', error);
    return;
  }

  console.log('Data sample:', JSON.stringify(data, null, 2));
}

checkQuery();
