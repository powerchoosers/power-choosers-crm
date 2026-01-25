
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verifyFix() {
  const badId = '2XmRJWoFmjEtzpMBjGCc'; // Mangan Inc.

  const { data, error } = await supabase
    .from('contacts')
    .select('*, accounts(name, domain, logo_url)')
    .eq('id', badId)
    .single();

  if (error) {
    console.log('Error:', error);
    return;
  }

  const item = data;
  const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts;
  
  // New Logic
  const fullName = [item.firstName, item.lastName].filter(Boolean).join(' ') 
    || item.name 
    || account?.name 
    || item.metadata?.company 
    || item.metadata?.companyName 
    || item.email 
    || 'Unknown';

  console.log('ID:', item.id);
  console.log('Resolved Name:', fullName);
  console.log('Metadata:', item.metadata);
}

verifyFix();
