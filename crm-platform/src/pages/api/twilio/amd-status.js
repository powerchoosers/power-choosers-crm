import logger from '../_logger.js';
import { upsertCallInSupabase } from '../calls.js';
import { isUnknownAnsweredBy, isVoicemailAnsweredBy } from '../../../lib/voice-outcomes.ts';
import { triggerOutboundVoicemailDrop } from '../../../lib/twilio-voicemail-drop.ts';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = req.body;
    const {
      CallSid,
      AnsweredBy,  // 'human', 'machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax', 'unknown'
      MachineDetectionDuration,
      Called,
      From
    } = body;

    logger.log('[AMD] Answering Machine Detection Result:', {
      CallSid,
      AnsweredBy,
      MachineDetectionDuration,
      Called,
      From
    });

    const isVoicemail = isVoicemailAnsweredBy(AnsweredBy);
    const isUnknown = isUnknownAnsweredBy(AnsweredBy);
    const nextOutcome = isVoicemail
      ? 'Voicemail'
      : (isUnknown ? 'Unknown' : null);

    const savedCall = await upsertCallInSupabase({
      callSid: CallSid,
      answeredBy: AnsweredBy || null,
      machineDetectionDuration: MachineDetectionDuration || null,
      outcome: nextOutcome || undefined,
      source: 'amd-status',
    }).catch((updateError) => {
      logger.error('[AMD] Failed to update call with AMD result:', updateError);
      return null;
    });

    const existingDropStatus = String(savedCall?.metadata?.voicemailDropStatus || '').toLowerCase();

    if (isVoicemail && !['dropped', 'missing-config'].includes(existingDropStatus)) {
      const dropResult = await triggerOutboundVoicemailDrop({
        callSid: CallSid,
        businessNumber: From,
        candidateIdentifiers: [From, Called],
      }).catch((dropError) => ({
        status: 'failed',
        reason: dropError?.message || 'twilio-update-failed',
      }));

      await upsertCallInSupabase({
        callSid: CallSid,
        answeredBy: AnsweredBy || null,
        machineDetectionDuration: MachineDetectionDuration || null,
        voicemailDropStatus: dropResult?.status || 'failed',
        voicemailDropAt: new Date().toISOString(),
        voicemailDropUrl: dropResult?.playUrl || null,
        metadata: {
          voicemailDropReason: dropResult?.reason || null,
        },
        source: 'amd-status-voicemail-drop',
      }).catch((updateError) => {
        logger.error('[AMD] Failed to persist voicemail drop result:', updateError);
      });

      if (dropResult?.status === 'dropped') {
        logger.log('[AMD] Outbound voicemail drop initiated for call:', CallSid);
      } else {
        logger.warn('[AMD] Voicemail drop skipped:', {
          callSid: CallSid,
          status: dropResult?.status,
          reason: dropResult?.reason,
        });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, answeredBy: AnsweredBy }));

  } catch (error) {
    logger.error('[AMD] Error processing AMD status:', error);
    // Always 200 for Twilio webhooks — 500 causes retries which can duplicate voicemail drops
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message, ok: false }));
  }
}
