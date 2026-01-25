
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function inspectSpecificContacts() {
  const ids = ['hqmsRjYnuF5tE0pPn3BE', 'UwP0WMVT9hsZOekOXH5M'];
  console.log(`Inspecting IDs: ${ids.join(', ')}`);

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .in('id', ids);

  if (error) {
    console.error('Error:', error);
    return;
  }

  data.forEach(c => {
    console.log('\n---------------------------------------------------');
    console.log('FULL RECORD:', JSON.stringify(c, null, 2));
    console.log('---------------------------------------------------');
  });
}

inspectSpecificContacts();
