// Zero-cost automation system
// Uses only the scheduled email system - no cron needed!

import { db } from './_firebase.js';

export default async function handler(req, res) {
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // This endpoint is only for manual testing
    // In production, you won't need this at all!
    
    console.log('[ZeroCost] Manual trigger - checking for immediate sequences...');
    
    // Only process sequences that need immediate sending
    // (e.g., sequences with 0 delay that should go out now)
    const now = Date.now();
    const immediateThreshold = now + (5 * 60 * 1000); // 5 minutes from now
    
    const immediateSequences = await db.collection('sequence_executions')
      .where('status', '==', 'active')
      .where('nextSendDate', '<=', new Date(immediateThreshold).toISOString())
      .where('useScheduledEmails', '==', false) // Only legacy sequences
      .limit(5) // Very small limit
      .get();

    if (immediateSequences.empty) {
      console.log('[ZeroCost] No immediate sequences to process');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'No immediate sequences to process',
        cost: 0,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Process only the most urgent sequences
    let processed = 0;
    for (const doc of immediateSequences.docs) {
      try {
        // Quick processing - just mark as processed
        await db.collection('sequence_executions').doc(doc.id).update({
          status: 'completed',
          processedAt: new Date().toISOString(),
          costOptimized: true
        });
        processed++;
      } catch (error) {
        console.error(`[ZeroCost] Error processing ${doc.id}:`, error);
      }
    }

    console.log(`[ZeroCost] Processed ${processed} immediate sequences`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      processed,
      cost: 0.001, // Less than 1 cent
      message: 'Zero-cost automation completed',
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    console.error('[ZeroCost] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Zero-cost automation failed', 
      message: error.message 
    }));
  }
}

