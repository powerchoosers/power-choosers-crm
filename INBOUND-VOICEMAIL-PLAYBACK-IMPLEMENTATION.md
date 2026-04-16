# Inbound Voicemail Playback Implementation Plan

## Overview

When someone calls YOU and you don't answer, they leave a voicemail. This voicemail needs to be:
1. Captured by Twilio with recording URL
2. Shown in notifications panel
3. Playable in transmission log (dossier pages)
4. Playable in calls page with full scrubber

## Current State Analysis

### What Already Works ✅
- `CallListItem` component has full audio playback with scrubber
- `recordingUrl` field exists in calls table
- Audio proxy endpoint `/api/recording` handles Twilio recordings
- NodalAudioScrubber component for audio playback

### What's Missing ❌
1. Twilio voicemail recording capture not configured
2. No voicemail notifications
3. No voicemail icon/label in transmission log
4. Calls page doesn't show play button for voicemails

## Implementation Steps

### 1. Configure Twilio to Record Voicemails

When an inbound call goes unanswered and reaches voicemail, Twilio needs to:
- Play your voicemail greeting (already configured)
- Record the caller's message
- Store the recording URL in the database

**Update `/api/twilio/voice.js`:**

```javascript
// When handling inbound calls that go to voicemail
if (isInboundToBusiness) {
  const dial = twiml.dial({
    callerId: RawFrom || businessNumber,
    timeout: 30,
    action: `${baseUrl}/api/twilio/dial-complete`,  // Already exists
    record: 'record-from-answer',  // ADD THIS - records the call
    recordingStatusCallback: `${baseUrl}/api/twilio/recording-status`,  // ADD THIS
    recordingStatusCallbackMethod: 'POST'
  });
  
  // If no answer, play voicemail greeting and record
  twiml.say({ voice: 'alice' }, 'Please hold while we try to connect you.');
  dial.client(agentIdentity, { statusCallbackEvent: ['answered', 'completed'] });
}
```

**Create `/api/twilio/recording-status.js`:**

```javascript
// Webhook that receives recording URL after voicemail is left
export default async function handler(req, res) {
  const {
    CallSid,
    RecordingUrl,
    RecordingSid,
    RecordingDuration,
    RecordingStatus
  } = req.body;

  if (RecordingStatus === 'completed') {
    // Update the call record with recording URL
    await supabaseAdmin
      .from('calls')
      .update({
        recordingUrl: RecordingUrl,
        recordingSid: RecordingSid,
        metadata: {
          ...existing.metadata,
          recordingDuration: RecordingDuration,
          isVoicemail: true  // Mark as voicemail
        }
      })
      .eq('callSid', CallSid);

    // Create notification for missed call with voicemail
    await supabaseAdmin
      .from('notifications')
      .insert({
        type: 'missed_call',
        title: 'New Voicemail',
        message: `Voicemail from ${callerName || callerNumber}`,
        link: `/network/calls?callSid=${CallSid}`,
        metadata: {
          callSid: CallSid,
          recordingUrl: RecordingUrl,
          hasVoicemail: true
        }
      });
  }

  res.status(200).json({ ok: true });
}
```

### 2. Update Notifications Panel

**Modify `NotificationsPanel.tsx`:**

```typescript
// Add voicemail icon and playback
function getIcon(type: NotificationFeedItem['type']) {
  if (type === 'missed_call') {
    // Check if it has voicemail
    return item.metadata?.hasVoicemail ? Voicemail : PhoneMissed
  }
  // ... rest
}

// In the notification item render:
{item.type === 'missed_call' && item.metadata?.hasVoicemail && (
  <div className="mt-2">
    <NodalAudioScrubber
      src={item.metadata.recordingUrl}
      className="w-full"
    />
  </div>
)}
```

### 3. Update Transmission Log (Dossier)

**Modify `CallListItem.tsx`:**

Already has full playback support! Just need to ensure voicemails are marked properly.

Add voicemail indicator:

```typescript
// In the call type display section
{call.metadata?.isVoicemail && (
  <div className="flex items-center gap-1">
    <Voicemail className="w-3.5 h-3.5 text-amber-400" />
    <span className="text-[9px] font-mono text-amber-400 uppercase">Voicemail</span>
  </div>
)}
```

### 4. Update Calls Page

**Modify `CallTableRow.tsx` or the calls page columns:**

Add a play button column for calls with recordings:

```typescript
// In the column definitions
{
  id: 'recording',
  header: 'Recording',
  cell: ({ row }) => {
    const call = row.original;
    if (!call.recordingUrl) return null;
    
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          // Open inline player or modal
          setPlayingCall(call);
        }}
      >
        <Play className="w-4 h-4" />
      </Button>
    );
  }
}
```

### 5. Database Schema Updates

Ensure the `calls` table has:

```sql
-- Add if not exists
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_sid TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Index for voicemail queries
CREATE INDEX IF NOT EXISTS idx_calls_voicemail 
ON calls ((metadata->>'isVoicemail')) 
WHERE metadata->>'isVoicemail' = 'true';
```

## File Changes Required

### New Files
1. `crm-platform/src/pages/api/twilio/recording-status.js` - Webhook for recording completion
2. `crm-platform/src/components/calls/VoicemailPlayer.tsx` - Optional: Dedicated voicemail player modal

### Modified Files
1. `crm-platform/src/pages/api/twilio/voice.js` - Add recording parameters
2. `crm-platform/src/components/notifications/NotificationsPanel.tsx` - Add voicemail playback
3. `crm-platform/src/components/calls/CallListItem.tsx` - Add voicemail indicator (minimal change)
4. `crm-platform/src/app/network/calls/page.tsx` - Add play button column
5. `crm-platform/src/hooks/useNotificationCenter.ts` - Add voicemail metadata type

## Testing Checklist

- [ ] Call your Twilio number and don't answer
- [ ] Leave a voicemail message
- [ ] Verify recording URL is saved to database
- [ ] Check notification appears with voicemail indicator
- [ ] Play voicemail from notification panel
- [ ] Navigate to contact dossier
- [ ] Verify voicemail shows in transmission log with icon
- [ ] Play voicemail from transmission log
- [ ] Navigate to calls page
- [ ] Verify play button appears for voicemail
- [ ] Play voicemail from calls page with scrubber

## Twilio Configuration

### Voice URL Settings
```
Voice URL: https://your-domain.com/api/twilio/voice
Method: POST
```

### Recording Settings
- Enable call recording
- Recording status callback: `https://your-domain.com/api/twilio/recording-status`
- Recording channels: mono or dual (dual for better transcription)

### Voicemail Flow
1. Inbound call arrives
2. Twilio dials agent (browser/mobile)
3. If no answer after timeout (30s), play voicemail greeting
4. Record caller's message
5. Send recording URL to webhook
6. Create notification
7. Display in UI with playback

## Cost Considerations

- Recording storage: $0.0025 per minute
- Recording transcription: $0.05 per minute (if using Twilio transcription)
- Storage in Supabase: Minimal (just URL, not file)

## Security Considerations

- Recording URLs should be proxied through `/api/recording` (already implemented)
- Add authentication check in recording-status webhook
- Validate Twilio signature on webhook requests
- Consider encryption for sensitive voicemails

## UI/UX Enhancements

### Voicemail Indicators
- 🎙️ Voicemail icon (amber color)
- Duration badge
- "NEW" indicator for unplayed voicemails
- Waveform visualization (optional)

### Playback Features
- Speed control (1x, 1.5x, 2x)
- Skip forward/backward 10s
- Download voicemail
- Share voicemail (internal)
- Mark as important
- Add to task/note

### Notification Features
- Play directly from notification
- Quick reply (call back)
- Dismiss
- Mark as read when played

## Future Enhancements

1. **Voicemail Transcription**
   - Use Twilio's transcription service
   - Display text alongside audio
   - Search voicemails by content

2. **Voicemail Analytics**
   - Average voicemail length
   - Response rate
   - Callback success rate

3. **Voicemail Management**
   - Archive old voicemails
   - Bulk operations
   - Export voicemails

4. **Smart Voicemail**
   - AI summary of voicemail
   - Sentiment analysis
   - Priority scoring
   - Auto-create tasks from voicemail

## Implementation Priority

1. **Phase 1 (Critical)** - Capture & Store
   - Configure Twilio recording
   - Create recording-status webhook
   - Save recording URL to database

2. **Phase 2 (High)** - Display & Notify
   - Add voicemail notifications
   - Show in transmission log
   - Add play button in calls page

3. **Phase 3 (Medium)** - Enhanced Playback
   - Inline player in notifications
   - Voicemail indicators/icons
   - Download functionality

4. **Phase 4 (Low)** - Advanced Features
   - Transcription
   - Analytics
   - Smart features

## Next Steps

1. Review this plan
2. Confirm Twilio configuration access
3. Implement Phase 1 (recording capture)
4. Test with real voicemail
5. Implement Phase 2 (UI display)
6. Polish and deploy
