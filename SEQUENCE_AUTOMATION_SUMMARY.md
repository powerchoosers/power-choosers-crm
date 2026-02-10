# Sequence Automation - Implementation Summary

## ✅ What Was Built

I've fully wired up sequences/protocols with Gmail API email capabilities and Supabase cron jobs. Here's what was implemented:

### 1. Gmail API Integration ✅

**File**: `api/email/gmail-send-sequence.js`
- Gmail API wrapper for sequence emails
- Supports HTML/text content, tracking, personalization
- Proper error handling and response formatting
- Returns message IDs for tracking
- Uses domain-wide delegation for sending

**Integration**: 
- Added to `server.js` with route `/api/email/gmail-send-sequence`
- Documented in `cloudbuild.yaml` (requires `GOOGLE_SERVICE_ACCOUNT_KEY` env var)

### 2. Database Infrastructure ✅

**Migration**: `supabase/migrations/20260209000000_sequence_automation.sql`

Created:
- `sequence_executions` table - Tracks every step execution for every contact
- pgmq queue (`sequence_jobs`) - Manages asynchronous job processing
- Utility functions:
  - `util.queue_sequence_step()` - Auto-queues steps when they're ready
  - `util.process_sequence_steps()` - Processes batches of steps
  - `enroll_in_sequence()` - Enrolls contacts and creates all execution records
- Triggers for automatic queueing when steps are ready
- RLS policies for security

### 3. Edge Function ✅

**File**: `supabase/functions/process-sequence-step/index.ts`

Features:
- Processes sequence steps from the queue
- Sends emails via Gmail API through backend
- Handles variable replacement ({{first_name}}, {{company_name}}, etc.)
- Implements retry logic (up to 3 attempts)
- Tracks execution status and errors
- Deletes completed jobs from queue

### 4. Cron Jobs ✅

**Schedule**: Every 5 minutes during business hours (8AM-5PM CST)

Two cron jobs created in migration:
1. `process-sequence-steps-business-hours` - Runs every 5 minutes from 14:00-22:59 UTC (8AM-4:59PM CST)
2. `process-sequence-steps-end-of-day` - Runs at 23:00 UTC (5PM CST) to catch final batch

**Free Tier Friendly**: Only 2 crons, running during business hours only (saves resources)

### 5. Documentation ✅

Created comprehensive guides:
- `SEQUENCE_AUTOMATION_SETUP.md` - Complete setup and usage guide
- `test-sequence-automation.sql` - End-to-end test script

## 🎯 How It Works

### The Flow

```
1. User creates sequence with email steps in Protocol Builder
   ↓
2. User enrolls contacts via enroll_in_sequence()
   ↓
3. System creates sequence_executions for each step
   ↓
4. Cron job runs every 5 minutes (8AM-5PM CST)
   ↓
5. Finds executions where scheduled_at <= NOW()
   ↓
6. Queues them in pgmq
   ↓
7. Edge Function processes batches
   ↓
8. Sends emails via Gmail API
   ↓
9. Updates execution status to 'completed'
   ↓
10. Deletes job from queue
```

### Delay Handling

Delays are handled during enrollment:
- When a contact is enrolled, all steps are created with calculated `scheduled_at` timestamps
- Each step's delay is added to the previous step's scheduled time
- The cron job only processes steps where `scheduled_at <= NOW()`

Example:
- Step 1 (email): scheduled_at = NOW()
- Step 2 (delay 3 days): scheduled_at = NOW() + 3 days
- Step 3 (email): scheduled_at = NOW() + 3 days
- Step 4 (delay 4 days): scheduled_at = NOW() + 7 days  
- Step 5 (email): scheduled_at = NOW() + 7 days

### Email Variable Replacement

The Edge Function automatically replaces these variables:
- `{{first_name}}` → Contact's first name
- `{{last_name}}` → Contact's last name
- `{{company_name}}` → Contact's company name

More can be easily added.

## 🚀 Setup Checklist

### Local Development

- [ ] Add `GOOGLE_SERVICE_ACCOUNT_KEY` to `.env` file
- [ ] Run migration: `npx supabase db push`
- [ ] Set project URL secret (see setup guide)
- [ ] Deploy Edge Function: `npx supabase functions deploy process-sequence-step --no-verify-jwt`
- [ ] Test with `test-sequence-automation.sql`

### Production Deployment

- [ ] Add `GOOGLE_SERVICE_ACCOUNT_KEY` to Cloud Run environment variables (nodal-point-network service)
- [ ] Migration is auto-applied via Cloud Build
- [ ] Set project URL secret in Supabase Dashboard (SQL Editor)
- [ ] Deploy Edge Function via Supabase Dashboard or CLI
- [ ] Set Edge Function `API_BASE_URL` secret: `npx supabase secrets set API_BASE_URL=https://nodal-point-network-792458658491.us-central1.run.app`
- [ ] Verify domain-wide delegation is configured in Google Workspace Admin
- [ ] Test with small batch first

## 📊 Monitoring

### Database Queries

```sql
-- Check pending executions
SELECT status, COUNT(*) 
FROM sequence_executions 
GROUP BY status;

-- View failed executions
SELECT * FROM sequence_executions 
WHERE status = 'failed' 
ORDER BY created_at DESC;

-- Check queue length
SELECT * FROM pgmq.queue_length('sequence_jobs');

-- View cron job history
SELECT * FROM cron.job_run_details 
WHERE job_name LIKE '%sequence%' 
ORDER BY start_time DESC 
LIMIT 10;
```

### Edge Function Logs

```bash
npx supabase functions logs process-sequence-step --limit 50
```

### Gmail API Monitoring

Check email delivery status via Gmail API logs and Supabase email tracking records.

## 🎓 Usage Examples

### Enroll Contacts from UI

```typescript
const result = await supabase.rpc('enroll_in_sequence', {
  p_sequence_id: 'seq-123',
  p_contact_ids: ['contact-1', 'contact-2'],
  p_owner_id: userId
});

console.log(result.data); 
// { enrolled: 2, skipped: 0, total: 2 }
```

### Create Email Step in Protocol Builder

```json
{
  "id": "step-1",
  "type": "email",
  "label": "Initial Outreach",
  "subject": "Quick question about {{company_name}}",
  "body": "<p>Hi {{first_name}},</p><p>I noticed {{company_name}} might benefit from our services...</p>",
  "delay": "0"
}
```

### Add Delay Between Steps

```json
{
  "id": "step-2",
  "type": "delay",
  "label": "Wait 3 days",
  "delay": "3"
}
```

## ⚠️ Important Notes

1. **Gmail Domain-Wide Delegation**: Domain-wide delegation MUST be configured in Google Workspace Admin for Gmail API sending
2. **Business Hours Only**: Sequences only run 8AM-5PM CST to stay in free tier
3. **Free Tier**: With 2 cron jobs running every 5 mins for 9 hours = ~200 invocations/day (well within limits)
4. **Retry Logic**: Failed steps automatically retry up to 3 times before marking as failed
5. **Contact Email Required**: Contacts without email addresses will cause step failures
6. **Variable Replacement**: More variables can be added in the Edge Function's `processEmailStep()` function

## 🔮 Future Enhancements

- [ ] AI-generated email content (integrate with existing Gemini optimization)
- [ ] Email tracking integration for open/click tracking
- [ ] SMS steps via Twilio
- [ ] Call steps with automatic dialer integration
- [ ] LinkedIn automation steps
- [ ] A/B testing for email variants
- [ ] Conditional branching based on engagement
- [ ] Time-zone aware scheduling per contact

## 📁 Files Created/Modified

### New Files
- `api/email/gmail-send-sequence.js` - Gmail API endpoint for sequences
- `supabase/migrations/20260209000000_sequence_automation.sql` - Database infrastructure
- `supabase/functions/process-sequence-step/index.ts` - Edge Function
- `SEQUENCE_AUTOMATION_SETUP.md` - Setup guide
- `test-sequence-automation.sql` - Test script
- `SEQUENCE_AUTOMATION_SUMMARY.md` - This file

### Modified Files
- `server.js` - Added Gmail sequence route and handler
- `cloudbuild.yaml` - Added note about GOOGLE_SERVICE_ACCOUNT_KEY

## ✅ Testing Checklist

Use `test-sequence-automation.sql` to verify:

- [ ] Infrastructure installed (pgmq, pg_cron, extensions)
- [ ] Queue created
- [ ] Cron jobs scheduled
- [ ] Can create test sequence
- [ ] Can enroll contacts
- [ ] Executions created with correct scheduled times
- [ ] Manual processing works
- [ ] Email sent successfully
- [ ] Gmail message ID recorded
- [ ] Status updates to 'completed'
- [ ] Email received in inbox

## 🎉 Next Steps

1. **Test locally** using `test-sequence-automation.sql`
2. **Deploy to production** following production checklist
3. **Create first real sequence** in Protocol Builder
4. **Enroll small test group** (5-10 contacts)
5. **Monitor results** via Gmail API logs and email tracking
6. **Iterate and improve** email copy based on metrics

---

**Implementation Date**: February 9, 2026  
**Status**: ✅ Complete & Ready for Testing  
**Estimated Setup Time**: 15-30 minutes  
**Free Tier Safe**: Yes (2 crons, business hours only)
