import twilio from 'twilio';
import logger from '../_logger.js';
import { supabaseAdmin } from '../../../lib/supabase.ts';
import { getOutboundVoicemailDropForTwilioNumber, resolveUserForBusinessNumber } from '../../../lib/voicemail.ts';

const VoiceResponse = twilio.twiml.VoiceResponse;

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

    // Update call record with AMD result
    const { error: updateError } = await supabaseAdmin
      .from('calls')
      .update({
        answeredBy: AnsweredBy,
        metadata: supabaseAdmin.raw(`
          COALESCE(metadata, '{}'::jsonb) || 
          jsonb_build_object(
            'answeredBy', $1::text,
            'machineDetectionDuration', $2::text
          )
        `, [AnsweredBy, String(MachineDetectionDuration || '')])
      })
      .eq('callSid', CallSid);

    if (updateError) {
      logger.error('[AMD] Failed to update call with AMD result:', updateError);
    }

    // If it's a voicemail, automatically drop the voicemail
    const isVoicemail = AnsweredBy && (
      AnsweredBy === 'machine_start' ||
      AnsweredBy === 'machine_end_beep' ||
      AnsweredBy === 'machine_end_silence' ||
      AnsweredBy === 'machine_end_other'
    );

    if (isVoicemail) {
      // Get the voicemail drop for this user's business number
      const businessNumber = From; // The Twilio number used to make the call
      
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, email, settings')
        .limit(1000);

      const matchedUser = resolveUserForBusinessNumber(users, businessNumber);
      const outboundVoicemailDrop = matchedUser 
        ? getOutboundVoicemailDropForTwilioNumber(matchedUser.settings, businessNumber)
        : null;

      if (outboundVoicemailDrop?.publicUrl && outboundVoicemailDrop.enabled) {
        // Use Twilio API to update the call with voicemail drop
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        
        if (accountSid && authToken) {
          const client = twilio(accountSid, authToken);
          
          // Create TwiML to play voicemail
          const twiml = new VoiceResponse();
          const playUrl = outboundVoicemailDrop.publicUrl + 
            (outboundVoicemailDrop.publicUrl.includes('?') ? '&' : '?') + 
            'cb=' + Date.now();
          
          twiml.play(playUrl);
          twiml.hangup();

          // Update the call to play the voicemail
          await client.calls(CallSid).update({
            twiml: twiml.toString()
          });

          logger.log('[AMD] Outbound voicemail drop initiated for call:', CallSid);
        }
      } else {
        logger.warn('[AMD] No outbound voicemail drop found for business number:', businessNumber);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, answeredBy: AnsweredBy }));

  } catch (error) {
    logger.error('[AMD] Error processing AMD status:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}
