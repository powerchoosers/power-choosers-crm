import twilio from 'twilio';
import { cors } from '../_cors.js';
import logger from '../_logger.js';

// Generate AI-powered live tips for energy sales calls
function generateLiveTips(insights) {
    const tips = [];
    const transcript = insights.transcript.toLowerCase();
    const sentiment = insights.sentiment;
    const topics = insights.topics || [];
    
    // Sentiment-based tips
    if (sentiment === 'negative') {
        tips.push({
            type: 'warning',
            message: 'Customer seems frustrated. Consider acknowledging their concerns and offering solutions.',
            priority: 'high'
        });
    } else if (sentiment === 'positive') {
        tips.push({
            type: 'success',
            message: 'Great! Customer is engaged. This is a good time to discuss benefits and next steps.',
            priority: 'medium'
        });
    }
    
    // Topic-based tips
    if (topics.includes('price') || transcript.includes('cost') || transcript.includes('expensive')) {
        tips.push({
            type: 'info',
            message: 'Price discussion detected. Emphasize value and long-term savings.',
            priority: 'high'
        });
    }
    
    if (topics.includes('contract') || transcript.includes('contract') || transcript.includes('agreement')) {
        tips.push({
            type: 'info',
            message: 'Contract discussion in progress. Be ready to explain terms and benefits.',
            priority: 'medium'
        });
    }
    
    if (topics.includes('renewal') || transcript.includes('renew') || transcript.includes('expire')) {
        tips.push({
            type: 'opportunity',
            message: 'Renewal discussion detected. Perfect time to offer competitive rates!',
            priority: 'high'
        });
    }
    
    // Energy-specific tips
    if (transcript.includes('supplier') || transcript.includes('provider')) {
        tips.push({
            type: 'info',
            message: 'Supplier discussion. Highlight your relationships with multiple suppliers.',
            priority: 'medium'
        });
    }
    
    if (transcript.includes('usage') || transcript.includes('kwh') || transcript.includes('kilowatt')) {
        tips.push({
            type: 'info',
            message: 'Usage discussion. Offer to analyze their current usage patterns.',
            priority: 'medium'
        });
    }
    
    // Objection handling tips
    if (transcript.includes('not interested') || transcript.includes('not ready')) {
        tips.push({
            type: 'warning',
            message: 'Objection detected. Ask about their timeline and offer to follow up later.',
            priority: 'high'
        });
    }
    
    if (transcript.includes('think about it') || transcript.includes('consider')) {
        tips.push({
            type: 'info',
            message: 'Customer needs time. Offer to send information and schedule a follow-up.',
            priority: 'medium'
        });
    }
    
    // Closing tips
    if (transcript.includes('next step') || transcript.includes('what happens next')) {
        tips.push({
            type: 'success',
            message: 'Closing opportunity! Be ready to schedule next steps or send proposal.',
            priority: 'high'
        });
    }
    
    return tips.slice(0, 3); // Return top 3 most relevant tips
}

async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    try {
        const { CallSid, VoiceIntelligenceInsights } = req.body;
        
        logger.log(`[Voice Intelligence] Received insights for call: ${CallSid}`);
        logger.log(`[Voice Intelligence] Insights:`, JSON.stringify(VoiceIntelligenceInsights, null, 2));
        
        if (!CallSid || !VoiceIntelligenceInsights) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required parameters' }));
            return;
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
        
        // Generate AI-powered live tips based on conversation
        const liveTips = generateLiveTips(insights);
        insights.liveTips = liveTips;
        
        // Update the call data in the central store
        try {
            const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host || '';
            const envBase = process.env.PUBLIC_BASE_URL || '';
            const base = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm-792458658491.us-south1.run.app');
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
                        liveTips: insights.liveTips,
                        generatedAt: insights.processedAt,
                        source: 'twilio-voice-intelligence'
                    }
                })
            }).catch((error) => {
                logger.warn('[Voice Intelligence] Failed posting insights to /api/calls:', error?.message);
            });
        } catch (e) {
            logger.warn('[Voice Intelligence] Failed posting insights to /api/calls:', e?.message);
        }
        
        logger.log(`[Voice Intelligence] Processing completed for call: ${CallSid}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            callSid: CallSid,
            insights: insights
        }));
        
    } catch (error) {
        logger.error('[Voice Intelligence] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Internal server error',
            message: error.message
        }));
        return;
    }
}

export default async function wrapped(req, res) {
    if (cors(req, res)) return;
    return await handler(req, res);
}
