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
        
        console.log('[Complete Restore] Starting complete call database cleanup and restore...');
        
        // Step 1: Delete ALL existing calls to start fresh
        const allCallsQuery = await db.collection('calls').get();
        const deletePromises = [];
        
        allCallsQuery.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });
        
        await Promise.all(deletePromises);
        console.log(`[Complete Restore] Deleted ${deletePromises.length} existing calls`);
        
        // Step 2: Get ONLY outbound calls from Twilio (calls you made)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Get outbound calls (calls you made TO others)
        const outboundCalls = await client.calls.list({
            startTimeAfter: thirtyDaysAgo,
            limit: 100,
            // Only get calls that were initiated by your Twilio number
            from: process.env.TWILIO_PHONE_NUMBER
        });
        
        console.log(`[Complete Restore] Found ${outboundCalls.length} outbound calls from Twilio`);
        
        // Step 3: Process each real call with full data
        const restorePromises = [];
        let recordingsFound = 0;
        let transcriptsFound = 0;
        let duplicatesRemoved = 0;
        
        // Track processed calls to avoid duplicates
        const processedCallSids = new Set();
        
        for (const call of outboundCalls) {
            // Skip if we've already processed this call
            if (processedCallSids.has(call.sid)) {
                duplicatesRemoved++;
                continue;
            }
            processedCallSids.add(call.sid);
            
            try {
                // Get recordings for this call
                let recordingUrl = '';
                let recordingSid = '';
                try {
                    const recordings = await client.recordings.list({ callSid: call.sid });
                    if (recordings.length > 0) {
                        recordingUrl = recordings[0].uri.replace('.json', '.mp3');
                        recordingSid = recordings[0].sid;
                        recordingsFound++;
                        console.log(`[Complete Restore] Found recording for ${call.sid}: ${recordingSid}`);
                    }
                } catch (recordingError) {
                    console.log(`[Complete Restore] No recording for call ${call.sid}`);
                }
                
                // Try to get transcript from Conversational Intelligence
                let transcript = '';
                let aiInsights = null;
                
                try {
                    const transcripts = await client.intelligence.v2.transcripts.list({
                        customerKey: call.sid
                    });
                    
                    if (transcripts.length > 0) {
                        const transcriptSid = transcripts[0].sid;
                        
                        // Get sentences
                        const sentences = await client.intelligence.v2
                            .transcripts(transcriptSid)
                            .sentences.list();
                        
                        if (sentences.length > 0) {
                            transcript = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                            transcriptsFound++;
                            console.log(`[Complete Restore] Found transcript for ${call.sid}: ${transcript.length} chars`);
                        }
                        
                        // Get operator results for AI insights
                        try {
                            const operatorResults = await client.intelligence.v2
                                .transcripts(transcriptSid)
                                .operatorResults.list();
                            
                            if (operatorResults.length > 0) {
                                const result = operatorResults[0];
                                if (result.result && result.result.summary) {
                                    aiInsights = {
                                        summary: result.result.summary,
                                        sentiment: result.result.sentiment || 'neutral',
                                        topics: result.result.key_topics || [],
                                        nextSteps: result.result.next_steps || [],
                                        painPoints: result.result.pain_points || [],
                                        budget: result.result.budget || '',
                                        timeline: result.result.timeline || '',
                                        contract: result.result.contract || {},
                                        flags: result.result.flags || {},
                                        entities: result.result.entities || [],
                                        generatedAt: new Date().toISOString()
                                    };
                                    console.log(`[Complete Restore] Found AI insights for ${call.sid}`);
                                }
                            }
                        } catch (operatorError) {
                            console.log(`[Complete Restore] No operator results for ${call.sid}`);
                        }
                    }
                } catch (transcriptError) {
                    console.log(`[Complete Restore] No CI transcript for ${call.sid}`);
                }
                
                // Create clean call document
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
                    transcript: transcript,
                    aiSummary: aiInsights ? aiInsights.summary : '',
                    aiInsights: aiInsights,
                    audioUrl: recordingUrl,
                    recordingUrl: recordingUrl,
                    recordingSid: recordingSid,
                    accountId: null,
                    accountName: null,
                    contactId: null,
                    contactName: null,
                    source: 'twilio-complete-restore',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    processedAt: new Date().toISOString()
                };
                
                // Save to Firestore
                restorePromises.push(
                    db.collection('calls').doc(call.sid).set(callData)
                );
                
            } catch (callError) {
                console.error(`[Complete Restore] Error processing call ${call.sid}:`, callError);
            }
        }
        
        await Promise.all(restorePromises);
        
        // Step 4: Get final count
        const finalSnap = await db.collection('calls').get();
        const finalCount = finalSnap.size;
        
        console.log(`[Complete Restore] Completed complete restore`);
        console.log(`[Complete Restore] Final count: ${finalCount} calls`);
        console.log(`[Complete Restore] Found ${recordingsFound} recordings and ${transcriptsFound} transcripts`);
        console.log(`[Complete Restore] Removed ${duplicatesRemoved} duplicates`);
        
        return res.status(200).json({
            success: true,
            deleted: deletePromises.length,
            restored: restorePromises.length,
            duplicatesRemoved: duplicatesRemoved,
            recordingsFound: recordingsFound,
            transcriptsFound: transcriptsFound,
            totalCalls: finalCount,
            message: `Complete restore: deleted ${deletePromises.length} calls, restored ${restorePromises.length} real outbound calls with ${recordingsFound} recordings and ${transcriptsFound} transcripts`
        });
        
    } catch (error) {
        console.error('[Complete Restore] Error:', error);
        return res.status(500).json({ 
            error: 'Complete restore failed', 
            details: error.message 
        });
    }
}
