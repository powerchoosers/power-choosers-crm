import twilio from 'twilio';
import { supabaseAdmin } from '../_supabase.js';
import { cors } from '../_cors.js';
import logger from '../_logger.js';

// Helper to get body - uses pre-parsed req.body from server.js, or reads stream if needed
async function getBody(req) {
  // If server.js already parsed the body, use it
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  // Otherwise, try to read the stream (fallback for direct handler calls)
  return await new Promise((resolve) => {
    try {
      // Check if stream is readable
      if (!req.readable) {
        resolve({});
        return;
      }

      let b = '';
      const timeout = setTimeout(() => resolve({}), 5000); // 5s timeout

      req.on('data', c => { b += c; });
      req.on('end', () => {
        clearTimeout(timeout);
        try { resolve(b ? JSON.parse(b) : {}); } catch (_) { resolve({}); }
      });
      req.on('error', () => {
        clearTimeout(timeout);
        resolve({});
      });
    } catch (_) { resolve({}); }
  });
}

export default async function handler(req, res) {
  // Handle CORS preflight - returns true if OPTIONS was handled
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Compute absolute base URL once (prefer PUBLIC_BASE_URL for webhook callbacks)
  const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || '';
  const base = envBase || (host ? `${proto}://${host}` : 'https://nodal-point-network.vercel.app');

  try {
    const body = await getBody(req);
    const callSid = String(body.callSid || '').trim();
    let recordingSid = String(body.recordingSid || '').trim();
    const serviceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID || undefined;

    if (!callSid && !recordingSid) {
      res.statusCode = 400; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'callSid or recordingSid is required' }));
      return;
    }

    if (!serviceSid) {
      res.statusCode = 500; res.setHeader('Content-Type', 'application/json');
      const errorMsg = 'Conversational Intelligence service not configured. Missing or empty TWILIO_INTELLIGENCE_SERVICE_SID environment variable. Please set this in your Cloud Run environment variables or local .env file.';
      logger.error('[CI Request] Configuration error:', errorMsg);
      res.end(JSON.stringify({
        error: errorMsg,
        details: 'This environment variable is required to create Conversational Intelligence transcripts. Check your Cloud Run service configuration or local environment setup.'
      }));
      return;
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // If we already created a transcript for this call, return it
    // OPTIMIZED: Add timeout to Firestore read to prevent hanging
    let ciTranscriptSid = '';
    let existingRecordingSid = '';
    try {
      if (supabaseAdmin && callSid) {
        // Add 5-second timeout for Supabase read
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Supabase timeout')), 5000)
        );
        const readPromise = supabaseAdmin.from('calls').select('metadata, recordingSid').eq('id', callSid).maybeSingle();

        const { data: snap, error: readError } = await Promise.race([readPromise, timeoutPromise]);
        if (readError) throw readError;

        if (snap) {
          const metadata = snap.metadata || {};
          if (metadata.ciTranscriptSid) ciTranscriptSid = String(metadata.ciTranscriptSid);
          if (snap.recordingSid) existingRecordingSid = String(snap.recordingSid);
          // Try to parse from recordingUrl if present
          if (!existingRecordingSid && metadata.recordingUrl) {
            try {
              // Match Recording SID from URL - handles both .mp3 and query string formats
              const m = String(metadata.recordingUrl).match(/Recordings\/(RE[A-Z0-9]+)/i);
              if (m && m[1]) existingRecordingSid = m[1];
            } catch (_) { }
          }
        }
      }
    } catch (e) {
      logger.warn('[CI Request] Supabase read failed or timed out:', e.message);
    }

    // Prefer provided recordingSid, then existing one from Firestore
    if (!recordingSid && existingRecordingSid) recordingSid = existingRecordingSid;

    // Helper: select preferred recording (dual-channel + completed, most recent)
    // OPTIMIZED: Reduced retries to prevent 30s timeout (max ~10s now)
    async function selectPreferredRecordingByCall(callSid, maxAttempts = 3) {
      const backoffs = [2000, 4000, 0]; // ~6s total (much faster)
      for (let attempt = 0; attempt < Math.min(maxAttempts, backoffs.length); attempt++) {
        try {
          const list = await client.recordings.list({ callSid, limit: 20 });
          const items = Array.isArray(list) ? list : [];
          if (items.length) {
            // Try to find dual-channel first, then latest completed
            // Some SDKs expose channels on the list item; if not, we can fetch details lazily
            let dual = [];
            const others = [];
            for (const rec of items) {
              const statusOk = !rec.status || String(rec.status).toLowerCase() === 'completed';
              if (!statusOk) { others.push(rec); continue; }
              let channels = rec.channels;
              if (channels == null) {
                try {
                  const fetched = await client.recordings(rec.sid).fetch();
                  channels = fetched?.channels;
                  rec.source = rec.source || fetched?.source;
                  // Capture duration when available for better ranking
                  if (rec.duration == null && fetched && (fetched.duration != null || fetched.durationSec != null)) {
                    rec.duration = fetched.duration != null ? Number(fetched.duration) : Number(fetched.durationSec);
                  }
                } catch (_) { }
              }
              const isDual = String(channels || '') === '2';
              if (isDual) { dual.push(rec); } else { others.push(rec); }
            }
            const sortByDurDescThenDate = (a, b) => {
              const da = (a.duration != null ? Number(a.duration) : -1);
              const db = (b.duration != null ? Number(b.duration) : -1);
              if (db !== da) return db - da;
              const tb = new Date(b.dateCreated || b.startTime || 0).getTime();
              const ta = new Date(a.dateCreated || a.startTime || 0).getTime();
              return tb - ta;
            };
            const sortByDateDesc = (a, b) => new Date(b.dateCreated || b.startTime || 0) - new Date(a.dateCreated || a.startTime || 0);
            if (dual.length) {
              // Prefer source=Dial, then most recent
              const dial = dual.filter(r => String(r.source || '').toLowerCase() === 'dial').sort(sortByDurDescThenDate);
              if (dial.length) return dial[0].sid;
              dual.sort(sortByDurDescThenDate);
              return dual[0].sid;
            }
            // Fallback: any completed, most recent
            const completed = items.filter(r => !r.status || String(r.status).toLowerCase() === 'completed').sort(sortByDateDesc);
            if (completed.length) { return completed[0].sid; }
          }
        } catch (_) { }
        const baseDelay = backoffs[attempt] || 0;
        const jitter = baseDelay ? Math.floor(Math.random() * 1000) : 0; // add up to 1s jitter to avoid thundering herd
        const delay = baseDelay + jitter;
        if (delay) await new Promise(r => setTimeout(r, delay));
      }
      return '';
    }

    // If still missing, try to resolve via Twilio by Call SID with backoff
    if (!recordingSid && callSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      logger.log(`[CI Request] Looking up recording for call: ${callSid}`);
      recordingSid = await selectPreferredRecordingByCall(callSid, 3); // Reduced from 5 to 3 attempts
      logger.log(`[CI Request] Recording lookup result: ${recordingSid || 'NOT FOUND'}`);
    }

    if (!recordingSid) {
      logger.error(`[CI Request] No recording found for call: ${callSid}`);
      res.statusCode = 404; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Recording not found for call',
        callSid,
        details: 'Recording may not exist yet. Recordings typically appear 30-60 seconds after call completion. Please wait and try again.',
        suggestion: 'Wait 1-2 minutes after the call ends, then click Process Call again.'
      }));
      return;
    }

    logger.log(`[CI Request] Using recording: ${recordingSid} for call: ${callSid}`);

    // CRITICAL FIX: Check if transcript already exists in Twilio for this recording
    // If it exists, we should use it instead of creating a new one (per Twilio guidance)
    // This prevents duplicate transcripts and ensures webhooks fire correctly
    let existingTwilioTranscript = null;
    if (!ciTranscriptSid) {
      try {
        const existingTranscripts = await client.intelligence.v2.transcripts.list({
          serviceSid: serviceSid,
          sourceSid: recordingSid,
          limit: 1
        });

        if (existingTranscripts && existingTranscripts.length > 0) {
          existingTwilioTranscript = existingTranscripts[0];
          ciTranscriptSid = existingTwilioTranscript.sid;
          logger.log(`[CI Request] Found existing Twilio transcript: ${ciTranscriptSid} for recording: ${recordingSid}, status: ${existingTwilioTranscript.status}`);
        }
      } catch (error) {
        logger.warn('[CI Request] Error checking for existing transcripts:', error.message);
        // Continue to create new transcript if check fails
      }
    }

    // If we found an existing transcript, handle it appropriately
    if (ciTranscriptSid && existingTwilioTranscript) {
      const transcriptStatus = existingTwilioTranscript.status || 'unknown';

      // Pre-flag the call so webhook gating sees ciRequested=true
      try {
        await fetch(`${base}/api/calls`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callSid,
            recordingSid,
            ciRequested: true,
            conversationalIntelligence: { transcriptSid: ciTranscriptSid, status: transcriptStatus },
            ciTranscriptSid: ciTranscriptSid
          })
        }).catch(() => { });
      } catch (_) { }

      // If transcript is already completed, trigger immediate processing to fetch results
      if (transcriptStatus === 'completed') {
        logger.log(`[CI Request] Existing transcript is completed, triggering immediate result fetch: ${ciTranscriptSid}`);

        // Trigger background processing to fetch results (fire and forget)
        try {
          await fetch(`${base}/api/twilio/poll-ci-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcriptSid: ciTranscriptSid,
              callSid: callSid
            })
          }).catch(() => { });
        } catch (_) { }

        res.statusCode = 202;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          transcriptSid: ciTranscriptSid,
          recordingSid,
          existing: true,
          status: 'completed',
          message: 'Using existing completed transcript. Fetching results in background.',
          webhookUrl: `${base}/api/twilio/conversational-intelligence-webhook`
        }));
        return;
      } else if (['queued', 'in-progress'].includes(transcriptStatus)) {
        // Transcript exists but still processing
        logger.log(`[CI Request] Existing transcript still processing: ${ciTranscriptSid}, status: ${transcriptStatus}`);

        res.statusCode = 202;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          transcriptSid: ciTranscriptSid,
          recordingSid,
          existing: true,
          status: transcriptStatus,
          message: 'Transcript already processing. Results will be available when complete.',
          webhookUrl: `${base}/api/twilio/conversational-intelligence-webhook`
        }));
        return;
      } else if (transcriptStatus === 'failed') {
        // Transcript failed, we'll create a new one below
        logger.log(`[CI Request] Existing transcript failed, will create new one: ${ciTranscriptSid}`);
        ciTranscriptSid = ''; // Reset to allow new transcript creation
      }
    }

    if (!ciTranscriptSid) {
      // Pre-flag the call so webhook gating sees ciRequested=true even if webhook arrives very fast
      try {
        await fetch(`${base}/api/calls`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid, recordingSid, ciRequested: true, conversationalIntelligence: { status: 'queued' } })
        }).catch(() => { });
      } catch (_) { }

      // Determine channel mapping for proper speaker separation
      let agentChannelNum = 1; // Default to channel 1 for agent
      try {
        let callResource = null;
        try { callResource = await client.calls(callSid).fetch(); } catch (_) { }
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
        agentChannelNum = fromIsAgent ? 1 : 2;
        logger.log(`[CI Request] Channel-role mapping: agent on channel ${agentChannelNum} (from=${fromStr}, to=${toStr})`);
      } catch (e) {
        logger.warn('[CI Request] Failed to compute channel-role mapping, defaulting agent to channel 1:', e?.message);
      }

      // Create CI transcript with proper channel participants for speaker separation
      const webhookUrl = `${base}/api/twilio/conversational-intelligence-webhook`;

      const createArgs = {
        serviceSid,
        channel: {
          media_properties: { source_sid: recordingSid },
          participants: [
            { role: 'Agent', channel_participant: agentChannelNum },
            { role: 'Customer', channel_participant: agentChannelNum === 1 ? 2 : 1 }
          ]
        },
        customerKey: callSid,
        webhookUrl: webhookUrl,
        webhookMethod: 'POST'
      };

      const idemKey = (callSid && recordingSid) ? `${callSid}-${recordingSid}` : undefined;
      const created = idemKey
        ? await client.intelligence.v2.transcripts.create(createArgs, { idempotencyKey: idemKey })
        : await client.intelligence.v2.transcripts.create(createArgs);
      ciTranscriptSid = created.sid;

      logger.log(`[CI Request] Created transcript: ${ciTranscriptSid}, status: ${created.status}`);

      // Poll transcript status to ensure it's processing
      // OPTIMIZED: Reduced from 3 to 2 attempts (2s instead of 3s) - minimal impact but reduces Cloud Run costs
      let attempts = 0;
      const maxAttempts = 2; // 2 * 1s = 2s (reduced from 3s)
      while (attempts < maxAttempts) {
        try {
          const transcript = await client.intelligence.v2.transcripts(ciTranscriptSid).fetch();
          logger.log(`[CI Request] Transcript ${ciTranscriptSid} status: ${transcript.status}`);

          if (transcript.status === 'completed') {
            logger.log(`[CI Request] Transcript completed immediately: ${ciTranscriptSid}`);
            break;
          } else if (transcript.status === 'failed') {
            logger.error(`[CI Request] Transcript failed: ${ciTranscriptSid}`, transcript);
            throw new Error(`Transcript processing failed: ${transcript.status}`);
          } else if (['queued', 'in-progress'].includes(transcript.status)) {
            logger.log(`[CI Request] Transcript processing: ${transcript.status}`);
            break;
          }
        } catch (e) {
          logger.warn(`[CI Request] Error checking transcript status (attempt ${attempts + 1}):`, e.message);
        }
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
      }
    }

    // Persist request flags so webhook only processes allowed transcripts
    try {
      await fetch(`${base}/api/calls`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callSid,
          recordingSid,
          conversationalIntelligence: { transcriptSid: ciTranscriptSid, status: 'queued' },
          aiInsights: null,
          ciRequested: true,
          ciTranscriptSid: ciTranscriptSid
        })
      }).catch(() => { });
    } catch (_) { }

    res.statusCode = 202; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      transcriptSid: ciTranscriptSid,
      recordingSid,
      message: 'Transcript processing started. Check status via webhook or polling.',
      webhookUrl: `${base}/api/twilio/conversational-intelligence-webhook`
    }));
  } catch (e) {
    logger.error('[ci-request] Error:', e);
    logger.error('[ci-request] Error details:', {
      message: e?.message,
      code: e?.code,
      status: e?.status,
      statusCode: e?.statusCode,
      moreInfo: e?.moreInfo,
      details: e?.details
    });
    const twilioCode = e && (e.code || e.status || e.statusCode);
    let friendly = 'Failed to request CI';
    if (twilioCode === 31000) friendly = 'Recording not found or not ready';
    else if (twilioCode === 31001) friendly = 'Recording is not dual-channel';
    else if (twilioCode === 31002) friendly = 'Recording is too short or empty';
    else if (twilioCode === 31003) friendly = 'Service temporarily unavailable';
    else if (twilioCode === 20003) friendly = 'Authentication failed - check Twilio credentials';
    else if (twilioCode === 20404) friendly = 'Resource not found';
    else if (twilioCode === 21211) friendly = 'Invalid phone number format';
    res.statusCode = (twilioCode && Number(twilioCode) >= 400 && Number(twilioCode) < 600) ? 400 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: friendly,
      details: e?.message,
      code: twilioCode,
      moreInfo: e?.moreInfo,
      fullError: e?.toString()
    }));
  }
}


