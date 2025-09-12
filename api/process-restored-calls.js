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
        
        console.log('[Process Restored] Starting to process recordings and transcripts...');
        
        // Get all calls that were restored (source: twilio-restore)
        const restoredCallsQuery = await db.collection('calls')
            .where('source', '==', 'twilio-restore')
            .get();
        
        console.log(`[Process Restored] Found ${restoredCallsQuery.size} restored calls to process`);
        
        const processPromises = [];
        let processedCount = 0;
        let recordingsFound = 0;
        let transcriptsFound = 0;
        
        for (const doc of restoredCallsQuery.docs) {
            const callData = doc.data();
            const callSid = callData.twilioSid || callData.id;
            
            try {
                // Get recordings for this call
                const recordings = await client.recordings.list({ callSid: callSid });
                
                let recordingUrl = '';
                let recordingSid = '';
                
                if (recordings.length > 0) {
                    recordingUrl = recordings[0].uri.replace('.json', '.mp3');
                    recordingSid = recordings[0].sid;
                    recordingsFound++;
                    
                    console.log(`[Process Restored] Found recording for ${callSid}: ${recordingSid}`);
                }
                
                // Try to get transcript from Conversational Intelligence
                let transcript = '';
                let aiInsights = null;
                
                try {
                    // Check if there's a Conversational Intelligence transcript
                    const transcripts = await client.intelligence.v2.transcripts.list({
                        customerKey: callSid
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
                            console.log(`[Process Restored] Found transcript for ${callSid}: ${transcript.length} chars`);
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
                                    console.log(`[Process Restored] Found AI insights for ${callSid}`);
                                }
                            }
                        } catch (operatorError) {
                            console.log(`[Process Restored] No operator results for ${callSid}:`, operatorError.message);
                        }
                    }
                } catch (transcriptError) {
                    console.log(`[Process Restored] No CI transcript for ${callSid}:`, transcriptError.message);
                }
                
                // Update the call document with recording and transcript data
                const updateData = {
                    recordingUrl: recordingUrl,
                    recordingSid: recordingSid,
                    audioUrl: recordingUrl,
                    transcript: transcript,
                    aiInsights: aiInsights,
                    aiSummary: aiInsights ? aiInsights.summary : '',
                    updatedAt: new Date().toISOString(),
                    processedAt: new Date().toISOString()
                };
                
                processPromises.push(
                    doc.ref.update(updateData)
                );
                
                processedCount++;
                
            } catch (callError) {
                console.error(`[Process Restored] Error processing call ${callSid}:`, callError);
            }
        }
        
        await Promise.all(processPromises);
        
        console.log(`[Process Restored] Completed processing ${processedCount} calls`);
        console.log(`[Process Restored] Found ${recordingsFound} recordings and ${transcriptsFound} transcripts`);
        
        return res.status(200).json({
            success: true,
            processed: processedCount,
            recordingsFound: recordingsFound,
            transcriptsFound: transcriptsFound,
            message: `Processed ${processedCount} calls, found ${recordingsFound} recordings and ${transcriptsFound} transcripts`
        });
        
    } catch (error) {
        console.error('[Process Restored] Error:', error);
        return res.status(500).json({ 
            error: 'Processing failed', 
            details: error.message 
        });
    }
}
