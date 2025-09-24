import twilio from 'twilio';
import { corsMiddleware } from '../_cors.js';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { transcriptSid, callSid } = req.body;
        
        if (!transcriptSid) {
            return res.status(400).json({ error: 'transcriptSid is required' });
        }
        
        console.log('[Poll CI Analysis] Checking analysis status for:', { transcriptSid, callSid });
        
        // Get transcript details
        const transcript = await client.intelligence.v2.transcripts(transcriptSid).fetch();
        
        console.log('[Poll CI Analysis] Transcript status:', {
            sid: transcript.sid,
            status: transcript.status,
            analysisStatus: transcript.analysisStatus,
            ciStatus: transcript.ciStatus,
            processingStatus: transcript.processingStatus
        });
        
        // Check if analysis is complete or failed
        const isAnalysisComplete = transcript.analysisStatus === 'completed' || 
                                 transcript.ciStatus === 'completed' ||
                                 transcript.processingStatus === 'completed';
        
        const isAnalysisFailed = transcript.analysisStatus === 'failed' ||
                               transcript.ciStatus === 'failed' ||
                               transcript.processingStatus === 'failed';
        
        if (isAnalysisFailed) {
            console.error('[Poll CI Analysis] CI analysis failed:', {
                transcriptStatus: transcript.status,
                analysisStatus: transcript.analysisStatus,
                ciStatus: transcript.ciStatus,
                processingStatus: transcript.processingStatus
            });
            return res.status(200).json({
                success: true,
                analysisComplete: false,
                analysisFailed: true,
                status: {
                    transcriptStatus: transcript.status,
                    analysisStatus: transcript.analysisStatus,
                    ciStatus: transcript.ciStatus,
                    processingStatus: transcript.processingStatus
                },
                message: 'CI analysis failed - manual review needed'
            });
        }
        
        if (!isAnalysisComplete) {
            return res.status(200).json({
                success: true,
                analysisComplete: false,
                status: {
                    transcriptStatus: transcript.status,
                    analysisStatus: transcript.analysisStatus,
                    ciStatus: transcript.ciStatus,
                    processingStatus: transcript.processingStatus
                },
                message: 'Analysis still in progress'
            });
        }
        
        // Compute agent/customer channel mapping (align with webhook)
        let channelRoleMap = { agentChannel: '1', customerChannel: '2' };
        try {
            let callResource = null;
            try { callResource = callSid ? await client.calls(callSid).fetch() : null; } catch(_) {}
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
            console.log('[Poll CI Analysis] Channel-role mapping', channelRoleMap, { from: fromStr, to: toStr });
        } catch(e) {
            console.warn('[Poll CI Analysis] Failed to compute channel-role mapping, defaulting:', e?.message);
        }

        // Analysis is complete, fetch sentences
        let sentences = [];
        try {
            const sentencesResponse = await client.intelligence.v2
                .transcripts(transcriptSid)
                .sentences.list();
            
            // Validate sentence segmentation quality
            if (sentencesResponse.length <= 2) {
                console.warn('[Poll CI Analysis] Very few sentences detected - possible segmentation failure:', {
                    sentenceCount: sentencesResponse.length,
                    message: 'Expected 5-20+ sentences for typical 1-2 minute calls'
                });
            }
            
            sentences = sentencesResponse.map(s => {
                // Handle edge cases for channel values (same as webhook handler)
                let channel = s.channel;
                let channelNum = null;
                
                if (channel === null || channel === undefined) {
                    console.warn('[Poll CI Analysis] Null/undefined channel detected');
                    channelNum = 1;
                } else if (typeof channel === 'string') {
                    if (channel.toLowerCase() === 'a') channelNum = 1;
                    else if (channel.toLowerCase() === 'b') channelNum = 2;
                    else channelNum = Number(channel) || 1;
                } else {
                    channelNum = Number(channel) || 1;
                }
                
                return {
                    text: s.text || '',
                    confidence: s.confidence,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    channel: channel,
                    channelNum: channelNum,
                    speaker: channelNum === Number(channelRoleMap.agentChannel || '1') ? 'Agent' : 'Customer'
                };
            });
            
            console.log(`[Poll CI Analysis] Retrieved ${sentences.length} sentences`, {
                segmentationQuality: sentences.length >= 5 ? 'Good' : sentences.length >= 2 ? 'Poor' : 'Failed'
            });
        } catch (error) {
            console.error('[Poll CI Analysis] Error fetching sentences:', error);
        }
        
        // Build transcript strings and proactively upsert to /api/calls (fallback if webhook races/fails)
        try {
            const transcriptText = sentences.map(s => s.text || '').filter(Boolean).join(' ');
            const formattedTranscript = sentences
              .filter(s => s.text && s.text.trim())
              .map(s => `${s.speaker}: ${s.text.trim()}`)
              .join('\n\n');
            if (transcriptText || sentences.length > 0) {
                const base = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app');
                const ai = {
                    summary: `Analysis of ${transcriptText.split(/\s+/).filter(Boolean).length}-word conversation.`,
                    sentiment: 'Neutral',
                    keyTopics: [],
                    nextSteps: ['Follow up'],
                    painPoints: [],
                    decisionMakers: [],
                    speakerTurns: sentences.map(x=>({ role: x.speaker.toLowerCase(), t: Math.max(0, Math.floor(x.startTime||0)), text: x.text||'' })),
                    conversationalIntelligence: {
                        transcriptSid,
                        status: transcript.status,
                        sentenceCount: sentences.length,
                        channelRoleMap
                    },
                    source: 'twilio-conversational-intelligence'
                };
                await fetch(`${base}/api/calls`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callSid, transcript: transcriptText, formattedTranscript, aiInsights: ai, conversationalIntelligence: ai.conversationalIntelligence })
                }).catch(()=>{});
            }
        } catch(e) {
            console.warn('[Poll CI Analysis] Fallback upsert failed:', e?.message || e);
        }

        return res.status(200).json({
            success: true,
            analysisComplete: true,
            status: {
                transcriptStatus: transcript.status,
                analysisStatus: transcript.analysisStatus,
                ciStatus: transcript.ciStatus,
                processingStatus: transcript.processingStatus
            },
            sentences: sentences,
            sentenceCount: sentences.length,
            updated: true,
            message: 'Analysis completed (fallback upsert attempted)'
        });
        
    } catch (error) {
        console.error('[Poll CI Analysis] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to poll CI analysis',
            details: error.message 
        });
    }
}
