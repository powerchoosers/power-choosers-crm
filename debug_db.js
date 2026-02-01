
import 'dotenv/config';
import { supabaseAdmin } from './api/_supabase.js';

async function checkData() {
  try {
    console.log('--- Checking Accounts for 2026 ---');
    const { data: accounts2026, error: err1 } = await supabaseAdmin
      .from('accounts')
      .select('name, contract_end_date, metadata')
      .or('contract_end_date::text.ilike.%2026%,metadata->>contract_end_date.ilike.%2026%,metadata->>contractEndDate.ilike.%2026%');
    
    if (err1) {
      console.error('Error fetching 2026 accounts:', err1);
    } else {
      console.log(`Found ${accounts2026?.length || 0} accounts expiring in 2026:`);
      accounts2026?.forEach(a => console.log(` - ${a.name} (${a.contract_end_date})`));
    }

    console.log('\n--- Checking for Camp Fire First Texas ---');
    const { data: campFire, error: err2 } = await supabaseAdmin
      .from('accounts')
      .select('id, name')
      .ilike('name', '%Camp Fire%');
    
    if (err2) {
      console.error('Error fetching Camp Fire:', err2);
    } else {
      console.log(`Found ${campFire?.length || 0} matches for "Camp Fire":`);
      campFire?.forEach(c => console.log(` - ${c.name} (${c.id})`));
      
      if (campFire && campFire.length > 0) {
        for (const account of campFire) {
          console.log(`\n--- Checking Documents for Account: ${account.name} (${account.id}) ---`);
          const { data: docs, error: err3 } = await supabaseAdmin
            .from('documents')
            .select('*')
            .eq('account_id', account.id);
          
          if (err3) {
            console.error(`Error fetching docs for ${account.name}:`, err3);
          } else {
            console.log(`Found ${docs?.length || 0} documents:`);
            docs?.forEach(d => console.log(` - ${d.name} (Type: ${d.type}, ID: ${d.id})`));
          }
        }
      }
    }
  } catch (error) {
    console.error('Unhandled error in debug script:', error);
  }
}

checkData();
