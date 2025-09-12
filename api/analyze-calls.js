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
        if (!db) {
            return res.status(500).json({ error: 'Firestore not available' });
        }
        
        // Get all calls from Firestore
        const snap = await db.collection('calls').get();
        const calls = [];
        const sourceCounts = {};
        const durationStats = { withDuration: 0, zeroDuration: 0, withRecordings: 0, withTranscripts: 0 };
        
        snap.forEach(doc => {
            const data = doc.data();
            calls.push({
                id: doc.id,
                twilioSid: data.twilioSid,
                to: data.to,
                from: data.from,
                duration: data.duration || 0,
                source: data.source || 'unknown',
                hasRecording: !!(data.recordingUrl && data.recordingUrl.length > 0),
                hasTranscript: !!(data.transcript && data.transcript.length > 0),
                timestamp: data.timestamp
            });
            
            // Count by source
            const source = data.source || 'unknown';
            sourceCounts[source] = (sourceCounts[source] || 0) + 1;
            
            // Duration stats
            if (data.duration > 0) {
                durationStats.withDuration++;
            } else {
                durationStats.zeroDuration++;
            }
            
            if (data.recordingUrl && data.recordingUrl.length > 0) {
                durationStats.withRecordings++;
            }
            
            if (data.transcript && data.transcript.length > 0) {
                durationStats.withTranscripts++;
            }
        });
        
        // Sort by timestamp (newest first)
        calls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return res.status(200).json({
            success: true,
            totalCalls: calls.length,
            sourceCounts: sourceCounts,
            durationStats: durationStats,
            recentCalls: calls.slice(0, 10), // Show 10 most recent
            calls: calls
        });
        
    } catch (error) {
        console.error('[Analyze] Error:', error);
        return res.status(500).json({ 
            error: 'Analysis failed', 
            details: error.message 
        });
    }
}
