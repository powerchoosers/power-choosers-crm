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
        const callSidFilter = (req.query && (req.query.callSid || req.query.callsid)) || '';
        try {
            if (db) {
                let calls = [];
                if (callSidFilter) {
                    // Try direct doc, then where query
                    const docRef = await db.collection('calls').doc(callSidFilter).get();
                    if (docRef.exists) {
                        const d = docRef.data() || {};
                        calls.push({
                            id: d.id || docRef.id,
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
                            audioUrl: d.recordingUrl || '',
                            recordingUrl: d.recordingUrl || '',
                            twilioSid: d.twilioSid || d.callSid || '',
                            accountId: d.accountId || null,
                            accountName: d.accountName || null,
                            contactId: d.contactId || null,
                            contactName: d.contactName || null
                        });
                    } else {
                        const snapSid = await db.collection('calls').where('twilioSid', '==', callSidFilter).limit(1).get();
                        snapSid.forEach(doc => {
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
                                audioUrl: d.recordingUrl || '',
                                recordingUrl: d.recordingUrl || '',
                                twilioSid: d.twilioSid || d.callSid || '',
                                accountId: d.accountId || null,
                                accountName: d.accountName || null,
                                contactId: d.contactId || null,
                                contactName: d.contactName || null
                            });
                        });
                    }
                }
                if (!callSidFilter || calls.length === 0) {
                    const snap = await db
                        .collection('calls')
                        .orderBy('timestamp', 'desc')
                        .limit(200)
                        .get();
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
                            audioUrl: d.recordingUrl || '',
                            recordingUrl: d.recordingUrl || '',
                            twilioSid: d.twilioSid || d.callSid || '',
                            accountId: d.accountId || null,
                            accountName: d.accountName || null,
                            contactId: d.contactId || null,
                            contactName: d.contactName || null
                        });
                    });
                }
                // Deduplicate by twilioSid (or id) to avoid showing multiple rows for the same call
                const dedupe = (arr) => {
                    const map = new Map();
                    for (const c of arr) {
                        const key = c.twilioSid || c.id;
                        if (!map.has(key)) { map.set(key, c); continue; }
                        const prev = map.get(key);
                        const aHasRec = !!c.recordingUrl;
                        const bHasRec = !!prev.recordingUrl;
                        const pick = aHasRec && !bHasRec ? c : (!aHasRec && bHasRec ? prev : ((c.durationSec||0) > (prev.durationSec||0) ? c : (new Date(c.timestamp) > new Date(prev.timestamp) ? c : prev)));
                        const merged = { ...prev, ...c };
                        merged.id = pick.id; // prefer the picked id for stability
                        merged.recordingUrl = pick.recordingUrl || prev.recordingUrl || '';
                        merged.audioUrl = merged.recordingUrl;
                        merged.durationSec = pick.durationSec || prev.durationSec || 0;
                        merged.duration = pick.duration || prev.duration || merged.durationSec || 0;
                        merged.status = pick.status || prev.status;
                        merged.accountId = pick.accountId || prev.accountId || null;
                        merged.accountName = pick.accountName || prev.accountName || null;
                        merged.contactId = pick.contactId || prev.contactId || null;
                        merged.contactName = pick.contactName || prev.contactName || null;
                        map.set(key, merged);
                    }
                    return Array.from(map.values());
                };
                const pruned = dedupe(calls);
                try { console.log('[Calls][GET] returning %d calls (deduped from %d)', pruned.length, calls.length); } catch(_) {}
                return res.status(200).json({ ok: true, calls: pruned });
            }
        } catch (e) {
            console.warn('[Calls] Firestore GET failed, falling back to memory:', e?.message);
        }

        let calls = Array.from(callStore.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50);
        if (callSidFilter) {
            calls = calls.filter(c => c && ((c.twilioSid && c.twilioSid === callSidFilter) || (c.id && c.id === callSidFilter)));
        }
        // Dedupe memory results similar to Firestore path
        const dedupeMem = (arr) => {
            const map = new Map();
            for (const c of arr) {
                const key = c.twilioSid || c.id;
                if (!map.has(key)) { map.set(key, c); continue; }
                const prev = map.get(key);
                const aHasRec = !!c.recordingUrl;
                const bHasRec = !!prev.recordingUrl;
                const pick = aHasRec && !bHasRec ? c : (!aHasRec && bHasRec ? prev : ((c.duration||0) > (prev.duration||0) ? c : (new Date(c.timestamp) > new Date(prev.timestamp) ? c : prev)));
                const merged = { ...prev, ...c };
                merged.id = pick.id;
                merged.recordingUrl = pick.recordingUrl || prev.recordingUrl || '';
                merged.duration = pick.duration || prev.duration || 0;
                merged.status = pick.status || prev.status;
                merged.accountId = pick.accountId || prev.accountId || null;
                merged.accountName = pick.accountName || prev.accountName || null;
                merged.contactId = pick.contactId || prev.contactId || null;
                merged.contactName = pick.contactName || prev.contactName || null;
                map.set(key, merged);
            }
            return Array.from(map.values());
        };
        const memPruned = dedupeMem(calls);
        return res.status(200).json({
            ok: true,
            calls: memPruned.map(call => ({
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
                audioUrl: call.recordingUrl || '',
                recordingUrl: call.recordingUrl || '',
                twilioSid: call.twilioSid || call.id || '',
                accountId: call.accountId || null,
                accountName: call.accountName || null,
                contactId: call.contactId || null,
                contactName: call.contactName || null
            }))
        });
    }
    
    if (req.method === 'POST') {
        // Log a new call or update existing call
        const { callSid, to, from, status, duration, transcript, aiInsights, recordingUrl, timestamp, callTime, accountId, accountName, contactId, contactName, source, targetPhone, businessPhone } = req.body || {};
        const _rid = `r${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        try {
            console.log('[Calls][POST][%s] body:', _rid, {
                callSid, to, from, status, duration, timestamp, callTime, accountId, accountName, contactId, contactName, source, targetPhone, businessPhone,
                hasTranscript: !!transcript, hasAI: !!aiInsights, hasRecording: !!recordingUrl
            });
        } catch(_) {}
        
        let callId = callSid || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Get existing call data or create new
        let existingCall = callStore.get(callId) || {};

        // Helper: normalize phone (10-digit) and strip Twilio client prefix
        const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
        const isClient = (s) => typeof s === 'string' && s.startsWith('client:');
        // Business numbers for merge logic (comma-separated env)
        const bizList = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
            .split(',').map(norm).filter(Boolean);
        const bodyBiz = norm(businessPhone);
        if (bodyBiz && !bizList.includes(bodyBiz)) bizList.push(bodyBiz);
        const isBiz = (p) => !!p && bizList.includes(p);
        const otherParty = (toRaw, fromRaw) => {
            const to = norm(isClient(toRaw) ? '' : toRaw);
            const from = norm(isClient(fromRaw) ? '' : fromRaw);
            if (isBiz(to) && !isBiz(from)) return from;
            if (isBiz(from) && !isBiz(to)) return to;
            // Prefer non-empty to
            return to || from || '';
        };

        // If there is no exact record for this callSid, try stronger merges: by twilioSid, then by window/counterparty
        if (!existingCall || Object.keys(existingCall).length === 0) {
            // 1) Exact twilioSid match in memory
            if (callSid) {
                for (const v of callStore.values()) {
                    if (v && v.twilioSid && v.twilioSid === callSid) {
                        try { console.log('[Calls][POST][%s] Exact memory twilioSid match -> %s', _rid, v.id); } catch(_) {}
                        callId = v.id; existingCall = v;
                        break;
                    }
                }
            }
            // 2) Exact twilioSid match in Firestore
            if ((!existingCall || !existingCall.id) && db && callSid) {
                try {
                    const snapSid = await db.collection('calls').where('twilioSid', '==', callSid).limit(1).get();
                    if (!snapSid.empty) {
                        const doc = snapSid.docs[0];
                        existingCall = { id: doc.id, ...(doc.data()||{}) };
                        callId = doc.id;
                        try { console.log('[Calls][POST][%s] Exact Firestore twilioSid match -> %s', _rid, callId); } catch(_) {}
                    }
                } catch(e) {
                    console.warn('[Calls][POST][%s] Firestore twilioSid lookup failed:', _rid, e?.message);
                }
            }
            // 3) Fallback to window-based counterparty matching (STRICT when explicit IDs are provided)
            try {
                const now = Date.now();
                // If caller provided a clear targetPhone, prefer it as counterparty
                const targetCounterparty = (targetPhone && norm(targetPhone)) || otherParty(to, from);
                try { console.log('[Calls][POST][%s] bizList=%j targetCounterparty=%s', _rid, bizList, targetCounterparty); } catch(_) {}
                let best = null;
                let bestTs = -1;
                for (const v of callStore.values()) {
                    try {
                        const ts = new Date(v.timestamp || v.callTime || 0).getTime();
                        if (!ts || Math.abs(now - ts) > 5 * 60 * 1000) continue; // within 5 minutes
                        const candCounterparty = otherParty(v.to, v.from);
                        // Match exact counterparty only (avoid matching shared business number)
                        const partyMatch = !!candCounterparty && candCounterparty === targetCounterparty;
                        // If explicit attribution provided, require it to match to avoid cross-company flips
                        const requireIdMatch = !!(accountId || contactId);
                        const idMatchStrict = ((accountId && v.accountId === accountId) || (contactId && v.contactId === contactId)) ? 1 : 0;
                        if (requireIdMatch && !idMatchStrict) continue;
                        if (!partyMatch) continue;
                        // Strong preference: same account/contact id if provided
                        const idBoost = idMatchStrict;
                        // Prefer newer timestamps, then missing recording, then id match boost
                        const score = (ts || 0) + ( (!v.recordingUrl ? 1 : 0) * 1 ) + (idBoost * 1000);
                        if (score > bestTs) {
                            bestTs = score; best = v;
                        }
                        try { console.log('[Calls][POST][%s] candidate id=%s ts=%s candCounterparty=%s score=%s hasRec=%s idMatch=%s', _rid, v.id, new Date(ts).toISOString(), candCounterparty, score, !!v.recordingUrl, !!idBoost); } catch(_) {}
                    } catch (_) {}
                }
                if (best && best.id) {
                    // Always merge into the existing best row to maintain a single call record
                    try { console.log('[Calls][POST][%s] Merging into existing id=%s for callSid=%s', _rid, best.id, callSid); } catch(_) {}
                    callId = best.id;
                    existingCall = best;
                }
                // If not found in memory, try Firestore recent rows
                if ((!existingCall || !existingCall.id) && db) {
                    try {
                        const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
                        let query = db.collection('calls').where('timestamp', '>=', sinceIso).orderBy('timestamp', 'desc').limit(25);
                        const snap = await query.get();
                        let fbBest = null;
                        let fbScore = -1;
                        snap.forEach(doc => {
                            const d = doc.data() || {};
                            const ts = new Date(d.timestamp || d.callTime || 0).getTime();
                            const candCp = otherParty(d.to, d.from);
                            const partyMatch = !!candCp && candCp === targetCounterparty;
                            const requireIdMatch = !!(accountId || contactId);
                            const idMatchStrict = ((accountId && d.accountId === accountId) || (contactId && d.contactId === contactId)) ? 1 : 0;
                            if (requireIdMatch && !idMatchStrict) return;
                            if (!partyMatch) return;
                            const idBoost = ((accountId && d.accountId === accountId) || (contactId && d.contactId === contactId)) ? 1 : 0;
                            const score = (ts || 0) + ((!d.recordingUrl ? 1 : 0) * 1) + (idBoost * 1000);
                            if (score > fbScore) { fbScore = score; fbBest = { id: doc.id, ...d }; }
                            try { console.log('[Calls][POST][%s] FS cand id=%s ts=%s cp=%s score=%s hasRec=%s idMatch=%s', _rid, doc.id, new Date(ts).toISOString(), candCp, score, !!d.recordingUrl, !!idBoost); } catch(_) {}
                        });
                        if (fbBest && fbBest.id) {
                            callId = fbBest.id;
                            existingCall = fbBest;
                            try { console.log('[Calls][POST][%s] Firestore merge target id=%s', _rid, callId); } catch(_) {}
                        } else {
                            try { console.log('[Calls][POST][%s] No Firestore merge target found', _rid); } catch(_) {}
                        }
                    } catch (fe) {
                        console.warn('[Calls][POST][%s] Firestore merge search failed:', _rid, fe?.message);
                    }
                }
            } catch (_) {}
        }

        // If to/from missing, try to fetch from Twilio Call resource
        let _to = to || existingCall.to;
        let _from = from || existingCall.from;
        let _duration = duration || existingCall.duration || 0;
        if ((!_to || !_from) && callSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            try {
                const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                const call = await client.calls(callSid).fetch();
                _to = _to || call.to;
                _from = _from || call.from;
                if (!_duration && call?.duration) _duration = parseInt(call.duration, 10) || 0;
            } catch (e) {
                console.warn('[Calls] Failed to fetch Call resource for', callSid, e?.message);
            }
        }
        
        const callData = {
            ...existingCall,
            id: callId,
            to: _to,
            from: _from,
            status: status || existingCall.status || 'initiated',
            duration: _duration,
            timestamp: timestamp || callTime || existingCall.timestamp || new Date().toISOString(),
            transcript: transcript || existingCall.transcript,
            aiInsights: aiInsights || existingCall.aiInsights,
            recordingUrl: recordingUrl || existingCall.recordingUrl,
            twilioSid: callSid || existingCall.twilioSid || null,
            // Persist context if provided
            accountId: accountId || existingCall.accountId || null,
            accountName: accountName || existingCall.accountName || null,
            contactId: contactId || existingCall.contactId || null,
            contactName: contactName || existingCall.contactName || null,
            source: source || existingCall.source || null,
            targetPhone: targetPhone || existingCall.targetPhone || null,
            businessPhone: businessPhone || existingCall.businessPhone || null
        };
        try {
            console.log('[Calls][POST][%s] UPSERT id=%s twilioSid=%s status=%s duration=%s hasRec=%s accId=%s conId=%s', _rid, callData.id, callData.twilioSid, callData.status, callData.duration, !!callData.recordingUrl, callData.accountId, callData.contactId);
        } catch(_) {}
        
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
