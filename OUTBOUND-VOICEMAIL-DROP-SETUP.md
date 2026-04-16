# Outbound Voicemail Drop Setup Guide

## Overview

This guide explains how to set up automatic voicemail drop for your power dialer. When a call reaches a voicemail, the system will automatically detect it and play your pre-recorded message.

## What's Been Implemented

### 1. Backend Infrastructure

- **New API Endpoint**: `/api/settings/outbound-voicemail` - Handles recording, saving, and deleting outbound voicemail drops
- **AMD Webhook**: `/api/twilio/amd-status` - Receives Answering Machine Detection results from Twilio and automatically drops voicemail
- **Library Functions**: Added to `lib/voicemail.ts`:
  - `normalizeOutboundVoicemailDrop()` - Normalizes outbound voicemail drop data
  - `getOutboundVoicemailDrop()` - Gets the outbound voicemail drop for a user
  - `getOutboundVoicemailDropForTwilioNumber()` - Gets the outbound voicemail drop for a specific Twilio number
  - `buildOutboundVoicemailStoragePath()` - Builds storage path for outbound voicemail files

### 2. Data Structure

The outbound voicemail drop is stored separately from inbound voicemail greetings:

```typescript
{
  enabled: boolean
  publicUrl: string | null
  storagePath: string | null  // e.g., "twilio-numbers/PN123/outbound-drop.wav"
  fileName: string | null
  mimeType: string | null
  updatedAt: string | null
  twilioNumberSid: string | null
  twilioNumber: string | null
  twilioNumberName: string | null
}
```

## Setup Instructions

### Step 1: Add UI to Settings Page

You need to add a new section to your settings page (`crm-platform/src/app/network/settings/page.tsx`) for recording outbound voicemail drops. This should be similar to the existing voicemail greeting section but separate.

Add these state variables (around line 180):

```typescript
// Outbound Voicemail Drop State
const [outboundVoicemailDrop, setOutboundVoicemailDrop] = useState<OutboundVoicemailDrop | null>(null)
const [outboundVoicemailPreviewUrl, setOutboundVoicemailPreviewUrl] = useState<string | null>(null)
const [isRecordingOutboundVoicemail, setIsRecordingOutboundVoicemail] = useState(false)
const [outboundVoicemailRecordingSeconds, setOutboundVoicemailRecordingSeconds] = useState(0)
const [isSavingOutboundVoicemail, setIsSavingOutboundVoicemail] = useState(false)
const [outboundVoicemailError, setOutboundVoicemailError] = useState<string | null>(null)
const [pendingOutboundVoicemailBlob, setPendingOutboundVoicemailBlob] = useState<Blob | null>(null)
const outboundRecorderRef = useRef<VoicemailRecorderState | null>(null)
const outboundVoicemailTimerRef = useRef<number | null>(null)
const outboundVoicemailPreviewUrlRef = useRef<string | null>(null)
const outboundVoicemailPlaybackSrc = outboundVoicemailPreviewUrl || outboundVoicemailDrop?.publicUrl || null
```

Then duplicate the voicemail recording functions but rename them for outbound:
- `startOutboundVoicemailRecording()`
- `stopOutboundVoicemailRecording()`
- `saveOutboundVoicemailDrop()`
- `deleteOutboundVoicemailDrop()`
- `discardOutboundVoicemailDraft()`

Update the API calls to use `/api/settings/outbound-voicemail` instead of `/api/settings/voicemail`.

### Step 2: Add UI Section

Add a new card in your settings page UI (after the inbound voicemail section):

```tsx
{/* Outbound Voicemail Drop */}
<div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
  <div className="flex items-center gap-3 mb-4">
    <PhoneOutgoing className="w-5 h-5 text-[#002FA7]" />
    <div>
      <h3 className="text-lg font-semibold text-white">Outbound Voicemail Drop</h3>
      <p className="text-xs text-zinc-500 mt-1">
        Record a message to automatically leave when you reach a voicemail (for power dialer)
      </p>
    </div>
  </div>

  {/* Recording UI - similar to inbound voicemail section */}
  {/* ... */}
</div>
```

### Step 3: Update Twilio Call Initiation

Update your call initiation code to enable AMD. Find where calls are initiated (likely in `VoiceContext.tsx` or similar) and add AMD parameters:

```typescript
const call = await client.calls.create({
  from: twilioPhone,
  to: targetPhone,
  url: bridgeUrl,
  
  // Add AMD Configuration
  machineDetection: 'DetectMessageEnd',  // Waits for beep
  asyncAmd: 'true',  // Get AMD results asynchronously
  asyncAmdStatusCallback: `${baseUrl}/api/twilio/amd-status`,
  asyncAmdStatusCallbackMethod: 'POST',
  
  // Existing config
  statusCallback: statusCallbackUrl,
  statusCallbackMethod: 'POST',
  timeout: 30
});
```

### Step 4: Configure Twilio Console

1. Go to your Twilio Console
2. Navigate to your TwiML App
3. Ensure these URLs are set:
   - Voice URL: `https://your-domain.com/api/twilio/voice`
   - Voice Fallback URL: `https://your-domain.com/api/twilio/voice`
   - Status Callback URL: `https://your-domain.com/api/twilio/status`

### Step 5: Test the Setup

1. **Record an outbound voicemail drop**:
   - Go to Settings
   - Find the "Outbound Voicemail Drop" section
   - Click "Record Message"
   - Record your message (e.g., "Hi, this is [Your Name] from [Company]. I was calling about...")
   - Click "Stop Recording"
   - Preview the recording
   - Click "Save"

2. **Test with power dialer**:
   - Select contacts in your power dialer
   - Start a power dial session
   - Call a number that goes to voicemail
   - Watch the logs for AMD detection
   - Verify your pre-recorded message plays automatically

3. **Check the logs**:
   ```bash
   # Look for these log entries:
   [AMD] Answering Machine Detection Result: { AnsweredBy: 'machine_end_beep', ... }
   [AMD] Outbound voicemail drop initiated for call: CA123...
   ```

## How It Works

### Call Flow

1. **Power Dialer Initiates Call**
   - Call is made with `machineDetection: 'DetectMessageEnd'`
   - Twilio starts listening for voicemail indicators

2. **AMD Detection**
   - Twilio analyzes the audio
   - Detects if a human or machine answered
   - Waits for the beep if it's a voicemail

3. **Webhook Callback**
   - Twilio calls `/api/twilio/amd-status` with the result
   - `AnsweredBy` parameter indicates: `human`, `machine_end_beep`, etc.

4. **Automatic Voicemail Drop**
   - If `AnsweredBy` indicates voicemail, the webhook:
     - Looks up the user's outbound voicemail drop
     - Uses Twilio API to update the call with TwiML
     - Plays the pre-recorded message
     - Hangs up after the message

### AMD Result Values

- `human` - A person answered (no voicemail drop)
- `machine_start` - Detected start of machine greeting
- `machine_end_beep` - Detected beep (best for voicemail drop)
- `machine_end_silence` - Detected silence at end of greeting
- `machine_end_other` - Detected end of greeting (other method)
- `fax` - Fax machine detected
- `unknown` - Could not determine

## Differences: Inbound vs Outbound Voicemail

| Feature | Inbound Voicemail Greeting | Outbound Voicemail Drop |
|---------|---------------------------|-------------------------|
| **Purpose** | When people call YOU and you don't answer | When YOU call people and they don't answer |
| **Trigger** | Incoming call goes unanswered | AMD detects voicemail on outbound call |
| **Storage** | `twilio-numbers/{id}/greeting.wav` | `twilio-numbers/{id}/outbound-drop.wav` |
| **API Endpoint** | `/api/settings/voicemail` | `/api/settings/outbound-voicemail` |
| **Settings Field** | `voicemailGreeting` | `outboundVoicemailDrop` |
| **Use Case** | Business hours greeting, after-hours message | Sales prospecting, follow-ups |

## Cost Considerations

- **AMD Cost**: $0.0075 per call attempt
- **AsyncAMD**: Recommended for better user experience (doesn't block call flow)
- **DetectMessageEnd**: Waits for beep, ideal for voicemail drop

## Troubleshooting

### Voicemail not dropping automatically

1. Check that AMD is enabled in call initiation
2. Verify the AMD webhook URL is correct
3. Check logs for AMD detection results
4. Ensure outbound voicemail drop is recorded and saved
5. Verify the Twilio number has an outbound voicemail drop configured

### AMD detecting incorrectly

- Adjust `machineDetectionSpeechThreshold` (default 2400ms)
- Adjust `machineDetectionSpeechEndThreshold` (default 1200ms)
- Adjust `machineDetectionSilenceTimeout` (default 5000ms)

### Recording not saving

- Check browser permissions for microphone
- Verify the audio is WAV format
- Check file size (must be under 15MB)
- Check Supabase storage bucket permissions

## Next Steps

1. Add the UI components to the settings page
2. Test recording and playback
3. Test with a real voicemail
4. Monitor AMD accuracy and adjust thresholds if needed
5. Consider adding analytics to track voicemail drop success rates

## Support

For issues or questions:
- Check Twilio logs in the console
- Review application logs for `[AMD]` and `[OutboundVoicemail]` entries
- Verify Supabase storage bucket is public and accessible
