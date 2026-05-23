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
    .select('id, name, description, metadata')
    .eq('id', '1e90957f-8a0b-4981-a4e8-e835d6ce6ea0');

  if (error) {
    console.error(error);
    return;
  }

  const acc = data[0];
  console.log('NAME:', acc.name);
  console.log('DESCRIPTION:', acc.description);
  console.log('METADATA:', JSON.stringify(acc.metadata, null, 2));

  // Let's also fetch notes if any
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('*')
    .eq('accountId', acc.id);
  
  if (notesError) {
    console.error(notesError);
  } else {
    console.log('NOTES:', JSON.stringify(notes, null, 2));
  }
}

run();
