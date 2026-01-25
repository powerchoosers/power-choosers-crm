
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
// Use SERVICE KEY to see "ground truth"
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function inspectSpecificId() {
  const targetId = 'hqmsRjYnuF5tE0pPn3BE';
  console.log(`Inspecting ID: ${targetId}`);

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', targetId)
    .single();

  if (error) {
    console.log('Error:', error);
    return;
  }

  console.log('--- Database Record (Service Key) ---');
  console.log('ID:', data.id);
  console.log('Name:', data.name);
  console.log('FirstName:', data.firstName);
  console.log('LastName:', data.lastName);
  console.log('Metadata:', JSON.stringify(data.metadata, null, 2));
  console.log('-------------------------------------');
}

inspectSpecificId();
