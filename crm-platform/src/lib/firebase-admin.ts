
import admin from 'firebase-admin';

// Check if firebase-admin is already initialized (to prevent hot-reload errors)
if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Handle private key: it might be double-quoted/escaped in .env files
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
        : undefined;

    if (projectId && clientEmail && privateKey) {
        console.log('[Firebase Admin] Initializing with Project ID:', projectId);
        try {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
            console.log('[Firebase Admin] Initialization successful.');
        } catch (error) {
            console.error('[Firebase Admin] Initialization failed:', error);
        }
    } else {
        console.error('[Firebase Admin] Missing environment variables for initialization.');
        if (!projectId) console.error('- Missing FIREBASE_PROJECT_ID');
        if (!clientEmail) console.error('- Missing FIREBASE_CLIENT_EMAIL');
        if (!privateKey) console.error('- Missing FIREBASE_PRIVATE_KEY');
    }
} else {
    console.log('[Firebase Admin] Already initialized.');
}

export const firebaseAdmin = admin;
