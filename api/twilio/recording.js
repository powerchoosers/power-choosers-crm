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

            // Trigger transcription and AI analysis
            try {
                await processRecording(recordingMp3Url, CallSid);
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

async function processRecording(recordingUrl, callSid) {
    try {
        console.log('[Recording] Starting AI processing for:', callSid);
        
        // Use Google Speech-to-Text for transcription
        const transcript = await transcribeAudio(recordingUrl);
        
        // Generate AI insights
        const aiInsights = await generateAIInsights(transcript);
        
        // Update call data
        const callData = callStore.get(callSid);
        if (callData) {
            callData.transcript = transcript;
            callData.aiInsights = aiInsights;
            callStore.set(callSid, callData);
        }
        
        // Also upsert transcript and insights into /api/calls for the UI
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
            console.warn('[Recording] Failed posting transcript/insights to /api/calls:', e?.message);
        }
        
        console.log('[Recording] AI processing completed for:', callSid);
        
    } catch (error) {
        console.error('[Recording] AI processing failed:', error);
    }
}

async function transcribeAudio(recordingUrl) {
    try {
        // 1) Download the recording (mp3) from Twilio using basic auth
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!accountSid || !authToken) {
            console.warn('[Transcribe] Missing Twilio credentials');
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

        if (data.results && data.results.length > 0) {
            return data.results
                .map(result => result.alternatives[0].transcript)
                .join(' ');
        }

        return 'Transcription not available';
        
    } catch (error) {
        console.error('[Transcribe] Error:', error);
        return 'Transcription failed';
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

// Export call store for API access
export { callStore };
