-- ============================================================================
-- Sequence Automation Test Script
-- ============================================================================
-- Run this script to test the sequence automation system end-to-end
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Verify Infrastructure
-- ----------------------------------------------------------------------------

-- Check that extensions are enabled
SELECT 
  extname,
  extversion
FROM pg_extension
WHERE extname IN ('pgmq', 'pg_net', 'pg_cron', 'vector');

-- Check that queue exists
SELECT * FROM pgmq.list_queues();

-- Check that cron jobs are scheduled
SELECT 
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobname LIKE '%sequence%';

-- ----------------------------------------------------------------------------
-- Step 2: Create Test Sequence
-- ----------------------------------------------------------------------------

-- Delete existing test sequence if it exists
DELETE FROM sequences WHERE id = 'test-auto-seq-001';

-- Create a simple test sequence with one email
INSERT INTO sequences (id, name, description, status, "ownerId", steps, "createdAt", "updatedAt")
VALUES (
  'test-auto-seq-001',
  'Automation Test Sequence',
  'Test sequence for verifying automation works',
  'active',
  (SELECT auth.uid()::text), -- Use current user's ID
  jsonb_build_array(
    jsonb_build_object(
      'id', 'test-step-1',
      'type', 'email',
      'label', 'Test Email',
      'subject', 'Test Email from Nodal Point Automation',
      'body', '<html><body><p>Hi {{first_name}},</p><p>This is a test email from the automated sequence system.</p><p>Your company: {{company_name}}</p><p>Best regards,<br>The Nodal Point Team</p></body></html>',
      'delay', '0'
    )
  ),
  NOW(),
  NOW()
);

-- Verify sequence was created
SELECT 
  id,
  name,
  status,
  jsonb_array_length(steps) as step_count
FROM sequences
WHERE id = 'test-auto-seq-001';

-- ----------------------------------------------------------------------------
-- Step 3: Get a Test Contact
-- ----------------------------------------------------------------------------

-- Find a contact with a valid email (replace with your own test contact)
-- IMPORTANT: Use a real email address you can check!
SELECT 
  id,
  "firstName",
  "lastName",
  email,
  "companyName"
FROM contacts
WHERE email IS NOT NULL
  AND email != ''
  AND email LIKE '%@%'
LIMIT 5;

-- ----------------------------------------------------------------------------
-- Step 4: Enroll Contact in Sequence
-- ----------------------------------------------------------------------------

-- REPLACE 'your-contact-id' with an actual contact ID from Step 3
-- You can enroll multiple contacts by adding more IDs to the array
SELECT enroll_in_sequence(
  'test-auto-seq-001',
  ARRAY['your-contact-id'], -- REPLACE THIS!
  (SELECT auth.uid()::text)
);

-- Verify enrollment created sequence_members
SELECT 
  id,
  "sequenceId",
  "targetId",
  "targetType",
  "createdAt"
FROM sequence_members
WHERE "sequenceId" = 'test-auto-seq-001';

-- ----------------------------------------------------------------------------
-- Step 5: Check Sequence Executions
-- ----------------------------------------------------------------------------

-- View all executions created for this sequence
SELECT 
  se.id,
  se.sequence_id,
  se.member_id,
  se.step_index,
  se.step_type,
  se.status,
  se.scheduled_at,
  se.scheduled_at AT TIME ZONE 'America/Chicago' as scheduled_cst,
  se.executed_at,
  se.completed_at,
  se.error_message,
  se.retry_count,
  c.email as contact_email,
  c."firstName" as contact_first_name
FROM sequence_executions se
JOIN sequence_members sm ON sm.id = se.member_id
JOIN contacts c ON c.id = sm."targetId"
WHERE se.sequence_id = 'test-auto-seq-001'
ORDER BY se.member_id, se.step_index;

-- ----------------------------------------------------------------------------
-- Step 6: Manually Trigger Processing (Optional - for immediate testing)
-- ----------------------------------------------------------------------------

-- This will immediately process any pending steps
-- Normally, the cron job runs every 5 minutes during business hours
SELECT util.process_sequence_steps();

-- Wait a few seconds, then check status again
SELECT 
  se.id,
  se.step_type,
  se.status,
  se.executed_at,
  se.completed_at,
  se.error_message,
  c.email
FROM sequence_executions se
JOIN sequence_members sm ON sm.id = se.member_id
JOIN contacts c ON c.id = sm."targetId"
WHERE se.sequence_id = 'test-auto-seq-001'
ORDER BY se.step_index;

-- ----------------------------------------------------------------------------
-- Step 7: Check Queue Status
-- ----------------------------------------------------------------------------

-- Check if there are any pending jobs in the queue
SELECT * FROM pgmq.queue_length('sequence_jobs');

-- View messages in the queue (if any)
SELECT 
  msg_id,
  message->>'execution_id' as execution_id,
  message->>'step_type' as step_type,
  enqueued_at
FROM pgmq.read('sequence_jobs', 60, 100);

-- ----------------------------------------------------------------------------
-- Step 8: Check Edge Function Response
-- ----------------------------------------------------------------------------

-- View recent HTTP responses from the Edge Function
SELECT 
  id,
  url,
  status,
  status_code,
  created_at,
  headers->>'x-completed-jobs' as completed,
  headers->>'x-failed-jobs' as failed,
  LEFT(body::text, 200) as response_preview
FROM net._http_response
WHERE url LIKE '%process-sequence-step%'
ORDER BY created_at DESC
LIMIT 5;

-- ----------------------------------------------------------------------------
-- Step 9: Check Cron Job Execution History
-- ----------------------------------------------------------------------------

-- View recent cron job runs
SELECT 
  jobid,
  runid,
  job_name,
  status,
  start_time,
  end_time,
  return_message
FROM cron.job_run_details
WHERE job_name LIKE '%sequence%'
ORDER BY start_time DESC
LIMIT 10;

-- ----------------------------------------------------------------------------
-- Step 10: Verify Email Was Sent
-- ----------------------------------------------------------------------------

-- Check the execution metadata for MailerSend message ID
SELECT 
  se.id,
  se.status,
  se.completed_at,
  se.metadata->>'messageId' as mailersend_message_id,
  se.metadata->>'sentAt' as sent_at,
  c.email
FROM sequence_executions se
JOIN sequence_members sm ON sm.id = se.member_id
JOIN contacts c ON c.id = sm."targetId"
WHERE se.sequence_id = 'test-auto-seq-001'
  AND se.step_type = 'email';

-- ----------------------------------------------------------------------------
-- Cleanup (Optional)
-- ----------------------------------------------------------------------------

-- Uncomment to clean up test data
-- DELETE FROM sequence_executions WHERE sequence_id = 'test-auto-seq-001';
-- DELETE FROM sequence_members WHERE "sequenceId" = 'test-auto-seq-001';
-- DELETE FROM sequences WHERE id = 'test-auto-seq-001';

-- ============================================================================
-- Expected Results
-- ============================================================================
-- 
-- 1. Infrastructure check should show all 4 extensions enabled
-- 2. Queue 'sequence_jobs' should exist
-- 3. Two cron jobs should be scheduled and active
-- 4. Sequence should be created with status 'active' and 1 step
-- 5. Enrollment should return: {"enrolled": 1, "skipped": 0, "total": 1}
-- 6. One sequence_member record should exist
-- 7. One sequence_execution record should exist with status 'pending' or 'queued'
-- 8. After manual trigger, status should change to 'completed'
-- 9. Edge Function response should show x-completed-jobs: 1, x-failed-jobs: 0
-- 10. Execution metadata should contain MailerSend messageId
-- 11. Check your email inbox for the test email!
-- 
-- ============================================================================
-- Troubleshooting
-- ============================================================================
-- 
-- If status is 'failed':
--   - Check error_message column in sequence_executions
--   - Check Edge Function logs: npx supabase functions logs process-sequence-step
--   - Verify MAILERSEND_API_KEY is set in environment
--   - Verify contact has valid email address
--   - Check net._http_response for API error details
-- 
-- If status stays 'pending':
--   - Check queue: SELECT * FROM pgmq.read('sequence_jobs', 60, 10);
--   - Manually trigger: SELECT util.process_sequence_steps();
--   - Check cron jobs are running
--   - Verify Edge Function is deployed
-- 
-- If email not received:
--   - Check MailerSend Dashboard for delivery status
--   - Verify domain is verified in MailerSend
--   - Check spam folder
--   - Verify 'from' email is from verified domain
-- 
-- ============================================================================
