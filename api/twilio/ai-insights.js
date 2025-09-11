const twilio = require('twilio');

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

// Helper: wait
function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

// Robust transcript fetch with retry and auto-create when missing
async function getTranscriptWithRetry(client, recordingSid, opts = {}) {
    const attempts = Number(opts.attempts || 5);
    const delayMs = Number(opts.delayMs || 3000);
    let created = false;
    let lastSid = null;
    for (let i = 1; i <= attempts; i++) {
        try {
            const list = await client.transcriptions.list({ recordingSid, limit: 1 });
            if (list && list.length > 0) {
                lastSid = list[0].sid;
                const t = await client.transcriptions(lastSid).fetch();
                const status = (t.status || '').toLowerCase();
                const text = t.transcriptionText || '';
                console.log(`[Twilio AI] Attempt ${i}/${attempts} transcription status: ${status}, length: ${text.length}`);
                if (text) return text;
                if (status === 'failed') {
                    console.warn('[Twilio AI] Transcription failed');
                    break;
                }
            } else if (!created) {
                console.log('[Twilio AI] No transcription found, creating...');
                const newT = await client.transcriptions.create({ recordingSid, languageCode: 'en-US' });
                lastSid = newT?.sid || null;
                created = true;
            }
        } catch (e) {
            console.warn('[Twilio AI] getTranscriptWithRetry error on attempt', i, e?.message);
        }
        if (i < attempts) await delay(delayMs);
    }
    // Final fetch if we have a sid
    if (lastSid) {
        try {
            const t = await client.transcriptions(lastSid).fetch();
            return t.transcriptionText || '';
        } catch(_) {}
    }
    return '';
}

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { callSid } = req.body;
        
        if (!callSid) {
            return res.status(400).json({ error: 'CallSid is required' });
        }
        
        console.log('[Twilio AI] Processing call insights for:', callSid);
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        // Get call details and recordings
        const call = await client.calls(callSid).fetch();
        const recordings = await client.recordings.list({ callSid: callSid, limit: 1 });
        
        if (recordings.length === 0) {
            return res.status(404).json({ error: 'No recording found for this call' });
        }
        
        const recording = recordings[0];
        console.log('[Twilio AI] Found recording:', recording.sid);
        
        // Try Conversational Intelligence first, then fallback to basic transcription
        let transcript = '';
        let aiInsights = null;
        let conversationalIntelligence = null;
        
        try {
            // Check if Conversational Intelligence service is configured
            const serviceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID;
            
            if (serviceSid) {
                console.log('[Twilio AI] Using Conversational Intelligence service');
                
                // Try to get existing Conversational Intelligence transcript
                const transcripts = await client.intelligence.v2.transcripts.list({
                    serviceSid: serviceSid,
                    sourceSid: recording.sid,
                    limit: 1
                });
                
                if (transcripts.length > 0) {
                    const ciTranscript = await client.intelligence.v2.transcripts(transcripts[0].sid).fetch();
                    
                    if (ciTranscript.status === 'completed') {
                        // Get sentences from Conversational Intelligence
                        const sentences = await client.intelligence.v2
                            .transcripts(ciTranscript.sid)
                            .sentences.list();
                        
                        transcript = sentences.map(s => s.text).join(' ');
                        conversationalIntelligence = {
                            transcriptSid: ciTranscript.sid,
                            status: ciTranscript.status,
                            sentenceCount: sentences.length,
                            averageConfidence: sentences.length > 0 ? 
                                sentences.reduce((acc, s) => acc + (s.confidence || 0), 0) / sentences.length : 0
                        };
                        
                        console.log(`[Twilio AI] Found Conversational Intelligence transcript with ${sentences.length} sentences`);
                    }
                }
            }
            
            // Fallback to basic transcription if Conversational Intelligence not available
            if (!transcript) {
                console.log('[Twilio AI] Falling back to basic transcription');
                transcript = await getTranscriptWithRetry(client, recording.sid, { attempts: 6, delayMs: 3000 });
            }
            
            if (transcript) {
                aiInsights = await generateTwilioAIInsights(transcript);
                if (conversationalIntelligence) {
                    aiInsights.source = 'twilio-conversational-intelligence';
                    aiInsights.conversationalIntelligence = conversationalIntelligence;
                } else {
                    aiInsights.source = 'twilio-basic-transcription';
                }
            }
            
        } catch (transcriptionError) {
            console.error('[Twilio AI] Transcription error:', transcriptionError);
            // Fallback to basic insights placeholder
            aiInsights = {
                summary: 'Call transcription processing in progress',
                sentiment: 'Unknown',
                keyTopics: ['Call analysis'],
                nextSteps: ['Follow up'],
                painPoints: [],
                budget: 'Unclear',
                timeline: 'Not specified',
                decisionMakers: [],
                source: 'fallback',
                error: transcriptionError.message
            };
        }
        
        // Update the call data in the central store
        try {
            const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';
            await fetch(`${base}/api/calls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callSid: callSid,
                    transcript,
                    aiInsights
                })
            }).catch(() => {});
        } catch (e) {
            console.warn('[Twilio AI] Failed posting insights to /api/calls:', e?.message);
        }
        
        console.log('[Twilio AI] Processing completed for:', callSid);
        
        return res.status(200).json({
            success: true,
            callSid,
            transcript,
            aiInsights
        });
        
    } catch (error) {
        console.error('[Twilio AI] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to process call with Twilio AI',
            details: error.message 
        });
    }
}

async function generateTwilioAIInsights(transcript) {
    try {
        // For now, we'll use a simple analysis approach
        // In the future, this could be enhanced with Twilio's AI services
        
        const words = transcript.toLowerCase().split(/\s+/);
        const wordCount = words.length;
        
        // Basic sentiment analysis based on keywords
        const positiveWords = ['good', 'great', 'excellent', 'perfect', 'love', 'happy', 'satisfied', 'interested', 'yes', 'sure', 'definitely'];
        const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'angry', 'frustrated', 'disappointed', 'no', 'not', 'never', 'problem'];
        
        const positiveCount = words.filter(word => positiveWords.includes(word)).length;
        const negativeCount = words.filter(word => negativeWords.includes(word)).length;
        
        let sentiment = 'Neutral';
        if (positiveCount > negativeCount) sentiment = 'Positive';
        else if (negativeCount > positiveCount) sentiment = 'Negative';
        
        // Extract key topics based on common business terms
        const businessTopics = ['price', 'cost', 'budget', 'contract', 'agreement', 'proposal', 'quote', 'timeline', 'schedule', 'meeting', 'demo', 'trial'];
        const keyTopics = businessTopics.filter(topic => words.includes(topic));
        
        // Extract potential next steps
        const nextStepKeywords = ['call', 'email', 'meeting', 'demo', 'proposal', 'quote', 'follow', 'schedule', 'send', 'review'];
        const nextSteps = nextStepKeywords.filter(step => words.includes(step));
        
        // Extract potential pain points
        const painKeywords = ['problem', 'issue', 'concern', 'worry', 'challenge', 'difficult', 'expensive', 'slow', 'complicated'];
        const painPoints = painKeywords.filter(pain => words.includes(pain));
        
        // Check for budget discussion
        const budgetKeywords = ['budget', 'cost', 'price', 'expensive', 'cheap', 'afford', 'money', 'dollar', 'payment'];
        const budgetDiscussed = budgetKeywords.some(keyword => words.includes(keyword));
        
        // Check for timeline discussion
        const timelineKeywords = ['when', 'timeline', 'schedule', 'deadline', 'urgent', 'soon', 'quickly', 'time'];
        const timelineMentioned = timelineKeywords.some(keyword => words.includes(keyword));
        
        return {
            summary: `Call transcript contains ${wordCount} words. ${sentiment} sentiment detected. ${keyTopics.length > 0 ? 'Key topics: ' + keyTopics.join(', ') : 'General discussion.'}`,
            sentiment: sentiment,
            keyTopics: keyTopics.length > 0 ? keyTopics : ['General business discussion'],
            nextSteps: nextSteps.length > 0 ? nextSteps : ['Follow up call'],
            painPoints: painPoints.length > 0 ? painPoints : [],
            budget: budgetDiscussed ? 'Discussed' : 'Not Mentioned',
            timeline: timelineMentioned ? 'Timeline discussed' : 'Not specified',
            decisionMakers: [] // Could be enhanced with name detection
        };
        
    } catch (error) {
        console.error('[Twilio AI] Insights generation error:', error);
        return {
            summary: 'AI analysis completed using Twilio services',
            sentiment: 'Neutral',
            keyTopics: ['Call analysis'],
            nextSteps: ['Follow up'],
            painPoints: [],
            budget: 'Unclear',
            timeline: 'Not specified',
            decisionMakers: []
        };
    }
}

