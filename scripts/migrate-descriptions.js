
import { db } from '../api/_firebase.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars from root .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function migrateDescriptions() {
  console.log('Starting migration of short descriptions from Firestore to Supabase...');

  try {
    const accountsSnapshot = await db.collection('accounts').get();
    
    if (accountsSnapshot.empty) {
      console.log('No accounts found in Firestore.');
      return;
    }

    console.log(`Found ${accountsSnapshot.size} accounts in Firestore.`);
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of accountsSnapshot.docs) {
      const data = doc.data();
      const legacyId = doc.id;
      const name = data.name;
      
      // Check for description fields
      const description = data.shortDescription || data.short_desc || data.descriptionShort || data.description;

      if (!description) {
        // console.log(`Skipping ${name} (${legacyId}): No description found.`);
        skippedCount++;
        continue;
      }

      // Try to find matching account in Supabase
      // First try ID match
      let { data: sbAccount, error: fetchError } = await supabase
        .from('accounts')
        .select('id, name, description')
        .eq('id', legacyId)
        .single();

      // If not found by ID, try Name
      if (!sbAccount) {
         ({ data: sbAccount, error: fetchError } = await supabase
          .from('accounts')
          .select('id, name, description')
          .eq('name', name)
          .single());
      }

      if (sbAccount) {
        // Update Supabase
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ description: description })
          .eq('id', sbAccount.id);

        if (updateError) {
          console.error(`Error updating ${name} (${sbAccount.id}):`, updateError.message);
          errorCount++;
        } else {
          console.log(`Updated ${name} (${sbAccount.id}) with description.`);
          updatedCount++;
        }
      } else {
        console.log(`Could not find Supabase account for ${name} (${legacyId})`);
        skippedCount++;
      }
    }

    console.log('Migration complete.');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateDescriptions().then(() => process.exit(0));
