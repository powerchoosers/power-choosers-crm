-- Add a Supabase cron job for scheduled emails.
-- This keeps schedule execution off Vercel and uses the existing emails table.

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'process-scheduled-emails'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'process-scheduled-emails',
  '*/5 * * * *',
  $cmd$
    SELECT net.http_post(
      url := 'https://gfitvnkaevozbcyostez.supabase.co/functions/v1/process-scheduled-emails',
      headers := '{"Content-Type":"application/json","x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{"limit":25}'::jsonb,
      timeout_milliseconds => 55000
    );
  $cmd$
);
