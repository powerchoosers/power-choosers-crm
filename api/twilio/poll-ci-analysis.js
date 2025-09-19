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
        
        // Check if analysis is complete
        const isAnalysisComplete = transcript.analysisStatus === 'completed' || 
                                 transcript.ciStatus === 'completed' ||
                                 transcript.processingStatus === 'completed';
        
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
            
            sentences = sentencesResponse.map(s => ({
                text: s.text || '',
                confidence: s.confidence,
                startTime: s.startTime,
                endTime: s.endTime,
                channel: s.channel
            }));
            
            console.log(`[Poll CI Analysis] Retrieved ${sentences.length} sentences`);
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
