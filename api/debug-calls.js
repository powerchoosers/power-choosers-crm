const { admin, db } = require('./_firebase');

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
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        console.log('[Debug Calls] Fetching all calls from Firestore...');
        
        if (!db) {
            return res.status(500).json({ error: 'Firestore not available' });
        }
        
        // Get all calls from Firestore
        const snap = await db.collection('calls').limit(10).get();
        const calls = [];
        
        snap.forEach(doc => {
            const data = doc.data();
            calls.push({
                id: doc.id,
                data: data,
                hasTranscript: !!(data.transcript && data.transcript.length > 0),
                hasAI: !!data.aiInsights,
                hasCI: !!data.conversationalIntelligence,
                source: data.source || 'unknown'
            });
        });
        
        console.log(`[Debug Calls] Found ${calls.length} calls in Firestore`);
        
        return res.status(200).json({
            success: true,
            totalCalls: calls.length,
            calls: calls
        });
        
    } catch (error) {
        console.error('[Debug Calls] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to fetch calls',
            details: error.message 
        });
    }
}
