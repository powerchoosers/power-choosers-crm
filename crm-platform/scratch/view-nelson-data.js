const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let supabaseUrl = '';
let serviceRoleKey = '';

try {
  const env = fs.readFileSync('.env.local', 'utf8');
  const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim().replace(/['\"]/g, '');
  if (keyMatch) serviceRoleKey = keyMatch[1].trim().replace(/['\"]/g, '');
} catch (e) {
  console.error('Failed to read env:', e.message);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const { data, error } = await supabase
    .from('accounts')
    .select('name, description, industry, metadata')
    .eq('id', '891b3ee1-d9a4-4d53-a2c9-e38cc46cd154')
    .single();

  if (error) {
    console.error(error.message);
    return;
  }

  console.log('Record:', JSON.stringify(data, null, 2));
}

run();
