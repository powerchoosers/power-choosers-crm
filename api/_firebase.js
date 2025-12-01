// Firebase Admin initialization helper for API routes
// Env vars required:
// - FIREBASE_PROJECT_ID
// - FIREBASE_CLIENT_EMAIL
// - FIREBASE_PRIVATE_KEY (use \n escapes for newlines)

import dotenv from 'dotenv';
import admin from 'firebase-admin';
import logger from './_logger.js';

// Load environment variables from .env file (for localhost)
dotenv.config();

let db;

// Only log initialization details in development (not production)
const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  logger.log('[Firebase Init] Starting Firebase module loading...');
  logger.log(`[Firebase Init] process.env.FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET'}`);
  logger.log(`[Firebase Init] process.env.FIREBASE_CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET'}`);
  logger.log(`[Firebase Init] process.env.FIREBASE_PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'NOT SET'} (length: ${process.env.FIREBASE_PRIVATE_KEY?.length || 0})`);
}

try {
  if (!admin.apps || !admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Always convert literal \n to real newlines
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
    
    // Remove surrounding quotes if present (dotenv sometimes includes them)
    let cleanedKey = rawKey.trim();
    if ((cleanedKey.startsWith('"') && cleanedKey.endsWith('"')) || 
        (cleanedKey.startsWith("'") && cleanedKey.endsWith("'"))) {
      cleanedKey = cleanedKey.slice(1, -1);
    }
    
    const privateKey = cleanedKey.replace(/\\n/g, '\n');

    // Only log env var checks in development (never log private key details - security risk)
    if (isDev) {
      logger.log('Firebase Env Vars Check:');
      logger.log('projectId:', projectId ? 'SET' : 'NOT SET');
      logger.log('clientEmail:', clientEmail ? 'SET' : 'NOT SET');
      // Private key details removed - security risk if logged
    }

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
        if (isDev) {
          logger.log('[Firebase] Admin initialized successfully!');
        }
      } catch (e) {
        // Always log errors (critical for debugging)
        logger.error('[Firebase] Failed to initialize Admin with credentials:', e && e.message, e);
        throw e;
      }
    } else {
      // Always show warnings (important for production debugging)
      logger.warn('[Firebase] Missing service account env vars; Firestore disabled for API routes.');
      if (isDev) {
        logger.log('Missing env vars:');
        logger.log('projectId:', projectId ? 'SET' : 'NOT SET');
        logger.log('clientEmail:', clientEmail ? 'SET' : 'NOT SET');
        logger.log('privateKey:', privateKey ? 'SET' : 'NOT SET');
      }
    }
  } else {
    if (isDev) {
      logger.log('[Firebase] Admin already initialized. Reusing existing instance.');
    }
    db = admin.firestore();
  }
} catch (e) {
  // Always log errors (critical for debugging)
  logger.error('[Firebase] Top-level Admin SDK initialization error:', e && e.message, e);
}

export { admin, db };
