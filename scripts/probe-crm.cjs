const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function probeCRM() {
  console.log('--- CRM INTELLIGENCE PROBE ---');
  
  // 1. Check Accounts with upcoming expirations or high usage
  const { data: accounts } = await supabase
    .from('accounts')
    .select('name, industry, electricity_supplier, annual_usage, contract_end_date')
    .limit(5);

  // 2. Check for Contacts with recent activity
  const { data: contacts } = await supabase
    .from('contacts')
    .select('name, title, accountId')
    .limit(5);

  // 3. Check for specific known entities
  const { data: campFire } = await supabase
    .from('accounts')
    .select('name, industry, metadata')
    .ilike('name', 'Camp Fire First Texas')
    .single();

  console.log('\n[SAMPLE ACCOUNTS]');
  console.table(accounts);

  console.log('\n[SAMPLE CONTACTS]');
  console.table(contacts);

  if (campFire) {
    console.log('\n[SPECIFIC ENTITY: CAMP FIRE]');
    console.log('Industry:', campFire.industry);
    // Extract a specific detail from metadata if it exists
    const contactName = campFire.metadata?.general?.primaryContact || 'Unknown';
    console.log('Primary Contact (Metadata):', contactName);
  }
}

probeCRM();
