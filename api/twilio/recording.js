import twilio from 'twilio';
import { resolveToCallSid, isCallSid } from '../_twilio-ids.js';

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

function normalizeBody(req) {
    // Supports: JS object, JSON string, x-www-form-urlencoded string
    const ct = (req.headers['content-type'] || '').toLowerCase();
    const b = req.body;
    if (!b) return req.query || {};
    if (typeof b === 'object') return b;
    if (typeof b === 'string') {
        try {
            if (ct.includes('application/json')) return JSON.parse(b);
        } catch(_) {}
        try {
            const params = new URLSearchParams(b);
            const out = {};
            for (const [k, v] of params.entries()) out[k] = v;
            return out;
        } catch(_) {}
    }
    return b;
}

// In-memory call storage (replace with database in production)
const callStore = new Map();

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const body = normalizeBody(req);
        const {
            RecordingUrl,
            RecordingSid,
            CallSid,
            AccountSid,
            RecordingStatus,
            RecordingDuration
        } = body;
        
        try {
            console.log('[Recording] Webhook headers:', {
                host: req.headers.host,
                'user-agent': req.headers['user-agent'] || '',
                'content-type': req.headers['content-type'] || '',
                'x-twilio-signature': req.headers['x-twilio-signature'] || ''
            });
        } catch(_) {}
        console.log('[Recording] Webhook received:', {
            RecordingSid,
            CallSid,
            RecordingStatus,
            RecordingDuration,
            RecordingUrl: RecordingUrl || '(none)'
        });
        try { console.log('[Recording] Raw body:', JSON.stringify(body).slice(0, 1200)); } catch(_) {}
        try { if (body && (body.RecordingChannels || body.RecordingTrack)) console.log('[Recording] Channels/Track:', body.RecordingChannels || '(n/a)', body.RecordingTrack || '(n/a)'); } catch(_) {}
        
        // Log all recording-related fields for debugging
        try {
            console.log('[Recording] All recording fields:', {
                RecordingSource: body.RecordingSource,
                RecordingChannels: body.RecordingChannels,
                RecordingTrack: body.RecordingTrack,
                RecordingStatus: body.RecordingStatus,
                RecordingDuration: body.RecordingDuration,
                CallSid: body.CallSid,
                RecordingSid: body.RecordingSid
            });
        } catch(_) {}
        
        // Guard: ignore only MONO DialVerb completions; allow dual ("2" or "dual")
        try {
            const src = String(body.RecordingSource || body.Source || '').toLowerCase();
            const chRaw = String(body.RecordingChannels || body.Channels || '').toLowerCase();
            const chNum = Number(body.RecordingChannels || body.Channels || 0);
            const isDual = chRaw === '2' || chRaw === 'dual' || chRaw === 'both' || chNum === 2;
            
            console.log('[Recording] Channel analysis:', { 
                RecordingChannels: body.RecordingChannels, 
                chRaw, 
                chNum, 
                isDual, 
                RecordingSource: body.RecordingSource,
                src 
            });
            
            // Monitor for dual-channel recording failures (alert condition)
            if (RecordingStatus === 'completed' && src === 'dialverb' && !isDual) {
                console.warn('[Recording] ⚠️ DUAL-CHANNEL FAILURE: DialVerb recording fell back to mono!', {
                    CallSid,
                    RecordingSid,
                    RecordingChannels: body.RecordingChannels,
                    RecordingSource: body.RecordingSource,
                    RecordingDuration: body.RecordingDuration
                });
            }
            
            if (RecordingStatus === 'completed' && src === 'dialverb' && !isDual) {
                console.log('[Recording] Ignoring mono DialVerb completion (will rely on REST dual):', { RecordingSid, CallSid, RecordingChannels: body.RecordingChannels, RecordingSource: body.RecordingSource });
                return res.status(200).json({ success: true, ignored: true, reason: 'mono_dialverb' });
            }
        } catch(_) {}

        // If the recording is completed but RecordingUrl is missing, attempt to fetch it by CallSid
        let effectiveRecordingUrl = RecordingUrl || '';
        let effectiveRecordingSid = RecordingSid || '';
        if (RecordingStatus === 'completed' && !effectiveRecordingUrl && CallSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            try {
                const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                const recs = await client.recordings.list({ callSid: CallSid, limit: 1 });
                if (recs && recs.length > 0) {
                    effectiveRecordingSid = recs[0].sid;
                    effectiveRecordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${effectiveRecordingSid}.mp3`;
                    console.log('[Recording] Fetched recording by CallSid:', { effectiveRecordingSid, effectiveRecordingUrl });
                } else {
                    console.log('[Recording] No recordings found via API for CallSid:', CallSid);
                }
            } catch (e) {
                console.warn('[Recording] Failed to fetch recording by CallSid:', e?.message);
            }
        }

        if (RecordingStatus === 'completed' && (effectiveRecordingUrl || RecordingUrl)) {
            // Resolve a reliable Call SID to avoid duplicate rows keyed by recording/transcript IDs
            let finalCallSid = (CallSid && isCallSid(CallSid)) ? CallSid : null;
            if (!finalCallSid) {
                try {
                    finalCallSid = await resolveToCallSid({ callSid: CallSid, recordingSid: effectiveRecordingSid || RecordingSid });
                } catch (_) {}
            }
            // Ensure we have a direct mp3 URL for playback with dual-channel support
            const rawUrl = effectiveRecordingUrl || RecordingUrl;
            let baseMp3;
            if (rawUrl.endsWith('.mp3')) {
                baseMp3 = rawUrl;
            } else if (rawUrl.includes('/Recordings/') && !rawUrl.includes('.')) {
                // Twilio Recording resource URL format
                baseMp3 = `${rawUrl}.mp3`;
            } else {
                baseMp3 = rawUrl;
            }
            
            // Always append RequestedChannels=2 for dual-channel playback
            const recordingMp3Url = baseMp3.includes('?') 
                ? `${baseMp3}&RequestedChannels=2` 
                : `${baseMp3}?RequestedChannels=2`;
            
            console.log('[Recording] Processed URL for dual-channel:', {
                original: rawUrl,
                final: recordingMp3Url,
                recordingSid: effectiveRecordingSid || RecordingSid
            });

            // Store call data in local memory (best-effort)
            const callData = {
                id: CallSid,
                recordingSid: effectiveRecordingSid || RecordingSid,
                recordingUrl: recordingMp3Url,
                duration: parseInt(RecordingDuration) || 0,
                status: 'completed',
                timestamp: new Date().toISOString(),
                transcript: null,
                aiInsights: null,
                // Store dual-channel recording metadata
                recordingChannels: body.RecordingChannels || body.Channels || '1',
                recordingTrack: body.RecordingTrack || 'inbound',
                recordingSource: body.RecordingSource || body.Source || 'unknown'
            };

            callStore.set(CallSid, callData);

            // Determine base URL from request headers (works for any deployment domain)
            const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host;
            const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || '';
            const baseUrl = host ? `${proto}://${host}` : (envBase || 'https://power-choosers-crm-792458658491.us-south1.run.app');

            // Upsert into central /api/calls so the UI can see the recording immediately
            try {
                // Attempt to fetch Call resource so we can include to/from
                let callResource = null;
                if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && finalCallSid) {
                    try {
                        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                        callResource = await client.calls(finalCallSid).fetch();
                    } catch (fe) {
                        console.warn('[Recording] Could not fetch Call resource:', fe?.message);
                    }
                }

                // Using baseUrl computed above

                // Derive targetPhone and businessPhone to assist merge on the /api/calls endpoint
                const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
                const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
                  .split(',').map(norm).filter(Boolean);
                const to10 = norm(callResource?.to || '');
                const from10 = norm(callResource?.from || '');
                const isBiz = (p) => !!p && envBiz.includes(p);
                const businessPhone = isBiz(to10) ? callResource?.to : (isBiz(from10) ? callResource?.from : (envBiz[0] || ''));
                const targetPhone = isBiz(to10) && !isBiz(from10) ? from10 : (isBiz(from10) && !isBiz(to10) ? to10 : (to10 || from10));

                if (finalCallSid) {
                    // Initial upsert with best-known fields (may be refined later)
                    await fetch(`${baseUrl}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callSid: finalCallSid,
                            to: callResource?.to || undefined,
                            from: callResource?.from || undefined,
                            status: 'completed',
                            duration: parseInt(RecordingDuration) || parseInt(callResource?.duration, 10) || 0,
                            recordingUrl: recordingMp3Url,
                            recordingSid: effectiveRecordingSid || RecordingSid,
                            // Include recording metadata for UI rendering
                            recordingChannels: (body.RecordingChannels != null ? String(body.RecordingChannels) : (body.Channels != null ? String(body.Channels) : '')) || undefined,
                            recordingTrack: body.RecordingTrack || undefined,
                            recordingSource: body.RecordingSource || body.Source || undefined,
                            source: 'twilio-recording-webhook',
                            targetPhone: targetPhone || undefined,
                            businessPhone: businessPhone || undefined
                        })
                    }).catch(() => {});
                    console.log('[Recording] Posted initial call data to /api/calls for', finalCallSid);

                    // If duration is 0 or metadata looked incomplete, schedule a follow-up refresh
                    try {
                        const needsRefresh = !RecordingDuration || String(RecordingDuration) === '0';
                        if (needsRefresh && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (effectiveRecordingSid || RecordingSid)) {
                            setTimeout(async () => {
                                try {
                                    const client2 = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                                    const recRes = await client2.recordings((effectiveRecordingSid || RecordingSid)).fetch();
                                    const finalDuration = parseInt(recRes.duration, 10) || 0;
                                    const finalChannels = recRes.channels != null ? String(recRes.channels) : undefined;
                                    const finalTrack = recRes.track || undefined;
                                    const finalSource = recRes.source || undefined;
                                    if (finalDuration || finalChannels || finalTrack || finalSource) {
                                        await fetch(`${baseUrl}/api/calls`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                callSid: finalCallSid,
                                                duration: finalDuration,
                                                recordingChannels: finalChannels,
                                                recordingTrack: finalTrack,
                                                recordingSource: finalSource
                                            })
                                        }).catch(() => {});
                                        console.log('[Recording] Refreshed call with final duration/metadata:', { finalDuration, finalChannels, finalTrack, finalSource });
                                    }
                                } catch (re) {
                                    console.warn('[Recording] Follow-up Recording fetch failed:', re?.message);
                                }
                            }, 6000); // allow processing time
                        }
                    } catch(_) {}
                } else {
                    console.warn('[Recording] Skipping initial /api/calls post due to unresolved Call SID', { CallSid, RecordingSid: effectiveRecordingSid || RecordingSid });
                }
            } catch (e) {
                console.warn('[Recording] Failed posting initial call data to /api/calls:', e?.message);
            }

            // Trigger background processing (non-blocking) - FIXED FREEZE ISSUE
            try {
                if (finalCallSid) {
                    // Schedule background processing without blocking webhook response
                    setImmediate(async () => {
                        try {
                            await processRecordingWithTwilio(recordingMp3Url, finalCallSid, effectiveRecordingSid || RecordingSid, baseUrl);
                        } catch (error) {
                            console.error('[Recording] Background processing error:', error);
                        }
                    });
                    console.log('[Recording] Background processing scheduled for:', finalCallSid);
                } else {
                    console.warn('[Recording] Skipping processing due to unresolved Call SID', { CallSid, RecordingSid: effectiveRecordingSid || RecordingSid });
                }
            } catch (error) {
                console.error('[Recording] Error scheduling background processing:', error);
            }
        }
        
        res.status(200).json({ success: true });
        
    } catch (error) {
        console.error('[Recording] Webhook error:', error);
        res.status(500).json({ 
            error: 'Failed to process recording webhook',
            details: error.message 
        });
    }
}

async function processRecordingWithTwilio(recordingUrl, callSid, recordingSid, baseUrl) {
    try {
        console.log('[Recording] Starting Twilio AI processing for:', callSid);

        // Hard gate: On-demand CI only. When disabled, do not auto-transcribe or create CI.
        try {
            const auto = String(process.env.CI_AUTO_PROCESS || '').toLowerCase();
            const shouldAuto = auto === '1' || auto === 'true' || auto === 'yes';
            if (!shouldAuto) {
                console.log('[Recording] CI auto-processing disabled; skipping transcription/AI until eye button request.');
                // Persist minimal metadata so UI knows recording is ready but not processed
                try {
                    const base = baseUrl || process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app';
                    await fetch(`${base}/api/calls`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callSid,
                            recordingSid,
                            recordingUrl,
                            aiInsights: null,
                            conversationalIntelligence: { status: 'not-requested' }
                        })
                    }).catch(() => {});
                } catch (_) {}
                return; // Do not continue with any transcription/CI work
            }
        } catch (_) {}
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        // Determine which dual-channel maps to Agent vs Customer
        let agentChannelStr = '1';
        try {
            let callResource = null;
            try { callResource = await client.calls(callSid).fetch(); } catch(_) {}
            const fromStr = callResource?.from || '';
            const toStr = callResource?.to || '';
            const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
            const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
              .split(',').map(norm).filter(Boolean);
            const from10 = norm(fromStr);
            const to10 = norm(toStr);
            const isBiz = (p) => !!p && envBiz.includes(p);
            const fromIsClient = /^client:/i.test(fromStr);
            // Heuristic: Agent is the "from" leg when from is Voice SDK client or our business number; otherwise agent is the "to" leg
            const fromIsAgent = fromIsClient || isBiz(from10) || (!isBiz(to10) && fromStr && fromStr !== toStr);
            agentChannelStr = fromIsAgent ? '1' : '2';
            console.log(`[Recording] Channel-role mapping: agent on channel ${agentChannelStr} (from=${fromStr}, to=${toStr})`);
        } catch (e) {
            console.warn('[Recording] Failed to compute channel-role mapping, defaulting agent to channel 1:', e?.message);
        }
        const normalizeChannel = (c) => {
            const s = (c == null ? '' : String(c)).trim();
            if (s === '0') return '1';
            if (/^[Aa]$/.test(s)) return '1';
            if (/^[Bb]$/.test(s)) return '2';
            return s;
        };
        const resolveRoleFromSentence = (s) => {
            try {
                const chStr = normalizeChannel(s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex);
                const sp = (s.speaker || s.role || '').toString().toLowerCase();
                if (sp.includes('agent') || sp.includes('rep')) return 'agent';
                if (sp.includes('customer') || sp.includes('caller') || sp.includes('client')) return 'customer';
                if (chStr) return chStr === agentChannelStr ? 'agent' : 'customer';
            } catch(_) {}
            return '';
        };
        
        // Try Conversational Intelligence first, then fallback to basic transcription
        let transcript = '';
        let aiInsights = null;
        let conversationalIntelligence = null;
        
        try {
            // Check if Conversational Intelligence service is configured
            const serviceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID;
            let speakerTurns = [];
            
            if (serviceSid) {
                console.log('[Recording] Using Conversational Intelligence service');
                
                // Try to get existing Conversational Intelligence transcript
                const transcripts = await client.intelligence.v2.transcripts.list({
                    serviceSid: serviceSid,
                    sourceSid: recordingSid,
                    limit: 1
                });
                
                if (transcripts.length > 0) {
                    let ciTranscript = await client.intelligence.v2.transcripts(transcripts[0].sid).fetch();

                    // If transcript exists but isn't completed yet, poll until completion (up to 2 minutes)
                    if (['queued', 'in-progress'].includes((ciTranscript.status || '').toLowerCase())) {
                        console.log('[Recording] Existing CI transcript found but not completed — polling...');
                        let attempts = 0;
                        const maxAttempts = 20; // 20 * 6s = 120s
                        let polled = ciTranscript;
                        while (attempts < maxAttempts && ['queued', 'in-progress'].includes((polled.status || '').toLowerCase())) {
                            await new Promise(r => setTimeout(r, 6000));
                            polled = await client.intelligence.v2.transcripts(ciTranscript.sid).fetch();
                            attempts++;
                            if (attempts % 5 === 0) console.log(`[Recording] Waiting for existing CI transcript... (${attempts*6}s)`);
                        }
                        if ((polled.status || '').toLowerCase() === 'completed') {
                        const sentences = await client.intelligence.v2
                            .transcripts(polled.sid)
                            .sentences.list();
                        const pickText = (s) => {
                            if (!s || typeof s !== 'object') return '';
                            const candidates = [s.text, s.sentence, s.body, s.content, s.transcript];
                            for (const c of candidates) { if (typeof c === 'string' && c.trim()) return c.trim(); }
                            if (Array.isArray(s.words)) {
                                const w = s.words.map(w => (w && (w.text || w.word || w.value || '')).toString().trim()).filter(Boolean).join(' ');
                                if (w) return w;
                            }
                            return '';
                        };
                        const turns = [];
                        const sentencesSlim = [];
                        for (const s of sentences) {
                            const txt = pickText(s);
                            if (!txt) continue;
                            const role = resolveRoleFromSentence(s);
                            const start = (s.startTime ?? s.start_time ?? s.start ?? 0);
                            const t = typeof start === 'number' ? start : (parseFloat(start) || 0);
                            turns.push({ t: Math.max(0, Math.round(t)), role, text: txt });
                            try { sentencesSlim.push({ text: txt, startTime: t, endTime: (s.endTime ?? s.end_time ?? s.end ?? t), channel: s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex, speaker: s.speaker || '', role: s.role || '', confidence: s.confidence }); } catch(_) {}
                        }
                        // Fallback: if no roles were assigned from sentences, try words with channels
                        try {
                            const hasKnownRoles = turns.some(x => x.role === 'agent' || x.role === 'customer');
                            if (!hasKnownRoles) {
                                const words = await client.intelligence.v2
                                  .transcripts(polled.sid)
                                  .words.list();
                                const list = Array.isArray(words) ? words : [];
                                if (list.length) {
                                    const normWordText = (w) => (w && (w.text || w.word || w.value || '')).toString().trim();
                                    const normalizeChannelWord = (c) => { const s = (c==null?'':String(c)).trim(); if (s==='0') return '1'; if (/^[Aa]$/.test(s)) return '1'; if (/^[Bb]$/.test(s)) return '2'; return s; };
                                    const segments = [];
                                    let current = null;
                                    for (const w of list) {
                                        const txt = normWordText(w);
                                        if (!txt) continue;
                                        const ch = normalizeChannelWord(w.channel ?? w.channelNumber ?? w.channel_id ?? w.channelIndex);
                                        let role = '';
                                        const sp = (w.speaker || w.role || '').toString().toLowerCase();
                                        if (sp.includes('agent') || sp.includes('rep')) role = 'agent';
                                        else if (sp.includes('customer') || sp.includes('caller') || sp.includes('client')) role = 'customer';
                                        else role = (ch === agentChannelStr) ? 'agent' : 'customer';
                                        const startW = (w.startTime ?? w.start_time ?? w.start ?? 0);
                                        const tW = typeof startW === 'number' ? startW : (parseFloat(startW) || 0);
                                        const gapOk = !current || (tW - current._lastStart) <= 1.25;
                                        if (current && current.role === role && gapOk) {
                                            current.text += (current.text ? ' ' : '') + txt;
                                            current._lastStart = tW;
                                            current.t = Math.round(tW);
                                        } else {
                                            if (current) segments.push({ t: current.t, role: current.role, text: current.text });
                                            current = { role, t: Math.max(0, Math.round(tW)), text: txt, _lastStart: tW };
                                        }
                                    }
                                    if (current) segments.push({ t: current.t, role: current.role, text: current.text });
                                    if (segments.length) {
                                        console.log('[Recording][CI] Built speaker turns from words due to missing roles in sentences:', segments.length);
                                        speakerTurns = segments;
                                        transcript = segments.map(x => x.text).join(' ');
                                    }
                                }
                            }
                        } catch (e) { console.warn('[Recording][CI] Words fallback failed:', e?.message); }
                        if (turns.length) speakerTurns = turns;
                        transcript = turns.map(x => x.text).join(' ');
                        if (!transcript && sentences && sentences.length) {
                            try { console.log('[Recording][CI] Example sentence keys:', Object.keys(sentences[0]||{})); } catch(_) {}
                        }
                            conversationalIntelligence = {
                                transcriptSid: polled.sid,
                                status: polled.status,
                                sentenceCount: sentences.length,
                                averageConfidence: sentences.length > 0 ?
                                    sentences.reduce((acc, s) => acc + (s.confidence || 0), 0) / sentences.length : 0,
                                sentences: sentencesSlim,
                                channelRoleMap: { agentChannel: agentChannelStr, customerChannel: agentChannelStr === '1' ? '2' : '1' }
                            };
                            console.log(`[Recording] CI transcript (existing) completed with ${sentences.length} sentences, transcript length: ${transcript.length}`);
                        }
                    } else if ((ciTranscript.status || '').toLowerCase() === 'completed') {
                        // Get sentences from Conversational Intelligence
                        let sentences = await client.intelligence.v2
                            .transcripts(ciTranscript.sid)
                            .sentences.list();
                        // If sentences lack channel/speaker entirely, recreate transcript with participants mapping
                        try {
                            const lacksDiarization = Array.isArray(sentences) && sentences.length > 0 && sentences.every(s => (s.channel == null && !s.speaker && !s.role));
                            if (lacksDiarization) {
                                console.log('[Recording] Existing CI transcript has no channel/speaker diarization. Recreating with participants mapping...');
                                try { await client.intelligence.v2.transcripts(ciTranscript.sid).remove(); } catch(_) {}
                                const agentChNum = Number(agentChannelStr === '2' ? 2 : 1);
                                const custChNum = agentChNum === 1 ? 2 : 1;
                                const recreated = await client.intelligence.v2.transcripts.create({
                                    serviceSid: serviceSid,
                                    channel: {
                                        media_properties: { source_sid: recordingSid },
                                        participants: [
                                            { role: 'Agent', channel_participant: agentChNum },
                                            { role: 'Customer', channel_participant: custChNum }
                                        ]
                                    },
                                    customerKey: callSid
                                });
                                ciTranscript = recreated;
                                // Re-fetch sentences after recreation
                                const attemptsRe = 10; // up to ~60s
                                let tries = 0, status = recreated.status;
                                while (tries < attemptsRe && ['queued','in-progress'].includes((status||'').toLowerCase())){
                                    await new Promise(r=>setTimeout(r,6000));
                                    const tmp = await client.intelligence.v2.transcripts(recreated.sid).fetch();
                                    status = tmp.status; tries++;
                                }
                                if ((status||'').toLowerCase()==='completed'){
                                    sentences = await client.intelligence.v2
                                        .transcripts(recreated.sid)
                                        .sentences.list();
                                }
                            }
                        } catch(_) {}
                        const pickText = (s) => {
                            if (!s || typeof s !== 'object') return '';
                            const candidates = [s.text, s.sentence, s.body, s.content, s.transcript];
                            for (const c of candidates) { if (typeof c === 'string' && c.trim()) return c.trim(); }
                            if (Array.isArray(s.words)) {
                                const w = s.words.map(w => (w && (w.text || w.word || w.value || '')).toString().trim()).filter(Boolean).join(' ');
                                if (w) return w;
                            }
                            return '';
                        };
                        const turns = [];
                        const sentencesSlim = [];
                        for (const s of sentences) {
                            const txt = pickText(s);
                            if (!txt) continue;
                            const role = resolveRoleFromSentence(s);
                            const start = (s.startTime ?? s.start_time ?? s.start ?? 0);
                            const t = typeof start === 'number' ? start : (parseFloat(start) || 0);
                            turns.push({ t: Math.max(0, Math.round(t)), role, text: txt });
                            try { sentencesSlim.push({ text: txt, startTime: t, endTime: (s.endTime ?? s.end_time ?? s.end ?? t), channel: s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex, speaker: s.speaker || '', role: s.role || '', confidence: s.confidence }); } catch(_) {}
                        }
                        // Fallback: if no roles were assigned from sentences, try words with channels
                        try {
                            const hasKnownRoles = turns.some(x => x.role === 'agent' || x.role === 'customer');
                            if (!hasKnownRoles) {
                                const words = await client.intelligence.v2
                                  .transcripts(ciTranscript.sid)
                                  .words.list();
                                const list = Array.isArray(words) ? words : [];
                                if (list.length) {
                                    const normWordText = (w) => (w && (w.text || w.word || w.value || '')).toString().trim();
                                    const normalizeChannelWord = (c) => { const s = (c==null?'':String(c)).trim(); if (s==='0') return '1'; if (/^[Aa]$/.test(s)) return '1'; if (/^[Bb]$/.test(s)) return '2'; return s; };
                                    const segments = [];
                                    let current = null;
                                    for (const w of list) {
                                        const txt = normWordText(w);
                                        if (!txt) continue;
                                        const ch = normalizeChannelWord(w.channel ?? w.channelNumber ?? w.channel_id ?? w.channelIndex);
                                        let role = '';
                                        const sp = (w.speaker || w.role || '').toString().toLowerCase();
                                        if (sp.includes('agent') || sp.includes('rep')) role = 'agent';
                                        else if (sp.includes('customer') || sp.includes('caller') || sp.includes('client')) role = 'customer';
                                        else role = (ch === agentChannelStr) ? 'agent' : 'customer';
                                        const startW = (w.startTime ?? w.start_time ?? w.start ?? 0);
                                        const tW = typeof startW === 'number' ? startW : (parseFloat(startW) || 0);
                                        const gapOk = !current || (tW - current._lastStart) <= 1.25;
                                        if (current && current.role === role && gapOk) {
                                            current.text += (current.text ? ' ' : '') + txt;
                                            current._lastStart = tW;
                                            current.t = Math.round(tW);
                                        } else {
                                            if (current) segments.push({ t: current.t, role: current.role, text: current.text });
                                            current = { role, t: Math.max(0, Math.round(tW)), text: txt, _lastStart: tW };
                                        }
                                    }
                                    if (current) segments.push({ t: current.t, role: current.role, text: current.text });
                                    if (segments.length) {
                                        console.log('[Recording][CI] Built speaker turns from words due to missing roles in sentences:', segments.length);
                                        speakerTurns = segments;
                                        transcript = segments.map(x => x.text).join(' ');
                                    }
                                }
                            }
                        } catch (e) { console.warn('[Recording][CI] Words fallback failed:', e?.message); }
                        if (turns.length) speakerTurns = turns;
                        transcript = turns.map(x => x.text).join(' ');
                        if (!transcript && sentences && sentences.length) {
                            try { console.log('[Recording][CI] Example sentence keys:', Object.keys(sentences[0]||{})); } catch(_) {}
                        }
                        conversationalIntelligence = {
                            transcriptSid: ciTranscript.sid,
                            status: ciTranscript.status,
                            sentenceCount: sentences.length,
                            averageConfidence: sentences.length > 0 ? 
                                sentences.reduce((acc, s) => acc + (s.confidence || 0), 0) / sentences.length : 0,
                            sentences: sentencesSlim,
                            channelRoleMap: { agentChannel: agentChannelStr, customerChannel: agentChannelStr === '1' ? '2' : '1' }
                        };
                        
                        console.log(`[Recording] Found Conversational Intelligence transcript with ${sentences.length} sentences, transcript length: ${transcript.length}`);
                    }

                    // FALLBACK: If Conversational Intelligence transcript is empty, try basic transcription (only if API available)
                    if (!transcript) {
                        console.log('[Recording] No CI transcript text, trying basic transcription fallback (if supported by SDK)...');
                        try {
                            if (client.transcriptions && typeof client.transcriptions.list === 'function') {
                                const transcriptions = await client.transcriptions.list({ recordingSid: recordingSid, limit: 1 });
                                if (transcriptions.length > 0 && typeof client.transcriptions === 'function') {
                                    const basicTranscription = await client.transcriptions(transcriptions[0].sid).fetch();
                                    transcript = (basicTranscription && basicTranscription.transcriptionText) || '';
                                    console.log(`[Recording] Basic transcription fallback: ${transcript.length} characters`);
                                } else if (client.transcriptions && typeof client.transcriptions.create === 'function') {
                                    // Some SDK versions support create
                                    const created = await client.transcriptions.create({ recordingSid: recordingSid, languageCode: 'en-US' });
                                    let attempts = 0; const maxAttempts = 12;
                                    while (attempts < maxAttempts) {
                                        await new Promise(r => setTimeout(r, 5000));
                                        let t = null;
                                        try { t = await client.transcriptions(created.sid).fetch(); } catch(_) {}
                                        const text = t?.transcriptionText || '';
                                        if (text && text.trim().length > 0) { transcript = text; break; }
                                        attempts++;
                                        if (attempts % 3 === 0) console.log(`[Recording] Waiting for transcription... (${attempts*5}s)`);
                                    }
                                } else {
                                    console.warn('[Recording] Transcriptions API not available in current Twilio SDK version');
                                }
                            } else {
                                console.warn('[Recording] Transcriptions API not present on client');
                            }
                        } catch (fallbackError) {
                            console.warn('[Recording] Basic transcription fallback failed:', fallbackError.message);
                        }
                    }
                } else {
                    // Auto-process is enabled at this point; create new CI transcript
                    // Create new Conversational Intelligence transcript
                    console.log('[Recording] Creating new Conversational Intelligence transcript...');
                    const agentChNum = Number(agentChannelStr === '2' ? 2 : 1);
                    const custChNum = agentChNum === 1 ? 2 : 1;
                    const newTranscript = await client.intelligence.v2.transcripts.create({
                        serviceSid: serviceSid,
                        channel: {
                            media_properties: {
                                source_sid: recordingSid
                            },
                            participants: [
                                { role: 'Agent', channel_participant: agentChNum },
                                { role: 'Customer', channel_participant: custChNum }
                            ]
                        },
                        customerKey: callSid
                    });
                    
                    console.log('[Recording] Created Conversational Intelligence transcript:', newTranscript.sid);
                    
                    // Wait for processing (up to 2 minutes)
                    let attempts = 0;
                    const maxAttempts = 20; // 20 * 6s = 120s
                    while (attempts < maxAttempts && ['queued', 'in-progress'].includes(newTranscript.status)) {
                        await new Promise(r => setTimeout(r, 6000));
                        const updatedTranscript = await client.intelligence.v2.transcripts(newTranscript.sid).fetch();
                        
                        if (updatedTranscript.status === 'completed') {
                            const sentences = await client.intelligence.v2
                                .transcripts(updatedTranscript.sid)
                                .sentences.list();
                            const pickText = (s) => {
                                if (!s || typeof s !== 'object') return '';
                                const candidates = [s.text, s.sentence, s.body, s.content, s.transcript];
                                for (const c of candidates) { if (typeof c === 'string' && c.trim()) return c.trim(); }
                                if (Array.isArray(s.words)) {
                                    const w = s.words.map(w => (w && (w.text || w.word || w.value || '')).toString().trim()).filter(Boolean).join(' ');
                                    if (w) return w;
                                }
                                return '';
                            };
                            const turns = [];
                            const sentencesSlim = [];
                            for (const s of sentences) {
                                const txt = pickText(s);
                                if (!txt) continue;
                                const role = resolveRoleFromSentence(s);
                                const start = (s.startTime ?? s.start_time ?? s.start ?? 0);
                                const t = typeof start === 'number' ? start : (parseFloat(start) || 0);
                                turns.push({ t: Math.max(0, Math.round(t)), role, text: txt });
                                try { sentencesSlim.push({ text: txt, startTime: t, endTime: (s.endTime ?? s.end_time ?? s.end ?? t), channel: s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex, speaker: s.speaker || '', role: s.role || '', confidence: s.confidence }); } catch(_) {}
                            }
                            // Fallback: if no roles were assigned from sentences, try words with channels
                            try {
                                const hasKnownRoles = turns.some(x => x.role === 'agent' || x.role === 'customer');
                                if (!hasKnownRoles) {
                                    const words = await client.intelligence.v2
                                      .transcripts(updatedTranscript.sid)
                                      .words.list();
                                    const list = Array.isArray(words) ? words : [];
                                    if (list.length) {
                                        const normWordText = (w) => (w && (w.text || w.word || w.value || '')).toString().trim();
                                        const normalizeChannelWord = (c) => { const s = (c==null?'':String(c)).trim(); if (s==='0') return '1'; if (/^[Aa]$/.test(s)) return '1'; if (/^[Bb]$/.test(s)) return '2'; return s; };
                                        const segments = [];
                                        let current = null;
                                        for (const w of list) {
                                            const txt = normWordText(w);
                                            if (!txt) continue;
                                            const ch = normalizeChannelWord(w.channel ?? w.channelNumber ?? w.channel_id ?? w.channelIndex);
                                            let role = '';
                                            const sp = (w.speaker || w.role || '').toString().toLowerCase();
                                            if (sp.includes('agent') || sp.includes('rep')) role = 'agent';
                                            else if (sp.includes('customer') || sp.includes('caller') || sp.includes('client')) role = 'customer';
                                            else role = (ch === agentChannelStr) ? 'agent' : 'customer';
                                            const startW = (w.startTime ?? w.start_time ?? w.start ?? 0);
                                            const tW = typeof startW === 'number' ? startW : (parseFloat(startW) || 0);
                                            const gapOk = !current || (tW - current._lastStart) <= 1.25;
                                            if (current && current.role === role && gapOk) {
                                                current.text += (current.text ? ' ' : '') + txt;
                                                current._lastStart = tW;
                                                current.t = Math.round(tW);
                                            } else {
                                                if (current) segments.push({ t: current.t, role: current.role, text: current.text });
                                                current = { role, t: Math.max(0, Math.round(tW)), text: txt, _lastStart: tW };
                                            }
                                        }
                                        if (current) segments.push({ t: current.t, role: current.role, text: current.text });
                                        if (segments.length) {
                                            console.log('[Recording][CI] Built speaker turns from words due to missing roles in sentences:', segments.length);
                                            speakerTurns = segments;
                                            transcript = segments.map(x => x.text).join(' ');
                                        }
                                    }
                                }
                            } catch (e) { console.warn('[Recording][CI] Words fallback failed:', e?.message); }
                            if (turns.length) speakerTurns = turns;
                            transcript = turns.map(x => x.text).join(' ');
                            if (!transcript && sentences && sentences.length) {
                                try { console.log('[Recording][CI] Example sentence keys:', Object.keys(sentences[0]||{})); } catch(_) {}
                            }
                            conversationalIntelligence = {
                                transcriptSid: updatedTranscript.sid,
                                status: updatedTranscript.status,
                                sentenceCount: sentences.length,
                                averageConfidence: sentences.length > 0 ? 
                                    sentences.reduce((acc, s) => acc + (s.confidence || 0), 0) / sentences.length : 0,
                                sentences: sentencesSlim,
                                channelRoleMap: { agentChannel: agentChannelStr, customerChannel: agentChannelStr === '1' ? '2' : '1' }
                            };
                            
                            console.log(`[Recording] Conversational Intelligence transcript completed with ${sentences.length} sentences, transcript length: ${transcript.length}`);
                            break;
                        }
                        
                        attempts++;
                        if (attempts % 5 === 0) console.log(`[Recording] Waiting for Conversational Intelligence... (${attempts*6}s)`);
                    }
                }
            }
            
            // Fallback to basic transcription if Conversational Intelligence not available or failed
            if (!transcript) {
                console.log('[Recording] Falling back to basic transcription');
                try {
                    if (client.transcriptions && typeof client.transcriptions.list === 'function') {
                        // Check if transcription already exists
                        const transcriptions = await client.transcriptions.list({ recordingSid: recordingSid, limit: 1 });
                        if (transcriptions.length > 0 && typeof client.transcriptions === 'function') {
                            const t = await client.transcriptions(transcriptions[0].sid).fetch();
                            transcript = t.transcriptionText || '';
                            console.log('[Recording] Existing transcript found:', (transcript || '').substring(0, 100) + '...');
                        } else if (client.transcriptions && typeof client.transcriptions.create === 'function') {
                            // Create new transcription using Twilio's service
                            console.log('[Recording] Creating Twilio transcription via SDK...');
                            const created = await client.transcriptions.create({ recordingSid: recordingSid, languageCode: 'en-US' });
                            // Poll for completion up to ~60s
                            let attempts = 0;
                            const maxAttempts = 12; // 12 * 5s = 60s
                            while (attempts < maxAttempts) {
                                await new Promise(r => setTimeout(r, 5000));
                                let t = null;
                                try { t = await client.transcriptions(created.sid).fetch(); } catch(_) {}
                                const text = t?.transcriptionText || '';
                                if (text && text.trim().length > 0) { transcript = text; break; }
                                attempts++;
                                if (attempts % 3 === 0) console.log(`[Recording] Waiting for transcription... (${attempts*5}s)`);
                            }
                            if (transcript) console.log('[Recording] Transcription ready:', transcript.substring(0, 100) + '...');
                            else console.log('[Recording] Transcription not ready within timeout');
                        } else {
                            console.warn('[Recording] Transcriptions API not available in this Twilio SDK runtime');
                        }
                    } else {
                        console.warn('[Recording] Transcriptions API not present on client');
                    }
                } catch (e) {
                    console.warn('[Recording] Basic transcription fallback failed:', e?.message);
                }
            }
            
            // Generate AI insights: prefer Gemini (if GEMINI_API_KEY set), else heuristic
            if (transcript) {
                if (process.env.GEMINI_API_KEY) {
                    try {
                        aiInsights = await generateGeminiAIInsights(transcript);
                    } catch (e) {
                        console.warn('[Recording] Gemini insights failed, falling back to heuristic:', e?.message);
                        aiInsights = await generateTwilioAIInsights(transcript);
                    }
                } else {
                    aiInsights = await generateTwilioAIInsights(transcript);
                }
                
                // Add Conversational Intelligence metadata if available
                if (conversationalIntelligence) {
                    aiInsights.source = 'twilio-conversational-intelligence';
                    aiInsights.conversationalIntelligence = conversationalIntelligence;
                } else {
                    aiInsights.source = 'twilio-basic-transcription';
                }
            // Attach speaker turns if we built them
            try { if (typeof speakerTurns !== 'undefined' && Array.isArray(speakerTurns) && speakerTurns.length) aiInsights.speakerTurns = speakerTurns; } catch(_) {}
            // Prefer Twilio CI sentence-based summary if Operator didn’t provide
            try {
                if ((!aiInsights.summary || !aiInsights.summary.trim()) && speakerTurns && speakerTurns.length) {
                    const first = speakerTurns[0]?.text || '';
                    const last = speakerTurns[speakerTurns.length-1]?.text || '';
                    aiInsights.summary = (first && last) ? `${first} … ${last}` : aiInsights.summary;
                }
            } catch(_) {}
            }
            
        } catch (transcriptionError) {
            console.error('[Recording] Twilio transcription error:', transcriptionError);
            // Fallback to basic placeholder insights; Google STT removed
            aiInsights = {
                summary: 'Call transcription processing in progress',
                sentiment: 'Unknown',
                keyTopics: ['Call analysis'],
                nextSteps: ['Follow up'],
                painPoints: [],
                budget: 'Unclear',
                timeline: 'Not specified',
                decisionMakers: []
            };
        }
        
        // Ensure we return some AI object even if transcript is empty
        if (!aiInsights) {
            aiInsights = {
                summary: transcript ? `Call transcript contains ${String(transcript).split(/\s+/).filter(Boolean).length} words.` : 'Call transcription processing in progress',
                sentiment: 'Unknown',
                keyTopics: ['Call analysis'],
                nextSteps: ['Follow up'],
                painPoints: [],
                budget: 'Unclear',
                timeline: 'Not specified',
                decisionMakers: [],
                contract: { currentRate:'', rateType:'', supplier:'', contractEnd:'', usageKWh:'', contractLength:'' }
            };
        }
        
        // Update call data
        const callData = callStore.get(callSid);
        if (callData) {
            callData.transcript = transcript;
            callData.aiInsights = aiInsights;
            callStore.set(callSid, callData);
        }
        
        // Also upsert transcript and insights into /api/calls for the UI
        try {
            const base = baseUrl || process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app';
            await fetch(`${base}/api/calls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callSid: callSid,
                    transcript,
                    aiInsights
                })
            }).catch(() => {});
        } catch (e) {
            console.warn('[Recording] Failed posting transcript/insights to /api/calls:', e?.message);
        }
        
        console.log('[Recording] Twilio AI processing completed for:', callSid);
        
    } catch (error) {
        console.error('[Recording] Twilio AI processing failed:', error);
    }
}

 

async function generateTwilioAIInsights(transcript) {
    try {
        const text = (transcript || '').toString();
        const lower = text.toLowerCase();
        const words = lower.split(/\s+/).filter(Boolean);
        const wordCount = words.length;

        // Basic sentiment analysis based on keywords
        const positiveWords = ['good','great','excellent','perfect','love','happy','satisfied','interested','yes','sure','definitely'];
        const negativeWords = ['bad','terrible','awful','hate','angry','frustrated','disappointed','no','not','never','problem'];
        const positiveCount = words.filter(w => positiveWords.includes(w)).length;
        const negativeCount = words.filter(w => negativeWords.includes(w)).length;
        let sentiment = 'Neutral';
        if (positiveCount > negativeCount) sentiment = 'Positive';
        else if (negativeCount > positiveCount) sentiment = 'Negative';

        // Key topics and next steps
        const businessTopics = ['price','cost','budget','contract','agreement','proposal','quote','timeline','schedule','meeting','demo','trial','supplier','rate'];
        const keyTopics = businessTopics.filter(t => lower.includes(t));
        const nextStepKeywords = ['call','email','meeting','demo','proposal','quote','follow','schedule','send','review'];
        const nextSteps = nextStepKeywords.filter(k => lower.includes(k));

        // Pain points
        const painKeywords = ['problem','issue','concern','worry','challenge','difficult','expensive','slow','complicated'];
        const painPoints = painKeywords.filter(k => lower.includes(k));

        // Budget/timeline flags
        const budgetDiscussed = /(budget|cost|price|expensive|cheap|afford|payment|invoice)/i.test(text);
        const timelineMentioned = /(when|timeline|schedule|deadline|urgent|soon|quickly|time)/i.test(text);

        // Light extraction for contract details
        const contract = { currentRate: '', rateType: '', supplier: '', contractEnd: '', usageKWh: '', contractLength: '' };
        const rateMatch = text.match(/\$?\s?(\d{1,2}(?:\.\d{1,3})?)\s*\/?\s*kwh/i);
        if (rateMatch) contract.currentRate = `$${Number(rateMatch[1]).toFixed(3)}/kWh`.replace(/\.000\/kWh$/, '/kWh');
        const rateTypeMatch = lower.match(/\b(fixed|variable|indexed)\b/);
        if (rateTypeMatch) contract.rateType = rateTypeMatch[1];
        const supplierMatch = text.match(/\b(?:with|from|using|on)\s+([A-Z][A-Za-z&\- ]{2,40})\b/);
        if (supplierMatch) contract.supplier = supplierMatch[1].trim();
        const endMatch = text.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[ ,]*\s*(20\d{2})/i);
        if (endMatch) contract.contractEnd = `${endMatch[1]} ${endMatch[2]}`;
        const usageMatch = text.match(/(\d{2,3}[,\.]?\d{3}|\d{4,6})\s*(kwh|kw\s*h|kilowatt\s*hours)/i);
        if (usageMatch) contract.usageKWh = usageMatch[1].replace(/\./g,',') + ' kWh';
        const lengthMatch = text.match(/(\d{1,2})\s*(month|months|mo|year|years|yr|yrs)/i);
        if (lengthMatch) contract.contractLength = /year/i.test(lengthMatch[2]) ? `${lengthMatch[1]} year${lengthMatch[1]==='1'?'':'s'}` : `${lengthMatch[1]} months`;

        return {
            summary: `Call transcript contains ${wordCount} words. ${sentiment} sentiment detected. ${keyTopics.length ? 'Key topics: ' + keyTopics.join(', ') : 'General discussion.'}`,
            sentiment,
            keyTopics: keyTopics.length ? keyTopics : ['General business discussion'],
            nextSteps: nextSteps.length ? nextSteps : ['Follow up call'],
            painPoints,
            budget: budgetDiscussed ? 'Discussed' : 'Not Mentioned',
            timeline: timelineMentioned ? 'Timeline discussed' : 'Not specified',
            decisionMakers: [],
            contract
        };

    } catch (error) {
        console.error('[Twilio AI] Insights generation error:', error);
        return {
            summary: 'AI analysis completed using Twilio services',
            sentiment: 'Neutral',
            keyTopics: ['Call analysis'],
            nextSteps: ['Follow up'],
            painPoints: [],
            budget: 'Unclear',
            timeline: 'Not specified',
            decisionMakers: [],
            contract: { currentRate:'', rateType:'', supplier:'', contractEnd:'', usageKWh:'', contractLength:'' }
        };
    }
}

async function generateGeminiAIInsights(transcript) {
    // Uses @google/generative-ai with GEMINI_API_KEY
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const prompt = `
Analyze this sales call transcript and provide insights:

TRANSCRIPT:
${transcript}

Provide a JSON response with:
- summary: Brief 2-3 sentence summary
- sentiment: Overall customer sentiment (Positive/Neutral/Negative)
- keyTopics: Array of main topics discussed
- nextSteps: Array of identified next steps
- painPoints: Array of customer pain points mentioned
- budget: Budget discussion status (Discussed/Not Mentioned/Unclear)
- timeline: Timeline mentioned or "Not specified"
- decisionMakers: Array of decision makers identified
`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    try {
        return JSON.parse(text.replace(/```json|```/g, ''));
    } catch {
        return {
            summary: text.substring(0, 300),
            sentiment: 'Neutral',
            keyTopics: ['Call analysis'],
            nextSteps: ['Follow up'],
            painPoints: [],
            budget: 'Unclear',
            timeline: 'Not specified',
            decisionMakers: []
        };
    }
}

// Export call store for API access
export { callStore };
