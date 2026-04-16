import logger from '../_logger.js';
import { supabaseAdmin } from '../../../lib/supabase.ts';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const {
      CallSid,
      RecordingUrl,
      RecordingSid,
      RecordingDuration,
      RecordingStatus,
      RecordingChannels
    } = req.body;

    logger.log('[RecordingStatus] Received recording status:', {
      CallSid,
      RecordingSid,
      RecordingStatus,
      RecordingDuration,
      RecordingChannels
    });

    if (RecordingStatus !== 'completed') {
      logger.log('[RecordingStatus] Recording not completed yet, status:', RecordingStatus);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'pending' }));
      return;
    }

    // Get the call record
    const { data: callData, error: callError } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('callSid', CallSid)
      .maybeSingle();

    if (callError) {
      logger.error('[RecordingStatus] Error fetching call:', callError);
      throw callError;
    }

    if (!callData) {
      logger.warn('[RecordingStatus] Call not found:', CallSid);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Call not found' }));
      return;
    }

    // Determine if this is a voicemail (inbound call with no answer or short duration)
    const isInbound = callData.direction === 'inbound';
    const duration = callData.duration || callData.durationSec || 0;
    const outcome = callData.outcome || '';
    const isVoicemail = isInbound && (
      outcome === 'No Answer' || 
      outcome === 'Voicemail' ||
      (duration < 10 && RecordingDuration > 0) // Short ring, but has recording
    );

    // Update call with recording URL
    const metadata = callData.metadata || {};
    const updatedMetadata = {
      ...metadata,
      recordingDuration: RecordingDuration,
      recordingChannels: RecordingChannels,
      isVoicemail,
      recordingCompletedAt: new Date().toISOString()
    };

    const { error: updateError } = await supabaseAdmin
      .from('calls')
      .update({
        recordingUrl: RecordingUrl,
        recording_url: RecordingUrl,
        recordingSid: RecordingSid,
        recording_sid: RecordingSid,
        metadata: updatedMetadata,
        outcome: isVoicemail ? 'Voicemail' : callData.outcome
      })
      .eq('callSid', CallSid);

    if (updateError) {
      logger.error('[RecordingStatus] Error updating call:', updateError);
      throw updateError;
    }

    logger.log('[RecordingStatus] Call updated with recording URL:', {
      CallSid,
      RecordingUrl,
      isVoicemail
    });

    // Create notification for voicemail
    if (isVoicemail) {
      const callerName = callData.contactName || callData.from || 'Unknown';
      const callerNumber = callData.from || callData.targetPhone || '';
      
      try {
        const { error: notifError } = await supabaseAdmin
          .from('notifications')
          .insert({
            type: 'missed_call',
            title: 'New Voicemail',
            message: `Voicemail from ${callerName}${callerNumber ? ` (${callerNumber})` : ''}`,
            link: `/network/calls?highlight=${CallSid}`,
            metadata: {
              callSid: CallSid,
              recordingUrl: RecordingUrl,
              recordingSid: RecordingSid,
              hasVoicemail: true,
              contactId: callData.contactId,
              accountId: callData.accountId,
              duration: RecordingDuration
            },
            userId: callData.ownerId || callData.assignedTo,
            read: false,
            createdAt: new Date().toISOString()
          });

        if (notifError) {
          logger.error('[RecordingStatus] Error creating notification:', notifError);
        } else {
          logger.log('[RecordingStatus] Voicemail notification created');
        }
      } catch (notifErr) {
        logger.error('[RecordingStatus] Failed to create notification:', notifErr);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      ok: true, 
      isVoicemail,
      recordingUrl: RecordingUrl 
    }));

  } catch (error) {
    logger.error('[RecordingStatus] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}
