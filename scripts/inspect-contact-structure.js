
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Try loading from .env in root
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials. Checked .env in root.');
  console.log('Current directory:', process.cwd());
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function inspectContact() {
  console.log('Searching for "Igwe Law Firm Pc" or "Lizvett"...');

  // Search by company name or name to find the record
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .or('name.ilike.%Igwe%,metadata->>company.ilike.%Igwe%,metadata->>companyName.ilike.%Igwe%,name.ilike.%Lizvett%,firstName.ilike.%Lizvett%,lastName.ilike.%Lizvett%,email.ilike.%Lizvett%')
    .limit(5);

  if (error) {
    console.error('Error fetching contact:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No matching contacts found.');
    return;
  }

  console.log(`Found ${data.length} records.`);
  
  data.forEach(c => {
    console.log('\n---------------------------------------------------');
    console.log('ID:', c.id);
    console.log('Root Fields:');
    console.log('  name:', c.name);
    console.log('  firstName:', c.firstName);
    console.log('  lastName:', c.lastName);
    console.log('  email:', c.email);
    console.log('  phone:', c.phone);
    console.log('Metadata:', JSON.stringify(c.metadata, null, 2));
    console.log('---------------------------------------------------\n');
  });
}

inspectContact();
