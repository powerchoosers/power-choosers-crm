const twilio = require('twilio');
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

// In-memory call storage (replace with database in production)
const callStore = new Map();

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    if (req.method === 'GET') {
        // Return recent calls with AI insights (Firestore first, fallback to memory)
        try {
            if (db) {
                const snap = await db
                    .collection('calls')
                    .orderBy('timestamp', 'desc')
                    .limit(50)
                    .get();
                const calls = [];
                snap.forEach(doc => {
                    const d = doc.data() || {};
                    calls.push({
                        id: d.id || doc.id,
                        to: d.to,
                        from: d.from,
                        status: d.status,
                        duration: d.duration,
                        timestamp: d.timestamp,
                        callTime: d.callTime || d.timestamp,
                        durationSec: d.duration || 0,
                        outcome: d.outcome || (d.status === 'completed' ? 'Connected' : 'No Answer'),
                        transcript: d.transcript || '',
                        aiSummary: (d.aiInsights && d.aiInsights.summary) || d.aiSummary || '',
                        aiInsights: d.aiInsights || null,
                        audioUrl: d.recordingUrl || ''
                    });
                });
                return res.status(200).json({ ok: true, calls });
            }
        } catch (e) {
            console.warn('[Calls] Firestore GET failed, falling back to memory:', e?.message);
        }

        const calls = Array.from(callStore.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50);
        return res.status(200).json({
            ok: true,
            calls: calls.map(call => ({
                id: call.id,
                to: call.to,
                from: call.from,
                status: call.status,
                duration: call.duration,
                timestamp: call.timestamp,
                callTime: call.timestamp,
                durationSec: call.duration || 0,
                outcome: call.status === 'completed' ? 'Connected' : 'No Answer',
                transcript: call.transcript || '',
                aiSummary: call.aiInsights?.summary || '',
                aiInsights: call.aiInsights || null,
                audioUrl: call.recordingUrl || ''
            }))
        });
    }
    
    if (req.method === 'POST') {
        // Log a new call or update existing call
        const { callSid, to, from, status, duration, transcript, aiInsights, recordingUrl } = req.body;
        
        const callId = callSid || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Get existing call data or create new
        const existingCall = callStore.get(callId) || {};
        
        const callData = {
            ...existingCall,
            id: callId,
            to: to || existingCall.to,
            from: from || existingCall.from,
            status: status || existingCall.status || 'initiated',
            duration: duration || existingCall.duration || 0,
            timestamp: existingCall.timestamp || new Date().toISOString(),
            transcript: transcript || existingCall.transcript,
            aiInsights: aiInsights || existingCall.aiInsights,
            recordingUrl: recordingUrl || existingCall.recordingUrl
        };
        
        // Persist to Firestore if available
        try {
            if (db) {
                await db.collection('calls').doc(callId).set(callData, { merge: true });
            }
        } catch (e) {
            console.warn('[Calls] Firestore POST failed, storing in memory only:', e?.message);
        }

        // Always upsert into in-memory store as a fallback cache
        callStore.set(callId, callData);
        
        return res.status(200).json({
            ok: true,
            call: callData
        });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
}

// Export call store for other modules
export { callStore };
