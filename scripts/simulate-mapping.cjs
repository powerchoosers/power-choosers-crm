
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../crm-platform/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateMapping() {
  // IDs: Igwe, Lizvett, Jai Guliani
  // Note: Jai's ID from search was 0F3wlAA6H7VYj236Kncb (lowercase L?)
  const ids = ['0mr6nDdqYbP26ZNzCmXl', '0rWdaR0wX5FmwBjwQZNw', '0F3wlAA6H7VYj236Kncb'];
  
  console.log(`Fetching test contacts: ${ids.join(', ')}...`);

  const { data, error } = await supabase
    .from('contacts')
    .select('*, accounts(name, domain, logo_url)')
    .in('id', ids);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nTesting mapping logic on ${data.length} records...\n`);

  const mapped = data.map(item => {
    const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts;
    
    // Logic from useContacts.ts (List View & Detail Hook shared logic)
    const fName = item.firstName || item.firstname || item.FirstName || item.metadata?.firstName || item.metadata?.first_name;
    const lName = item.lastName || item.lastname || item.LastName || item.metadata?.lastName || item.metadata?.last_name;

    const fullName = [fName, lName].filter(Boolean).join(' ') 
      || item.name 
      || item.email 
      || item.metadata?.companyName
      || item.metadata?.company
      || account?.name
      || 'Unknown';

    const company = account?.name 
      || item.metadata?.company 
      || item.metadata?.companyName
      || '';

    return {
      id: item.id,
      original_name: item.name,
      original_firstName: item.firstName,
      original_lastName: item.lastName,
      metadata_companyName: item.metadata?.companyName,
      account_name: account?.name,
      
      MAPPED_NAME: fullName,
      MAPPED_COMPANY: company
    };
  });

  mapped.forEach(m => {
    console.log('---------------------------------------------------');
    console.log(`ID: ${m.id}`);
    console.log(`Raw Name: "${m.original_name}" | First: "${m.original_firstName}" | Last: "${m.original_lastName}"`);
    console.log(`Raw Company (Meta): "${m.metadata_companyName}" | Account: "${m.account_name}"`);
    console.log(`RESULT -> Name: "${m.MAPPED_NAME}"`);
    console.log(`RESULT -> Company: "${m.MAPPED_COMPANY}"`);
  });
}

simulateMapping();
