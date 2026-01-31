
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, 'crm-platform', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) {
    env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectAccounts() {
  console.log("Checking for accounts with 2026 expiration (casting date to text)...");
  
  // Use casting ::text to allow ilike on date columns
  const { data: match2026, error: matchErr } = await supabase
    .from('accounts')
    .select('id, name, contract_end_date, metadata')
    .or('contract_end_date.cast.text.ilike.%2026%,metadata->>contract_end_date.ilike.%2026%,metadata->>contractEndDate.ilike.%2026%')
    .limit(10);

  if (matchErr) {
    console.error("Error matching 2026:", matchErr);
    
    console.log("\nAttempting alternative: search for all and filter in JS...");
    const { data: all, error: allErr } = await supabase
      .from('accounts')
      .select('id, name, contract_end_date, metadata')
      .limit(1000);
      
    if (allErr) {
        console.error("Fetch all error:", allErr);
        return;
    }
    
    const matches = all.filter(r => {
        const d = r.contract_end_date || r.metadata?.contract_end_date || r.metadata?.contractEndDate;
        return d && String(d).includes('2026');
    });
    
    console.log(`\nFound ${matches.length} matches in memory:`);
    matches.slice(0, 10).forEach(m => {
        console.log(`- ${m.name}: ${m.contract_end_date || m.metadata?.contract_end_date || m.metadata?.contractEndDate}`);
    });
  } else {
    console.log(`\nFound ${match2026.length} accounts matching '2026':`);
    match2026.forEach(m => {
      console.log(`- ${m.name}: ${m.contract_end_date || m.metadata?.contract_end_date || m.metadata?.contractEndDate}`);
    });
  }
}

inspectAccounts();
