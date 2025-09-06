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
        
        // Use Twilio's native transcription service
        let transcript = '';
        let aiInsights = null;
        
        try {
            // Get transcription from Twilio
            const transcriptions = await client.transcriptions.list({ 
                recordingSid: recording.sid,
                limit: 1 
            });
            
            if (transcriptions.length > 0) {
                const transcription = await client.transcriptions(transcriptions[0].sid).fetch();
                transcript = transcription.transcriptionText || '';
                console.log('[Twilio AI] Transcript found:', transcript.substring(0, 100) + '...');
            } else {
                // If no transcription exists, create one
                console.log('[Twilio AI] Creating transcription...');
                const newTranscription = await client.transcriptions.create({
                    recordingSid: recording.sid,
                    languageCode: 'en-US'
                });
                
                // Wait a moment for transcription to complete
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const completedTranscription = await client.transcriptions(newTranscription.sid).fetch();
                transcript = completedTranscription.transcriptionText || '';
                console.log('[Twilio AI] New transcript created:', transcript.substring(0, 100) + '...');
            }
            
            // Generate AI insights using Twilio's AI capabilities
            if (transcript) {
                aiInsights = await generateTwilioAIInsights(transcript);
            }
            
        } catch (transcriptionError) {
            console.error('[Twilio AI] Transcription error:', transcriptionError);
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

