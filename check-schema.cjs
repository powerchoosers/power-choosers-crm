const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function checkSchema() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('SUPABASE_DB_URL not found in .env');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    console.log('Connected to Supabase database\n');

    // Check transmission_assets table
    console.log('=== transmission_assets table ===');
    const transmissionAssets = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'transmission_assets'
      ORDER BY ordinal_position
    `);
    console.table(transmissionAssets.rows);

    // Check users table
    console.log('\n=== users table ===');
    const users = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'users'
      ORDER BY ordinal_position
    `);
    console.table(users.rows);

    // Check constraints
    console.log('\n=== transmission_assets constraints ===');
    const constraints = await client.query(`
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public' 
        AND tc.table_name = 'transmission_assets'
    `);
    console.table(constraints.rows);

    // Sample data check
    console.log('\n=== Sample transmission_assets data (first row) ===');
    const sample = await client.query('SELECT id, name, type, content_json FROM transmission_assets LIMIT 1');
    if (sample.rows.length > 0) {
      console.log('ID:', sample.rows[0].id);
      console.log('Name:', sample.rows[0].name);
      console.log('Type:', sample.rows[0].type);
      console.log('Content JSON keys:', Object.keys(sample.rows[0].content_json || {}));
      if (sample.rows[0].content_json?.blocks) {
        console.log('Blocks count:', sample.rows[0].content_json.blocks.length);
        if (sample.rows[0].content_json.blocks.length > 0) {
          console.log('First block type:', sample.rows[0].content_json.blocks[0].type);
          console.log('First block content type:', typeof sample.rows[0].content_json.blocks[0].content);
        }
      }
    } else {
      console.log('No data found');
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkSchema();
