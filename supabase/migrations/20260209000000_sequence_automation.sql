-- ============================================================================
-- Sequence Automation Infrastructure
-- ============================================================================
-- This migration sets up the infrastructure for automated sequence execution
-- using Supabase Edge Functions, pgmq queues, and pg_cron scheduling.
--
-- Features:
-- - Automated email sending via MailerSend
-- - Delay handling between sequence steps
-- - Retry logic for failed steps
-- - Business hours execution (8AM-5PM CST)
-- - Step execution tracking
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Create sequence execution tracking table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sequence_executions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES sequence_members(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    step_type TEXT NOT NULL, -- 'email', 'call', 'linkedin', 'delay', 'trigger'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'queued', 'processing', 'completed', 'failed', 'skipped'
    scheduled_at TIMESTAMPTZ NOT NULL, -- When this step should execute
    executed_at TIMESTAMPTZ, -- When this step was actually executed
    completed_at TIMESTAMPTZ, -- When this step completed
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficiently finding pending steps
CREATE INDEX IF NOT EXISTS idx_sequence_executions_pending 
ON sequence_executions(status, scheduled_at) 
WHERE status IN ('pending', 'queued');

-- Index for sequence/member lookups
CREATE INDEX IF NOT EXISTS idx_sequence_executions_sequence_member 
ON sequence_executions(sequence_id, member_id);

-- Index for member step tracking
CREATE INDEX IF NOT EXISTS idx_sequence_executions_member 
ON sequence_executions(member_id, step_index);

-- ----------------------------------------------------------------------------
-- Step 2: Enable required extensions (if not already enabled)
-- ----------------------------------------------------------------------------

-- For queueing sequence step jobs
CREATE EXTENSION IF NOT EXISTS pgmq;

-- For async HTTP requests to Edge Functions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- For scheduled processing
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- For utility functions
CREATE EXTENSION IF NOT EXISTS hstore WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- Step 3: Create utility schema and functions (if not already created)
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS util;

-- Utility function to get the Supabase project URL
CREATE OR REPLACE FUNCTION util.project_url()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  -- Retrieve the project URL from Vault
  SELECT decrypted_secret INTO secret_value 
  FROM vault.decrypted_secrets 
  WHERE name = 'project_url';
  RETURN secret_value;
END;
$$;

-- Generic function to invoke any Edge Function
CREATE OR REPLACE FUNCTION util.invoke_edge_function(
  name TEXT,
  body JSONB,
  timeout_milliseconds INT DEFAULT 5 * 60 * 1000  -- default 5 minute timeout
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  headers_raw TEXT;
  auth_header TEXT;
BEGIN
  -- If we're in a PostgREST session, reuse the request headers for authorization
  headers_raw := current_setting('request.headers', true);
  -- Only try to parse if headers are present
  auth_header := CASE
    WHEN headers_raw IS NOT NULL THEN
      (headers_raw::json->>'authorization')
    ELSE
      NULL
  END;
  
  -- Perform async HTTP request to the edge function
  PERFORM net.http_post(
    url => util.project_url() || '/functions/v1/' || name,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', auth_header
    ),
    body => body,
    timeout_milliseconds => timeout_milliseconds
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Step 4: Create sequence queue
-- ----------------------------------------------------------------------------

SELECT pgmq.create('sequence_jobs');

-- ----------------------------------------------------------------------------
-- Step 5: Create function to queue sequence steps
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION util.queue_sequence_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only queue if status is 'pending' or 'queued' and scheduled_at is in the past
  IF NEW.status IN ('pending', 'queued') AND NEW.scheduled_at <= NOW() THEN
    PERFORM pgmq.send(
      queue_name => 'sequence_jobs',
      msg => jsonb_build_object(
        'execution_id', NEW.id,
        'sequence_id', NEW.sequence_id,
        'member_id', NEW.member_id,
        'step_index', NEW.step_index,
        'step_type', NEW.step_type,
        'metadata', NEW.metadata
      )
    );
    
    -- Update status to queued
    NEW.status := 'queued';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to queue sequence steps when they become ready
CREATE TRIGGER queue_sequence_step_trigger
  BEFORE INSERT OR UPDATE OF status, scheduled_at
  ON sequence_executions
  FOR EACH ROW
  EXECUTE FUNCTION util.queue_sequence_step();

-- ----------------------------------------------------------------------------
-- Step 6: Create function to process sequence steps
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION util.process_sequence_steps(
  batch_size INT DEFAULT 10,
  max_requests INT DEFAULT 10,
  timeout_milliseconds INT DEFAULT 5 * 60 * 1000 -- default 5 minute timeout
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  job_batches JSONB[];
  batch JSONB;
BEGIN
  WITH
    -- First get jobs and assign batch numbers
    numbered_jobs AS (
      SELECT
        message || jsonb_build_object('jobId', msg_id) AS job_info,
        (row_number() OVER (ORDER BY 1) - 1) / batch_size AS batch_num
      FROM pgmq.read(
        queue_name => 'sequence_jobs',
        vt => timeout_milliseconds / 1000,
        qty => max_requests * batch_size
      )
    ),
    -- Then group jobs into batches
    batched_jobs AS (
      SELECT
        jsonb_agg(job_info) AS batch_array,
        batch_num
      FROM numbered_jobs
      GROUP BY batch_num
    )
  -- Finally aggregate all batches into array
  SELECT array_agg(batch_array)
  FROM batched_jobs
  INTO job_batches;
  
  -- Invoke the edge function for each batch
  IF job_batches IS NOT NULL THEN
    FOREACH batch IN ARRAY job_batches LOOP
      PERFORM util.invoke_edge_function(
        name => 'process-sequence-step',
        body => batch,
        timeout_milliseconds => timeout_milliseconds
      );
    END LOOP;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Step 7: Create helper function to enroll contacts in a sequence
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enroll_in_sequence(
  p_sequence_id TEXT,
  p_contact_ids TEXT[],
  p_owner_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence RECORD;
  v_contact_id TEXT;
  v_member_id TEXT;
  v_step JSONB;
  v_step_index INT;
  v_scheduled_at TIMESTAMPTZ;
  v_enrolled_count INT := 0;
  v_skipped_count INT := 0;
BEGIN
  -- Fetch sequence details
  SELECT * INTO v_sequence
  FROM sequences
  WHERE id = p_sequence_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sequence not found: %', p_sequence_id;
  END IF;
  
  -- Ensure sequence has steps
  IF v_sequence.steps IS NULL OR jsonb_array_length(v_sequence.steps) = 0 THEN
    RAISE EXCEPTION 'Sequence has no steps: %', p_sequence_id;
  END IF;
  
  -- Loop through each contact
  FOREACH v_contact_id IN ARRAY p_contact_ids LOOP
    -- Check if contact is already enrolled
    IF EXISTS (
      SELECT 1 FROM sequence_members 
      WHERE "sequenceId" = p_sequence_id 
      AND "targetId" = v_contact_id
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;
    
    -- Create sequence member
    INSERT INTO sequence_members (
      id, "sequenceId", "targetId", "targetType", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid()::text,
      p_sequence_id,
      v_contact_id,
      'contact',
      NOW(),
      NOW()
    ) RETURNING id INTO v_member_id;
    
    -- Create execution records for each step
    v_step_index := 0;
    v_scheduled_at := NOW(); -- Start immediately
    
    FOR v_step IN SELECT * FROM jsonb_array_elements(v_sequence.steps) LOOP
      -- Extract step details
      DECLARE
        v_step_type TEXT := v_step->>'type';
        v_delay_days INT := COALESCE((v_step->>'delay')::INT, 0);
      BEGIN
        -- Create execution record
        INSERT INTO sequence_executions (
          id,
          sequence_id,
          member_id,
          step_index,
          step_type,
          status,
          scheduled_at,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          gen_random_uuid()::text,
          p_sequence_id,
          v_member_id,
          v_step_index,
          v_step_type,
          'pending',
          v_scheduled_at,
          v_step,
          NOW(),
          NOW()
        );
        
        -- Calculate next scheduled time (add delay from current step)
        v_scheduled_at := v_scheduled_at + (v_delay_days || ' days')::INTERVAL;
        v_step_index := v_step_index + 1;
      END;
    END LOOP;
    
    v_enrolled_count := v_enrolled_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'enrolled', v_enrolled_count,
    'skipped', v_skipped_count,
    'total', array_length(p_contact_ids, 1)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Step 8: Create cron job for business hours (8AM-5PM CST = 9AM-6PM EST = 14:00-23:00 UTC)
-- ----------------------------------------------------------------------------
-- NOTE: Supabase uses UTC time, so we convert CST to UTC
-- CST is UTC-6, so 8AM CST = 2PM UTC (14:00), 5PM CST = 11PM UTC (23:00)
-- We'll run every 5 minutes during business hours

-- Run at :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55 during business hours
DO $$
BEGIN
  -- Remove existing jobs if they exist
  PERFORM cron.unschedule('process-sequence-steps-business-hours');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Create cron job that runs every 5 minutes between 14:00-23:00 UTC (8AM-5PM CST)
SELECT cron.schedule(
  'process-sequence-steps-business-hours',
  '*/5 14-22 * * *',  -- Every 5 minutes from 14:00 to 22:59 UTC
  $$
  SELECT util.process_sequence_steps();
  $$
);

-- Also process at 23:00 UTC (5PM CST) to catch the last batch
SELECT cron.schedule(
  'process-sequence-steps-end-of-day',
  '0 23 * * *',  -- At 23:00 UTC (5PM CST)
  $$
  SELECT util.process_sequence_steps();
  $$
);

-- ----------------------------------------------------------------------------
-- Step 9: Create indexes for performance
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sequence_executions_scheduled 
ON sequence_executions(scheduled_at) 
WHERE status IN ('pending', 'queued');

-- ----------------------------------------------------------------------------
-- Step 10: Grant necessary permissions
-- ----------------------------------------------------------------------------

-- Grant execute on utility functions to authenticated users
GRANT EXECUTE ON FUNCTION enroll_in_sequence TO authenticated;
GRANT EXECUTE ON FUNCTION util.process_sequence_steps TO postgres;

-- Grant select/insert/update on sequence_executions to authenticated users
GRANT SELECT, INSERT, UPDATE ON sequence_executions TO authenticated;

-- Enable RLS on sequence_executions
ALTER TABLE sequence_executions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own sequence executions
CREATE POLICY "Users can view their own sequence executions"
ON sequence_executions
FOR SELECT
USING (
  sequence_id IN (
    SELECT id FROM sequences WHERE "ownerId" = auth.uid()::text
  )
);

-- Policy: Users can insert sequence executions for their own sequences
CREATE POLICY "Users can insert sequence executions for their own sequences"
ON sequence_executions
FOR INSERT
WITH CHECK (
  sequence_id IN (
    SELECT id FROM sequences WHERE "ownerId" = auth.uid()::text
  )
);

-- Policy: System can update any sequence execution (for cron jobs)
CREATE POLICY "System can update sequence executions"
ON sequence_executions
FOR UPDATE
USING (true);

-- ----------------------------------------------------------------------------
-- Complete!
-- ----------------------------------------------------------------------------
