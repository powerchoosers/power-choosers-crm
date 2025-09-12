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
        
        console.log('[Fix Database] Starting comprehensive call database fix...');
        
        // Step 1: Get all calls from Twilio (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const twilioCalls = await client.calls.list({
            startTimeAfter: thirtyDaysAgo,
            limit: 200
        });
        
        console.log(`[Fix Database] Found ${twilioCalls.length} calls in Twilio`);
        
        // Step 2: Create a map of real calls from Twilio
        const realCallsMap = new Map();
        
        for (const call of twilioCalls) {
            // Only process calls that have recordings (real calls)
            try {
                const recordings = await client.recordings.list({ callSid: call.sid });
                if (recordings.length > 0) {
                    realCallsMap.set(call.sid, {
                        call: call,
                        recording: recordings[0]
                    });
                }
            } catch (error) {
                // Skip calls without recordings
                continue;
            }
        }
        
        console.log(`[Fix Database] Found ${realCallsMap.size} calls with recordings`);
        
        // Step 3: Delete ALL existing calls in database
        const existingCallsQuery = await db.collection('calls').get();
        const deletePromises = [];
        
        existingCallsQuery.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });
        
        await Promise.all(deletePromises);
        console.log(`[Fix Database] Deleted ${deletePromises.length} existing database calls`);
        
        // Step 4: Insert only real calls with recordings
        const insertPromises = [];
        
        for (const [callSid, callData] of realCallsMap) {
            const call = callData.call;
            const recording = callData.recording;
            
            try {
                // Get transcript if available
                let transcript = '';
                let aiInsights = null;
                
                try {
                    const transcripts = await client.intelligence.v2.transcripts.list({
                        customerKey: callSid
                    });
                    
                    if (transcripts.length > 0) {
                        const transcriptSid = transcripts[0].sid;
                        const sentences = await client.intelligence.v2
                            .transcripts(transcriptSid)
                            .sentences.list();
                        
                        if (sentences.length > 0) {
                            transcript = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                        }
                        
                        // Get AI insights
                        try {
                            const operatorResults = await client.intelligence.v2
                                .transcripts(transcriptSid)
                                .operatorResults.list();
                            
                            if (operatorResults.length > 0 && operatorResults[0].result) {
                                const result = operatorResults[0].result;
                                aiInsights = {
                                    summary: result.summary || '',
                                    sentiment: result.sentiment || 'neutral',
                                    topics: result.key_topics || [],
                                    nextSteps: result.next_steps || [],
                                    painPoints: result.pain_points || [],
                                    budget: result.budget || '',
                                    timeline: result.timeline || '',
                                    contract: result.contract || {},
                                    flags: result.flags || {},
                                    entities: result.entities || [],
                                    generatedAt: new Date().toISOString()
                                };
                            }
                        } catch (operatorError) {
                            // No operator results available
                        }
                    }
                } catch (transcriptError) {
                    // No transcript available
                }
                
                // Create clean call document
                const callDocument = {
                    id: callSid,
                    twilioSid: callSid,
                    callSid: callSid,
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
                    transcript: transcript,
                    aiSummary: aiInsights ? aiInsights.summary : '',
                    aiInsights: aiInsights,
                    audioUrl: recording.uri.replace('.json', '.mp3'),
                    recordingUrl: recording.uri.replace('.json', '.mp3'),
                    recordingSid: recording.sid,
                    accountId: null,
                    accountName: null,
                    contactId: null,
                    contactName: null,
                    source: 'twilio-real-calls',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                insertPromises.push(
                    db.collection('calls').doc(callSid).set(callDocument)
                );
                
            } catch (error) {
                console.error(`[Fix Database] Error processing call ${callSid}:`, error);
            }
        }
        
        await Promise.all(insertPromises);
        
        // Step 5: Get final count
        const finalSnap = await db.collection('calls').get();
        const finalCount = finalSnap.size;
        
        console.log(`[Fix Database] Database fix completed`);
        console.log(`[Fix Database] Final count: ${finalCount} real calls with recordings`);
        
        return res.status(200).json({
            success: true,
            deleted: deletePromises.length,
            inserted: insertPromises.length,
            totalCalls: finalCount,
            message: `Database fixed: deleted ${deletePromises.length} calls, inserted ${insertPromises.length} real calls with recordings`
        });
        
    } catch (error) {
        console.error('[Fix Database] Error:', error);
        return res.status(500).json({ 
            error: 'Database fix failed', 
            details: error.message 
        });
    }
}
