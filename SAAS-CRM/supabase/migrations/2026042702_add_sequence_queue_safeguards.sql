-- Add safeguards to prevent sequence jobs from getting stuck in the queue
-- 1. Add a check constraint to ensure step_type is never 'protocolNode'
-- 2. Add a function to auto-purge jobs that have been retried too many times
-- 3. Add a function to detect and fix stuck executions

-- 1. Add check constraint to prevent protocolNode step_type
ALTER TABLE sequence_executions 
ADD CONSTRAINT check_step_type_not_protocol_node 
CHECK (step_type != 'protocolNode');

-- 2. Function to purge stuck queue jobs (called by cron)
CREATE OR REPLACE FUNCTION util.purge_stuck_sequence_jobs()
RETURNS TABLE(purged_count bigint, max_retries int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'util', 'public', 'pgmq'
AS $function$
DECLARE
  v_purged_count bigint := 0;
  v_max_retries int := 0;
BEGIN
  -- Find max retry count
  SELECT COALESCE(MAX(read_ct), 0)
  INTO v_max_retries
  FROM pgmq.q_sequence_jobs;

  -- Purge jobs that have been retried more than 20 times
  IF v_max_retries > 20 THEN
    DELETE FROM pgmq.q_sequence_jobs
    WHERE read_ct > 20;
    
    GET DIAGNOSTICS v_purged_count = ROW_COUNT;
    
    -- Log the purge
    RAISE NOTICE 'Purged % stuck sequence jobs with >20 retries', v_purged_count;
  END IF;

  RETURN QUERY SELECT v_purged_count, v_max_retries;
END;
$function$;

-- 3. Function to detect and re-queue stuck executions
CREATE OR REPLACE FUNCTION util.requeue_stuck_sequence_executions()
RETURNS TABLE(requeued_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'util', 'public', 'pgmq'
AS $function$
DECLARE
  v_requeued_count int := 0;
  v_execution record;
BEGIN
  -- Find executions that are queued/pending but past their scheduled time by >1 hour
  -- and not in the queue
  FOR v_execution IN
    SELECT se.id, se.sequence_id, se.member_id, se.step_type, se.metadata
    FROM sequence_executions se
    WHERE se.status IN ('pending', 'queued')
      AND se.scheduled_at < NOW() - INTERVAL '1 hour'
      AND se.step_type IN ('call', 'email', 'linkedin', 'condition')
      AND NOT EXISTS (
        SELECT 1 
        FROM pgmq.q_sequence_jobs q 
        WHERE q.message->>'execution_id' = se.id
      )
    LIMIT 50
  LOOP
    -- Re-queue the execution
    PERFORM pgmq.send(
      'sequence_jobs',
      jsonb_build_object(
        'execution_id', v_execution.id,
        'sequence_id', v_execution.sequence_id,
        'member_id', v_execution.member_id,
        'step_type', v_execution.step_type,
        'metadata', v_execution.metadata
      )
    );
    
    -- Update status to queued
    UPDATE sequence_executions
    SET status = 'queued', updated_at = NOW()
    WHERE id = v_execution.id;
    
    v_requeued_count := v_requeued_count + 1;
  END LOOP;

  IF v_requeued_count > 0 THEN
    RAISE NOTICE 'Re-queued % stuck sequence executions', v_requeued_count;
  END IF;

  RETURN QUERY SELECT v_requeued_count;
END;
$function$;

-- 4. Add a monitoring view for stuck jobs
CREATE OR REPLACE VIEW util.v_stuck_sequence_jobs AS
SELECT 
  'High retry count' as issue_type,
  q.msg_id,
  q.read_ct as retries,
  q.enqueued_at,
  q.message->>'execution_id' as execution_id,
  q.message->>'step_type' as step_type,
  q.message->'metadata'->>'type' as metadata_type,
  se.status as execution_status
FROM pgmq.q_sequence_jobs q
LEFT JOIN sequence_executions se ON se.id = q.message->>'execution_id'
WHERE q.read_ct > 10

UNION ALL

SELECT 
  'Stuck execution (not in queue)' as issue_type,
  NULL as msg_id,
  NULL as retries,
  se.scheduled_at as enqueued_at,
  se.id as execution_id,
  se.step_type,
  se.metadata->>'type' as metadata_type,
  se.status as execution_status
FROM sequence_executions se
WHERE se.status IN ('pending', 'queued')
  AND se.scheduled_at < NOW() - INTERVAL '2 hours'
  AND se.step_type IN ('call', 'email', 'linkedin', 'condition')
  AND NOT EXISTS (
    SELECT 1 
    FROM pgmq.q_sequence_jobs q 
    WHERE q.message->>'execution_id' = se.id
  )

ORDER BY enqueued_at;

-- Grant permissions
GRANT SELECT ON util.v_stuck_sequence_jobs TO service_role;
GRANT EXECUTE ON FUNCTION util.purge_stuck_sequence_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION util.requeue_stuck_sequence_executions() TO service_role;

-- Add comment
COMMENT ON FUNCTION util.purge_stuck_sequence_jobs() IS 
'Purges sequence jobs that have been retried more than 20 times. Should be called by cron every hour.';

COMMENT ON FUNCTION util.requeue_stuck_sequence_executions() IS 
'Detects and re-queues sequence executions that are stuck (past scheduled time but not in queue). Should be called by cron every hour.';

COMMENT ON VIEW util.v_stuck_sequence_jobs IS 
'Monitoring view to detect stuck sequence jobs and executions. Check this view regularly to catch issues early.';
