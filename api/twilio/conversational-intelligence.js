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
        const { callSid, recordingSid } = req.body;
        
        if (!callSid && !recordingSid) {
            return res.status(400).json({ error: 'Either callSid or recordingSid is required' });
        }
        
        console.log('[Conversational Intelligence] Processing for:', { callSid, recordingSid });
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        let recording = null;
        
        // Get recording if we have callSid
        if (callSid && !recordingSid) {
            const recordings = await client.recordings.list({ callSid: callSid, limit: 1 });
            if (recordings.length === 0) {
                return res.status(404).json({ error: 'No recording found for this call' });
            }
            recording = recordings[0];
        } else if (recordingSid) {
            recording = await client.recordings(recordingSid).fetch();
        }
        
        if (!recording) {
            return res.status(404).json({ error: 'Recording not found' });
        }
        
        console.log('[Conversational Intelligence] Found recording:', recording.sid);
        
        // Check if Conversational Intelligence service is configured
        const serviceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID;
        if (!serviceSid) {
            return res.status(500).json({ 
                error: 'Conversational Intelligence Service not configured',
                message: 'Please set TWILIO_INTELLIGENCE_SERVICE_SID environment variable'
            });
        }
        
        // Check if transcript already exists
        let existingTranscript = null;
        try {
            const transcripts = await client.intelligence.v2.transcripts.list({
                serviceSid: serviceSid,
                sourceSid: recording.sid,
                limit: 1
            });
            
            if (transcripts.length > 0) {
                existingTranscript = transcripts[0];
                console.log('[Conversational Intelligence] Found existing transcript:', existingTranscript.sid);
            }
        } catch (error) {
            console.warn('[Conversational Intelligence] Error checking existing transcripts:', error.message);
        }
        
        let transcript = null;
        // Compute channel participants map (Agent vs Customer) based on call legs
        let agentChannelNum = 1;
        try {
            const callSidForMap = (callSid || recording.callSid || null);
            if (callSidForMap) {
                const callResource = await client.calls(callSidForMap).fetch();
                const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
                const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
                  .split(',').map(norm).filter(Boolean);
                const fromStr = callResource?.from || '';
                const toStr = callResource?.to || '';
                const from10 = norm(fromStr);
                const to10 = norm(toStr);
                const isBiz = (p) => !!p && envBiz.includes(p);
                const fromIsClient = /^client:/i.test(fromStr);
                const fromIsAgent = fromIsClient || isBiz(from10) || (!isBiz(to10) && fromStr && fromStr !== toStr);
                agentChannelNum = fromIsAgent ? 1 : 2;
                console.log('[CI Manual] Agent mapped to channel', agentChannelNum, { from: fromStr, to: toStr });
            }
        } catch (e) {
            console.warn('[CI Manual] Could not compute channel participants map, defaulting agent=1:', e?.message);
        }
        
        // Respect on-demand CI: if CI_AUTO_PROCESS is not enabled and no manual trigger param is provided, do not auto-create
        const autoProcess = String(process.env.CI_AUTO_PROCESS || '').toLowerCase();
        const shouldAutoProcess = autoProcess === '1' || autoProcess === 'true' || autoProcess === 'yes';
        if (!shouldAutoProcess && !req.query?.trigger && !req.body?.trigger) {
            console.log('[CI Manual] CI auto-processing disabled and no trigger flag provided; skipping transcript creation');
            return res.status(202).json({ ok: true, pending: true, reason: 'CI not requested' });
        }

        if (existingTranscript) {
            // Fetch the existing transcript
            transcript = await client.intelligence.v2.transcripts(existingTranscript.sid).fetch();
            console.log('[Conversational Intelligence] Using existing transcript:', transcript.sid);
        } else {
            // Create new Conversational Intelligence transcript
            console.log('[Conversational Intelligence] Creating new transcript...');
            transcript = await client.intelligence.v2.transcripts.create({
                serviceSid: serviceSid,
                channel: {
                    media_properties: {
                        source_sid: recording.sid
                    },
                    participants: [
                        { role: 'Agent', channel_participant: agentChannelNum },
                        { role: 'Customer', channel_participant: agentChannelNum === 1 ? 2 : 1 }
                    ]
                },
                customerKey: callSid || recordingSid // Use callSid as customer key for tracking
            });
            console.log('[Conversational Intelligence] Created new transcript:', transcript.sid);
        }
        
        // Wait for transcript to be processed (if status is queued or in-progress)
        let attempts = 0;
        const maxAttempts = 20; // Wait up to 2 minutes
        
        while (attempts < maxAttempts && ['queued', 'in-progress'].includes(transcript.status)) {
            console.log(`[Conversational Intelligence] Transcript status: ${transcript.status}, waiting...`);
            await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
            
            transcript = await client.intelligence.v2.transcripts(transcript.sid).fetch();
            attempts++;
        }
        
        console.log(`[Conversational Intelligence] Final transcript status: ${transcript.status}`);
        
        // Get transcript sentences if completed
        let transcriptText = '';
        let sentences = [];
        
        if (transcript.status === 'completed') {
            try {
                const sentencesResponse = await client.intelligence.v2
                    .transcripts(transcript.sid)
                    .sentences.list();
                
                sentences = sentencesResponse.map(s => ({
                    text: s.text || '',
                    confidence: s.confidence,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    channel: s.channel
                }));
                
                // If sentences lack channel/speaker entirely, recreate transcript with participants mapping
                try {
                    const lacksDiarization = Array.isArray(sentences) && sentences.length > 0 && sentences.every(s => (s.channel == null && !s.speaker && !s.role));
                    if (lacksDiarization) {
                        console.log('[CI Manual] Sentences missing diarization; recreating with participants mapping...');
                        try { await client.intelligence.v2.transcripts(transcript.sid).remove(); } catch(_) {}
                        const agentChannel = agentChannelNum;
                        const recreated = await client.intelligence.v2.transcripts.create({
                            channel: {
                                media_properties: { source_sid: recording.sid },
                                participants: [
                                    { role: 'Agent', channel_participant: agentChannel },
                                    { role: 'Customer', channel_participant: agentChannel === 1 ? 2 : 1 }
                                ]
                            },
                            serviceSid: serviceSid,
                            customerKey: callSid || recordingSid
                        });
                        // Poll until complete
                        let tries = 0; const maxTries = 10; let status = recreated.status; let tx = recreated;
                        while (tries < maxTries && ['queued','in-progress'].includes((status||'').toLowerCase())){
                            await new Promise(r=>setTimeout(r,6000));
                            tx = await client.intelligence.v2.transcripts(recreated.sid).fetch();
                            status = tx.status; tries++;
                        }
                        if ((status||'').toLowerCase() === 'completed'){
                            const sentencesResponse2 = await client.intelligence.v2
                                .transcripts(tx.sid)
                                .sentences.list();
                            sentences = sentencesResponse2.map(s => ({
                                text: s.text || '',
                                confidence: s.confidence,
                                startTime: s.startTime,
                                endTime: s.endTime,
                                channel: s.channel
                            }));
                            transcript = tx;
                        }
                    }
                } catch(_) {}
                
                // Build speakerTurns from sentences using channel map
                const normCh = (c)=>{ const s=(c==null?'':String(c)).trim(); if(s==='0') return '1'; if(/^[Aa]$/.test(s)) return '1'; if(/^[Bb]$/.test(s)) return '2'; return s; };
                let speakerTurns = [];
                try {
                    const turns = [];
                    for (const s of sentences){
                        const txt = (s.text||'').trim(); if(!txt) continue;
                        const ch = normCh(s.channel);
                        const sp = (s.speaker||s.role||'').toString().toLowerCase();
                        let role = '';
                        if (sp.includes('agent')||sp.includes('rep')) role='agent'; else if (sp.includes('customer')||sp.includes('caller')||sp.includes('client')) role='customer'; else if (ch) role = (String(agentChannelNum)===normCh(ch)) ? 'agent':'customer';
                        const start = Number(s.startTime)||0; const t=Math.max(0,Math.round(start));
                        turns.push({ t, role, text: txt });
                    }
                    speakerTurns = turns;
                } catch(_) {}

                transcriptText = (speakerTurns.length ? speakerTurns.map(x=>x.text).join(' ') : sentences.map(s => s.text || '').filter(text => text.trim()).join(' '));
                console.log(`[Conversational Intelligence] Retrieved ${sentences.length} sentences, transcript length: ${transcriptText.length}`);
                console.log(`[Conversational Intelligence] Sample sentences:`, sentences.slice(0, 3).map(s => ({ text: s.text, confidence: s.confidence })));
                
                // FALLBACK: If Conversational Intelligence transcript is empty, try basic transcription
                if (!transcriptText && recording) {
                    console.log('[Conversational Intelligence] No transcript text found, trying basic transcription fallback...');
                    try {
                        const transcriptions = await client.transcriptions.list({ 
                            recordingSid: recording.sid,
                            limit: 1 
                        });
                        
                        if (transcriptions.length > 0) {
                            const basicTranscription = await client.transcriptions(transcriptions[0].sid).fetch();
                            transcriptText = basicTranscription.transcriptionText || '';
                            console.log(`[Conversational Intelligence] Basic transcription fallback: ${transcriptText.length} characters`);
                        }
                    } catch (fallbackError) {
                        console.warn('[Conversational Intelligence] Basic transcription fallback failed:', fallbackError.message);
                    }
                }
                // Words fallback when sentences lack diarization
                try {
                    const lacksDiarization = Array.isArray(sentences) && sentences.length > 0 && sentences.every(s => (s.channel == null && !s.speaker && !s.role));
                    const noRoles = !speakerTurns.some(t => t.role==='agent' || t.role==='customer');
                    if (lacksDiarization || noRoles) {
                        const words = await client.intelligence.v2.transcripts(transcript.sid).words.list();
                        if (Array.isArray(words) && words.length){
                            const normalizeChannelWord = (c)=>{ const s=(c==null?'':String(c)).trim(); if(s==='0') return '1'; if(/^[Aa]$/.test(s)) return '1'; if(/^[Bb]$/.test(s)) return '2'; return s; };
                            const getText=(w)=> (w && (w.text||w.word||w.value||'')).toString().trim();
                            const segments=[]; let current=null;
                            for (const w of words){
                                const txt=getText(w); if(!txt) continue;
                                const ch = normalizeChannelWord(w.channel ?? w.channelNumber ?? w.channel_id ?? w.channelIndex);
                                let role='';
                                const sp=(w.speaker||w.role||'').toString().toLowerCase();
                                if (sp.includes('agent')||sp.includes('rep')) role='agent'; else if (sp.includes('customer')||sp.includes('caller')||sp.includes('client')) role='customer'; else role = (String(agentChannelNum)===ch)?'agent':'customer';
                                const startW = Number(w.startTime || w.start_time || w.start || 0);
                                const tW = isNaN(startW)?0:startW;
                                const gapOk = !current || (tW - current._lastStart) <= 1.25;
                                if (current && current.role===role && gapOk){ current.text += (current.text?' ':'') + txt; current._lastStart=tW; current.t=Math.round(tW); }
                                else { if (current) segments.push({ t: current.t, role: current.role, text: current.text }); current = { role, t: Math.max(0, Math.round(tW)), text: txt, _lastStart: tW }; }
                            }
                            if (current) segments.push({ t: current.t, role: current.role, text: current.text });
                            if (segments.length){ speakerTurns = segments; transcriptText = segments.map(x=>x.text).join(' '); }
                        }
                    }
                } catch(_) {}

                // Attach turns and channel map to be used by UI
                try { transcript._pcSpeakerTurns = speakerTurns; } catch(_) {}

            } catch (error) {
                console.error('[Conversational Intelligence] Error fetching sentences:', error);
            }
        }
        
        // Get operator results if available
        let operatorResults = null;
        try {
            const resultsResponse = await client.intelligence.v2
                .transcripts(transcript.sid)
                .operatorResults.list();
            
            if (resultsResponse.length > 0) {
                operatorResults = resultsResponse.map(r => ({
                    name: r.name,
                    results: r.results,
                    confidence: r.confidence
                }));
                console.log(`[Conversational Intelligence] Retrieved ${resultsResponse.length} operator results`);
            }
        } catch (error) {
            console.warn('[Conversational Intelligence] No operator results available:', error.message);
        }
        
        // Generate AI insights from the transcript
        let aiInsights = null;
        if (transcriptText) {
            aiInsights = await generateAdvancedAIInsights(transcriptText, sentences, operatorResults);
            // Attach speaker turns if available
            try { if (Array.isArray(transcript._pcSpeakerTurns) && transcript._pcSpeakerTurns.length) aiInsights.speakerTurns = transcript._pcSpeakerTurns; } catch(_) {}
        }
        
        // Update the call data in the central store
        try {
            const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';
            await fetch(`${base}/api/calls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callSid: callSid || recording.callSid,
                    transcript: transcriptText,
                    aiInsights: aiInsights,
                    conversationalIntelligence: {
                        transcriptSid: transcript.sid,
                        status: transcript.status,
                        sentences: sentences,
                        channelRoleMap: { agentChannel: String(agentChannelNum), customerChannel: String(agentChannelNum===1?2:1) },
                        operatorResults: operatorResults,
                        serviceSid: serviceSid
                    }
                })
            }).catch((error) => {
                console.warn('[Conversational Intelligence] Failed posting to /api/calls:', error?.message);
            });
        } catch (e) {
            console.warn('[Conversational Intelligence] Failed posting to /api/calls:', e?.message);
        }
        
        console.log('[Conversational Intelligence] Processing completed');
        
        return res.status(200).json({
            success: true,
            callSid: callSid || recording.callSid,
            transcriptSid: transcript.sid,
            status: transcript.status,
            transcript: transcriptText,
            sentences: sentences,
            operatorResults: operatorResults,
            aiInsights: aiInsights
        });
        
    } catch (error) {
        console.error('[Conversational Intelligence] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to process with Conversational Intelligence',
            details: error.message 
        });
    }
}

async function generateAdvancedAIInsights(transcript, sentences, operatorResults) {
    try {
        const words = transcript.toLowerCase().split(/\s+/);
        const wordCount = words.length;
        
        // Enhanced sentiment analysis
        const positiveWords = ['good', 'great', 'excellent', 'perfect', 'love', 'happy', 'satisfied', 'interested', 'yes', 'sure', 'definitely', 'amazing', 'fantastic', 'wonderful'];
        const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'angry', 'frustrated', 'disappointed', 'no', 'not', 'never', 'problem', 'issue', 'concern', 'worried'];
        
        const positiveCount = words.filter(word => positiveWords.includes(word)).length;
        const negativeCount = words.filter(word => negativeWords.includes(word)).length;
        
        let sentiment = 'Neutral';
        let sentimentScore = 0;
        if (positiveCount > negativeCount) {
            sentiment = 'Positive';
            sentimentScore = (positiveCount - negativeCount) / wordCount;
        } else if (negativeCount > positiveCount) {
            sentiment = 'Negative';
            sentimentScore = -(negativeCount - positiveCount) / wordCount;
        }
        
        // Extract key topics with confidence
        const businessTopics = {
            'price': ['price', 'cost', 'expensive', 'cheap', 'budget', 'afford', 'dollar', 'payment'],
            'contract': ['contract', 'agreement', 'terms', 'conditions', 'sign', 'signature'],
            'timeline': ['timeline', 'schedule', 'deadline', 'when', 'urgent', 'soon', 'quickly', 'time'],
            'energy': ['energy', 'electricity', 'power', 'supplier', 'provider', 'utility', 'kwh', 'kilowatt'],
            'renewal': ['renewal', 'renew', 'expire', 'expiration', 'current', 'existing'],
            'meeting': ['meeting', 'demo', 'presentation', 'call', 'schedule', 'appointment'],
            'proposal': ['proposal', 'quote', 'estimate', 'offer', 'deal', 'package']
        };
        
        const detectedTopics = [];
        for (const [topic, keywords] of Object.entries(businessTopics)) {
            const matches = keywords.filter(keyword => words.includes(keyword));
            if (matches.length > 0) {
                detectedTopics.push({
                    topic: topic,
                    confidence: matches.length / keywords.length,
                    keywords: matches
                });
            }
        }
        
        // Extract next steps
        const nextStepKeywords = ['call', 'email', 'meeting', 'demo', 'proposal', 'quote', 'follow', 'schedule', 'send', 'review', 'next step', 'what happens next'];
        const nextSteps = nextStepKeywords.filter(step => words.includes(step));
        
        // Extract pain points
        const painKeywords = ['problem', 'issue', 'concern', 'worry', 'challenge', 'difficult', 'expensive', 'slow', 'complicated', 'confused'];
        const painPoints = painKeywords.filter(pain => words.includes(pain));
        
        // Check for budget discussion
        const budgetKeywords = ['budget', 'cost', 'price', 'expensive', 'cheap', 'afford', 'money', 'dollar', 'payment', 'investment'];
        const budgetDiscussed = budgetKeywords.some(keyword => words.includes(keyword));
        
        // Check for timeline discussion
        const timelineKeywords = ['when', 'timeline', 'schedule', 'deadline', 'urgent', 'soon', 'quickly', 'time', 'date'];
        const timelineMentioned = timelineKeywords.some(keyword => words.includes(keyword));
        
        // Extract decision makers (simple name detection)
        const decisionMakers = [];
        const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
        const names = transcript.match(namePattern) || [];
        if (names.length > 0) {
            decisionMakers.push(...names.slice(0, 3)); // Limit to 3 names
        }
        
        // Use operator results if available
        let enhancedInsights = {};
        if (operatorResults && operatorResults.length > 0) {
            enhancedInsights = {
                operatorAnalysis: operatorResults,
                confidence: operatorResults.reduce((acc, r) => acc + (r.confidence || 0), 0) / operatorResults.length
            };
        }
        
        return {
            summary: `Advanced AI analysis of ${wordCount}-word conversation. ${sentiment} sentiment detected (${(sentimentScore * 100).toFixed(1)}% confidence). ${detectedTopics.length > 0 ? 'Key topics: ' + detectedTopics.map(t => t.topic).join(', ') : 'General business discussion.'}`,
            sentiment: sentiment,
            sentimentScore: sentimentScore,
            keyTopics: detectedTopics.length > 0 ? detectedTopics : [{ topic: 'General business discussion', confidence: 0.5, keywords: [] }],
            nextSteps: nextSteps.length > 0 ? nextSteps : ['Follow up call'],
            painPoints: painPoints.length > 0 ? painPoints : [],
            budget: budgetDiscussed ? 'Discussed' : 'Not Mentioned',
            timeline: timelineMentioned ? 'Timeline discussed' : 'Not specified',
            decisionMakers: decisionMakers,
            wordCount: wordCount,
            sentenceCount: sentences.length,
            averageConfidence: sentences.length > 0 ? sentences.reduce((acc, s) => acc + (s.confidence || 0), 0) / sentences.length : 0,
            source: 'twilio-conversational-intelligence',
            ...enhancedInsights
        };
        
    } catch (error) {
        console.error('[Conversational Intelligence] Insights generation error:', error);
        return {
            summary: 'Advanced AI analysis completed using Twilio Conversational Intelligence',
            sentiment: 'Neutral',
            keyTopics: [{ topic: 'Call analysis', confidence: 0.5, keywords: [] }],
            nextSteps: ['Follow up'],
            painPoints: [],
            budget: 'Unclear',
            timeline: 'Not specified',
            decisionMakers: [],
            source: 'twilio-conversational-intelligence',
            error: error.message
        };
    }
}

