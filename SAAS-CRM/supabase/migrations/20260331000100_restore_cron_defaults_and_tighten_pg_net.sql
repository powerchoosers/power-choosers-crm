-- Tighten the busiest Supabase cron jobs so the project stays usable on Nano.
-- This avoids the broken app-setting dependency by putting literal URLs and
-- the shared cron secret directly into the jobs that need them.

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'process-embeddings'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'process-embeddings',
  '*/5 14-23 * * 1-5',
  'select util.process_embeddings();'
);

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'purge-http-responses'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'purge-http-responses',
  '0 * * * *',
  'DELETE FROM net._http_response WHERE created < now() - interval ''6 hours'''
);

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'prospect-radar-daily-scan'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'poll-calendar-replies'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'poll-calendar-replies',
  '*/10 14-22 * * 1-5',
  $cmd$
    SELECT net.http_post(
      url := 'https://www.nodalpoint.io/api/cron/poll-calendar-replies',
      headers := '{"Content-Type":"application/json", "x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds => 55000
    );
  $cmd$
);

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'send-briefing-reminders'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'send-briefing-reminders',
  '*/5 13-23 * * 1-5',
  $cmd$
    SELECT net.http_post(
      url := 'https://www.nodalpoint.io/api/tasks/send-briefing-reminders',
      headers := '{"Content-Type":"application/json", "x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds => 25000
    );
  $cmd$
);

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'purge-cron-job-run-details'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'purge-cron-job-run-details',
  '30 3 * * *',
  $cmd$
    DELETE FROM cron.job_run_details
    WHERE start_time < now() - interval '7 days';
  $cmd$
);

-- Trim historical noise right away so the current project footprint shrinks now.
DELETE FROM net._http_response
WHERE created < now() - interval '6 hours';

DELETE FROM cron.job_run_details
WHERE start_time < now() - interval '7 days';

CREATE OR REPLACE FUNCTION util.configure_embeddings_cron_business_hours()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'util', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE command ILIKE '%process_embeddings%'
  ORDER BY jobid
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'No process_embeddings cron job found';
  END IF;

  PERFORM cron.alter_job(v_job_id, schedule => '*/5 14-23 * * 1-5', active => true);
END;
$function$;
