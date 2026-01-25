
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkNullNames() {
  const { count, error } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .is('name', null)
    .is('firstName', null);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Contacts with null name AND firstName:', count);
  
  // Check empty strings
  const { count: emptyCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('name', '')
    .eq('firstName', '');
    
  console.log('Contacts with empty string name AND firstName:', emptyCount);
}

checkNullNames();
