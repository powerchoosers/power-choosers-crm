// Firebase Admin initialization helper for API routes
// Env vars required:
// - FIREBASE_PROJECT_ID
// - FIREBASE_CLIENT_EMAIL
// - FIREBASE_PRIVATE_KEY (use \n escapes for newlines)

let admin;
let db;

try {
  admin = require('firebase-admin');

  if (!admin.apps || !admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Support both direct multiline key and \n-escaped single-line
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
    const privateKey = rawKey.includes('\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

    if (projectId && clientEmail && privateKey) {
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

module.exports = { admin, db };
