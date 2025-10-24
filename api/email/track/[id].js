// Email open tracking pixel endpoint (Cloud Run API route)
// Returns a 1x1 transparent PNG and (optionally) records an open event

import { db } from '../../_firebase.js';

// 1x1 transparent PNG
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const { id } = req.query || {};
    const trackingId = String(id || '').trim();

    // Always return a pixel, even if id missing
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const referer = req.headers.referer || '';

    // Best-effort: record an open event if Firestore is available and id looks valid
    try {
      if (db && trackingId) {
        const ref = db.collection('emails').doc(trackingId);
        const snap = await ref.get();
        if (snap.exists) {
          const openedAt = new Date().toISOString();
          await ref.set({
            openCount: (snap.data().openCount || 0) + 1,
            opens: (snap.data().opens || []).concat([{ openedAt, userAgent, ip, referer }]),
            updatedAt: openedAt
          }, { merge: true });
        }
      }
    } catch (_) {
      // do not block pixel
    }

    // For email clients and proxies, allow caching to reduce repeat fetches
    const headers = {
      'Content-Type': 'image/png',
      'Content-Length': PIXEL.length,
      'X-Content-Type-Options': 'nosniff',
      // Encourage caching by proxies to avoid repeated re-opens
      'Cache-Control': 'public, max-age=31536000, immutable'
    };

    res.writeHead(200, headers);
    res.end(PIXEL);
  } catch (error) {
    try {
      const headers = {
        'Content-Type': 'image/png',
        'Content-Length': PIXEL.length,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      };
      res.writeHead(200, headers);
      res.end(PIXEL);
    } catch (_) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
