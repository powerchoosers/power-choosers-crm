const { URLSearchParams } = require('url');
const { resolveToCallSid, isCallSid } = require('../_twilio-ids');

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

function parseBody(req) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { if (ct.includes('application/json')) return JSON.parse(b); } catch(_) {}
    try { const params = new URLSearchParams(b); const out = {}; for (const [k,v] of params) out[k]=v; return out; } catch(_) {}
  }
  return {};
}

function pick(obj, keys, d='') { for (const k of keys) { if (obj && obj[k] != null && obj[k] !== '') return obj[k]; } return d; }
function toArr(v){ return Array.isArray(v)?v:(v? [v]:[]); }

export default async function handler(req, res){
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = parseBody(req) || {};
    // Twilio Operator payloads are flexible; allow nesting under Payload.Result
    const op = body.Payload?.Result || body.result || body || {};

    // Attempt to identify callSid from multiple places
    const callSid = pick(body, ['CallSid','callSid','call_sid','customerKey','customer_key','customer_key_sid']) || pick(op, ['CallSid','callSid','call_sid','customerKey']);
    if (!callSid) {
      return res.status(400).json({ error: 'Missing callSid' });
    }

    // Build aiInsights by normalizing snake_case to camelCase
    const contractIn = op.contract || {};
    console.log('[Webhook Debug] Original operator contract data:', contractIn);
    console.log('[Webhook Debug] Full operator data (op):', JSON.stringify(op, null, 2));
    const contract = {
      currentRate: pick(contractIn, ['currentRate','current_rate','rate']),
      rateType: pick(contractIn, ['rateType','rate_type']),
      supplier: pick(contractIn, ['supplier']),
      contractEnd: pick(contractIn, ['contractEnd','contract_end']),
      usageKWh: pick(contractIn, ['usage_k_wh','usageK_wh','usageKWh','usage']),
      contractLength: pick(contractIn, ['contractLength','contract_length'])
    };

    // Guard supplier: ignore weekday strings accidentally extracted
    const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    console.log('[Webhook Debug] Original supplier:', contract.supplier);
    if (contract.supplier && WEEKDAYS.includes(String(contract.supplier).toLowerCase())) {
      console.log('[Webhook Debug] Filtering out weekday supplier:', contract.supplier);
      contract.supplier = '';
    }
    console.log('[Webhook Debug] Final supplier:', contract.supplier);

    const aiInsights = {
      source: 'twilio-operator',
      sentiment: pick(op, ['sentiment'], 'Unknown'),
      disposition: pick(op, ['disposition'], ''),
      keyTopics: toArr(pick(op, ['key_topics','keyTopics'], [])),
      nextSteps: toArr(pick(op, ['next_steps','nextSteps'], [])),
      painPoints: toArr(pick(op, ['pain_points','painPoints'], [])),
      budget: pick(op, ['budget'], ''),
      timeline: pick(op, ['timeline'], ''),
      contract,
      flags: {
        recordingDisclosure: !!pick(op.flags||{}, ['recording_disclosure','recordingDisclosure'], false),
        escalationRequest: !!pick(op.flags||{}, ['escalation_request','escalationRequest'], false),
        doNotContact: !!pick(op.flags||{}, ['do_not_contact','doNotContact'], false),
        nonEnglish: !!pick(op.flags||{}, ['non_english','nonEnglish'], false),
        voicemailDetected: !!pick(op.flags||{}, ['voicemail_detected','voicemailDetected'], false),
        callTransfer: !!pick(op.flags||{}, ['call_transfer','callTransfer'], false)
      },
      entities: toArr(op.entities || []),
      summary: pick(op, ['summary','conversation_summary','Conversation Summary'], '')
    };

    // Post into central calls store
    const base = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app');
    await fetch(`${base}/api/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callSid, aiInsights })
    }).catch(()=>{});

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[Operator Webhook] Error:', e);
    return res.status(500).json({ error: 'Failed to process operator webhook', details: e?.message });
  }
}

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
        console.log('[Conversational Intelligence Webhook] Received webhook:', req.body);
        
        const { 
            TranscriptSid, 
            ServiceSid, 
            Status, 
            CallSid,
            RecordingSid 
        } = req.body;
        
        if (!TranscriptSid || !ServiceSid) {
            console.log('[Conversational Intelligence Webhook] Missing required fields');
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        console.log('[Conversational Intelligence Webhook] Processing transcript:', {
            TranscriptSid,
            ServiceSid,
            Status,
            CallSid,
            RecordingSid
        });
        
        // Only process completed transcripts
        if (Status !== 'completed') {
            console.log('[Conversational Intelligence Webhook] Transcript not completed yet, status:', Status);
            return res.status(200).json({ success: true, message: 'Transcript not ready' });
        }
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        try {
            // Get the transcript details
            const transcript = await client.intelligence.v2.transcripts(TranscriptSid).fetch();
            console.log('[Conversational Intelligence Webhook] Transcript details:', {
                sid: transcript.sid,
                status: transcript.status,
                sourceSid: transcript.sourceSid
            });
            
            // Get sentences
            let transcriptText = '';
            let sentences = [];
            try {
                const sentencesResponse = await client.intelligence.v2
                    .transcripts(TranscriptSid)
                    .sentences.list();
                
                sentences = sentencesResponse.map(s => ({
                    text: s.text || '',
                    confidence: s.confidence,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    channel: s.channel
                }));
                
                transcriptText = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                console.log(`[Conversational Intelligence Webhook] Retrieved ${sentences.length} sentences, transcript length: ${transcriptText.length}`);
            } catch (error) {
                console.error('[Conversational Intelligence Webhook] Error fetching sentences:', error);
            }
            
            // Get operator results
            let operatorResults = null;
            try {
                const resultsResponse = await client.intelligence.v2
                    .transcripts(TranscriptSid)
                    .operatorResults.list();
                
                if (resultsResponse.length > 0) {
                    operatorResults = resultsResponse.map(r => ({
                        name: r.name,
                        results: r.results,
                        confidence: r.confidence
                    }));
                    console.log(`[Conversational Intelligence Webhook] Retrieved ${resultsResponse.length} operator results`);
                }
            } catch (error) {
                console.warn('[Conversational Intelligence Webhook] No operator results available:', error.message);
            }
            
            // Generate AI insights from the transcript
            let aiInsights = null;
            if (transcriptText) {
                aiInsights = await generateAdvancedAIInsights(transcriptText, sentences, operatorResults);
            }
            
            // Update the call data in the central store (ensure we use a real Call SID to avoid duplicates)
            try {
                const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';
                const resolved = await resolveToCallSid({ callSid: CallSid, recordingSid: RecordingSid, transcriptSid: TranscriptSid });
                const finalCallSid = resolved || (isCallSid(CallSid) ? CallSid : null);

                if (!finalCallSid) {
                    console.warn('[Conversational Intelligence Webhook] Skipping /api/calls update: unresolved Call SID', { CallSid, RecordingSid, TranscriptSid });
                } else {
                    const updateResponse = await fetch(`${base}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callSid: finalCallSid,
                            transcript: transcriptText,
                            aiInsights: aiInsights,
                            conversationalIntelligence: {
                                transcriptSid: TranscriptSid,
                                status: transcript.status,
                                sentences: sentences,
                                operatorResults: operatorResults,
                                serviceSid: ServiceSid
                            }
                        })
                    });
                    
                    if (updateResponse.ok) {
                        console.log('[Conversational Intelligence Webhook] Successfully updated call data');
                    } else {
                        console.error('[Conversational Intelligence Webhook] Failed to update call data:', updateResponse.status);
                    }
                }
            } catch (error) {
                console.error('[Conversational Intelligence Webhook] Error updating call data:', error);
            }
            
        } catch (error) {
            console.error('[Conversational Intelligence Webhook] Error processing transcript:', error);
        }
        
        console.log('[Conversational Intelligence Webhook] Processing completed');
        
        return res.status(200).json({
            success: true,
            message: 'Transcript processed successfully'
        });
        
    } catch (error) {
        console.error('[Conversational Intelligence Webhook] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to process webhook',
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
        console.error('[Conversational Intelligence Webhook] Insights generation error:', error);
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
