// Optimized cron job endpoint for processing automated email sequences
import SequenceAutomation from './sequence-automation.js';

export default async function handler(req, res) {
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Verify this is a legitimate cron request
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.CRON_SECRET || 'your-secret-token';
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const startTime = Date.now();
    console.log('[Cron] Starting optimized sequence automation processing...');
    
    const automation = new SequenceAutomation();
    
    // Process with cost optimization
    const result = await automation.processPendingEmailsOptimized();
    
    const executionTime = Date.now() - startTime;
    console.log(`[Cron] Sequence automation completed in ${executionTime}ms. Processed: ${result.processed}, Skipped: ${result.skipped}`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      message: 'Sequence automation processed successfully',
      processed: result.processed,
      skipped: result.skipped,
      executionTime: executionTime,
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


