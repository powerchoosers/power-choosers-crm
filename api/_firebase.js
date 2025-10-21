// Firebase Admin initialization helper for API routes
// Env vars required:
// - FIREBASE_PROJECT_ID
// - FIREBASE_CLIENT_EMAIL
// - FIREBASE_PRIVATE_KEY (use \n escapes for newlines)

import admin from 'firebase-admin';

let db;

try {

  if (!admin.apps || !admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Always convert literal \n to real newlines
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
    const privateKey = rawKey.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey
          })
        });
      } catch (e) {
        console.error('[Firebase] Failed to initialize Admin:', e && e.message);
        throw e;
      }
      db = admin.firestore();
      // Use timestamps in snapshots
      db.settings({ ignoreUndefinedProperties: true });
      console.log('[Firebase] Admin initialized');
    } else {
      console.warn('[Firebase] Missing service account env vars; Firestore disabled for API routes');
    }
  } else {
    db = admin.firestore();
  }
} catch (e) {
  console.warn('[Firebase] Admin SDK not available:', e && e.message);
}

export { admin, db };
