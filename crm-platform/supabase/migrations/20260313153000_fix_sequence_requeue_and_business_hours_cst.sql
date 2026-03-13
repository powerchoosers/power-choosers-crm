-- Fix stuck scheduled sequence emails by forcing queue trigger to fire for overdue rows.
-- Also lock business-hours sequence processing to 8:00 AM - 5:59 PM CST (UTC-6).

CREATE OR REPLACE FUNCTION util.requeue_scheduled_steps()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Force UPDATE OF status/scheduled_at trigger paths so queue_sequence_step runs.
  -- This requeues overdue rows in pre-send states, including manually generated pending_send rows.
  UPDATE sequence_executions
  SET status = status,
      scheduled_at = scheduled_at,
      updated_at = NOW()
  WHERE status IN ('pending', 'awaiting_generation', 'pending_send')
    AND scheduled_at <= NOW();
END;
$function$;

-- Keep the processing window at 8 AM - 5 PM CST (fixed UTC-6).
DO $$
DECLARE
  v_business_job_id BIGINT;
  v_end_of_day_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_business_job_id
  FROM cron.job
  WHERE jobname = 'process-sequence-steps-business-hours'
  LIMIT 1;

  IF v_business_job_id IS NOT NULL THEN
    PERFORM util.set_cron_job_schedule(v_business_job_id, '*/5 14-23 * * 1-5');
    PERFORM util.set_cron_job_active(v_business_job_id, true);
  END IF;

  SELECT jobid INTO v_end_of_day_job_id
  FROM cron.job
  WHERE jobname = 'process-sequence-steps-end-of-day'
  LIMIT 1;

  IF v_end_of_day_job_id IS NOT NULL THEN
    PERFORM util.set_cron_job_active(v_end_of_day_job_id, false);
  END IF;
END $$;
