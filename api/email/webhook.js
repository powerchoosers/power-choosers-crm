// Vercel API endpoint for email webhooks
import { cors } from '../_cors';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event, trackingId, data } = req.body;

    console.log('[Email] Webhook received:', { event, trackingId, data });

    // Handle different webhook events
    switch (event) {
      case 'email_opened':
        // TODO: Update database with open event
        console.log('[Email] Email opened:', trackingId);
        break;
      case 'email_replied':
        // TODO: Update database with reply event
        console.log('[Email] Email replied:', trackingId);
        break;
      case 'email_bounced':
        // TODO: Update database with bounce event
        console.log('[Email] Email bounced:', trackingId);
        break;
      default:
        console.log('[Email] Unknown webhook event:', event);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[Email] Webhook error:', error);
    return res.status(500).json({ error: 'Failed to process webhook', message: error.message });
  }
}
