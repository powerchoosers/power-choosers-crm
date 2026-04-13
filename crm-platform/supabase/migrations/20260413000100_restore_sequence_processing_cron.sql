-- Restore the live sequence consumer cron so queued steps advance again.
-- Also keep the retry/requeue maintenance job active so stalled executions get retried.

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'process-sequence-steps-business-hours'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'requeue-scheduled-steps'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'process-sequence-steps-business-hours',
  '*/5 13-23 * * 1-5',
  $cmd$
    SELECT util.process_sequence_steps();
  $cmd$
);

SELECT cron.schedule(
  'requeue-scheduled-steps',
  '*/5 * * * *',
  $cmd$
    SELECT util.requeue_scheduled_steps();
  $cmd$
);
