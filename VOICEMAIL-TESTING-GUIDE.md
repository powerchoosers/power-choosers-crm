# Voicemail System Testing Guide

## What Was Implemented

### 1. Backend Changes ✅
- **Recording Status Webhook** (`/api/twilio/recording-status`)
  - Captures recording URL when voicemail is left
  - Automatically marks calls as voicemail
  - Creates notifications for new voicemails
  
- **Updated Voice Webhook** (`/api/twilio/voice`)
  - Changed recording callback from `/api/twilio/recording` to `/api/twilio/recording-status`
  - Applied to all call types: inbound, outbound, and power dialer

### 2. UI Changes ✅
- **CallListItem Component** (Transmission Log)
  - Added voicemail icon (amber Voicemail icon)
  - Shows "VOICEMAIL" label instead of "INBOUND" for voicemails
  - Already has full audio playback with scrubber
  
- **Notifications Panel**
  - Shows voicemail icon (amber) for missed calls with voicemail
  - Inline play/pause button for voicemail playback
  - "View Details" link to navigate to call
  
- **Calls Page**
  - New "Recording" column
  - Play button for calls with recordings
  - Voicemail indicator (VM badge) for voicemails
  - Click to navigate to call detail

## Testing Steps

### Test 1: Leave a Voicemail

1. **Call your Twilio number** from your mobile phone
2. **Don't answer** - let it ring until voicemail
3. **Leave a message** - speak for at least 5-10 seconds
4. **Hang up**

**Expected Results:**
- Recording URL should be saved to database
- Call record should be marked as voicemail (`metadata.isVoicemail = true`)
- Notification should be created with type `missed_call`

### Test 2: Check Notifications Panel

1. **Click the bell icon** in the top bar
2. **Look for the voicemail notification**

**Expected Results:**
- Notification shows with amber voicemail icon
- Title: "New Voicemail"
- Message: "Voicemail from [Your Name/Number]"
- Play button appears below the message
- Click play to hear the voicemail
- Pause/stop buttons work correctly

### Test 3: Check Transmission Log (Dossier)

1. **Navigate to the contact** who left the voicemail
2. **Scroll to Transmission Log** section

**Expected Results:**
- Call appears with amber voicemail icon
- Shows "VOICEMAIL" label instead of "INBOUND"
- Duration is displayed
- Click the play button to hear voicemail
- Audio scrubber allows seeking through the recording
- Download button works

### Test 4: Check Calls Page

1. **Navigate to** `/network/calls`
2. **Find the voicemail call** in the table

**Expected Results:**
- "Recording" column shows "VM" badge with amber voicemail icon
- Click the button to navigate to call detail
- Status shows "Voicemail" with yellow indicator

### Test 5: Outbound Call Recording

1. **Make an outbound call** from the CRM
2. **Have a conversation** (or leave a voicemail on their end)
3. **Hang up**

**Expected Results:**
- Recording URL is saved
- Can play back the call from transmission log
- Can play back from calls page
- Shows play button (not voicemail icon since it's outbound)

## Database Verification

Check the `calls` table for the voicemail:

```sql
SELECT 
  id,
  "callSid",
  direction,
  outcome,
  "recordingUrl",
  "recordingSid",
  metadata
FROM calls
WHERE direction = 'inbound'
  AND outcome = 'Voicemail'
ORDER BY timestamp DESC
LIMIT 5;
```

**Expected Fields:**
- `recordingUrl`: Should have Twilio recording URL
- `recordingSid`: Should have recording SID (RE...)
- `metadata.isVoicemail`: Should be `true`
- `metadata.recordingDuration`: Duration in seconds
- `outcome`: Should be "Voicemail"

## Notification Verification

Check the `notifications` table:

```sql
SELECT 
  id,
  type,
  title,
  message,
  metadata,
  read,
  "createdAt"
FROM notifications
WHERE type = 'missed_call'
  AND metadata->>'hasVoicemail' = 'true'
ORDER BY "createdAt" DESC
LIMIT 5;
```

**Expected Fields:**
- `type`: "missed_call"
- `title`: "New Voicemail"
- `metadata.hasVoicemail`: `true`
- `metadata.recordingUrl`: Twilio recording URL
- `metadata.callSid`: Call SID

## Troubleshooting

### Voicemail Not Recording

**Check:**
1. Twilio webhook is receiving the call
2. Recording is enabled in voice.js
3. Recording status callback URL is correct
4. Check Twilio logs for errors

**Fix:**
- Verify `record: 'record-from-answer-dual'` is set
- Verify `recordingStatusCallback` points to `/api/twilio/recording-status`
- Check Twilio console for webhook errors

### Recording URL Not Saved

**Check:**
1. `/api/twilio/recording-status` endpoint is accessible
2. Check server logs for errors
3. Verify database permissions

**Fix:**
- Check that the endpoint returns 200 OK
- Verify Supabase connection
- Check for any database errors in logs

### Notification Not Created

**Check:**
1. Call is marked as voicemail (`metadata.isVoicemail = true`)
2. Notification insert is not failing
3. User ID is correct

**Fix:**
- Check `ownerId` or `assignedTo` field on call
- Verify notifications table exists
- Check for database errors

### Can't Play Voicemail

**Check:**
1. Recording URL is valid
2. `/api/recording` proxy endpoint works
3. Browser console for errors

**Fix:**
- Test recording URL directly in browser
- Check CORS settings
- Verify Twilio credentials

### Voicemail Icon Not Showing

**Check:**
1. Call has `metadata.isVoicemail = true` or `outcome = 'Voicemail'`
2. Component is checking the right field
3. Icon import is correct

**Fix:**
- Verify database field
- Check component logic
- Ensure Voicemail icon is imported from lucide-react

## API Endpoints

### Recording Status Webhook
```
POST /api/twilio/recording-status
```

**Receives from Twilio:**
- CallSid
- RecordingUrl
- RecordingSid
- RecordingDuration
- RecordingStatus
- RecordingChannels

**Actions:**
1. Updates call with recording URL
2. Marks as voicemail if applicable
3. Creates notification

### Recording Proxy
```
GET /api/recording?url={recordingUrl}
GET /api/recording?sid={recordingSid}
```

**Purpose:**
- Proxies Twilio recording through your server
- Handles authentication
- Prevents CORS issues

## Twilio Configuration

### Voice URL
```
https://your-domain.com/api/twilio/voice
Method: POST
```

### Recording Settings
- Recording: Enabled
- Recording Mode: Dual channel
- Recording Status Callback: `https://your-domain.com/api/twilio/recording-status`
- Recording Status Callback Method: POST

## Features Implemented

### Voicemail Detection
- ✅ Automatic detection based on call outcome
- ✅ Marks inbound calls with no answer as voicemail
- ✅ Stores recording URL and metadata

### Notifications
- ✅ Creates notification for new voicemails
- ✅ Shows voicemail icon (amber)
- ✅ Inline playback in notification panel
- ✅ Play/pause controls
- ✅ Link to call detail

### Transmission Log (Dossier)
- ✅ Voicemail icon indicator
- ✅ "VOICEMAIL" label
- ✅ Full audio playback with scrubber
- ✅ Download button
- ✅ Seek controls

### Calls Page
- ✅ Recording column
- ✅ Play button for recordings
- ✅ Voicemail badge (VM)
- ✅ Click to view details

## Next Steps (Optional Enhancements)

### Phase 1: Transcription
- Add Twilio transcription service
- Display text alongside audio
- Search voicemails by content

### Phase 2: Analytics
- Track voicemail response rate
- Average voicemail length
- Callback success rate

### Phase 3: Smart Features
- AI summary of voicemail
- Sentiment analysis
- Auto-create tasks from voicemail
- Priority scoring

## Support

If you encounter issues:

1. **Check Twilio Logs**
   - Go to Twilio Console → Monitor → Logs
   - Look for errors in call logs
   - Check webhook request/response

2. **Check Application Logs**
   - Look for `[RecordingStatus]` entries
   - Check for database errors
   - Verify webhook is being called

3. **Check Database**
   - Verify recording URL is saved
   - Check metadata fields
   - Verify notification was created

4. **Check Browser Console**
   - Look for JavaScript errors
   - Check network tab for failed requests
   - Verify audio element is loading

## Success Criteria

✅ Voicemail is recorded when call goes unanswered
✅ Recording URL is saved to database
✅ Notification is created with voicemail indicator
✅ Can play voicemail from notification panel
✅ Voicemail shows in transmission log with icon
✅ Can play voicemail from transmission log
✅ Voicemail shows in calls page with badge
✅ Audio scrubber works for seeking
✅ Download button works
✅ All UI indicators are correct (icons, labels, colors)

## Testing Checklist

- [ ] Call Twilio number and leave voicemail
- [ ] Verify recording URL in database
- [ ] Check notification was created
- [ ] Play voicemail from notification panel
- [ ] Navigate to contact dossier
- [ ] Verify voicemail icon in transmission log
- [ ] Play voicemail from transmission log
- [ ] Test audio scrubber (seek forward/backward)
- [ ] Download voicemail recording
- [ ] Navigate to calls page
- [ ] Verify recording column shows VM badge
- [ ] Click to view call details
- [ ] Make outbound call and verify recording
- [ ] Test play button on outbound call

## Deployment Notes

1. **Environment Variables**
   - Ensure `TWILIO_ACCOUNT_SID` is set
   - Ensure `TWILIO_AUTH_TOKEN` is set
   - Verify `PUBLIC_BASE_URL` is correct

2. **Database Migrations**
   - No schema changes required
   - Existing `recordingUrl` and `metadata` fields are used

3. **Webhook Configuration**
   - Update Twilio webhook URLs if domain changed
   - Verify webhooks are publicly accessible
   - Test webhook with Twilio's webhook tester

4. **Monitoring**
   - Monitor webhook success rate
   - Track voicemail notification delivery
   - Monitor recording storage usage

## Cost Considerations

- **Recording Storage**: $0.0025 per minute
- **Recording Transcription**: $0.05 per minute (if enabled)
- **Bandwidth**: Minimal (recordings are proxied, not stored)
- **Notifications**: Free (stored in your database)

Estimated cost for 100 voicemails/month (avg 1 min each):
- Recording: $0.25/month
- Storage: Minimal (URLs only)
- Total: ~$0.25/month

## Complete! 🎉

Your voicemail system is now fully implemented and ready to test. Follow the testing steps above to verify everything works correctly.
