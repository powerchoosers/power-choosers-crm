-- Schedule automatic safeguard jobs to prevent sequence queue issues
-- Runs every hour to detect and fix stuck jobs

-- 1. Schedule purge of stuck queue jobs (every hour)
SELECT cron.unschedule('purge-stuck-sequence-jobs');
SELECT cron.schedule(
  'purge-stuck-sequence-jobs',
  '0 * * * *', -- Every hour at minute 0
  $$
    SELECT util.purge_stuck_sequence_jobs();
  $$
);

-- 2. Schedule re-queue of stuck executions (every hour at minute 15)
SELECT cron.unschedule('requeue-stuck-sequence-executions');
SELECT cron.schedule(
  'requeue-stuck-sequence-executions',
  '15 * * * *', -- Every hour at minute 15
  $$
    SELECT util.requeue_stuck_sequence_executions();
  $$
);

-- Add comments
COMMENT ON FUNCTION cron.schedule IS 'Schedules recurring jobs. Format: cron.schedule(job_name, cron_expression, sql_command)';
