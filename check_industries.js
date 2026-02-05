/**
 * One-off script: list industries (logistics/warehouse etc). Run with env loaded:
 *   node -r dotenv/config check_industries.js
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env (never commit these).
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Set in .env (do not commit).');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkIndustries() {
  console.log('Searching for Logistics and Warehouse industries...');
  
  const { data, error } = await supabase
    .from('accounts')
    .select('industry')
    .or('industry.ilike.%logistics%,industry.ilike.%warehouse%,industry.ilike.%transport%,industry.ilike.%freight%,industry.ilike.%supply chain%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  const uniqueIndustries = [...new Set(data.map(item => item.industry))].filter(Boolean);
  console.log('\nFound industries in database:');
  uniqueIndustries.sort().forEach(ind => console.log(`- ${ind}`));

  const { data: allData, error: allErr } = await supabase
    .from('accounts')
    .select('industry');
    
  if (!allErr) {
     const counts = allData.reduce((acc, curr) => {
        if (curr.industry) acc[curr.industry] = (acc[curr.industry] || 0) + 1;
        return acc;
     }, {});
     console.log('\nTop 20 industries by record count:');
     Object.entries(counts)
       .sort((a, b) => b[1] - a[1])
       .slice(0, 20)
       .forEach(([ind, count]) => console.log(`- ${ind}: ${count}`));
  }
}

checkIndustries();
