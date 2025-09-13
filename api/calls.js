const twilio = require('twilio');
const { admin, db } = require('./_firebase');

// CORS middleware
function corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
                            outcome: d.outcome || (d.status === 'completed' ? 'Connected' : (d.status === 'in-progress' || d.status === 'connected' || d.status === 'ringing' ? 'Connected' : 'No Answer')),
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
                                outcome: d.outcome || (d.status === 'completed' ? 'Connected' : (d.status === 'in-progress' || d.status === 'connected' || d.status === 'ringing' ? 'Connected' : 'No Answer')),
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
                            outcome: d.outcome || (d.status === 'completed' ? 'Connected' : (d.status === 'in-progress' || d.status === 'connected' || d.status === 'ringing' ? 'Connected' : 'No Answer')),
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
                        // Prefer non-empty transcript and present aiInsights
                        const prevTranscript = (prev.transcript || '').trim();
                        const currTranscript = (c.transcript || '').trim();
                        merged.transcript = currTranscript || prevTranscript || '';
                        merged.aiInsights = c.aiInsights || prev.aiInsights || null;
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
                outcome: call.status === 'completed' ? 'Connected' : (call.status === 'in-progress' || call.status === 'connected' || call.status === 'ringing' ? 'Connected' : 'No Answer'),
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
        // Track placeholder to delete if we upgrade it to canonical callSid
        let deleteOldId = null;

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
            
            // Prepare best-available to/from for upgrade matching (fetch Twilio Call if needed)
            let matchTo = to;
            let matchFrom = from;
            if ((!matchTo || !matchFrom) && callSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                try {
                    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                    const call = await client.calls(callSid).fetch();
                    matchTo = matchTo || call.to;
                    matchFrom = matchFrom || call.from;
                    try { console.log('[Calls][POST][%s] Fetched Call resource for upgrade match to=%s from=%s', _rid, matchTo, matchFrom); } catch(_) {}
                } catch (e) {
                    console.warn('[Calls][POST][%s] Twilio Call fetch failed for upgrade match:', _rid, e?.message);
                }
            }

            // 2b) If we have a callSid but no exact match, try to UPGRADE a recent placeholder row (no twilioSid) to this callSid
            if ((!existingCall || !existingCall.id) && callSid) {
                try {
                    const now = Date.now();
                    const incomingTs = new Date(timestamp || callTime || now).getTime() || now;
                    const UPGRADE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
                    const targetCounterparty = (targetPhone && norm(targetPhone)) || otherParty(matchTo, matchFrom);
                    let best = null; let bestTs = -1; let bestKey = null;
                    // scan memory placeholders
                    for (const [k,v] of callStore.entries()) {
                        try {
                            if (!v || v.twilioSid) continue; // only placeholders
                            const ts = new Date(v.timestamp || v.callTime || 0).getTime();
                            if (!ts || Math.abs(incomingTs - ts) > UPGRADE_WINDOW_MS) continue;
                            const candCp = otherParty(v.to, v.from);
                            if (!candCp || candCp !== targetCounterparty) continue;
                            const hasMedia = !!(v.recordingUrl || (v.transcript && String(v.transcript).trim()!==''));
                            if (hasMedia) continue; // don't upgrade finished calls
                            const score = (ts || 0);
                            if (score > bestTs) { bestTs = score; best = v; bestKey = k; }
                        } catch(_) {}
                    }
                    if (best && best.id) {
                        try { console.log('[Calls][POST][%s] Upgrading placeholder id=%s -> callSid=%s', _rid, best.id, callSid); } catch(_) {}
                        existingCall = best; // merge from placeholder
                        deleteOldId = best.id !== callSid ? best.id : null;
                        callId = callSid; // canonicalize
                    }
                    // Firestore upgrade scan
                    if ((!existingCall || !existingCall.id) && db) {
                        try {
                            const sinceIso = new Date(Date.now() - UPGRADE_WINDOW_MS).toISOString();
                            const snap = await db.collection('calls').where('timestamp', '>=', sinceIso).orderBy('timestamp', 'desc').limit(25).get();
                            let fbBest = null; let fbScore = -1;
                            snap.forEach(doc => {
                                const d = doc.data() || {};
                                if (d.twilioSid) return; // skip real rows
                                const ts = new Date(d.timestamp || d.callTime || 0).getTime();
                                if (!ts || Math.abs(incomingTs - ts) > UPGRADE_WINDOW_MS) return;
                                const candCp = otherParty(d.to, d.from);
                                if (!candCp || candCp !== targetCounterparty) return;
                                const hasMedia = !!(d.recordingUrl || (d.transcript && String(d.transcript).trim()!==''));
                                if (hasMedia) return;
                                const score = (ts || 0);
                                if (score > fbScore) { fbScore = score; fbBest = { id: doc.id, ...d }; }
                            });
                            if (fbBest && fbBest.id) {
                                try { console.log('[Calls][POST][%s] Firestore upgrade placeholder id=%s -> callSid=%s', _rid, fbBest.id, callSid); } catch(_) {}
                                existingCall = fbBest;
                                deleteOldId = fbBest.id !== callSid ? fbBest.id : null;
                                callId = callSid;
                            }
                        } catch (fe) {
                            console.warn('[Calls][POST][%s] Firestore upgrade scan failed:', _rid, fe?.message);
                        }
                    }
                } catch(_) {}
            }
            // 3) Fallback to window-based counterparty matching (ONLY when no callSid and candidate is clearly in-progress)
            try {
                if (!callSid) {
                    const now = Date.now();
                    const incomingTs = new Date(timestamp || callTime || now).getTime() || now;
                    const MERGE_WINDOW_MS = 90 * 1000; // 90 seconds
                    const isInProgressStatus = (s)=>['queued','initiated','ringing','in-progress','connected','busy','no-answer','canceled'].includes(String(s||'').toLowerCase());

                    // If caller provided a clear targetPhone, prefer it as counterparty
                    const targetCounterparty = (targetPhone && norm(targetPhone)) || otherParty(to, from);
                    try { console.log('[Calls][POST][%s] bizList=%j targetCounterparty=%s', _rid, bizList, targetCounterparty); } catch(_) {}
                    let best = null;
                    let bestTs = -1;
                    for (const v of callStore.values()) {
                        try {
                            const ts = new Date(v.timestamp || v.callTime || 0).getTime();
                            if (!ts || Math.abs(incomingTs - ts) > MERGE_WINDOW_MS) continue; // narrow window
                            const candCounterparty = otherParty(v.to, v.from);
                            const partyMatch = !!candCounterparty && candCounterparty === targetCounterparty;
                            if (!partyMatch) continue;
                            // Only merge into candidates that are in-progress and missing a recording/transcript
                            const vStatus = String(v.status||'');
                            const vInProgress = isInProgressStatus(vStatus);
                            const vHasMedia = !!(v.recordingUrl || (v.transcript && String(v.transcript).trim()!==''));
                            if (!vInProgress || vHasMedia) continue;
                            // If explicit attribution provided, require it to match to avoid cross-company flips
                            const requireIdMatch = !!(accountId || contactId);
                            const idMatchStrict = ((accountId && v.accountId === accountId) || (contactId && v.contactId === contactId)) ? 1 : 0;
                            if (requireIdMatch && !idMatchStrict) continue;
                            const idBoost = idMatchStrict;
                            const score = (ts || 0) + (idBoost * 1000);
                            if (score > bestTs) { bestTs = score; best = v; }
                            try { console.log('[Calls][POST][%s] candidate id=%s ts=%s cp=%s vStatus=%s hasMedia=%s idMatch=%s', _rid, v.id, new Date(ts).toISOString(), candCounterparty, vStatus, vHasMedia, !!idBoost); } catch(_) {}
                        } catch (_) {}
                    }
                    if (best && best.id) {
                        try { console.log('[Calls][POST][%s] Merging into existing in-progress id=%s (no callSid yet)', _rid, best.id); } catch(_) {}
                        callId = best.id;
                        existingCall = best;
                    }
                    // If not found in memory, try Firestore recent rows
                    if ((!existingCall || !existingCall.id) && db) {
                        try {
                            const sinceIso = new Date(Date.now() - (2 * MERGE_WINDOW_MS)).toISOString();
                            let query = db.collection('calls').where('timestamp', '>=', sinceIso).orderBy('timestamp', 'desc').limit(25);
                            const snap = await query.get();
                            let fbBest = null;
                            let fbScore = -1;
                            snap.forEach(doc => {
                                const d = doc.data() || {};
                                const ts = new Date(d.timestamp || d.callTime || 0).getTime();
                                const candCp = otherParty(d.to, d.from);
                                const partyMatch = !!candCp && candCp === targetCounterparty;
                                if (!partyMatch) return;
                                const dInProgress = isInProgressStatus(d.status);
                                const dHasMedia = !!(d.recordingUrl || (d.transcript && String(d.transcript).trim()!==''));
                                if (!dInProgress || dHasMedia) return;
                                const requireIdMatch = !!(accountId || contactId);
                                const idMatchStrict = ((accountId && d.accountId === accountId) || (contactId && d.contactId === contactId)) ? 1 : 0;
                                if (requireIdMatch && !idMatchStrict) return;
                                const idBoost = idMatchStrict;
                                const score = (ts || 0) + (idBoost * 1000);
                                if (score > fbScore) { fbScore = score; fbBest = { id: doc.id, ...d }; }
                                try { console.log('[Calls][POST][%s] FS cand id=%s ts=%s cp=%s status=%s hasMedia=%s idMatch=%s', _rid, doc.id, new Date(ts).toISOString(), candCp, d.status, dHasMedia, !!idBoost); } catch(_) {}
                            });
                            if (fbBest && fbBest.id) {
                                callId = fbBest.id;
                                existingCall = fbBest;
                                try { console.log('[Calls][POST][%s] Firestore in-progress merge target id=%s', _rid, callId); } catch(_) {}
                            } else {
                                try { console.log('[Calls][POST][%s] No Firestore in-progress merge target found', _rid); } catch(_) {}
                            }
                        } catch (fe) {
                            console.warn('[Calls][POST][%s] Firestore merge search failed:', _rid, fe?.message);
                        }
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
        
        // Merge aiInsights if provided (do not wipe existing fields with empty strings)
        const mergedInsights = (()=>{
            const curr = existingCall.aiInsights || {};
            const inc = aiInsights || {};
            if (!aiInsights) return curr;
            const deep = (a,b)=>{
                if (!b) return a;
                const out = { ...a };
                for (const k of Object.keys(b)){
                    const v = b[k];
                    if (v == null) continue;
                    if (typeof v === 'object' && !Array.isArray(v)) out[k] = deep(a[k]||{}, v);
                    else if (Array.isArray(v)) out[k] = v.length ? v : (a[k]||v);
                    else if (typeof v === 'string') out[k] = v.trim()!=='' ? v : (a[k]||'');
                    else out[k] = v;
                }
                return out;
            };
            return deep(curr, inc);
        })();

        const callData = {
            ...existingCall,
            id: callId,
            to: _to,
            from: _from,
            status: status || existingCall.status || 'initiated',
            duration: _duration,
            timestamp: timestamp || callTime || existingCall.timestamp || new Date().toISOString(),
            transcript: transcript || existingCall.transcript,
            aiInsights: mergedInsights,
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
                // If we upgraded from a placeholder, delete the old doc to avoid duplicates
                if (deleteOldId && deleteOldId !== callId) {
                    try {
                        await db.collection('calls').doc(deleteOldId).delete();
                        try { console.log('[Calls][POST][%s] Deleted placeholder doc id=%s after upgrade', _rid, deleteOldId); } catch(_) {}
                    } catch (delErr) {
                        console.warn('[Calls][POST][%s] Failed to delete placeholder doc id=%s: %s', _rid, deleteOldId, delErr?.message);
                    }
                }
                // Final safety cleanup: remove any recent placeholder duplicates for the same counterparty/contact
                try {
                    const CLEAN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
                    const now = Date.now();
                    const incomingTs = new Date(callData.timestamp || callData.callTime || now).getTime() || now;
                    const sinceIso = new Date(Date.now() - CLEAN_WINDOW_MS).toISOString();
                    const snapshot = await db.collection('calls').where('timestamp', '>=', sinceIso).orderBy('timestamp', 'desc').limit(50).get();
                    const targetCounterparty = otherParty(callData.to, callData.from);
                    const toDelete = [];
                    snapshot.forEach(doc => {
                        if (doc.id === callId) return;
                        const d = doc.data() || {};
                        if (d.twilioSid) return;
                        // If contactId matches, that's a strong signal
                        const contactMatch = !!(callData.contactId && d.contactId && d.contactId === callData.contactId);
                        const ts = new Date(d.timestamp || d.callTime || 0).getTime();
                        if (!ts || Math.abs(incomingTs - ts) > CLEAN_WINDOW_MS) return;
                        const candCp = otherParty(d.to, d.from);
                        const cpMatch = !!candCp && !!targetCounterparty && candCp === targetCounterparty;
                        const hasMedia = !!(d.recordingUrl || (d.transcript && String(d.transcript).trim()!==''));
                        if (hasMedia) return;
                        if (contactMatch || cpMatch) {
                            toDelete.push(doc.id);
                        }
                    });
                    for (const delId of toDelete) {
                        if (delId === callId) continue;
                        try {
                            await db.collection('calls').doc(delId).delete();
                            try { console.log('[Calls][POST][%s] Cleanup deleted stray placeholder id=%s', _rid, delId); } catch(_) {}
                        } catch (delErr) {
                            console.warn('[Calls][POST][%s] Cleanup failed to delete id=%s: %s', _rid, delId, delErr?.message);
                        }
                    }
                } catch (cleanupErr) {
                    console.warn('[Calls][POST][%s] Cleanup scan error: %s', _rid, cleanupErr?.message);
                }
            }
        } catch (e) {
            console.warn('[Calls] Firestore POST failed, storing in memory only:', e?.message);
        }
        
        // Always upsert into in-memory store as a fallback cache
        callStore.set(callId, callData);
        // Remove placeholder from memory if we upgraded
        try {
            if (deleteOldId && deleteOldId !== callId) {
                for (const [k, v] of callStore.entries()) {
                    if (v && v.id === deleteOldId) { callStore.delete(k); break; }
                }
            }
        } catch(_) {}
        
        return res.status(200).json({
            ok: true,
            call: callData
        });
    }
    
    if (req.method === 'DELETE') {
        // Delete a call by ID (robust: by doc id, by twilioSid, or by stored id field)
        const { id, twilioSid } = req.body || {};
        const candidates = [id, twilioSid].filter(Boolean);
        if (candidates.length === 0) {
            return res.status(400).json({ error: 'Call identifier is required (id or twilioSid)' });
        }
        
        try {
            let deletedDocId = null;
            if (db) {
                const col = db.collection('calls');

                // 1) Try exact document ID(s)
                for (const cand of candidates) {
                    try {
                        const ref = col.doc(cand);
                        const snap = await ref.get();
                        if (snap.exists) {
                            await ref.delete();
                            deletedDocId = cand;
                            console.log(`[Calls][DELETE] Deleted call ${cand} by doc id`);
                            break;
                        }
                    } catch (e) {
                        // continue to other strategies
                    }
                }

                // 2) Try where twilioSid == candidate
                if (!deletedDocId) {
                    for (const cand of candidates) {
                        const q = await col.where('twilioSid', '==', cand).limit(1).get();
                        if (!q.empty) {
                            const doc = q.docs[0];
                            await col.doc(doc.id).delete();
                            deletedDocId = doc.id;
                            console.log(`[Calls][DELETE] Deleted call ${doc.id} by twilioSid=${cand}`);
                            break;
                        }
                    }
                }

                // 3) Try where id field == candidate
                if (!deletedDocId) {
                    for (const cand of candidates) {
                        const q = await col.where('id', '==', cand).limit(1).get();
                        if (!q.empty) {
                            const doc = q.docs[0];
                            await col.doc(doc.id).delete();
                            deletedDocId = doc.id;
                            console.log(`[Calls][DELETE] Deleted call ${doc.id} by stored id field=${cand}`);
                            break;
                        }
                    }
                }
            }
            
            // Also remove from in-memory store if it exists (try by id and by twilioSid)
            for (const cand of candidates) {
                if (callStore.has(cand)) {
                    callStore.delete(cand);
                    console.log(`[Calls][DELETE] Deleted call ${cand} from memory store (key match)`);
                } else {
                    // try matching by field
                    for (const [k, v] of callStore.entries()) {
                        if (!v) continue;
                        if (v.twilioSid === cand || v.id === cand) {
                            callStore.delete(k);
                            console.log(`[Calls][DELETE] Deleted call ${k} from memory store (field match)`);
                            break;
                        }
                    }
                }
            }
            
            if (!deletedDocId && db) {
                return res.status(404).json({ success: false, error: 'Call not found for deletion' });
            }
            
            return res.status(200).json({ success: true, message: 'Call deleted successfully', id: deletedDocId || id || twilioSid });
            
        } catch (error) {
            console.error('[Calls][DELETE] Error deleting call:', error);
            return res.status(500).json({ error: 'Failed to delete call', details: error.message });
        }
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
}

// Export call store for other modules
export { callStore };
