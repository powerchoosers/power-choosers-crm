# Power Dialer Ringback Tone Fix

## Problem

When using the power dialer with async AMD (Answering Machine Detection), users were hearing **overlapping audio**:
1. The custom two-tone beep (intended ringback sound)
2. Multiple carrier ringback tones from all 3 simultaneous outbound calls

This created a confusing audio experience where the user heard both sounds at the same time, plus the actual dial tones from the phone carriers.

## Root Cause

With `answerOnBridge: true` and `asyncAmd: 'true'`, Twilio connects the calls at the media level immediately to allow AMD to analyze the audio in the background. This means the browser receives **early media** (ringback tones) from ALL THREE carrier networks simultaneously, which all play through the browser's audio output.

The issue occurs because:
- **Async AMD** requires the call to connect immediately at the media level (to analyze audio)
- **answerOnBridge: true** keeps the call in "ringing" state from the user's perspective
- **Early media** from the carrier (ringback tones) is passed through to the browser
- With 3 simultaneous calls, you get 3 overlapping ringback tones + the custom beep

## Solution

The fix suppresses early media (carrier ringback tones) by **muting the remote audio tracks** until a human actually answers:

1. **On call initiation**: Mute all remote audio tracks from the MediaStream
2. **During ringing**: Keep remote audio muted (user only hears custom two-tone beep)
3. **On accept**: Unmute remote audio tracks so the user can hear the person who answered

### Implementation Details

**File**: `crm-platform/src/context/VoiceContext.tsx`

```typescript
// After device.connect() for power dial:
if (isPowerDial) {
  // Mute remote audio tracks to suppress early media ringback
  const muteRemoteAudio = () => {
    const remoteStream = call.getRemoteStream()
    if (remoteStream) {
      remoteStream.getAudioTracks().forEach(track => {
        track.enabled = false  // Disable remote audio
      })
    }
  }

  // Unmute when call is accepted
  const unmuteRemoteAudio = () => {
    const remoteStream = call.getRemoteStream()
    if (remoteStream) {
      remoteStream.getAudioTracks().forEach(track => {
        track.enabled = true  // Re-enable remote audio
      })
    }
  }

  // Listen for ringing event with early media
  call.on('ringing', (hasEarlyMedia) => {
    if (hasEarlyMedia) {
      muteRemoteAudio()
    }
  })

  // Unmute on accept
  call.on('accept', () => {
    unmuteRemoteAudio()
  })
}
```

## Technical Background

### What is Early Media?

Early media is audio that flows **before** a call is fully answered. Common examples:
- Carrier ringback tones ("ring ring" sound)
- "The number you have dialed is not in service" messages
- Call progress announcements

### Why Does This Happen with Async AMD?

Synchronous AMD waits for the call to be answered before connecting media. Async AMD connects media **immediately** so it can analyze the audio in the background to detect voicemail. This is necessary for power dialing because:
- Voicemail systems answer instantly (1-2 rings)
- Humans answer slower (3-8 rings)
- With sync AMD, voicemail would "win" the race every time

### Why Not Just Disable answerOnBridge?

`answerOnBridge: true` is essential because:
- It keeps the call in "ringing" state until someone actually answers
- It prevents billing from starting until a human picks up
- It provides accurate call state for the UI

## Testing

To verify the fix works:

1. **Start a power dial session** with 3 contacts
2. **Listen for audio** - you should ONLY hear the two-tone beep
3. **No carrier ringback tones** should be audible
4. **When someone answers**, you should immediately hear them clearly

## Related Files

- `crm-platform/src/context/VoiceContext.tsx` - Main fix implementation
- `crm-platform/src/lib/audio.ts` - Custom ringback tone (two-tone beep)
- `crm-platform/src/pages/api/twilio/voice.js` - TwiML with async AMD config
- `ASYNC-AMD-TECHNICAL-DETAILS.md` - Background on async AMD

## References

- [Twilio Voice SDK: Twilio.Call](https://www.twilio.com/docs/voice/sdks/javascript/twiliocall)
- [GitHub Issue #85: answerOnBridge ringback tone](https://github.com/twilio/twilio-voice-ios/issues/85)
- [Twilio Docs: TwiML Number](https://www.twilio.com/docs/voice/twiml/number)
