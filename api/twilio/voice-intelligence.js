const twilio = require('twilio');

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { CallSid, VoiceIntelligenceInsights } = req.body;
        
        console.log(`[Voice Intelligence] Received insights for call: ${CallSid}`);
        console.log(`[Voice Intelligence] Insights:`, JSON.stringify(VoiceIntelligenceInsights, null, 2));
        
        if (!CallSid || !VoiceIntelligenceInsights) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Extract insights data
        const insights = {
            summary: VoiceIntelligenceInsights.summary || '',
            sentiment: VoiceIntelligenceInsights.sentiment || 'neutral',
            topics: VoiceIntelligenceInsights.topics || [],
            transcript: VoiceIntelligenceInsights.transcript || '',
            confidence: VoiceIntelligenceInsights.confidence || 0,
            language: VoiceIntelligenceInsights.language || 'en-US',
            processedAt: new Date().toISOString()
        };
        
        // Update the call data in the central store
        try {
            const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://power-choosers-crm.vercel.app';
            await fetch(`${base}/api/calls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callSid: CallSid,
                    transcript: insights.transcript,
                    aiInsights: {
                        summary: insights.summary,
                        sentiment: insights.sentiment,
                        topics: insights.topics,
                        confidence: insights.confidence,
                        language: insights.language,
                        generatedAt: insights.processedAt,
                        source: 'twilio-voice-intelligence'
                    }
                })
            }).catch((error) => {
                console.warn('[Voice Intelligence] Failed posting insights to /api/calls:', error?.message);
            });
        } catch (e) {
            console.warn('[Voice Intelligence] Failed posting insights to /api/calls:', e?.message);
        }
        
        console.log(`[Voice Intelligence] Processing completed for call: ${CallSid}`);
        
        return res.status(200).json({
            success: true,
            callSid: CallSid,
            insights: insights
        });
        
    } catch (error) {
        console.error('[Voice Intelligence] Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}

const allowCors = fn => async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.status(200).end()
    return await fn(req, res)
}

export default allowCors(handler)
