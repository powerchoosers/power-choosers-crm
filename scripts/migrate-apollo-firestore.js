
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// 1. Initialize Firebase
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';

if (!projectId || !clientEmail || !rawKey) {
  console.error('Missing Firebase credentials in .env file');
  process.exit(1);
}

const privateKey = rawKey.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

const db = admin.firestore();

// 2. Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 3. Migration Logic
async function migrateApolloSearches() {
  console.log('Starting migration from Firestore (lusha_cache) to Supabase (apollo_searches)...');
  
  const collectionRef = db.collection('lusha_cache');
  let snapshot;
  try {
    snapshot = await collectionRef.get();
  } catch (error) {
    console.error('Error fetching from Firestore:', error);
    return;
  }

  if (snapshot.empty) {
    console.log('No documents found in lusha_cache.');
    return;
  }

  console.log(`Found ${snapshot.size} documents. Processing...`);

  let successCount = 0;
  let errorCount = 0;
  const batchSize = 50; // Supabase upsert batch size
  let batchData = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const key = doc.id;

    // Prepare payload
    // We store the entire firestore data object into the 'data' JSONB column
    const payload = {
      key: key,
      data: data,
      updated_at: new Date().toISOString()
      // created_at will be default now() if new, or preserved if we map it? 
      // Firestore data might have createdAt, but the table schema has default now().
      // We'll let Supabase handle created_at for new records.
    };

    batchData.push(payload);

    if (batchData.length >= batchSize) {
      await processBatch(batchData);
      successCount += batchData.length; // Approximate, assuming batch succeeds
      batchData = [];
      console.log(`Processed ${successCount}/${snapshot.size}...`);
    }
  }

  // Process remaining
  if (batchData.length > 0) {
    await processBatch(batchData);
    successCount += batchData.length;
  }

  console.log('Migration complete!');
  console.log(`Total documents processed: ${snapshot.size}`);
  console.log(`(See logs for any batch errors)`);
}

async function processBatch(rows) {
  const { error } = await supabase
    .from('apollo_searches')
    .upsert(rows, { onConflict: 'key' });

  if (error) {
    console.error('Error upserting batch:', error);
    // In a real script we might want to retry or log specific failed keys
  }
}

migrateApolloSearches();
