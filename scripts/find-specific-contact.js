
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function findContact() {
  // Try to find by company name in metadata
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .ilike('metadata->>companyName', '%Optimum Life%')
    .limit(1);

  if (data && data.length > 0) {
    console.log('Found by metadata:', data[0]);
    return;
  }

  // Try to find by account name
  const { data: accountData } = await supabase
    .from('accounts')
    .select('id')
    .ilike('name', '%Optimum Life%')
    .single();

  if (accountData) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('accountId', accountData.id)
      .limit(1);
      
    if (contacts && contacts.length > 0) {
      console.log('Found by account:', contacts[0]);
    } else {
      console.log('Found account but no contacts');
    }
  } else {
    console.log('Could not find Optimum Life');
  }
}

findContact();
