# Async AMD Technical Implementation Details

## Overview

This document explains the technical implementation of asynchronous Answering Machine Detection (AMD) for the parallel power dialer, including the race condition problem and how async AMD solves it.

## The Race Condition Problem

### How Twilio's `<Dial>` Works with Multiple Numbers

When you use TwiML like this:

```xml
<Dial>
  <Number>+15551234567</Number>
  <Number>+15559876543</Number>
  <Number>+15555555555</Number>
</Dial>
```

Twilio's behavior:
1. Initiates all calls simultaneously
2. Waits for ANY call to be answered
3. **Immediately connects to the first answered call**
4. **Immediately cancels all other calls**

### The Voicemail Problem

**Voicemail systems answer instantly:**
- Human: 3-8 rings (15-40 seconds)
- Voicemail: 1-2 rings (5-10 seconds)
- Result: **Voicemail wins the race 80-90% of the time**

### Why Synchronous AMD Doesn't Help

**Synchronous AMD (`asyncAmd: false` or not set):**

```
1. Call connects to voicemail
   ↓
2. Twilio BLOCKS the call (silence)
   ↓
3. AMD analyzes audio for 5-15 seconds
   ↓
4. AMD returns result: "machine_end_beep"
   ↓
5. Call finally bridges to agent
```

**Problems:**
- ❌ Voicemail already "won" the race (other calls cancelled)
- ❌ Agent hears 5-15 seconds of silence
- ❌ If a human answered, they hear silence and hang up
- ❌ Detection happens AFTER the race is already over

## The Async AMD Solution

### How Async AMD Works

**Asynchronous AMD (`asyncAmd: true`):**

```
1. Call connects to voicemail
   ↓
2. Call IMMEDIATELY bridges to agent (no blocking)
   ↓
3. AMD analyzes audio IN BACKGROUND
   ↓
4. AMD webhook fires with result
   ↓
5. If voicemail: Auto-drop via TwiML update
```

**Benefits:**
- ✅ No silence for humans or agents
- ✅ AMD detection happens in parallel
- ✅ Can still auto-drop voicemail after detection
- ✅ Better user experience

### Implementation Code

**File: `crm-platform/src/pages/api/twilio/voice.js`**

```javascript
powerDialTargets.forEach((target, index) => {
    // ... build callback params ...
    
    dial.number({
        statusCallback: `${base}/api/twilio/dial-status?${targetParams.toString()}`,
        statusCallbackEvent: 'initiated ringing answered completed',
        
        // Async AMD configuration
        machineDetection: 'DetectMessageEnd',      // Wait for beep (more accurate)
        machineDetectionTimeout: 45,                // Max 45 seconds to detect
        asyncAmd: 'true',                           // ← KEY: Run in background
        asyncAmdStatusCallback: `${base}/api/twilio/amd-status?${targetParams.toString()}`,
        asyncAmdStatusCallbackMethod: 'POST'
    }, target.phoneNumber);
});
```

### AMD Webhook Flow

**Endpoint: `/api/twilio/amd-status`**

```javascript
// Twilio POSTs to this endpoint with AMD result
{
  CallSid: 'CAxxxxx',
  AnsweredBy: 'machine_end_beep',  // or 'human', 'unknown', etc.
  MachineDetectionDuration: 8500,   // milliseconds
  Called: '+15551234567',
  From: '+15559876543'
}
```

**Handler Logic:**

```javascript
1. Receive AMD result
   ↓
2. Update call record in database
   ↓
3. If voicemail detected:
   a. Check if already dropped
   b. Trigger outbound voicemail drop
   c. Update call with drop status
   ↓
4. Return 200 OK to Twilio
```

## AMD Result Values

### AnsweredBy Values

**When `machineDetection: 'Enable'`:**
- `human` - Human answered
- `machine_start` - Machine detected (before beep)
- `fax` - Fax machine detected
- `unknown` - Could not determine

**When `machineDetection: 'DetectMessageEnd'` (our config):**
- `human` - Human answered
- `machine_end_beep` - Voicemail detected, beep heard
- `machine_end_silence` - Voicemail detected, silence after greeting
- `machine_end_other` - Voicemail detected, other end indicator
- `fax` - Fax machine detected
- `unknown` - Could not determine

### Our Classification Logic

**File: `crm-platform/src/lib/voice-outcomes.ts`**

```typescript
export function isVoicemailAnsweredBy(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = String(value).toLowerCase().trim();
  return normalized.startsWith('machine_');
}

export function isUnknownAnsweredBy(value: string | null | undefined): boolean {
  if (!value) return false;
  return String(value).toLowerCase().trim() === 'unknown';
}
```

## Voicemail Auto-Drop Flow

### Trigger Function

**File: `crm-platform/src/lib/twilio-voicemail-drop.ts`**

```typescript
export async function triggerOutboundVoicemailDrop({
  callSid,
  businessNumber,
  candidateIdentifiers
}: {
  callSid: string
  businessNumber: string
  candidateIdentifiers: string[]
}): Promise<VoicemailDropResult>
```

**Process:**
1. Look up user's outbound voicemail recording
2. Generate TwiML to play recording
3. Use Twilio API to update active call with new TwiML
4. Recording plays, then call hangs up

### TwiML Update

```javascript
// Update the active call to play voicemail
await twilioClient.calls(callSid).update({
  twiml: `
    <Response>
      <Play>${voicemailRecordingUrl}</Play>
      <Hangup/>
    </Response>
  `
});
```

## Timing & Performance

### Expected Timings

**Call Connection:**
- Dial initiated: 0ms
- First ring: 1000-2000ms
- Answer (voicemail): 5000-10000ms
- Answer (human): 15000-40000ms
- Bridge to agent: +0-100ms (async) vs +5000-15000ms (sync)

**AMD Detection:**
- Start: Immediately on answer
- Human detection: 1000-3000ms
- Voicemail detection: 5000-15000ms (waiting for beep)
- Timeout: 45000ms (configurable)

**Voicemail Drop:**
- AMD webhook: +100-500ms
- TwiML update: +200-800ms
- Recording playback: 10000-30000ms (depends on recording length)
- Total: ~10-30 seconds from answer to hangup

### Performance Optimization

**Webhook Response Time:**
- Target: <200ms
- Current: ~100-300ms
- Optimization: Database upsert is async, doesn't block response

**TwiML Update:**
- Target: <500ms
- Current: ~200-800ms
- Optimization: Direct Twilio API call, minimal processing

## Configuration Options

### AMD Tuning Parameters

**machineDetectionTimeout** (default: 45)
- How long to wait for AMD result
- Increase: More time to detect (fewer unknowns)
- Decrease: Faster response (more unknowns)

**machineDetectionSpeechThreshold** (default: 2400ms)
- Length of speech to classify as machine
- Increase: Fewer false machines (long human greetings)
- Decrease: Detect short voicemails better

**machineDetectionSpeechEndThreshold** (default: 1200ms)
- Silence duration to consider speech complete
- Increase: Better for short voicemails with gaps
- Decrease: Faster human detection

**machineDetectionSilenceTimeout** (default: 5000ms)
- Initial silence before returning unknown
- Increase: Wait longer for greeting
- Decrease: Faster unknown result

### Our Current Configuration

```javascript
{
  machineDetection: 'DetectMessageEnd',  // Wait for beep
  machineDetectionTimeout: 45,            // 45 seconds max
  asyncAmd: 'true',                       // Background detection
  // Using defaults for other parameters
}
```

## Error Handling

### AMD Webhook Failures

**Scenario:** AMD webhook fails to reach our server

**Twilio Behavior:**
- Retries webhook 3 times
- Exponential backoff
- Eventually gives up

**Our Handling:**
- Always return 200 OK (even on error)
- Log errors but don't fail
- Prevents duplicate voicemail drops

### Voicemail Drop Failures

**Scenario:** TwiML update fails

**Possible Causes:**
- Call already ended
- Invalid TwiML
- Twilio API error

**Our Handling:**
```javascript
const dropResult = await triggerOutboundVoicemailDrop({...})
  .catch((dropError) => ({
    status: 'failed',
    reason: dropError?.message || 'twilio-update-failed',
  }));

// Always update call record with result
await upsertCallInSupabase({
  voicemailDropStatus: dropResult?.status || 'failed',
  voicemailDropReason: dropResult?.reason || null,
});
```

## Monitoring & Debugging

### Key Logs to Watch

**Voice.js (Call Initiation):**
```
[Voice] POWER DIAL: Dialing 3 numbers for batch abc123 with callerId +15551234567
```

**AMD Status (Detection):**
```
[AMD] Answering Machine Detection Result: {
  CallSid: 'CAxxxxx',
  AnsweredBy: 'machine_end_beep',
  MachineDetectionDuration: 8500
}
```

**Voicemail Drop (Auto-drop):**
```
[AMD] Outbound voicemail drop initiated for call: CAxxxxx
```

### Twilio Debugger

Check Twilio Console → Monitor → Logs → Debugger for:
- AMD events
- Webhook delivery status
- TwiML update results
- Call status changes

### Database Queries

**Check AMD results:**
```sql
SELECT 
  call_sid,
  answered_by,
  machine_detection_duration,
  voicemail_drop_status,
  created_at
FROM calls
WHERE answered_by IS NOT NULL
ORDER BY created_at DESC
LIMIT 100;
```

**AMD accuracy metrics:**
```sql
SELECT 
  answered_by,
  COUNT(*) as count,
  AVG(machine_detection_duration) as avg_duration_ms
FROM calls
WHERE answered_by IS NOT NULL
GROUP BY answered_by;
```

## Alternative Approaches (Not Implemented)

### 1. REST API with Manual Cancellation

**Concept:** Create calls via REST API, monitor status, cancel losers

```javascript
// Create multiple calls
const calls = await Promise.all(
  targets.map(target => 
    twilioClient.calls.create({
      to: target.phoneNumber,
      from: callerId,
      url: twimlUrl,
      machineDetection: 'DetectMessageEnd'
    })
  )
);

// Monitor for first answer
const winner = await waitForFirstAnswer(calls);

// Cancel others
await Promise.all(
  calls
    .filter(c => c.sid !== winner.sid)
    .map(c => twilioClient.calls(c.sid).update({ status: 'canceled' }))
);
```

**Why Not:**
- ❌ Much more complex
- ❌ Rate limits (1 call/second)
- ❌ Timing issues
- ❌ Higher costs (more API calls)
- ❌ Harder to maintain

### 2. Call Screening with `<Gather>`

**Concept:** Ask callee to press key before connecting

```xml
<Dial>
  <Number url="/screen">+15551234567</Number>
</Dial>

<!-- /screen endpoint -->
<Response>
  <Gather numDigits="1" timeout="5">
    <Say>Press any key to accept this call</Say>
  </Gather>
  <Hangup/>
</Response>
```

**Why Not:**
- ❌ Adds friction for legitimate contacts
- ❌ Many people hang up
- ❌ Feels spammy
- ❌ Doesn't work well with power dialer UX

### 3. Disable AMD Entirely

**Concept:** Remove machine detection, handle manually

**Why Not:**
- ❌ Can't auto-drop voicemail
- ❌ Wastes agent time
- ❌ Defeats purpose of voicemail drop feature

## Future Enhancements

### 1. AMD Analytics Dashboard

Track and visualize:
- AMD accuracy rates
- False positive/negative rates
- Detection timing distribution
- Voicemail drop success rates

### 2. Adaptive AMD Tuning

Automatically adjust parameters based on:
- Historical accuracy
- Industry/vertical patterns
- Time of day patterns
- Geographic patterns

### 3. Machine Learning Enhancement

Train custom model on:
- Your specific voicemail patterns
- Industry-specific greetings
- Regional accent patterns
- Business vs personal patterns

### 4. Smart Batch Optimization

Dynamically adjust batch size based on:
- Historical answer rates
- Time of day
- Contact type
- Previous attempt results

## References

- [Twilio AMD Documentation](https://twilio.com/docs/voice/answering-machine-detection)
- [AMD FAQ & Best Practices](https://static1.twilio.com/docs/voice/answering-machine-detection-faq-best-practices)
- [Async AMD Announcement](https://www.twilio.com/en-us/changelog/async-answering-machine-detection-now-generally-available)
- [TwiML Dial Verb](https://www.twilio.com/docs/voice/twiml/dial)
- [Stack Overflow: Multiple Numbers](https://stackoverflow.com/questions/45260550/twilio-call-multiple-phone-numbers-at-once-and-get-connected-to-the-first-one-w)
