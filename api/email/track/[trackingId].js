// Vercel API endpoint for email tracking pixels
import { cors } from '../../_cors';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { trackingId } = req.query;
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    
    console.log('[Email] Tracking pixel hit:', { trackingId, userAgent, ip });

    // Update database with open event
    const openEvent = {
      trackingId,
      openedAt: new Date().toISOString(),
      userAgent,
      ip
    };

    console.log('[Email] Open event:', openEvent);
    
    // TODO: Update Firebase database here
    // const admin = require('firebase-admin');
    // const emailRef = admin.firestore().collection('emails').doc(trackingId);
    // await emailRef.update({
    //   opens: admin.firestore.FieldValue.arrayUnion(openEvent),
    //   openCount: admin.firestore.FieldValue.increment(1),
    //   lastOpened: openEvent.openedAt,
    //   updatedAt: new Date().toISOString()
    // });

    // Return a 1x1 transparent pixel
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pixel.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.status(200).send(pixel);

  } catch (error) {
    console.error('[Email] Track error:', error);
    return res.status(500).json({ error: 'Failed to track email', message: error.message });
  }
}
