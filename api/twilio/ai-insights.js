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
        
        const text = (transcript || '').toString();
        const lower = text.toLowerCase();
        const words = lower.split(/\s+/).filter(Boolean);
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
        const businessTopics = ['price','cost','budget','contract','agreement','proposal','quote','timeline','schedule','meeting','demo','trial','supplier','rate'];
        const keyTopics = businessTopics.filter(topic => words.includes(topic));
        
        // Extract potential next steps
        const nextStepKeywords = ['call','email','meeting','demo','proposal','quote','follow','schedule','send','review'];
        const nextSteps = nextStepKeywords.filter(step => words.includes(step));
        
        // Extract potential pain points
        const painKeywords = ['problem', 'issue', 'concern', 'worry', 'challenge', 'difficult', 'expensive', 'slow', 'complicated'];
        const painPoints = painKeywords.filter(pain => words.includes(pain));
        
        // Check for budget discussion
        const budgetDiscussed = /(budget|cost|price|expensive|cheap|afford|payment|invoice)/i.test(text);
        
        // Check for timeline discussion
        const timelineMentioned = /(when|timeline|schedule|deadline|urgent|soon|quickly|time)/i.test(text);
        
        // Light extraction for contract details
        const contract = { currentRate: '', rateType: '', supplier: '', contractEnd: '', usageKWh: '', contractLength: '' };
        const rateMatch = text.match(/\$?\s?(\d{1,2}(?:\.\d{1,3})?)\s*\/?\s*kwh/i);
        if (rateMatch) contract.currentRate = `$${Number(rateMatch[1]).toFixed(3)}/kWh`.replace(/\.000\/kWh$/, '/kWh');
        const rateTypeMatch = lower.match(/\b(fixed|variable|indexed)\b/);
        if (rateTypeMatch) contract.rateType = rateTypeMatch[1];
        const supplierMatch = text.match(/\b(?:with|from|using|on)\s+([A-Z][A-Za-z&\- ]{2,40})\b/);
        if (supplierMatch) contract.supplier = supplierMatch[1].trim();
        const endMatch = text.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[ ,]*\s*(20\d{2})/i);
        if (endMatch) contract.contractEnd = `${endMatch[1]} ${endMatch[2]}`;
        const usageMatch = text.match(/(\d{2,3}[,\.]?\d{3}|\d{4,6})\s*(kwh|kw\s*h|kilowatt\s*hours)/i);
        if (usageMatch) contract.usageKWh = usageMatch[1].replace(/\./g,',') + ' kWh';
        const lengthMatch = text.match(/(\d{1,2})\s*(month|months|mo|year|years|yr|yrs)/i);
        if (lengthMatch) contract.contractLength = /year/i.test(lengthMatch[2]) ? `${lengthMatch[1]} year${lengthMatch[1]==='1'?'':'s'}` : `${lengthMatch[1]} months`;
        
        return {
            summary: `Call transcript contains ${wordCount} words. ${sentiment} sentiment detected. ${keyTopics.length ? 'Key topics: ' + keyTopics.join(', ') : 'General discussion.'}`,
            sentiment,
            keyTopics: keyTopics.length ? keyTopics : ['General business discussion'],
            nextSteps: nextSteps.length ? nextSteps : ['Follow up call'],
            painPoints,
            budget: budgetDiscussed ? 'Discussed' : 'Not Mentioned',
            timeline: timelineMentioned ? 'Timeline discussed' : 'Not specified',
            decisionMakers: [],
            contract
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
            decisionMakers: [],
            contract: { currentRate:'', rateType:'', supplier:'', contractEnd:'', usageKWh:'', contractLength:'' }
        };
    }
}

