# Power Dialer Async AMD Testing Guide

## Quick Test Checklist

### 1. Test with Voicemail Numbers
**Goal:** Verify AMD detects voicemail and auto-drops

**Steps:**
1. Add 2-3 contacts with numbers that go to voicemail
2. Start power dial session
3. Let calls connect

**Expected Results:**
- ✅ Call connects immediately (no silence)
- ✅ You hear the voicemail greeting
- ✅ AMD webhook fires within 5-10 seconds
- ✅ Voicemail auto-drops (if configured in settings)
- ✅ Post-call workspace shows "VM DROPPED" status
- ✅ Call log shows `answeredBy: machine_end_beep`

**Check Logs:**
```
[Voice] POWER DIAL: Dialing 3 numbers...
[AMD] Answering Machine Detection Result: { AnsweredBy: 'machine_end_beep' }
[AMD] Outbound voicemail drop initiated for call: CA...
```

### 2. Test with Human Answers
**Goal:** Verify humans connect without delay

**Steps:**
1. Add 2-3 contacts with real phone numbers
2. Start power dial session
3. Have someone answer

**Expected Results:**
- ✅ First person to answer gets connected immediately
- ✅ No silence or delay for the person answering
- ✅ Other calls are cancelled automatically
- ✅ AMD webhook fires with `human` result
- ✅ Call continues normally
- ✅ Call log shows `answeredBy: human`

**Check Logs:**
```
[Voice] POWER DIAL: Dialing 3 numbers...
[Dial Status] Call answered by: +1234567890
[AMD] Answering Machine Detection Result: { AnsweredBy: 'human' }
```

### 3. Test Mixed Batch (Critical Test)
**Goal:** Verify humans win over voicemail

**Steps:**
1. Create batch with:
   - 1 number that goes to voicemail immediately
   - 2 numbers answered by humans (have colleagues ready)
2. Start power dial
3. Have humans answer within 3-5 seconds

**Expected Results:**
- ✅ If human answers first → connects to human, voicemail cancelled
- ✅ If voicemail answers first → AMD detects it, you can manually drop or wait for auto-drop
- ✅ Other calls are cancelled once one connects

**This is the key test** - if voicemail still "wins" every time, async AMD isn't working.

### 4. Test Unknown AMD Results
**Goal:** Verify handling of unclear detections

**Steps:**
1. Call numbers with unusual greetings (business IVRs, etc.)
2. Check how system handles `unknown` AMD results

**Expected Results:**
- ✅ Call connects
- ✅ AMD webhook fires with `answeredBy: unknown`
- ✅ You can manually assess and drop voicemail if needed
- ✅ Post-call workspace shows "AMD UNKNOWN" status

### 5. Test Manual VM Drop Button
**Goal:** Verify manual override still works

**Steps:**
1. Start a call that connects to voicemail
2. Click "VM Drop" button in power dialer UI
3. Verify voicemail plays and call ends

**Expected Results:**
- ✅ Button is visible during active call
- ✅ Clicking triggers voicemail drop
- ✅ Recording plays after beep
- ✅ Call ends automatically
- ✅ Status updates to "VM DROPPED"

## Monitoring & Debugging

### Key Metrics to Track

**Before Fix:**
- Voicemail connections: ~80-90% (too high)
- Human connections: ~10-20% (too low)
- Manual VM drops: High

**After Fix (Expected):**
- Voicemail connections: ~30-40% (realistic)
- Human connections: ~50-60% (improved)
- Auto VM drops: High
- Manual VM drops: Low

### Log Locations

**Voice.js (Call Initiation):**
```bash
[Voice] POWER DIAL: Dialing X numbers for batch...
```

**AMD Status (Detection Results):**
```bash
[AMD] Answering Machine Detection Result: { CallSid, AnsweredBy, ... }
[AMD] Outbound voicemail drop initiated for call: ...
```

**Dial Status (Connection Events):**
```bash
[Dial Status] Call answered by: +1234567890
[Dial Status] statusCallbackEvent: answered
```

### Common Issues & Solutions

#### Issue: Still connecting to voicemail first
**Symptoms:** Voicemail always wins the race

**Check:**
1. Verify `asyncAmd: 'true'` is in voice.js
2. Check AMD webhook is receiving callbacks
3. Verify `asyncAmdStatusCallback` URL is correct
4. Check Twilio debugger for AMD events

**Solution:** Ensure async AMD is actually enabled (check TwiML output in logs)

#### Issue: No AMD webhooks firing
**Symptoms:** Calls connect but no AMD detection

**Check:**
1. Verify `/api/twilio/amd-status` endpoint is accessible
2. Check Twilio webhook logs in console
3. Verify `asyncAmdStatusCallback` URL is absolute (not relative)

**Solution:** Check webhook URL format and accessibility

#### Issue: Voicemail not auto-dropping
**Symptoms:** AMD detects voicemail but doesn't drop

**Check:**
1. Verify outbound voicemail is configured in Settings
2. Check `triggerOutboundVoicemailDrop` function
3. Verify Twilio has permission to update call

**Solution:** Configure voicemail drop in settings, check logs for errors

#### Issue: Humans hear silence
**Symptoms:** Person answering hears nothing for 5-10 seconds

**Check:**
1. Verify `asyncAmd: 'true'` is set (not synchronous)
2. Check `answerOnBridge: true` is in dial config
3. Verify no TwiML `<Say>` before `<Dial>`

**Solution:** This indicates synchronous AMD - verify async is enabled

## Performance Benchmarks

### Expected Timing

**Async AMD (Current):**
- Time to connect: 0-2 seconds (immediate)
- AMD result: 5-15 seconds (background)
- Total user experience: Instant connection

**Sync AMD (Old - Don't Use):**
- Time to connect: 5-15 seconds (blocked)
- AMD result: 5-15 seconds (blocking)
- Total user experience: Awkward silence

### Success Criteria

✅ **Fix is working if:**
- Humans connect within 2 seconds
- No silence for person answering
- Voicemail is detected within 15 seconds
- Auto-drop works for voicemail
- Mixed batches connect to humans more often

❌ **Fix is NOT working if:**
- Voicemail still wins every time
- Humans hear 5+ seconds of silence
- AMD webhooks not firing
- Auto-drop not working

## Rollback Procedure

If async AMD causes issues:

1. **Remove async AMD parameters from voice.js:**
```javascript
// Remove these 3 lines:
asyncAmd: 'true',
asyncAmdStatusCallback: `${base}/api/twilio/amd-status?${targetParams.toString()}`,
asyncAmdStatusCallbackMethod: 'POST'
```

2. **Redeploy:**
```bash
git commit -m "Rollback async AMD"
git push
```

3. **Verify rollback:**
- Check TwiML output no longer has `AsyncAmd` parameter
- Confirm calls work (with original voicemail issue)

## Next Steps After Testing

1. **Monitor for 1 week:**
   - Track connection rates
   - Gather user feedback
   - Check AMD accuracy

2. **Tune AMD parameters if needed:**
   - Adjust `machineDetectionTimeout` (default: 45s)
   - Consider `machineDetectionSpeechThreshold` for edge cases
   - Fine-tune `machineDetectionSpeechEndThreshold` for short voicemails

3. **Consider additional improvements:**
   - Add AMD result analytics dashboard
   - Track false positive/negative rates
   - Optimize batch size based on connection patterns

## Support Resources

- [Twilio AMD Documentation](https://twilio.com/docs/voice/answering-machine-detection)
- [AMD FAQ & Best Practices](https://static1.twilio.com/docs/voice/answering-machine-detection-faq-best-practices)
- [Twilio Support](https://support.twilio.com) - For AMD tuning assistance
