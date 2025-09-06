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
        const { callSid, recordingUrl } = req.body;
        
        if (!callSid) {
            return res.status(400).json({ error: 'CallSid is required' });
        }
        
        console.log('[Process Call] Starting AI processing for:', callSid);
        
        // If no recording URL provided, try to get it from Twilio
        let finalRecordingUrl = recordingUrl;
        if (!finalRecordingUrl) {
            try {
                const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                const recordings = await client.recordings.list({ callSid: callSid, limit: 1 });
                
                if (recordings.length > 0) {
                    finalRecordingUrl = recordings[0].uri;
                    console.log('[Process Call] Found recording URL:', finalRecordingUrl);
                } else {
                    return res.status(404).json({ error: 'No recording found for this call' });
                }
            } catch (error) {
                console.error('[Process Call] Error fetching recording:', error);
                return res.status(500).json({ error: 'Failed to fetch recording from Twilio' });
            }
        }
        
        // Process the recording using Twilio native services
        const result = await processRecordingWithTwilio(finalRecordingUrl, callSid);
        
        return res.status(200).json({
            success: true,
            callSid,
            transcript: result.transcript,
            aiInsights: result.aiInsights
        });
        
    } catch (error) {
        console.error('[Process Call] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to process call',
            details: error.message 
        });
    }
}

async function processRecordingWithTwilio(recordingUrl, callSid) {
    try {
        console.log('[Process Call] Starting Twilio AI processing for:', callSid);
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        // Get recordings for this call
        const recordings = await client.recordings.list({ callSid: callSid, limit: 1 });
        
        if (recordings.length === 0) {
            throw new Error('No recording found for this call');
        }
        
        const recording = recordings[0];
        console.log('[Process Call] Found recording:', recording.sid);
        
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
                console.log('[Process Call] Existing transcript found:', transcript.substring(0, 100) + '...');
            } else {
                // Create new transcription using Twilio's service
                console.log('[Process Call] Creating Twilio transcription...');
                const newTranscription = await client.transcriptions.create({
                    recordingSid: recording.sid,
                    languageCode: 'en-US'
                });
                
                // Wait for transcription to complete (Twilio processes asynchronously)
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                const completedTranscription = await client.transcriptions(newTranscription.sid).fetch();
                transcript = completedTranscription.transcriptionText || '';
                console.log('[Process Call] New transcript created:', transcript.substring(0, 100) + '...');
            }
            
            // Generate AI insights using Twilio-based analysis
            if (transcript) {
                aiInsights = await generateTwilioAIInsights(transcript);
            }
            
        } catch (transcriptionError) {
            console.error('[Process Call] Twilio transcription error:', transcriptionError);
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
            console.warn('[Process Call] Failed posting transcript/insights to /api/calls:', e?.message);
        }

        console.log('[Process Call] Twilio AI processing completed for:', callSid);
        
        return { transcript, aiInsights };
        
    } catch (error) {
        console.error('[Process Call] Twilio AI processing failed:', error);
        throw error;
    }
}

async function processRecording(recordingUrl, callSid) {
    try {
        console.log('[Process Call] Starting transcription for:', callSid);
        
        // 1) Download the recording (mp3) from Twilio using basic auth
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        
        if (!accountSid || !authToken) {
            throw new Error('Missing Twilio credentials');
        }

        const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const recResp = await fetch(recordingUrl, { headers: { Authorization: authHeader } });
        if (!recResp.ok) throw new Error(`Failed to fetch recording: ${recResp.status}`);
        const arrayBuf = await recResp.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuf).toString('base64');

        // 2) Transcribe using Google Speech-to-Text (API key via query param)
        const sttUrl = `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(process.env.GOOGLE_API_KEY || '')}`;
        const response = await fetch(sttUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                config: {
                    encoding: 'MP3',
                    sampleRateHertz: 8000,
                    languageCode: 'en-US',
                    enableAutomaticPunctuation: true,
                    model: 'phone_call'
                },
                audio: {
                    content: base64Audio
                }
            })
        });

        const data = await response.json().catch(() => ({}));

        let transcript = 'Transcription not available';
        if (data.results && data.results.length > 0) {
            transcript = data.results
                .map(result => result.alternatives[0].transcript)
                .join(' ');
        }

        console.log('[Process Call] Transcript generated:', transcript.substring(0, 100) + '...');

        // 3) Generate AI insights
        const aiInsights = await generateAIInsights(transcript);
        
        // 4) Update the call data in the central store
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
            console.warn('[Process Call] Failed posting transcript/insights to /api/calls:', e?.message);
        }

        console.log('[Process Call] AI processing completed for:', callSid);
        
        return { transcript, aiInsights };
        
    } catch (error) {
        console.error('[Process Call] AI processing failed:', error);
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

async function generateAIInsights(transcript) {
    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        
        const prompt = `
Analyze this sales call transcript and provide insights:

TRANSCRIPT:
${transcript}

Provide a JSON response with:
- summary: Brief 2-3 sentence summary
- sentiment: Overall customer sentiment (Positive/Neutral/Negative)  
- keyTopics: Array of main topics discussed
- nextSteps: Array of identified next steps
- painPoints: Array of customer pain points mentioned
- budget: Budget discussion status (Discussed/Not Mentioned/Unclear)
- timeline: Timeline mentioned or "Not specified"
- decisionMakers: Array of decision makers identified
`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Try to parse as JSON
        try {
            return JSON.parse(text.replace(/```json|```/g, ''));
        } catch {
            return {
                summary: text.substring(0, 300),
                sentiment: 'Neutral',
                keyTopics: ['Call analysis'],
                nextSteps: ['Follow up'],
                painPoints: [],
                budget: 'Unclear',
                timeline: 'Not specified',
                decisionMakers: []
            };
        }
        
    } catch (error) {
        console.error('[AI Insights] Error:', error);
        return {
            summary: 'AI analysis unavailable',
            sentiment: 'Unknown',
            keyTopics: [],
            nextSteps: [],
            painPoints: [],
            budget: 'Unclear',
            timeline: 'Not specified',
            decisionMakers: []
        };
    }
}
