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
      if (db && trackingId && trackingId.length > 0) {
        const ref = db.collection('emails').doc(trackingId);
        const snap = await ref.get();
        if (snap.exists) {
          const openedAt = new Date().toISOString();
          const currentData = snap.data() || {};
          await ref.update({
            openCount: (currentData.openCount || 0) + 1,
            opens: (currentData.opens || []).concat([{ openedAt, userAgent, ip, referer }]),
            updatedAt: openedAt,
            lastOpened: openedAt
          });
        }
      }
    } catch (error) {
      // Log error but don't block pixel - tracking is best-effort
      console.error('[Email Track] Error recording open event:', error.message || error);
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
    // Always return pixel even on error - tracking failures shouldn't break email rendering
    console.error('[Email Track] Unexpected error:', error.message || error);
    try {
      const headers = {
        'Content-Type': 'image/png',
        'Content-Length': PIXEL.length,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      };
      res.writeHead(200, headers);
      res.end(PIXEL);
    } catch (sendError) {
      // Last resort - try to send pixel without headers
      try {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(PIXEL);
      } catch (finalError) {
        // If all else fails, send minimal response
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('');
      }
    }
  }
}
