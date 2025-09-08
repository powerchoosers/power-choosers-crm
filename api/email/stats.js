// Vercel API endpoint for email statistics
import { cors } from '../_cors';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { trackingId } = req.query;
    
    if (!trackingId) {
      return res.status(400).json({ error: 'Missing trackingId parameter' });
    }

    // TODO: Fetch email stats from database
    // For now, return mock data
    const stats = {
      trackingId,
      openCount: 0,
      replyCount: 0,
      lastOpened: null,
      lastReplied: null,
      opens: [],
      replies: []
    };

    return res.status(200).json(stats);

  } catch (error) {
    console.error('[Email] Stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch email stats', message: error.message });
  }
}
