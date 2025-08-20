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
        const { recordingUrl, callSid } = req.body;
        
        if (!recordingUrl) {
            return res.status(400).json({ error: 'Recording URL required' });
        }
        
        console.log('[Transcribe] Processing recording:', recordingUrl);
        
        // Use Google Speech-to-Text API
        const { GoogleAuth } = require('google-auth-library');
        const speech = require('@google-cloud/speech');
        
        // Initialize Google Speech client with API key
        const client = new speech.SpeechClient({
            keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
        });
        
        // Download and transcribe the recording
        const request = {
            audio: {
                uri: recordingUrl
            },
            config: {
                encoding: 'MP3',
                sampleRateHertz: 8000,
                languageCode: 'en-US',
                enableAutomaticPunctuation: true,
                enableWordTimeOffsets: true,
                model: 'phone_call'
            }
        };
        
        const [operation] = await client.longRunningRecognize(request);
        const [response] = await operation.promise();
        
        const transcript = response.results
            .map(result => result.alternatives[0].transcript)
            .join(' ');
        
        console.log('[Transcribe] Transcript generated:', transcript.substring(0, 100) + '...');
        
        // Generate AI insights using Google Gemini
        const aiInsights = await generateAIInsights(transcript);
        
        res.status(200).json({
            success: true,
            transcript,
            aiInsights,
            callSid
        });
        
    } catch (error) {
        console.error('[Transcribe] Error:', error);
        res.status(500).json({ 
            error: 'Failed to transcribe recording',
            details: error.message 
        });
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

Please provide:
1. CALL SUMMARY (2-3 sentences)
2. KEY TOPICS DISCUSSED
3. CUSTOMER SENTIMENT (Positive/Neutral/Negative)
4. NEXT STEPS IDENTIFIED
5. FOLLOW-UP RECOMMENDATIONS
6. PAIN POINTS MENTIONED
7. DECISION MAKERS IDENTIFIED
8. TIMELINE MENTIONED
9. BUDGET DISCUSSED (Yes/No/Unclear)
10. COMPETITIVE MENTIONS

Format as JSON with these exact keys: summary, topics, sentiment, nextSteps, followUp, painPoints, decisionMakers, timeline, budget, competitors.
`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Try to parse as JSON, fallback to structured text
        try {
            return JSON.parse(text);
        } catch {
            return {
                summary: text.substring(0, 500),
                topics: [],
                sentiment: 'Neutral',
                nextSteps: [],
                followUp: [],
                painPoints: [],
                decisionMakers: [],
                timeline: 'Not specified',
                budget: 'Unclear',
                competitors: []
            };
        }
        
    } catch (error) {
        console.error('[AI Insights] Error:', error);
        return {
            summary: 'AI analysis unavailable',
            error: error.message
        };
    }
}
