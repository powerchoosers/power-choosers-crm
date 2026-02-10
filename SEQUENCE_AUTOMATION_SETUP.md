# Sequence Automation Setup Guide

This guide walks through the complete setup and testing of the automated sequence execution system with MailerSend email capabilities.

## 🎯 Overview

The sequence automation system enables automated outreach campaigns with:
- **Automated email sending** via MailerSend API
- **Scheduled execution** during business hours (8AM-5PM CST)
- **Delay handling** between sequence steps
- **Retry logic** for failed steps
- **Progress tracking** for each contact in the sequence

## 📋 Prerequisites

1. **MailerSend Account**: Create an account at [mailersend.com](https://www.mailersend.com/)
2. **Verified Domain**: Verify your sending domain in MailerSend Dashboard
3. **API Key**: Generate an API key from MailerSend Dashboard
4. **Supabase Project**: Your project must be linked and authenticated

## 🚀 Setup Instructions

### Step 1: Apply Database Migration

The migration creates all necessary infrastructure:
- `sequence_executions` table for tracking step execution
- pgmq queue for job processing
- Utility functions for queueing and processing
- Cron jobs for business hours execution
- Helper function for enrolling contacts

```bash
# From project root
npx supabase db push
```

### Step 2: Configure Environment Variables

#### Local Development (.env)

```env
MAILERSEND_API_KEY=mlsn.your-api-key-here
API_BASE_URL=http://localhost:3001
```

#### Production (Cloud Run)

1. Go to Cloud Console → Cloud Run → nodal-point-network
2. Click "Edit & Deploy New Revision"
3. Add environment variable:
   - Name: `MAILERSEND_API_KEY`
   - Value: `mlsn.your-api-key-here`
4. Deploy

### Step 3: Set Supabase Project URL Secret

The Edge Function needs to know your project URL to call back to the API.

**For local development** (add to `supabase/seed.sql`):
```sql
SELECT vault.create_secret('http://api.supabase.internal:8000', 'project_url');
```

**For production** (run in SQL Editor):
```sql
SELECT vault.create_secret('https://your-project.supabase.co', 'project_url');
```

### Step 4: Deploy Edge Function

```bash
# From project root
npx supabase functions deploy process-sequence-step --no-verify-jwt

# Set API_BASE_URL for the Edge Function
npx supabase secrets set API_BASE_URL=https://nodal-point-network-792458658491.us-central1.run.app
```

### Step 5: Verify Cron Jobs

Check that cron jobs are scheduled:

```sql
SELECT * FROM cron.job;
```

You should see:
- `process-sequence-steps-business-hours` - Runs every 5 minutes from 14:00-22:59 UTC (8AM-4:59PM CST)
- `process-sequence-steps-end-of-day` - Runs at 23:00 UTC (5PM CST)

## 🧪 Testing

### Test 1: Create a Simple Email Sequence

```sql
-- 1. Create a test sequence
INSERT INTO sequences (id, name, description, status, "ownerId", steps, "createdAt", "updatedAt")
VALUES (
  'test-seq-001',
  'Test Email Sequence',
  'Simple test sequence with one email',
  'active',
  'your-user-id',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'step-1',
      'type', 'email',
      'label', 'Welcome Email',
      'subject', 'Welcome to Nodal Point',
      'body', '<p>Hi {{first_name}},</p><p>Welcome to Nodal Point! We are excited to have you.</p><p>Best regards,<br>The Nodal Point Team</p>',
      'delay', '0'
    )
  ),
  NOW(),
  NOW()
);

-- 2. Enroll a test contact (replace with a real contact ID and user ID)
SELECT enroll_in_sequence(
  'test-seq-001',
  ARRAY['your-contact-id'],
  'your-user-id'
);

-- 3. Check that sequence_executions were created
SELECT * FROM sequence_executions WHERE sequence_id = 'test-seq-001';

-- 4. Manually trigger processing (for immediate testing)
SELECT util.process_sequence_steps();

-- 5. Check execution status
SELECT 
  id,
  step_index,
  step_type,
  status,
  scheduled_at,
  executed_at,
  completed_at,
  error_message
FROM sequence_executions 
WHERE sequence_id = 'test-seq-001'
ORDER BY step_index;
```

### Test 2: Multi-Step Sequence with Delays

```sql
-- Create sequence with delays between steps
INSERT INTO sequences (id, name, description, status, "ownerId", steps, "createdAt", "updatedAt")
VALUES (
  'test-seq-002',
  'Multi-Step Outreach',
  'Sequence with 3 emails over 7 days',
  'active',
  'your-user-id',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'step-1',
      'type', 'email',
      'label', 'Initial Contact',
      'subject', 'Quick question about {{company_name}}',
      'body', '<p>Hi {{first_name}},</p><p>I noticed {{company_name}} might benefit from our energy optimization services.</p>',
      'delay', '0'
    ),
    jsonb_build_object(
      'id', 'step-2',
      'type', 'delay',
      'label', 'Wait 3 days',
      'delay', '3'
    ),
    jsonb_build_object(
      'id', 'step-3',
      'type', 'email',
      'label', 'Follow-up',
      'subject', 'Following up - {{company_name}}',
      'body', '<p>Hi {{first_name}},</p><p>Just following up on my previous email about energy optimization for {{company_name}}.</p>',
      'delay', '0'
    ),
    jsonb_build_object(
      'id', 'step-4',
      'type', 'delay',
      'label', 'Wait 4 days',
      'delay', '4'
    ),
    jsonb_build_object(
      'id', 'step-5',
      'type', 'email',
      'label', 'Final Touch',
      'subject', 'Last chance - {{company_name}}',
      'body', '<p>Hi {{first_name}},</p><p>This is my last email. Would love to connect if you are interested in reducing energy costs.</p>',
      'delay', '0'
    )
  ),
  NOW(),
  NOW()
);

-- Enroll contacts
SELECT enroll_in_sequence(
  'test-seq-002',
  ARRAY['contact-id-1', 'contact-id-2'],
  'your-user-id'
);

-- View scheduled executions
SELECT 
  member_id,
  step_index,
  step_type,
  status,
  scheduled_at,
  scheduled_at AT TIME ZONE 'America/Chicago' as scheduled_cst
FROM sequence_executions 
WHERE sequence_id = 'test-seq-002'
ORDER BY member_id, step_index;
```

## 🔍 Monitoring & Troubleshooting

### Check Queue Status

```sql
-- View pending jobs in queue
SELECT * FROM pgmq.queue_length('sequence_jobs');

-- View messages in queue
SELECT * FROM pgmq.read('sequence_jobs', 60, 100);
```

### Check Execution Status

```sql
-- View all executions by status
SELECT 
  status,
  COUNT(*) as count
FROM sequence_executions
GROUP BY status;

-- View failed executions
SELECT 
  id,
  sequence_id,
  step_type,
  error_message,
  retry_count,
  created_at
FROM sequence_executions
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- View pending executions that should have run
SELECT 
  id,
  sequence_id,
  member_id,
  step_type,
  scheduled_at,
  scheduled_at AT TIME ZONE 'America/Chicago' as scheduled_cst,
  NOW() - scheduled_at as overdue_by
FROM sequence_executions
WHERE status = 'pending'
  AND scheduled_at <= NOW()
ORDER BY scheduled_at;
```

### Check Edge Function Logs

```bash
# View recent Edge Function logs
npx supabase functions logs process-sequence-step --limit 50
```

### Check Network Requests

```sql
-- View recent HTTP requests from pg_net
SELECT 
  id,
  url,
  status,
  status_code,
  created_at,
  headers->>'x-completed-jobs' as completed,
  headers->>'x-failed-jobs' as failed
FROM net._http_response
WHERE url LIKE '%process-sequence-step%'
ORDER BY created_at DESC
LIMIT 10;
```

## 📊 Common Issues & Solutions

### Issue: Emails Not Sending

**Symptoms**: Executions stay in 'pending' or 'queued' status

**Checks**:
1. Verify MailerSend API key is set: `echo $MAILERSEND_API_KEY`
2. Check domain is verified in MailerSend Dashboard
3. Check cron jobs are running: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
4. Check Edge Function is deployed: `npx supabase functions list`

### Issue: Edge Function Errors

**Symptoms**: Jobs fail with errors in Edge Function logs

**Checks**:
1. Check Edge Function logs: `npx supabase functions logs process-sequence-step`
2. Verify API_BASE_URL is set correctly
3. Check that contacts have valid email addresses
4. Verify sequence metadata has required fields (subject, body)

### Issue: Wrong Timezone

**Symptoms**: Emails send at unexpected times

**Solution**: The cron job runs in UTC. CST is UTC-6, so:
- 8AM CST = 14:00 UTC
- 5PM CST = 23:00 UTC

To adjust, modify the cron schedule in the migration.

## 🎓 Usage in the App

### Enroll Contacts from UI

```typescript
// From your React component
async function enrollInSequence(sequenceId: string, contactIds: string[]) {
  const { data, error } = await supabase.rpc('enroll_in_sequence', {
    p_sequence_id: sequenceId,
    p_contact_ids: contactIds,
    p_owner_id: userId
  });
  
  if (error) throw error;
  
  console.log(`Enrolled ${data.enrolled} contacts, skipped ${data.skipped}`);
  return data;
}
```

### Monitor Execution Progress

```typescript
// Get execution status for a sequence
async function getSequenceProgress(sequenceId: string) {
  const { data, error } = await supabase
    .from('sequence_executions')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('step_index');
  
  if (error) throw error;
  return data;
}
```

## 📝 Next Steps

1. **Test with real contacts** - Start with small test groups
2. **Monitor delivery rates** - Check MailerSend Dashboard for delivery metrics
3. **Refine email templates** - Improve copy based on engagement
4. **Add AI generation** - Integrate Gemini to dynamically generate email content
5. **Implement tracking** - Add webhooks for opens/clicks from MailerSend

## 🔗 References

- **MailerSend API Docs**: https://developers.mailersend.com/
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
- **pgmq Documentation**: https://github.com/tembo-io/pgmq
- **pg_cron Documentation**: https://github.com/citusdata/pg_cron

---

**Last Updated**: February 9, 2026
