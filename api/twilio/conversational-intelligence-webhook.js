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

// Helpers shared by both Operator and CI paths
function normalizeSupplierTokens(s){
  try {
    if (!s) return '';
    let out = String(s);
    out = out.replace(/\bT\s*X\s*U\b/gi, 'TXU');
    out = out.replace(/\bN\s*R\s*G\b/gi, 'NRG');
    out = out.replace(/\bT\s*X\s*you\b/gi, 'TXU');
    return out;
  } catch(_) { return String(s||''); }
}

function canonicalizeSupplierName(s){
  if (!s) return '';
  const raw = normalizeSupplierTokens(s).trim();
  const key = raw.replace(/[^a-z0-9]/gi,'').toLowerCase();
  const map = {
    'txu':'TXU', 'txuenergy':'TXU',
    'nrg':'NRG',
    'reliant':'Reliant', 'reliantenergy':'Reliant',
    'constellation':'Constellation',
    'directenergy':'Direct Energy',
    'greenmountain':'Green Mountain', 'greenmountainenergy':'Green Mountain',
    'cirro':'Cirro',
    'engie':'Engie',
    'shellenergy':'Shell Energy',
    'championenergy':'Champion Energy', 'champion':'Champion Energy',
    'gexa':'Gexa',
    'taraenergy':'Tara Energy', 'apg&e':'APG & E', 'apge':'APG & E',
  };
  return map[key] || raw;
}

function extractContractFromTranscript(text){
  const out = { currentRate: '', rateType: '', supplier: '', contractEnd: '', usageKWh: '', contractLength: '' };
  if (!text) return out;
  const t = normalizeSupplierTokens(String(text));
  // Rate: $0.078/kWh or 0.078 near 'rate'
  try {
    const rateKw = /(rate|price)[^\n\r]{0,30}?([$]?\s*\d{1,2}(?:\.\d{1,3})?\s*(?:cents|¢|\$?\/?\s*kwh))/i;
    const m1 = t.match(rateKw);
    const m2 = t.match(/\b\$?\s*(\d{1,2}\.\d{2,3})\b\s*(?:cents|¢|\/?\s*kwh)/i);
    const val = (m1 && m1[2]) || (m2 && m2[1] ? `$${m2[1]}/kWh` : '');
    if (val) out.currentRate = val.replace(/\s+/g,'').replace(/\$/,'$');
  } catch(_) {}
  // Rate type
  if (/\bfixed\b/i.test(t)) out.rateType = 'fixed';
  else if (/\bvariable\b/i.test(t)) out.rateType = 'variable';
  else if (/\bindex(ed)?\b/i.test(t)) out.rateType = 'indexed';
  // Supplier candidates
  try {
    const supCand = t.match(/\b(?:supplier|utility)\b[^\n\r]{0,30}?([A-Za-z &]+)\b/)?.[1] || '';
    const normalized = canonicalizeSupplierName(supCand);
    const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    if (normalized && !WEEKDAYS.includes(normalized.toLowerCase())) out.supplier = normalized;
  } catch(_) {}
  // Usage
  try {
    const u = t.match(/\b([\d,.]{3,})\s*(kwh|kilowatt\s*hours?)\b/i);
    if (u) {
      const num = u[1].replace(/,/g,'');
      const formatted = Number(num).toLocaleString();
      out.usageKWh = `${formatted} kWh`;
    }
  } catch(_) {}
  // Contract end: month name + day + year (allow spaces in digits)
  try {
    let s = t.replace(/(\d)\s+(\d)/g, '$1$2');
    const m = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-9]{1,2})(?:st|nd|rd|th)?\s*,?\s*(20\d{2})/i);
    if (m) out.contractEnd = `${m[1]} ${m[2]}, ${m[3]}`;
  } catch(_) {}
  // Contract length
  try {
    const cl = t.match(/\b(\d{1,2})\s*(?:year|years|month|months)\b/i);
    if (cl) out.contractLength = `${cl[1]} ${/year/i.test(cl[0]) ? 'years' : 'months'}`;
  } catch(_) {}
  return out;
}

function buildSpeakerTurnsFromSentences(sentences, agentChannelStr){
  const turns = [];
  if (!Array.isArray(sentences) || !sentences.length) return turns;
  const normalizeChannel = (c) => {
    const s = (c == null ? '' : String(c)).trim();
    if (s === '0') return '1';
    if (/^[Aa]$/.test(s)) return '1';
    if (/^[Bb]$/.test(s)) return '2';
    return s;
  };
  const resolveRole = (s) => {
    const sp = (s.speaker || s.role || '').toString().toLowerCase();
    if (sp.includes('agent') || sp.includes('rep')) return 'agent';
    if (sp.includes('customer') || sp.includes('caller') || sp.includes('client')) return 'customer';
    const ch = normalizeChannel(s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex);
    if (ch) return ch === (agentChannelStr || '1') ? 'agent' : 'customer';
    return '';
  };
  let current = null;
  for (const s of sentences){
    const role = resolveRole(s) || 'customer';
    const t = Math.max(0, Math.floor((s.startTime || 0))); // seconds
    const text = s.text || s.transcript || '';
    if (current && current.role === role) {
      current.text += (current.text ? ' ' : '') + text;
      current.t = t;
    } else {
      if (current) turns.push(current);
      current = { role, t, text };
    }
  }
  if (current) turns.push(current);
  return turns;
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
            
            // Compute channel to role mapping for this call (agent vs customer)
            let channelRoleMap = { agentChannel: '1', customerChannel: '2' };
            try {
                let callResource = null;
                try { callResource = await client.calls(CallSid).fetch(); } catch(_) {}
                const fromStr = callResource?.from || '';
                const toStr = callResource?.to || '';
                const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
                const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
                  .split(',').map(norm).filter(Boolean);
                const from10 = norm(fromStr);
                const to10 = norm(toStr);
                const isBiz = (p) => !!p && envBiz.includes(p);
                const fromIsClient = /^client:/i.test(fromStr);
                const fromIsAgent = fromIsClient || isBiz(from10) || (!isBiz(to10) && fromStr && fromStr !== toStr);
                channelRoleMap.agentChannel = fromIsAgent ? '1' : '2';
                channelRoleMap.customerChannel = fromIsAgent ? '2' : '1';
                console.log('[CI Webhook] Channel-role mapping', channelRoleMap, { from: fromStr, to: toStr });
            } catch(e) {
                console.warn('[CI Webhook] Failed to compute channel-role mapping, defaulting:', e?.message);
            }

            // Get sentences
            let transcriptText = '';
            let sentences = [];
            try {
                const sentencesResponse = await client.intelligence.v2
                    .transcripts(TranscriptSid)
                    .sentences.list();
                
                const agentChNum = Number(channelRoleMap.agentChannel || '1');
                sentences = sentencesResponse.map(s => ({
                    text: s.text || '',
                    confidence: s.confidence,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    channel: s.channel,
                    // Map channel to speaker role using computed per-call mapping
                    speaker: Number(s.channel) === agentChNum ? 'Agent' : 'Customer'
                }));
                
                transcriptText = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                
                // Create formatted transcript with speaker labels for better display
                const formattedTranscript = sentences
                    .filter(s => s.text && s.text.trim())
                    .map(s => `${s.speaker}: ${s.text.trim()}`)
                    .join('\n\n');
                
                console.log(`[Conversational Intelligence Webhook] Retrieved ${sentences.length} sentences, transcript length: ${transcriptText.length}`);
                console.log(`[Conversational Intelligence Webhook] Formatted transcript with speaker labels: ${formattedTranscript.length} chars`);
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
                // Add normalized contract fields from transcript if missing or weak
                const contractFromText = extractContractFromTranscript(transcriptText);
                aiInsights.contract = {
                  ...(aiInsights.contract || {}),
                  currentRate: aiInsights.contract?.currentRate || contractFromText.currentRate || '',
                  rateType: aiInsights.contract?.rateType || contractFromText.rateType || '',
                  supplier: canonicalizeSupplierName(aiInsights.contract?.supplier || contractFromText.supplier || ''),
                  contractEnd: aiInsights.contract?.contractEnd || contractFromText.contractEnd || '',
                  usageKWh: aiInsights.contract?.usageKWh || contractFromText.usageKWh || '',
                  contractLength: aiInsights.contract?.contractLength || contractFromText.contractLength || ''
                };
                // Derive grouped speaker turns from sentences when diarization is not present
                if (!Array.isArray(aiInsights.speakerTurns) || !aiInsights.speakerTurns.length) {
                  aiInsights.speakerTurns = buildSpeakerTurnsFromSentences(sentences, channelRoleMap.agentChannel);
                }
                // Also attach CI metadata so the UI can render reliably
                aiInsights.conversationalIntelligence = {
                  transcriptSid: TranscriptSid,
                  status: transcript.status,
                  sentenceCount: Array.isArray(sentences) ? sentences.length : 0,
                  channelRoleMap
                };
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
                            formattedTranscript: formattedTranscript, // Include formatted transcript with speaker labels
                            aiInsights: aiInsights,
                            conversationalIntelligence: {
                                transcriptSid: TranscriptSid,
                                status: transcript.status,
                                sentences: sentences,
                                operatorResults: operatorResults,
                                serviceSid: ServiceSid,
                                speakerMapping: {
                                    channel1: 'Agent',
                                    channel2: 'Customer'
                                },
                                // Provide numeric agent/customer mapping for UI reconstruction
                                channelRoleMap: {
                                    agentChannel: channelRoleMap.agentChannel,
                                    customerChannel: channelRoleMap.customerChannel
                                }
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
