// Cron job endpoint for processing automated email sequences
import { cors } from '../_cors';
import SequenceAutomation from './sequence-automation.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify this is a legitimate cron request (add your own verification)
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.CRON_SECRET || 'your-secret-token';
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[Cron] Starting sequence automation processing...');
    
    const automation = new SequenceAutomation();
    await automation.processPendingEmails();
    
    console.log('[Cron] Sequence automation processing completed');
    
    return res.status(200).json({ 
      success: true, 
      message: 'Sequence automation processed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Cron] Sequence automation error:', error);
    return res.status(500).json({ 
      error: 'Failed to process sequence automation', 
      message: error.message 
    });
  }
}
