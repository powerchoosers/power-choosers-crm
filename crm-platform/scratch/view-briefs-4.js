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

const ids = [
  '2ce36fd8-72c6-4cc2-a9fa-098f00cc582f', // Remis America LLC
  '1e90957f-8a0b-4981-a4e8-e835d6ce6ea0'  // Polk Mechanical Company
];

async function run() {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, industry, description, metadata, intelligence_brief_headline, intelligence_brief_detail, intelligence_brief_opener, intelligence_brief_talk_track')
    .in('id', ids);

  if (error) {
    console.error('Error fetching accounts:', error.message);
    return;
  }

  data.forEach((acc) => {
    console.log(`\n=================== ${acc.name} ===================`);
    console.log(`ID:          ${acc.id}`);
    console.log(`Industry:    ${acc.industry}`);
    console.log(`Metadata:    `, JSON.stringify(acc.metadata, null, 2));
    console.log(`Headline:    ${acc.intelligence_brief_headline}`);
    console.log(`Detail:      ${acc.intelligence_brief_detail}`);
    console.log(`Opener:      ${acc.intelligence_brief_opener}`);
    console.log(`Talk Track:  ${acc.intelligence_brief_talk_track}`);
  });
}

run();
