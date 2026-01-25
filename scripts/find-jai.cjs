
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

async function findJai() {
  console.log('Searching for Guliani...');
  
  // Search by name or email or metadata
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .ilike('name', '%Guliani%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (data.length === 0) {
    console.log('No "Guliani" found in name column. Checking email/metadata...');
    const { data: emailData } = await supabase
      .from('contacts')
      .select('*')
      .ilike('email', '%guliani%');
      
    if (emailData && emailData.length > 0) {
        console.log('Found by email:', JSON.stringify(emailData, null, 2));
    } else {
        console.log('Not found by email either.');
    }
    return;
  }

  console.log('Found Guliani:', JSON.stringify(data, null, 2));
}

findJai();
