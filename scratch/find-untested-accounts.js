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

const testedIds = [
  '7aa3adb1-8806-463b-a87b-13570e43a40f', // ViaTech
  '1070047f-f308-4381-b1e1-d296db5ff6a7', // Ridgway's
  '00fe843c-cd87-491b-a484-4d61dc8d12d3', // McKinney Avenue Transit Authority
  'ac2e86ca-e982-43b8-9522-76a5c68b6b74', // Armstrong Moving & Storage Company
  '62731d74-4cb4-4114-8bda-31087b215c0d', // Teasdale Latin Foods
  '9a16c979-1090-4e42-b9a1-4670afb6e8f6', // Kim's Convenience Stores
  '3e1bfc43-3a1e-48be-9f3f-8940d189777e', // Game Nerdz
  'f458eac3-89d4-40c2-95e7-4fc3101fe690', // Navarro Regional Hospital
  '0081dd8b-be38-4ae4-a9ed-1bf5e4b1472b', // TES - Telecom Electric Supply
  '7380ea11-7b0a-48e3-afa9-4fdac998e498'  // Genesis Women's Shelter & Support
];

async function run() {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, industry, city, state, description')
    .not('id', 'in', `(${testedIds.join(',')})`)
    .limit(15);

  if (error) {
    console.error('Error fetching accounts:', error.message);
    return;
  }

  console.log('\n=================== UNTESTED ACCOUNTS ===================');
  data.forEach((acc, i) => {
    console.log(`${i+1}. Name: ${acc.name} | Industry: ${acc.industry} | Location: ${acc.city || 'N/A'}, ${acc.state || 'N/A'}`);
    console.log(`   Desc: ${acc.description ? acc.description.slice(0, 120) + '...' : 'N/A'}`);
    console.log(`   ID:   ${acc.id}`);
  });
}

run();
