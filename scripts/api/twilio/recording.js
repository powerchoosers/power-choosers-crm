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

// In-memory call storage (replace with database in production)
const callStore = new Map();

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const {
            RecordingUrl,
            RecordingSid,
            CallSid,
            AccountSid,
            RecordingStatus,
            RecordingDuration
        } = req.body;
        
        console.log('[Recording] Webhook received:', {
            RecordingSid,
            CallSid,
            RecordingStatus,
            RecordingDuration
        });
        
        if (RecordingStatus === 'completed' && RecordingUrl) {
            // Ensure we have a direct mp3 URL for playback
            const recordingMp3Url = RecordingUrl.endsWith('.mp3') ? RecordingUrl : `${RecordingUrl}.mp3`;

            // Store call data in local memory (best-effort)
            const callData = {
                id: CallSid,
                recordingSid: RecordingSid,
                recordingUrl: recordingMp3Url,
                duration: parseInt(RecordingDuration) || 0,
                status: 'completed',
                timestamp: new Date().toISOString(),
                transcript: null,
                aiInsights: null
            };

            callStore.set(CallSid, callData);

            // Upsert into central /api/calls so the UI can see the recording immediately
            try {
                const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';
                await fetch(`${base}/api/calls`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callSid: CallSid,
                        status: 'completed',
                        duration: parseInt(RecordingDuration) || 0,
                        recordingUrl: recordingMp3Url
                    })
                }).catch(() => {});
            } catch (e) {
                console.warn('[Recording] Failed posting initial call data to /api/calls:', e?.message);
            }

            // Trigger Twilio native transcription and AI analysis
            try {
                await processRecordingWithTwilio(recordingMp3Url, CallSid, RecordingSid);
            } catch (error) {
                console.error('[Recording] Processing error:', error);
            }
        }
        
        res.status(200).json({ success: true });
        
    } catch (error) {
        console.error('[Recording] Webhook error:', error);
        res.status(500).json({ 
            error: 'Failed to process recording webhook',
            details: error.message 
        });
    }
}

async function processRecordingWithTwilio(recordingUrl, callSid, recordingSid) {
    try {
        console.log('[Recording] Starting Twilio AI processing for:', callSid);
        
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        let transcript = '';
        let aiInsights = null;
        try {
            const transcriptions = await client.transcriptions.list({ recordingSid, limit: 1 });
            if (transcriptions.length > 0) {
                const t = await client.transcriptions(transcriptions[0].sid).fetch();
                transcript = t.transcriptionText || '';
            } else {
                const newT = await client.transcriptions.create({ recordingSid, languageCode: 'en-US' });
                await new Promise(r => setTimeout(r, 10000));
                const done = await client.transcriptions(newT.sid).fetch();
                transcript = done.transcriptionText || '';
            }
            if (transcript) {
                if (process.env.GEMINI_API_KEY) {
                    try { aiInsights = await generateGeminiAIInsights(transcript); }
                    catch (e) { console.warn('[Recording] Gemini insights failed:', e?.message); aiInsights = await generateTwilioAIInsights(transcript); }
                } else {
                    aiInsights = await generateTwilioAIInsights(transcript);
                }
            }
        } catch (e) {
            console.error('[Recording] Twilio transcription error:', e);
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

        const callData = callStore.get(callSid);
        if (callData) {
            callData.transcript = transcript;
            callData.aiInsights = aiInsights;
            callStore.set(callSid, callData);
        }
        try {
            const base = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm.vercel.app';
            await fetch(`${base}/api/calls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid, transcript, aiInsights })
            }).catch(() => {});
        } catch (e) {
            console.warn('[Recording] Failed posting transcript/insights to /api/calls:', e?.message);
        }
        console.log('[Recording] Twilio AI processing completed for:', callSid);
    } catch (error) {
        console.error('[Recording] Twilio AI processing failed:', error);
    }
}

async function generateTwilioAIInsights(transcript) {
    try {
        const words = transcript.toLowerCase().split(/\s+/);
        const positiveWords = ['good','great','excellent','perfect','love','happy','satisfied','interested','yes','sure','definitely'];
        const negativeWords = ['bad','terrible','awful','hate','angry','frustrated','disappointed','no','not','never','problem'];
        const positiveCount = words.filter(w => positiveWords.includes(w)).length;
        const negativeCount = words.filter(w => negativeWords.includes(w)).length;
        const sentiment = positiveCount > negativeCount ? 'Positive' : negativeCount > positiveCount ? 'Negative' : 'Neutral';
        const businessTopics = ['price','cost','budget','contract','agreement','proposal','quote','timeline','schedule','meeting','demo','trial'];
        const keyTopics = businessTopics.filter(t => words.includes(t));
        const nextStepKeywords = ['call','email','meeting','demo','proposal','quote','follow','schedule','send','review'];
        const nextSteps = nextStepKeywords.filter(k => words.includes(k));
        const painKeywords = ['problem','issue','concern','worry','challenge','difficult','expensive','slow','complicated'];
        const painPoints = painKeywords.filter(k => words.includes(k));
        const budgetDiscussed = ['budget','cost','price','expensive','cheap','afford','money','dollar','payment'].some(k => words.includes(k));
        const timelineMentioned = ['when','timeline','schedule','deadline','urgent','soon','quickly','time'].some(k => words.includes(k));
        return {
            summary: `Call transcript contains ${words.length} words. ${sentiment} sentiment detected.`,
            sentiment,
            keyTopics: keyTopics.length ? keyTopics : ['General business discussion'],
            nextSteps: nextSteps.length ? nextSteps : ['Follow up call'],
            painPoints,
            budget: budgetDiscussed ? 'Discussed' : 'Not Mentioned',
            timeline: timelineMentioned ? 'Timeline discussed' : 'Not specified',
            decisionMakers: []
        };
    } catch (error) {
        console.error('[Twilio AI] Insights generation error:', error);
        return { summary: 'AI analysis completed', sentiment: 'Neutral', keyTopics: ['Call analysis'], nextSteps: ['Follow up'], painPoints: [], budget: 'Unclear', timeline: 'Not specified', decisionMakers: [] };
    }
}

async function generateGeminiAIInsights(transcript) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
    const genAI = new GoogleGenerativeAI(apiKey);
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
    try { return JSON.parse(text.replace(/```json|```/g, '')); }
    catch { return { summary: text.substring(0,300), sentiment: 'Neutral', keyTopics: ['Call analysis'], nextSteps: ['Follow up'], painPoints: [], budget: 'Unclear', timeline: 'Not specified', decisionMakers: [] }; }
}

// Export call store for API access
export { callStore };
