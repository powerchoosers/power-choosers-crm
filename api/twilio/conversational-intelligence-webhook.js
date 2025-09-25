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
const { db } = require('../_firebase.js');

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
        const _start = Date.now();
        const _ts = new Date().toISOString();
        try { console.log('[CI Webhook] Received at', _ts); } catch(_) {}
        console.log('[Conversational Intelligence Webhook] Received webhook:', req.body);
        
        const { 
            TranscriptSid, 
            ServiceSid, 
            Status, 
            CallSid,
            RecordingSid,
            EventType,
            analysisStatus,
            AccountSid,
            timestamp
        } = req.body;
        
        if (!TranscriptSid || !ServiceSid) {
            console.log('[Conversational Intelligence Webhook] Missing required fields');
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Log full webhook payload for debugging
        console.log('[Conversational Intelligence Webhook] Full webhook payload:', JSON.stringify(req.body, null, 2));
        
        console.log('[Conversational Intelligence Webhook] Processing webhook:', {
            TranscriptSid,
            ServiceSid,
            Status,
            CallSid,
            RecordingSid,
            EventType,
            analysisStatus,
            AccountSid,
            timestamp
        });
        
        // Only process analysis completed events (per Twilio guidance)
        const isAnalysisComplete = EventType === 'analysis_completed' || 
                                 EventType === 'ci.analysis.completed';
        
        if (!isAnalysisComplete) {
            console.log('[Conversational Intelligence Webhook] Not an analysis completion event:', {
                EventType,
                analysisStatus,
                message: 'Waiting for analysis_completed event'
            });
            return res.status(200).json({ success: true, message: 'Not analysis completion event' });
        }
        
        // Validate analysis status
        if (analysisStatus && analysisStatus !== 'completed') {
            console.log('[Conversational Intelligence Webhook] Analysis not completed yet:', {
                EventType,
                analysisStatus,
                message: 'Analysis still in progress'
            });
            return res.status(200).json({ success: true, message: 'Analysis in progress' });
        }
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

        // Gate processing when CI auto-processing is disabled: only handle transcripts we explicitly requested
        try {
            const auto = String(process.env.CI_AUTO_PROCESS || '').toLowerCase();
            const autoEnabled = auto === '1' || auto === 'true' || auto === 'yes';
            if (!autoEnabled) {
                let allowed = false;
                let callSidFromCustomerKey = '';
                try {
                    const t = await client.intelligence.v2.transcripts(TranscriptSid).fetch();
                    callSidFromCustomerKey = t?.customerKey || '';
                } catch(_) {}
                if (db && callSidFromCustomerKey) {
                    try {
                        const snap = await db.collection('calls').doc(callSidFromCustomerKey).get();
                        if (snap.exists) {
                            const data = snap.data() || {};
                            // Only allow if this call explicitly requested CI
                            if (data.ciRequested === true) {
                                allowed = true;
                            }
                        }
                    } catch(_) {}
                }
                if (!allowed) {
                    console.log('[CI Webhook] CI auto-process disabled; ignoring transcript not explicitly requested', { TranscriptSid, callSidFromCustomerKey });
                    return res.status(202).json({ success: true, gated: true });
                }
            }
        } catch(_) {}

        // Defer heavy work: queue background fetch and ACK fast to avoid webhook retries/timeouts
        try {
            const base = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app');
            const payload = { transcriptSid: TranscriptSid, callSid: isCallSid(CallSid) ? CallSid : '' };
            // Fire-and-forget; do not await
            fetch(`${base}/api/twilio/poll-ci-analysis`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            }).then(()=>{ try { console.log('[CI Webhook] Queued background poll for', TranscriptSid); } catch(_) {} })
              .catch((e)=>{ try { console.warn('[CI Webhook] Background poll queue failed:', e?.message||e); } catch(_) {} });
        } catch (e) { try { console.warn('[CI Webhook] Queue error:', e?.message||e); } catch(_) {} }
        const _elapsed = Date.now() - _start;
        try { console.log('[CI Webhook] ACK 200 queued in', _elapsed + 'ms', 'for', TranscriptSid); } catch(_) {}
        return res.status(200).json({ success: true, queued: true, transcriptSid: TranscriptSid, elapsedMs: _elapsed });
        
        try {
            // Get the transcript details and validate CI analysis status
            const transcript = await client.intelligence.v2.transcripts(TranscriptSid).fetch();
            console.log('[Conversational Intelligence Webhook] Transcript details:', {
                sid: transcript.sid,
                status: transcript.status,
                sourceSid: transcript.sourceSid,
                analysisStatus: transcript.analysisStatus || 'unknown',
                // Log additional CI fields for debugging
                ciStatus: transcript.ciStatus || 'unknown',
                processingStatus: transcript.processingStatus || 'unknown'
            });
            
            // Double-check that CI analysis is actually completed (per Twilio guidance)
            if (transcript.analysisStatus && transcript.analysisStatus !== 'completed') {
                if (transcript.analysisStatus === 'failed') {
                    console.error('[Conversational Intelligence Webhook] CI analysis failed:', {
                        transcriptStatus: transcript.status,
                        analysisStatus: transcript.analysisStatus,
                        ciStatus: transcript.ciStatus,
                        processingStatus: transcript.processingStatus,
                        message: 'CI analysis failed - manual review needed'
                    });
                    return res.status(200).json({ success: true, message: 'CI analysis failed' });
                }
                
                console.log('[Conversational Intelligence Webhook] CI analysis not completed yet:', {
                    transcriptStatus: transcript.status,
                    analysisStatus: transcript.analysisStatus,
                    ciStatus: transcript.ciStatus,
                    processingStatus: transcript.processingStatus,
                    message: 'Waiting for CI analysis to complete'
                });
                return res.status(200).json({ success: true, message: 'CI analysis in progress' });
            }
            
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

            // Get sentences with validation
            let transcriptText = '';
            let sentences = [];
            try {
                // Retry fetching sentences for propagation lag (extend to ~90s per Twilio guidance)
                let sentencesResponse = [];
                const maxMs = 90000; const stepMs = 3000; let waited = 0;
                while (waited <= maxMs) {
                    const resp = await client.intelligence.v2
                        .transcripts(TranscriptSid)
                        .sentences.list();
                    const count = Array.isArray(resp) ? resp.length : 0;
                    console.log(`[Conversational Intelligence Webhook] Sentences fetch: count=${count}, waitedMs=${waited}`);
                    if (count > 0) { sentencesResponse = resp; break; }
                    if (waited >= maxMs) break;
                    await new Promise(r => setTimeout(r, stepMs));
                    waited += stepMs;
                }
                
                console.log(`[Conversational Intelligence Webhook] Raw sentences response:`, {
                    count: sentencesResponse.length,
                    sample: sentencesResponse.slice(0, 2).map(s => ({
                        text: s.text?.substring(0, 50) + '...',
                        channel: s.channel,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        confidence: s.confidence
                    })),
                    // Log full sentences response for debugging (first 3 sentences)
                    fullResponse: sentencesResponse.slice(0, 3)
                });
                
                // Validate we have proper sentence segmentation (per Twilio guidance)
                if (sentencesResponse.length === 0) {
                    console.warn('[Conversational Intelligence Webhook] No sentences returned - CI analysis may not be complete');
                    return res.status(200).json({ success: true, message: 'No sentences available yet' });
                }
                
                // Check for segmentation failure indicators (per Twilio guidance: 5-20+ sentences expected for 1-2 min calls)
                if (sentencesResponse.length <= 2) {
                    console.warn('[Conversational Intelligence Webhook] Very few sentences detected - possible segmentation failure:', {
                        sentenceCount: sentencesResponse.length,
                        callLength: 'unknown', // We could calculate this from call duration if available
                        message: 'Expected 5-20+ sentences for typical 1-2 minute calls'
                    });
                }
                
                if (sentencesResponse.length === 1 && sentencesResponse[0].text && sentencesResponse[0].text.length > 500) {
                    console.warn('[Conversational Intelligence Webhook] Single long sentence detected - CI segmentation likely failed:', {
                        sentenceLength: sentencesResponse[0].text.length,
                        message: 'Single sentence over 500 chars suggests segmentation failure'
                    });
                }
                
                const agentChNum = Number(channelRoleMap.agentChannel || '1');
                sentences = sentencesResponse.map(s => {
                    // Handle edge cases for channel values (per Twilio guidance)
                    let channel = s.channel;
                    let channelNum = null;
                    
                    // Normalize channel values defensively
                    if (channel === null || channel === undefined) {
                        console.warn('[Conversational Intelligence Webhook] Null/undefined channel detected:', {
                            sentence: s.text?.substring(0, 50) + '...',
                            originalChannel: channel
                        });
                        channelNum = 1; // Default fallback
                    } else if (typeof channel === 'string') {
                        // Handle 'A'/'B' or other string representations
                        if (channel.toLowerCase() === 'a') channelNum = 1;
                        else if (channel.toLowerCase() === 'b') channelNum = 2;
                        else channelNum = Number(channel) || 1;
                    } else {
                        channelNum = Number(channel) || 1;
                    }
                    
                    // Log unexpected channel values for investigation
                    if (channelNum !== 1 && channelNum !== 2) {
                        console.warn('[Conversational Intelligence Webhook] Unexpected channel value:', {
                            originalChannel: channel,
                            normalizedChannel: channelNum,
                            sentence: s.text?.substring(0, 50) + '...'
                        });
                    }
                    
                    return {
                        text: s.text || '',
                        confidence: s.confidence,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        channel: channel,
                        channelNum: channelNum,
                        // Map channel to speaker role using computed per-call mapping
                        speaker: channelNum === agentChNum ? 'Agent' : 'Customer'
                    };
                });
                
                transcriptText = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                
                // Create formatted transcript with speaker labels for better display
                const formattedTranscript = sentences
                    .filter(s => s.text && s.text.trim())
                    .map(s => `${s.speaker}: ${s.text.trim()}`)
                    .join('\n\n');
                
                console.log(`[Conversational Intelligence Webhook] Retrieved ${sentences.length} sentences, transcript length: ${transcriptText.length}`);
                console.log(`[Conversational Intelligence Webhook] Formatted transcript with speaker labels: ${formattedTranscript.length} chars`);
                console.log(`[Conversational Intelligence Webhook] Channel distribution:`, {
                    channel1: sentences.filter(s => s.channelNum === 1).length,
                    channel2: sentences.filter(s => s.channelNum === 2).length,
                    other: sentences.filter(s => s.channelNum !== 1 && s.channelNum !== 2).length,
                    totalSentences: sentences.length,
                    segmentationQuality: sentences.length >= 5 ? 'Good' : sentences.length >= 2 ? 'Poor' : 'Failed'
                });
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
