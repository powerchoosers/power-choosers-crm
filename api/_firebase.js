// Firebase Admin initialization helper for API routes
// Env vars required:
// - FIREBASE_PROJECT_ID
// - FIREBASE_CLIENT_EMAIL
// - FIREBASE_PRIVATE_KEY (use \n escapes for newlines)

import admin from 'firebase-admin';

let db;

console.log('[Firebase Init] Starting Firebase module loading...');
console.log(`[Firebase Init] process.env.FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET'}`);
console.log(`[Firebase Init] process.env.FIREBASE_CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET'}`);
console.log(`[Firebase Init] process.env.FIREBASE_PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'NOT SET'} (length: ${process.env.FIREBASE_PRIVATE_KEY?.length || 0})`);

try {
  if (!admin.apps || !admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Always convert literal \n to real newlines
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
    const privateKey = rawKey.replace(/\\n/g, '\n');

    console.log('Firebase Env Vars Check:');
    console.log('projectId:', projectId ? 'SET' : 'NOT SET');
    console.log('clientEmail:', clientEmail ? 'SET' : 'NOT SET');
    console.log('privateKey length:', privateKey.length); // Avoid logging raw private key

    if (projectId && clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey
          })
        });
        db = admin.firestore();
        // Use timestamps in snapshots
        db.settings({ ignoreUndefinedProperties: true });
        console.log('[Firebase] Admin initialized successfully!');
      } catch (e) {
        console.error('[Firebase] Failed to initialize Admin with credentials:', e && e.message, e); // Log full error object
        throw e;
      }
    } else {
      console.warn('[Firebase] Missing service account env vars; Firestore disabled for API routes. Check logs above for specific missing vars.');
      console.log('Missing env vars:');
      console.log('projectId:', projectId ? 'SET' : 'NOT SET');
      console.log('clientEmail:', clientEmail ? 'SET' : 'NOT SET');
      console.log('privateKey:', privateKey ? 'SET' : 'NOT SET');
    }
  } else {
    console.log('[Firebase] Admin already initialized. Reusing existing instance.');
    db = admin.firestore();
  }
} catch (e) {
  console.error('[Firebase] Top-level Admin SDK initialization error:', e && e.message, e); // Catch any unexpected errors here
}

export { admin, db };
