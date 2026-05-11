-- Keep sequence processing pinned to 8:00 AM - 5:59 PM America/Chicago
-- across DST by adding a local-time gate in util.process_sequence_steps.

CREATE OR REPLACE FUNCTION util.process_sequence_steps(
  batch_size integer DEFAULT 8,
  max_requests integer DEFAULT 1,
  timeout_milliseconds integer DEFAULT ((5 * 60) * 1000)
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  job_batches JSONB[];
  batch JSONB;
  v_local_ts TIMESTAMP;
BEGIN
  v_local_ts := timezone('America/Chicago', now());

  -- Guard rail: only run during local business hours (Mon-Fri, 08:00-17:59).
  IF EXTRACT(ISODOW FROM v_local_ts) NOT BETWEEN 1 AND 5
     OR EXTRACT(HOUR FROM v_local_ts) NOT BETWEEN 8 AND 17 THEN
    RETURN;
  END IF;

  WITH
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
    batched_jobs AS (
      SELECT
        jsonb_agg(job_info) AS batch_array,
        batch_num
      FROM numbered_jobs
      GROUP BY batch_num
    )
  SELECT array_agg(batch_array)
  FROM batched_jobs
  INTO job_batches;

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
$function$;

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
    -- Cover both CST and CDT UTC offsets. Function gate enforces exact local hours.
    PERFORM util.set_cron_job_schedule(v_business_job_id, '*/5 13-23 * * 1-5');
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

