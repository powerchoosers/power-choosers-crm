/**
 * POST /api/twilio/manual-voicemail-drop
 *
 * Manually triggers a voicemail drop on an active Twilio call.
 * The call's TwiML is overwritten server-side to play the configured
 * voicemail audio and then hang up.
 *
 * Body: { callSid: string, businessNumber?: string }
 */
import { triggerOutboundVoicemailDrop } from '../../../lib/twilio-voicemail-drop.ts';

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const callSid = String(body.callSid || '').trim();
    const businessNumber = String(body.businessNumber || '').trim();

    if (!callSid) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'callSid is required' }));
      return;
    }

    console.log(`[Manual VM Drop] Triggered for callSid=${callSid}, businessNumber=${businessNumber || '(auto)'}`);

    const result = await triggerOutboundVoicemailDrop({
      callSid,
      businessNumber: businessNumber || null,
      candidateIdentifiers: businessNumber ? [businessNumber] : [],
    });

    console.log(`[Manual VM Drop] Result for ${callSid}:`, result);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    console.error('[Manual VM Drop] Error:', error);
    res.statusCode = 200; // Always 200 for Twilio webhook safety
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, status: 'failed', reason: error?.message || 'unknown' }));
  }
}
