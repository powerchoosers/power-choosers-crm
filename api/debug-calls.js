import { admin, db } from './_firebase.js';
import { cors } from './_cors.js';

export default async function handler(req, res) {
    if (cors(req, res)) return; // handle OPTIONS centrally
    
    if (req.method !== 'GET') {
        return res.writeHead(405, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Method not allowed' }));
return;
    }
    
    try {
        console.log('[Debug Calls] Fetching all calls from Firestore...');
        
        if (!db) {
            return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Firestore not available' }));
return;
        }
        
        // Get all calls from Firestore
        const snap = await db.collection('calls').limit(200).get();
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
        
        // Count calls by source
        const sourceCounts = {};
        calls.forEach(call => {
            const source = call.source || 'unknown';
            sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        });
        
        console.log(`[Debug Calls] Source breakdown:`, sourceCounts);
        
        return res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({
            success: true,
            totalCalls: calls.length,
            calls: calls,
            sourceCounts: sourceCounts
        }));
return;
        
    } catch (error) {
        console.error('[Debug Calls] Error:', error);
        return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ 
            error: 'Failed to fetch calls',
            details: error.message 
        }));
return;
    }
}
