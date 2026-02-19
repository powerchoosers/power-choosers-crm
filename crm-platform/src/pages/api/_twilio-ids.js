// Small helper to normalize Twilio IDs and resolve Recording/Transcript SIDs to the correct Call SID
// Exports CommonJS for compatibility with existing require() usage

function isCallSid(id) {
  if (!id || typeof id !== 'string') return false;
  return /^CA[0-9a-f]{32}$/i.test(id.trim());
}

function isRecordingSid(id) {
  if (!id || typeof id !== 'string') return false;
  return /^RE[0-9a-f]{32}$/i.test(id.trim());
}

async function resolveToCallSid({ callSid, recordingSid, transcriptSid }) {
  try {
    // If caller already provided a proper Call SID, use it directly.
    // NOTE: We intentionally do NOT resolve child SIDs to parent SIDs here.
    // The parent leg (browser/client:agent) is skipped by status.js, so using
    // the child PSTN SID directly as the record ID is correct and avoids extra
    // Twilio API calls that may time out in serverless (Vercel) environments.
    if (isCallSid(callSid)) return callSid.trim();

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return isCallSid(callSid) ? callSid.trim() : null;
    }

    const twilio = await import('twilio');
    const client = twilio.default(accountSid, authToken);

    // If we have a Recording SID, fetch it and read callSid (use as-is, no parent resolution)
    if (isRecordingSid(recordingSid)) {
      try {
        const rec = await client.recordings(recordingSid.trim()).fetch();
        if (rec && isCallSid(rec.callSid)) {
          return rec.callSid.trim();
        }
      } catch (_) { /* swallow and continue */ }
    }

    // If we have a Transcript SID from Twilio CI, fetch it, get sourceSid (usually Recording SID), then resolve
    if (transcriptSid && typeof transcriptSid === 'string' && transcriptSid.trim()) {
      try {
        const tr = await client.intelligence.v2.transcripts(transcriptSid.trim()).fetch();
        const sourceSid = (tr && tr.sourceSid) ? String(tr.sourceSid) : '';
        if (isCallSid(sourceSid)) {
          return sourceSid.trim();
        }
        if (isRecordingSid(sourceSid)) {
          try {
            const rec = await client.recordings(sourceSid.trim()).fetch();
            if (rec && isCallSid(rec.callSid)) {
              return rec.callSid.trim();
            }
          } catch (_) { /* ignore */ }
        }
      } catch (_) { /* ignore */ }
    }

    // Last resort
    return isCallSid(callSid) ? callSid.trim() : null;
  } catch (_) {
    return isCallSid(callSid) ? callSid.trim() : null;
  }
}

export { isCallSid, isRecordingSid, resolveToCallSid };
