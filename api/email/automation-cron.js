// Cron job endpoint for processing automated email sequences
import SequenceAutomation from './sequence-automation.js';

export default async function handler(req, res) {
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Verify this is a legitimate cron request (add your own verification)
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.CRON_SECRET || 'your-secret-token';
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    console.log('[Cron] Starting sequence automation processing...');
    
    const automation = new SequenceAutomation();
    await automation.processPendingEmails();
    
    console.log('[Cron] Sequence automation processing completed');
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      message: 'Sequence automation processed successfully',
      timestamp: new Date().toISOString()
    }));
    return;

  } catch (error) {
    console.error('[Cron] Sequence automation error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to process sequence automation', 
      message: error.message 
    }));
    return;
  }
}
