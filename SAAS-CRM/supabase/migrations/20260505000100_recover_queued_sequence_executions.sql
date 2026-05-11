-- Recover sequence executions that say "queued" but no longer have a pgmq job.
-- This prevents scheduled sequence emails from sitting forever with empty bodies.

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
  SELECT COALESCE(MAX(read_ct), 0)
  INTO v_max_retries
  FROM pgmq.q_sequence_jobs;

  DELETE FROM pgmq.q_sequence_jobs
  WHERE read_ct > 20;

  GET DIAGNOSTICS v_purged_count = ROW_COUNT;

  RETURN QUERY SELECT v_purged_count, v_max_retries;
END;
$function$;

CREATE OR REPLACE FUNCTION util.requeue_stuck_sequence_executions()
RETURNS TABLE(requeued_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'util', 'public', 'pgmq'
AS $function$
DECLARE
  v_requeued_count int := 0;
BEGIN
  UPDATE public.sequence_executions se
  SET status = status,
      scheduled_at = scheduled_at,
      updated_at = NOW()
  WHERE se.status IN ('pending', 'queued', 'awaiting_generation', 'pending_send')
    AND se.scheduled_at <= NOW() - INTERVAL '10 minutes'
    AND lower(COALESCE(
      se.metadata->>'type',
      CASE WHEN se.step_type = 'protocolNode' THEN NULL ELSE se.step_type END,
      ''
    )) IN ('call', 'email', 'linkedin', 'condition', 'input')
    AND NOT EXISTS (
      SELECT 1
      FROM pgmq.q_sequence_jobs q
      WHERE q.message->>'execution_id' = se.id::text
    );

  GET DIAGNOSTICS v_requeued_count = ROW_COUNT;

  RETURN QUERY SELECT v_requeued_count;
END;
$function$;

CREATE OR REPLACE FUNCTION util.requeue_scheduled_steps()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Requeue overdue pre-send rows. Touching status/scheduled_at fires queue_sequence_step_trigger.
  UPDATE sequence_executions
  SET status = status,
      scheduled_at = scheduled_at,
      updated_at = NOW()
  WHERE status IN ('pending', 'awaiting_generation', 'pending_send')
    AND scheduled_at <= NOW();

  -- Recover rows that were marked queued but have no live pgmq job.
  UPDATE sequence_executions se
  SET status = status,
      scheduled_at = scheduled_at,
      updated_at = NOW()
  WHERE se.status = 'queued'
    AND se.scheduled_at <= NOW()
    AND NOT EXISTS (
      SELECT 1
      FROM pgmq.q_sequence_jobs q
      WHERE q.message->>'execution_id' = se.id::text
    );

  -- Retry transient failed email rows with a bounded retry count.
  UPDATE sequence_executions
  SET status = 'awaiting_generation',
      retry_count = COALESCE(retry_count, 0) + 1,
      error_message = NULL,
      updated_at = NOW()
  WHERE status = 'failed'
    AND COALESCE(metadata->>'type', CASE WHEN step_type = 'protocolNode' THEN NULL ELSE step_type END, '') = 'email'
    AND COALESCE(retry_count, 0) < 3
    AND COALESCE(error_message, '') <> ''
    AND error_message !~* '^(Missing target email|Missing sender email|Suppressed:|Deduplicated:)';
END;
$function$;

CREATE OR REPLACE VIEW util.v_stuck_sequence_jobs AS
SELECT
  'High retry count'::text AS issue_type,
  q.msg_id,
  q.read_ct AS retries,
  q.enqueued_at,
  q.message->>'execution_id' AS execution_id,
  q.message->>'step_type' AS step_type,
  q.message->'metadata'->>'type' AS metadata_type,
  se.status AS execution_status
FROM pgmq.q_sequence_jobs q
LEFT JOIN public.sequence_executions se ON se.id::text = q.message->>'execution_id'
WHERE q.read_ct > 10

UNION ALL

SELECT
  'Stuck execution (not in queue)'::text AS issue_type,
  NULL::bigint AS msg_id,
  NULL::int AS retries,
  se.scheduled_at AS enqueued_at,
  se.id::text AS execution_id,
  se.step_type,
  se.metadata->>'type' AS metadata_type,
  se.status AS execution_status
FROM public.sequence_executions se
WHERE se.status IN ('pending', 'queued', 'awaiting_generation', 'pending_send')
  AND se.scheduled_at < NOW() - INTERVAL '10 minutes'
  AND lower(COALESCE(
    se.metadata->>'type',
    CASE WHEN se.step_type = 'protocolNode' THEN NULL ELSE se.step_type END,
    ''
  )) IN ('call', 'email', 'linkedin', 'condition', 'input')
  AND NOT EXISTS (
    SELECT 1
    FROM pgmq.q_sequence_jobs q
    WHERE q.message->>'execution_id' = se.id::text
  );

GRANT SELECT ON util.v_stuck_sequence_jobs TO service_role;
GRANT EXECUTE ON FUNCTION util.purge_stuck_sequence_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION util.requeue_stuck_sequence_executions() TO service_role;
GRANT EXECUTE ON FUNCTION util.requeue_scheduled_steps() TO service_role;
