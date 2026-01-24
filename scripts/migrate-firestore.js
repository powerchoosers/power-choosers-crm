const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

// --- CONFIGURATION ---
// 1. Firebase Setup
// We assume the service account key is available via environment variables
// or you can point to a local file: require('./service-account.json')
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) 
  : null;

// Fallback to checking standard Firebase env vars if full key JSON isn't in one var
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY 
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
  : undefined;

if (!serviceAccount && (!projectId || !clientEmail || !privateKey)) {
  console.error('❌ Missing Firebase Credentials.');
  console.error('Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: serviceAccount 
      ? admin.credential.cert(serviceAccount)
      : admin.credential.cert({ projectId, clientEmail, privateKey })
  });
}
const db = admin.firestore();

// 2. Supabase Setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // MUST be Service Role Key for writing!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase Credentials.');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateCollection(collectionName, tableName, transformFn) {
  console.log(`\n🚀 Starting migration: ${collectionName} -> ${tableName}`);
  
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) {
    console.log(`⚠️ No documents found in ${collectionName}`);
    return;
  }

  console.log(`Found ${snapshot.size} documents. Processing...`);

  const batchSize = 100;
  let batch = [];
  let count = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    try {
      const data = doc.data();
      const transformed = transformFn(doc.id, data);
      
      if (transformed) {
        batch.push(transformed);
      }
    } catch (e) {
      console.error(`Error transforming doc ${doc.id}:`, e.message);
      errors++;
    }

    if (batch.length >= batchSize) {
      const { error } = await supabase.from(tableName).upsert(batch);
      if (error) {
        console.error('Error inserting batch:', error);
        errors += batch.length;
      } else {
        count += batch.length;
        process.stdout.write(`.`);
      }
      batch = [];
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const { error } = await supabase.from(tableName).upsert(batch);
    if (error) {
      console.error('Error inserting final batch:', error);
      errors += batch.length;
    } else {
      count += batch.length;
    }
  }

  console.log(`\n✅ Finished ${tableName}: ${count} inserted, ${errors} errors.`);
}

// --- TRANSFORMERS ---

const transformAccount = (id, data) => ({
  id: id,
  name: data.accountName || data.name || data.company,
  domain: data.domain,
  industry: data.industry,
  status: data.status || 'active',
  employees: parseInt(data.employees) || null,
  revenue: data.revenue,
  address: data.address,
  city: data.city,
  state: data.state,
  zip: data.zipCode || data.zip,
  country: data.country,
  ownerId: data.ownerId,
  createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
  metadata: data // Store everything else in metadata
});

const transformContact = (id, data) => ({
  id: id,
  accountId: data.accountId,
  firstName: data.firstName,
  lastName: data.lastName,
  email: data.email,
  phone: data.phone,
  mobile: data.mobile || data.mobilePhone,
  workPhone: data.workPhone || data.workDirectPhone,
  title: data.title,
  linkedinUrl: data.linkedinUrl || data.linkedin,
  status: data.status || 'active',
  ownerId: data.ownerId,
  createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  metadata: data
});

const transformCall = (id, data) => ({
  id: id,
  callSid: data.callSid,
  from: data.from,
  to: data.to,
  direction: data.direction,
  status: data.status,
  duration: parseInt(data.duration) || 0,
  timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : new Date().toISOString(),
  recordingUrl: data.recordingUrl,
  transcript: data.transcript,
  summary: data.summary,
  aiInsights: data.aiInsights || data.conversationalIntelligence,
  accountId: data.accountId,
  contactId: data.contactId,
  // Note: Embedding migration would need to happen separately if they exist in Firestore
  // or regenerated using Supabase Edge Functions
});

async function run() {
  try {
    await migrateCollection('accounts', 'accounts', transformAccount);
    await migrateCollection('people', 'contacts', transformContact);
    await migrateCollection('calls', 'calls', transformCall);
    
    console.log('\n🎉 Migration Complete!');
  } catch (e) {
    console.error('Fatal Error:', e);
  }
}

run();
