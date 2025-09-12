const twilio = require('twilio');
const { admin, db } = require('./_firebase');

// CORS middleware
function corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
}

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        if (!db) {
            return res.status(500).json({ error: 'Firestore not available' });
        }
        
        console.log('[Cleanup] Starting cleanup and restore process...');
        
        // Step 1: Delete test calls (conversational-intelligence-processing-alternative)
        const testCallsQuery = await db.collection('calls')
            .where('source', '==', 'conversational-intelligence-processing-alternative')
            .get();
        
        const deletePromises = [];
        testCallsQuery.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });
        
        await Promise.all(deletePromises);
        console.log(`[Cleanup] Deleted ${deletePromises.length} test calls`);
        
        // Step 2: Get real calls from Twilio (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const twilioCalls = await client.calls.list({
            startTimeAfter: thirtyDaysAgo,
            limit: 100
        });
        
        console.log(`[Cleanup] Found ${twilioCalls.length} calls in Twilio`);
        
        // Step 3: Process each Twilio call
        const restorePromises = [];
        for (const call of twilioCalls) {
            try {
                // Check if call already exists
                const existingDoc = await db.collection('calls').doc(call.sid).get();
                if (existingDoc.exists) {
                    console.log(`[Cleanup] Call ${call.sid} already exists, skipping`);
                    continue;
                }
                
                // Get recording if available
                let recordingUrl = '';
                let recordingSid = '';
                try {
                    const recordings = await client.recordings.list({ callSid: call.sid });
                    if (recordings.length > 0) {
                        recordingUrl = recordings[0].uri.replace('.json', '.mp3');
                        recordingSid = recordings[0].sid;
                    }
                } catch (recordingError) {
                    console.log(`[Cleanup] No recording for call ${call.sid}`);
                }
                
                // Create call document
                const callData = {
                    id: call.sid,
                    twilioSid: call.sid,
                    callSid: call.sid,
                    to: call.to,
                    from: call.from,
                    status: call.status,
                    duration: Math.floor(call.duration || 0),
                    timestamp: call.dateCreated.toISOString(),
                    callTime: call.dateCreated.toISOString(),
                    durationSec: Math.floor(call.duration || 0),
                    outcome: call.status === 'completed' ? 'Connected' : 
                             call.status === 'no-answer' ? 'No Answer' : 
                             call.status === 'busy' ? 'Busy' : 'Failed',
                    transcript: '',
                    aiSummary: '',
                    aiInsights: null,
                    audioUrl: recordingUrl,
                    recordingUrl: recordingUrl,
                    recordingSid: recordingSid,
                    accountId: null,
                    accountName: null,
                    contactId: null,
                    contactName: null,
                    source: 'twilio-restore',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                // Save to Firestore
                restorePromises.push(
                    db.collection('calls').doc(call.sid).set(callData)
                );
                
            } catch (callError) {
                console.error(`[Cleanup] Error processing call ${call.sid}:`, callError);
            }
        }
        
        await Promise.all(restorePromises);
        console.log(`[Cleanup] Restored ${restorePromises.length} calls from Twilio`);
        
        // Step 4: Get final count
        const finalSnap = await db.collection('calls').get();
        const finalCount = finalSnap.size;
        
        return res.status(200).json({
            success: true,
            deleted: deletePromises.length,
            restored: restorePromises.length,
            totalCalls: finalCount,
            message: `Cleaned up ${deletePromises.length} test calls and restored ${restorePromises.length} real calls from Twilio`
        });
        
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        return res.status(500).json({ 
            error: 'Cleanup failed', 
            details: error.message 
        });
    }
}
