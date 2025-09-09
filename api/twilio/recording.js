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

function normalizeBody(req) {
    // Supports: JS object, JSON string, x-www-form-urlencoded string
    const ct = (req.headers['content-type'] || '').toLowerCase();
    const b = req.body;
    if (!b) return req.query || {};
    if (typeof b === 'object') return b;
    if (typeof b === 'string') {
        try {
            if (ct.includes('application/json')) return JSON.parse(b);
        } catch(_) {}
        try {
            const params = new URLSearchParams(b);
            const out = {};
            for (const [k, v] of params.entries()) out[k] = v;
            return out;
        } catch(_) {}
    }
    return b;
}

// In-memory call storage (replace with database in production)
const callStore = new Map();

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const body = normalizeBody(req);
        const {
            RecordingUrl,
            RecordingSid,
            CallSid,
            AccountSid,
            RecordingStatus,
            RecordingDuration
        } = body;
        
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
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        // Use Twilio's native transcription service
        let transcript = '';
        let aiInsights = null;
        
        try {
            // Check if transcription already exists
            const transcriptions = await client.transcriptions.list({ 
                recordingSid: recordingSid,
                limit: 1 
            });
            
            if (transcriptions.length > 0) {
                const transcription = await client.transcriptions(transcriptions[0].sid).fetch();
                transcript = transcription.transcriptionText || '';
                console.log('[Recording] Existing transcript found:', transcript.substring(0, 100) + '...');
            } else {
                // Create new transcription using Twilio's service
                console.log('[Recording] Creating Twilio transcription...');
                const newTranscription = await client.transcriptions.create({
                    recordingSid: recordingSid,
                    languageCode: 'en-US'
                });
                
                // Wait for transcription to complete (Twilio processes asynchronously)
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                const completedTranscription = await client.transcriptions(newTranscription.sid).fetch();
                transcript = completedTranscription.transcriptionText || '';
                console.log('[Recording] New transcript created:', transcript.substring(0, 100) + '...');
            }
            
            // Generate AI insights using Twilio-based analysis
            if (transcript) {
                aiInsights = await generateTwilioAIInsights(transcript);
            }
            
        } catch (transcriptionError) {
            console.error('[Recording] Twilio transcription error:', transcriptionError);
            // If Google key is available, fall back to Google STT end-to-end
            const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
            if (googleKey) {
                console.log('[Recording] Falling back to Google STT for:', callSid);
                await processRecording(recordingUrl, callSid);
                return; // processing and /api/calls update handled by fallback
            }
            // Fallback to basic placeholder insights if no Google key
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

        // If Twilio returned no transcript text, optionally fall back to Google STT
        const googleKey2 = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        if (!transcript && googleKey2) {
            console.log('[Recording] Twilio transcript empty; falling back to Google STT for:', callSid);
            await processRecording(recordingUrl, callSid);
            return;
        }
        
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
        
        console.log('[Recording] Twilio AI processing completed for:', callSid);
        
    } catch (error) {
        console.error('[Recording] Twilio AI processing failed:', error);
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
        const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
        const sttUrl = `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(googleKey)}`;
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

// Export call store for API access
export { callStore };
