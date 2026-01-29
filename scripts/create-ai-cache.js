
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../crm-platform/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createAiCacheTable() {
  console.log('Creating ai_cache table...');
  
  const { error } = await supabase.rpc('create_ai_cache_table');
  
  if (error) {
    console.error('Error creating table via RPC (trying direct SQL):', error.message);
    
    // Direct SQL execution is not directly supported via JS client for table creation 
    // without a specific RPC or extension. 
    // However, we can try to insert a dummy record to see if it exists.
    const { error: checkError } = await supabase.from('ai_cache').select('key').limit(1);
    if (checkError && checkError.code === '42P01') {
      console.error('Table ai_cache does not exist and RPC failed. Please create it manually in Supabase SQL Editor:');
      console.log('CREATE TABLE ai_cache (key TEXT PRIMARY KEY, value JSONB, cached_at BIGINT, metadata JSONB);');
      console.log('ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;');
      console.log('CREATE POLICY "Allow all access for service role" ON ai_cache FOR ALL TO service_role USING (true);');
    } else if (checkError) {
      console.error('Unexpected error checking table:', checkError.message);
    } else {
      console.log('Table ai_cache already exists.');
    }
  } else {
    console.log('Table ai_cache created successfully.');
  }
}

createAiCacheTable();
