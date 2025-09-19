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
                    channelNum: channelNum
                };
            });
            
            console.log(`[Poll CI Analysis] Retrieved ${sentences.length} sentences`, {
                segmentationQuality: sentences.length >= 5 ? 'Good' : sentences.length >= 2 ? 'Poor' : 'Failed'
            });
        } catch (error) {
            console.error('[Poll CI Analysis] Error fetching sentences:', error);
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
            message: 'Analysis completed successfully'
        });
        
    } catch (error) {
        console.error('[Poll CI Analysis] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to poll CI analysis',
            details: error.message 
        });
    }
}
