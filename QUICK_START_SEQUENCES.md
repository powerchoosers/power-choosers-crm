# Quick Start: Sequence Automation

## 🚀 5-Minute Setup

### 1. Configure Gmail Service Account

1. Set up Google Cloud Service Account with Gmail API access
2. Configure domain-wide delegation in Google Workspace Admin
3. Export service account key JSON
4. Base64 encode the JSON key

### 2. Add to Environment

**Local (.env):**
```bash
GOOGLE_SERVICE_ACCOUNT_KEY=your-base64-encoded-service-account-key-json
```

**Production (Cloud Run):**
```bash
# Cloud Console → Cloud Run → nodal-point-network → Edit
# Add environment variable:
GOOGLE_SERVICE_ACCOUNT_KEY=your-base64-encoded-service-account-key-json
```

### 3. Apply Migration

```bash
# From project root
npx supabase db push
```

### 4. Set Project URL Secret

**Local:**
```sql
-- Run in Supabase SQL Editor
SELECT vault.create_secret('http://api.supabase.internal:8000', 'project_url');
```

**Production:**
```sql
-- Run in Supabase SQL Editor
SELECT vault.create_secret('https://gfitvnkaevozbcyostez.supabase.co', 'project_url');
```

### 5. Deploy Edge Function

```bash
# Deploy function
npx supabase functions deploy process-sequence-step --no-verify-jwt

# Set API URL
npx supabase secrets set API_BASE_URL=https://nodal-point-network-792458658491.us-central1.run.app
```

### 6. Test It!

```bash
# Open test-sequence-automation.sql in Supabase SQL Editor
# Follow the steps in the file to create and test a sequence
```

## 🎯 Quick Test

1. Open `test-sequence-automation.sql` in Supabase SQL Editor
2. Run Step 1: Verify Infrastructure
3. Run Step 2: Create Test Sequence
4. Run Step 3: Find a contact with valid email
5. Run Step 4: Enroll contact (replace 'your-contact-id')
6. Run Step 6: Manually trigger processing
7. Check your email!

## 📊 Quick Monitor

```sql
-- Check status
SELECT status, COUNT(*) FROM sequence_executions GROUP BY status;

-- View recent executions
SELECT 
  step_type, 
  status, 
  completed_at, 
  error_message 
FROM sequence_executions 
ORDER BY created_at DESC 
LIMIT 10;
```

## 🆘 Troubleshooting

### Emails not sending?

1. Check service account key: `echo $GOOGLE_SERVICE_ACCOUNT_KEY`
2. Verify domain-wide delegation is configured
3. Check logs: `npx supabase functions logs process-sequence-step`
4. Manually trigger: `SELECT util.process_sequence_steps();`

### Wrong timezone?

- Cron runs in UTC
- 8AM CST = 14:00 UTC
- 5PM CST = 23:00 UTC

### Need help?

See full guides:
- `SEQUENCE_AUTOMATION_SETUP.md` - Detailed setup
- `SEQUENCE_AUTOMATION_SUMMARY.md` - Architecture overview
- `test-sequence-automation.sql` - Test queries

## 🎓 Create Your First Sequence

```sql
INSERT INTO sequences (
  id, name, description, status, "ownerId", steps, "createdAt", "updatedAt"
)
VALUES (
  'my-first-seq',
  'My First Sequence',
  'Introduction email campaign',
  'active',
  (SELECT auth.uid()::text),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'step-1',
      'type', 'email',
      'label', 'Introduction',
      'subject', 'Quick intro - {{company_name}}',
      'body', '<p>Hi {{first_name}},</p><p>Just reaching out about {{company_name}}...</p>',
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
      'label', 'Follow up',
      'subject', 'Following up',
      'body', '<p>Hi {{first_name}},</p><p>Wanted to follow up...</p>',
      'delay', '0'
    )
  ),
  NOW(),
  NOW()
);

-- Enroll contacts
SELECT enroll_in_sequence(
  'my-first-seq',
  ARRAY['contact-id-1', 'contact-id-2'],
  (SELECT auth.uid()::text)
);
```

---

**That's it! Your sequences are now automated.** 🎉
