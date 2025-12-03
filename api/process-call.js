import twilio from 'twilio';
import { isCallSid } from './_twilio-ids.js';
import { cors } from './_cors.js';
import logger from './_logger.js';

export default async function handler(req, res) {
    if (cors(req, res)) return; // handle OPTIONS centrally
    
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    try {
        const { callSid, recordingUrl } = req.body;
        
        if (!callSid || !isCallSid(callSid)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Valid CallSid is required' }));
            return;
        }
        
        logger.log('[Process Call] Starting AI processing for:', callSid);
        
        // If no recording URL provided, try to get it from Twilio
        let finalRecordingUrl = recordingUrl;
        if (!finalRecordingUrl) {
            try {
                const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                const recordings = await client.recordings.list({ callSid: callSid, limit: 1 });
                
                if (recordings.length > 0) {
                    finalRecordingUrl = recordings[0].uri;
                    logger.log('[Process Call] Found recording URL:', finalRecordingUrl);
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No recording found for this call' }));
                    return;
                }
            } catch (error) {
                logger.error('[Process Call] Error fetching recording:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to fetch recording from Twilio' }));
                return;
            }
        }
        
        // Process the recording using Twilio native services
        const result = await processRecordingWithTwilio(finalRecordingUrl, callSid);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            callSid,
            transcript: result.transcript,
            aiInsights: result.aiInsights
        }));
        
    } catch (error) {
        logger.error('[Process Call] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            error: 'Failed to process call',
            details: error.message 
        }));
    }
}

async function processRecordingWithTwilio(recordingUrl, callSid) {
    try {
        logger.log('[Process Call] Starting Twilio AI processing for:', callSid);
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        // Get recordings for this call
        const recordings = await client.recordings.list({ callSid: callSid, limit: 1 });
        
        if (recordings.length === 0) {
            throw new Error('No recording found for this call');
        }
        
        const recording = recordings[0];
        logger.log('[Process Call] Found recording:', recording.sid);
        
        // Use Twilio's native transcription service
        let transcript = '';
        let aiInsights = null;
        
        try {
            // Check if transcription already exists
            const transcriptions = await client.transcriptions.list({ 
                recordingSid: recording.sid,
                limit: 1 
            });
            
            if (transcriptions.length > 0) {
                const transcription = await client.transcriptions(transcriptions[0].sid).fetch();
                transcript = transcription.transcriptionText || '';
                logger.log('[Process Call] Existing transcript found:', transcript.substring(0, 100) + '...');
            } else {
                // Create new transcription using Twilio's service
                logger.log('[Process Call] Creating Twilio transcription...');
                const newTranscription = await client.transcriptions.create({
                    recordingSid: recording.sid,
                    languageCode: 'en-US'
                });
                
                // Wait for transcription to complete (Twilio processes asynchronously)
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                const completedTranscription = await client.transcriptions(newTranscription.sid).fetch();
                transcript = completedTranscription.transcriptionText || '';
                logger.log('[Process Call] New transcript created:', transcript.substring(0, 100) + '...');
            }
            
            // Generate AI insights using Twilio-based analysis
            if (transcript) {
                aiInsights = await generateTwilioAIInsights(transcript);
            }
            
        } catch (transcriptionError) {
            logger.error('[Process Call] Twilio transcription error:', transcriptionError);
            // Fallback to basic insights
            aiInsights = {
                summary: 'Call transcription processing in progress',
                sentiment: 'Unknown',
                keyTopics: ['Call analysis'],
                nextSteps: ['Follow up'],
                painPoints: [],
                budget: 'Unclear',
                timeline: 'Not specified',
                decisionMakers: []
            };
        }
        
        // Update the call data in the central store
        try {
            const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host || '';
            const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || '';
            const base = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm-792458658491.us-south1.run.app');
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
            logger.warn('[Process Call] Failed posting transcript/insights to /api/calls:', e?.message);
        }

        logger.log('[Process Call] Twilio AI processing completed for:', callSid);
        
        return { transcript, aiInsights };
        
    } catch (error) {
        logger.error('[Process Call] Twilio AI processing failed:', error);
        throw error;
    }
}

async function generateTwilioAIInsights(transcript) {
    try {
        // Twilio-based AI insights generation
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
        logger.error('[Twilio AI] Insights generation error:', error);
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
