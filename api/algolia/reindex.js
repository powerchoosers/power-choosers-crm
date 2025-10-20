import algoliasearch from 'algoliasearch';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { appId, apiKey, type } = req.body;
    
    if (!appId || !apiKey || !type) {
      return res.status(400).json({ 
        error: 'Missing required parameters: appId, apiKey, and type' 
      });
    }

    if (!['accounts', 'contacts'].includes(type)) {
      return res.status(400).json({ 
        error: 'Type must be either "accounts" or "contacts"' 
      });
    }

    // Initialize Algolia client (server-side)
    const client = algoliasearch(appId, apiKey);
    const index = client.initIndex(type);

    // Get data from Firebase
    const collectionName = type === 'contacts' ? 'people' : type; // Map 'contacts' to 'people' collection
    const snapshot = await getDocs(collection(db, collectionName));
    
    if (snapshot.empty) {
      return res.status(200).json({ 
        success: true, 
        processed: 0,
        total: 0,
        message: `No ${type} found in Firebase`
      });
    }

    // Prepare records for Algolia
    const records = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        objectID: doc.id,
        ...data,
        updatedAt: new Date().toISOString()
      };
    });

    // Batch upload to Algolia
    const batchSize = 100;
    let processed = 0;
    let errors = 0;
    const batches = [];
    
    // Create batches
    for (let i = 0; i < records.length; i += batchSize) {
      batches.push(records.slice(i, i + batchSize));
    }

    // Process batches
    for (let i = 0; i < batches.length; i++) {
      try {
        const batch = batches[i];
        const response = await index.saveObjects(batch);
        processed += batch.length;
        console.log(`Batch ${i + 1}/${batches.length} complete: ${response.objectIDs.length} records indexed`);
      } catch (batchError) {
        console.error(`Error processing batch ${i + 1}:`, batchError);
        errors += batches[i].length;
      }
    }

    // Verify the index was updated
    let verificationCount = 0;
    try {
      const searchResponse = await index.search('');
      verificationCount = searchResponse.nbHits;
    } catch (verifyError) {
      console.warn('Could not verify index count:', verifyError.message);
    }

    res.status(200).json({ 
      success: true, 
      processed,
      errors,
      total: records.length,
      verificationCount,
      message: `Reindex complete! Processed ${processed} ${type}, ${errors} errors`
    });

  } catch (error) {
    console.error('Reindex error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Check server logs for more information'
    });
  }
}
