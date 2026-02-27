import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase...');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSQL() {
  const sql = `
    ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_account_id_fkey;
    ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_contact_id_fkey;

    ALTER TABLE calls
    ADD CONSTRAINT calls_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;

    ALTER TABLE calls
    ADD CONSTRAINT calls_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  `;

  try {
    console.log('⏳ Executing constraint fix...');
    const { data, error } = await supabase.rpc('execute_sql', { sql });

    if (error) throw error;

    console.log('✅ Constraints updated successfully!');
    console.log('\n📋 Result:');
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('❌ Error executing SQL:', err.message);
    process.exit(1);
  }
}

runSQL();
