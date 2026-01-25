
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkMapping() {
  const { data, error } = await supabase
    .from('contacts')
    .select('*, accounts(name, domain, logo_url)')
    .limit(5);

  if (error) {
    console.log('Error:', error);
    return;
  }

  const contacts = data.map(item => {
    const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts
    const fullName = [item.firstName, item.lastName].filter(Boolean).join(' ') || item.name || 'Unknown';
    
    return { 
      id: item.id, 
      name: fullName,
      email: item.email || '',
      phone: item.phone || item.mobile || item.workPhone || '',
      company: account?.name || item.metadata?.company || '',
      companyDomain: account?.domain || item.metadata?.domain || '',
      logoUrl: account?.logo_url || '',
      status: item.status || 'Lead',
      lastContact: item.lastContactedAt || item.created_at || new Date().toISOString(),
      accountId: item.accountId || undefined
    }
  });

  console.log('Mapped contacts:', JSON.stringify(contacts, null, 2));
}

checkMapping();
