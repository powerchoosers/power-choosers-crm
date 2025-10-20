// Temporary Debug Health Endpoint
// Path: /api/debug/health

import { cors } from '../_cors.js';
const { db } = require('../_firebase');

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS
  if (req.method !== 'GET') {
    res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const env = process.env || {};
    const has = (k) => Boolean(env[k]);

    const envFlags = {
      FIREBASE_PROJECT_ID: has('FIREBASE_PROJECT_ID'),
      FIREBASE_CLIENT_EMAIL: has('FIREBASE_CLIENT_EMAIL'),
      FIREBASE_PRIVATE_KEY: has('FIREBASE_PRIVATE_KEY'),
      GEMINI_API_KEY: has('GEMINI_API_KEY'),
      TWILIO_ACCOUNT_SID: has('TWILIO_ACCOUNT_SID'),
      TWILIO_AUTH_TOKEN: has('TWILIO_AUTH_TOKEN'),
      TWILIO_PHONE_NUMBER: has('TWILIO_PHONE_NUMBER'),
      VERCEL_URL: has('VERCEL_URL')
    };

    let firestore = { enabled: false, lastCalls: [], webhooks: [], error: null };
    try {
      if (db) {
        firestore.enabled = true;
        const snap = await db
          .collection('calls')
          .orderBy('timestamp', 'desc')
          .limit(5)
          .get();
        firestore.lastCalls = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          firestore.lastCalls.push({
            id: d.id || doc.id,
            status: d.status || null,
            duration: d.duration || 0,
            hasRecording: Boolean(d.recordingUrl),
            transcriptLen: (d.transcript || '').length,
            updated: d.timestamp || null
          });
        });

        // Recent webhook hits
        const w = await db
          .collection('twilio_webhooks')
          .orderBy('ts', 'desc')
          .limit(5)
          .get();
        w.forEach((doc) => {
          const d = doc.data() || {};
          firestore.webhooks.push({ type: d.type, event: d.event || null, callSid: d.body?.CallSid || null, status: d.body?.CallStatus || d.body?.RecordingStatus || null, ts: d.ts });
        });
      }
    } catch (e) {
      firestore.error = e?.message || String(e);
    }

    const out = {
      ok: true,
      serverTime: new Date().toISOString(),
      vercelUrl: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null,
      envFlags,
      firestore,
      notes: [
        'GET /api/twilio/status will return 405 by design; Twilio POSTs to that endpoint.',
        'Recording webhook: /api/twilio/recording should be invoked by Twilio with RecordingSid/CallSid.',
        'If lastCalls is empty, either webhooks are not arriving or Firestore is not initialized.'
      ]
    };

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (error) {
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: error?.message || String(error) }));
  }
}
