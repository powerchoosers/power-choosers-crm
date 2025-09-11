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
        
        try {
            console.log('[Recording] Webhook headers:', {
                host: req.headers.host,
                'user-agent': req.headers['user-agent'] || '',
                'content-type': req.headers['content-type'] || '',
                'x-twilio-signature': req.headers['x-twilio-signature'] || ''
            });
        } catch(_) {}
        console.log('[Recording] Webhook received:', {
            RecordingSid,
            CallSid,
            RecordingStatus,
            RecordingDuration,
            RecordingUrl: RecordingUrl || '(none)'
        });
        try { console.log('[Recording] Raw body:', JSON.stringify(body).slice(0, 1200)); } catch(_) {}
        
        // If the recording is completed but RecordingUrl is missing, attempt to fetch it by CallSid
        let effectiveRecordingUrl = RecordingUrl || '';
        let effectiveRecordingSid = RecordingSid || '';
        if (RecordingStatus === 'completed' && !effectiveRecordingUrl && CallSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            try {
                const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                const recs = await client.recordings.list({ callSid: CallSid, limit: 1 });
                if (recs && recs.length > 0) {
                    effectiveRecordingSid = recs[0].sid;
                    effectiveRecordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${effectiveRecordingSid}.mp3`;
                    console.log('[Recording] Fetched recording by CallSid:', { effectiveRecordingSid, effectiveRecordingUrl });
                } else {
                    console.log('[Recording] No recordings found via API for CallSid:', CallSid);
                }
            } catch (e) {
                console.warn('[Recording] Failed to fetch recording by CallSid:', e?.message);
            }
        }

        if (RecordingStatus === 'completed' && (effectiveRecordingUrl || RecordingUrl)) {
            // Ensure we have a direct mp3 URL for playback
            const rawUrl = effectiveRecordingUrl || RecordingUrl;
            const recordingMp3Url = rawUrl.endsWith('.mp3') ? rawUrl : `${rawUrl}.mp3`;

            // Store call data in local memory (best-effort)
            const callData = {
                id: CallSid,
                recordingSid: effectiveRecordingSid || RecordingSid,
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
                // Attempt to fetch Call resource so we can include to/from
                let callResource = null;
                if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && CallSid) {
                    try {
                        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                        callResource = await client.calls(CallSid).fetch();
                    } catch (fe) {
                        console.warn('[Recording] Could not fetch Call resource:', fe?.message);
                    }
                }

                // Determine base URL from request headers (works for any deployment domain)
                const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
                const host = req.headers['x-forwarded-host'] || req.headers.host;
                const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
                const base = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm.vercel.app');

                // Derive targetPhone and businessPhone to assist merge on the /api/calls endpoint
                const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
                const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
                  .split(',').map(norm).filter(Boolean);
                const to10 = norm(callResource?.to || '');
                const from10 = norm(callResource?.from || '');
                const isBiz = (p) => !!p && envBiz.includes(p);
                const businessPhone = isBiz(to10) ? callResource?.to : (isBiz(from10) ? callResource?.from : (envBiz[0] || ''));
                const targetPhone = isBiz(to10) && !isBiz(from10) ? from10 : (isBiz(from10) && !isBiz(to10) ? to10 : (to10 || from10));

                await fetch(`${base}/api/calls`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callSid: CallSid,
                        to: callResource?.to || undefined,
                        from: callResource?.from || undefined,
                        status: 'completed',
                        duration: parseInt(RecordingDuration) || parseInt(callResource?.duration, 10) || 0,
                        recordingUrl: recordingMp3Url,
                        source: 'twilio-recording-webhook',
                        targetPhone: targetPhone || undefined,
                        businessPhone: businessPhone || undefined
                    })
                }).catch(() => {});
                console.log('[Recording] Posted initial call data to /api/calls for', CallSid);
            } catch (e) {
                console.warn('[Recording] Failed posting initial call data to /api/calls:', e?.message);
            }

            // Trigger Twilio native transcription and AI analysis
            try {
                await processRecordingWithTwilio(recordingMp3Url, CallSid, effectiveRecordingSid || RecordingSid, base);
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
        
        // Try Conversational Intelligence first, then fallback to basic transcription
        let transcript = '';
        let aiInsights = null;
        let conversationalIntelligence = null;
        
        try {
            // Check if Conversational Intelligence service is configured
            const serviceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID;
            
            if (serviceSid) {
                console.log('[Recording] Using Conversational Intelligence service');
                
                // Try to get existing Conversational Intelligence transcript
                const transcripts = await client.intelligence.v2.transcripts.list({
                    serviceSid: serviceSid,
                    sourceSid: recordingSid,
                    limit: 1
                });
                
                if (transcripts.length > 0) {
                    const ciTranscript = await client.intelligence.v2.transcripts(transcripts[0].sid).fetch();
                    
                    if (ciTranscript.status === 'completed') {
                        // Get sentences from Conversational Intelligence
                        const sentences = await client.intelligence.v2
                            .transcripts(ciTranscript.sid)
                            .sentences.list();
                        
                        transcript = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                        conversationalIntelligence = {
                            transcriptSid: ciTranscript.sid,
                            status: ciTranscript.status,
                            sentenceCount: sentences.length,
                            averageConfidence: sentences.length > 0 ? 
                                sentences.reduce((acc, s) => acc + (s.confidence || 0), 0) / sentences.length : 0
                        };
                        
                        console.log(`[Recording] Found Conversational Intelligence transcript with ${sentences.length} sentences, transcript length: ${transcript.length}`);
                        
                        // FALLBACK: If Conversational Intelligence transcript is empty, try basic transcription
                        if (!transcript) {
                            console.log('[Recording] No Conversational Intelligence transcript text, trying basic transcription fallback...');
                            try {
                                const transcriptions = await client.transcriptions.list({ 
                                    recordingSid: recordingSid,
                                    limit: 1 
                                });
                                
                                if (transcriptions.length > 0) {
                                    const basicTranscription = await client.transcriptions(transcriptions[0].sid).fetch();
                                    transcript = basicTranscription.transcriptionText || '';
                                    console.log(`[Recording] Basic transcription fallback: ${transcript.length} characters`);
                                }
                            } catch (fallbackError) {
                                console.warn('[Recording] Basic transcription fallback failed:', fallbackError.message);
                            }
                        }
                    }
                } else {
                    // Create new Conversational Intelligence transcript
                    console.log('[Recording] Creating new Conversational Intelligence transcript...');
                    const newTranscript = await client.intelligence.v2.transcripts.create({
                        serviceSid: serviceSid,
                        channel: {
                            media_properties: {
                                source_sid: recordingSid
                            }
                        },
                        customerKey: callSid
                    });
                    
                    console.log('[Recording] Created Conversational Intelligence transcript:', newTranscript.sid);
                    
                    // Wait for processing (up to 2 minutes)
                    let attempts = 0;
                    const maxAttempts = 20; // 20 * 6s = 120s
                    while (attempts < maxAttempts && ['queued', 'in-progress'].includes(newTranscript.status)) {
                        await new Promise(r => setTimeout(r, 6000));
                        const updatedTranscript = await client.intelligence.v2.transcripts(newTranscript.sid).fetch();
                        
                        if (updatedTranscript.status === 'completed') {
                            const sentences = await client.intelligence.v2
                                .transcripts(updatedTranscript.sid)
                                .sentences.list();
                            
                            transcript = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                            conversationalIntelligence = {
                                transcriptSid: updatedTranscript.sid,
                                status: updatedTranscript.status,
                                sentenceCount: sentences.length,
                                averageConfidence: sentences.length > 0 ? 
                                    sentences.reduce((acc, s) => acc + (s.confidence || 0), 0) / sentences.length : 0
                            };
                            
                            console.log(`[Recording] Conversational Intelligence transcript completed with ${sentences.length} sentences, transcript length: ${transcript.length}`);
                            break;
                        }
                        
                        attempts++;
                        if (attempts % 5 === 0) console.log(`[Recording] Waiting for Conversational Intelligence... (${attempts*6}s)`);
                    }
                }
            }
            
            // Fallback to basic transcription if Conversational Intelligence not available or failed
            if (!transcript) {
                console.log('[Recording] Falling back to basic transcription');
                
                // Check if transcription already exists
                const transcriptions = await client.transcriptions.list({ 
                    recordingSid: recordingSid,
                    limit: 1 
                });
                
                if (transcriptions.length > 0) {
                    const t = await client.transcriptions(transcriptions[0].sid).fetch();
                    transcript = t.transcriptionText || '';
                    console.log('[Recording] Existing transcript found:', (transcript || '').substring(0, 100) + '...');
                } else {
                    // Create new transcription using Twilio's service
                    console.log('[Recording] Creating Twilio transcription...');
                    const created = await client.transcriptions.create({
                        recordingSid: recordingSid,
                        languageCode: 'en-US'
                    });
                    // Poll for completion up to ~60s
                    let attempts = 0;
                    const maxAttempts = 12; // 12 * 5s = 60s
                    while (attempts < maxAttempts) {
                        await new Promise(r => setTimeout(r, 5000));
                        let t = null;
                        try { t = await client.transcriptions(created.sid).fetch(); } catch(_) {}
                        const text = t?.transcriptionText || '';
                        if (text && text.trim().length > 0) {
                            transcript = text;
                            break;
                        }
                        attempts++;
                        if (attempts % 3 === 0) console.log(`[Recording] Waiting for transcription... (${attempts*5}s)`);
                    }
                    if (transcript) {
                        console.log('[Recording] Transcription ready:', transcript.substring(0, 100) + '...');
                    } else {
                        console.log('[Recording] Transcription not ready within timeout');
                    }
                }
            }
            
            // Generate AI insights: prefer Gemini (if GEMINI_API_KEY set), else heuristic
            if (transcript) {
                if (process.env.GEMINI_API_KEY) {
                    try {
                        aiInsights = await generateGeminiAIInsights(transcript);
                    } catch (e) {
                        console.warn('[Recording] Gemini insights failed, falling back to heuristic:', e?.message);
                        aiInsights = await generateTwilioAIInsights(transcript);
                    }
                } else {
                    aiInsights = await generateTwilioAIInsights(transcript);
                }
                
                // Add Conversational Intelligence metadata if available
                if (conversationalIntelligence) {
                    aiInsights.source = 'twilio-conversational-intelligence';
                    aiInsights.conversationalIntelligence = conversationalIntelligence;
                } else {
                    aiInsights.source = 'twilio-basic-transcription';
                }
            }
            
        } catch (transcriptionError) {
            console.error('[Recording] Twilio transcription error:', transcriptionError);
            // Fallback to basic placeholder insights; Google STT removed
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

        
        
        // Update call data
        const callData = callStore.get(callSid);
        if (callData) {
            callData.transcript = transcript;
            callData.aiInsights = aiInsights;
            callStore.set(callSid, callData);
        }
        
        // Also upsert transcript and insights into /api/calls for the UI
        try {
            const base = process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm.vercel.app';
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

async function generateGeminiAIInsights(transcript) {
    // Uses @google/generative-ai with GEMINI_API_KEY
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
}

// Export call store for API access
export { callStore };
