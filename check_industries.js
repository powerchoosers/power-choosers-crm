
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gfitvnkaevozbcyostez.supabase.co';
const supabaseKey = 'REDACTED_JWT';

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
