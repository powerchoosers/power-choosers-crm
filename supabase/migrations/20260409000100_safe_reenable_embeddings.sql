-- Re-enable embeddings with lower throughput so the queue stays bounded.
-- This does not backfill historical rows automatically.

CREATE OR REPLACE FUNCTION util.process_embeddings(
  batch_size integer DEFAULT 5,
  max_requests integer DEFAULT 2,
  timeout_milliseconds integer DEFAULT ((5 * 60) * 1000)
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'util', 'public'
AS $function$
declare
  job_batches jsonb[];
  batch jsonb;
begin
  if not exists (select 1 from pgmq.q_embedding_jobs limit 1) then
    return;
  end if;

  with
    numbered_jobs as (
      select
        message || jsonb_build_object('jobId', msg_id) as job_info,
        (row_number() over (order by 1) - 1) / batch_size as batch_num
      from pgmq.read(
        queue_name => 'embedding_jobs',
        vt => timeout_milliseconds / 1000,
        qty => max_requests * batch_size
      )
    ),
    batched_jobs as (
      select
        jsonb_agg(job_info) as batch_array,
        batch_num
      from numbered_jobs
      group by batch_num
    )
  select array_agg(batch_array)
  from batched_jobs
  into job_batches;

  if job_batches is not null then
    foreach batch in array job_batches loop
      perform util.invoke_edge_function(
        name => 'embed',
        body => batch,
        timeout_milliseconds => timeout_milliseconds
      );
    end loop;
  end if;
end;
$function$;

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

  PERFORM cron.alter_job(v_job_id, schedule => '*/15 14-23 * * 1-5', active => true);
END;
$function$;

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
  '*/15 14-23 * * 1-5',
  'select util.process_embeddings();'
);

ALTER TABLE public.accounts ENABLE TRIGGER embed_accounts_on_insert;
ALTER TABLE public.accounts ENABLE TRIGGER embed_accounts_on_update;
ALTER TABLE public.contacts ENABLE TRIGGER embed_contacts_on_insert;
ALTER TABLE public.contacts ENABLE TRIGGER embed_contacts_on_update;
ALTER TABLE public.emails ENABLE TRIGGER embed_emails_on_insert;
ALTER TABLE public.emails ENABLE TRIGGER embed_emails_on_update;
ALTER TABLE public.calls ENABLE TRIGGER embed_calls_on_insert;
ALTER TABLE public.calls ENABLE TRIGGER embed_calls_on_update;
ALTER TABLE public.apollo_news_articles ENABLE TRIGGER embed_apollo_news_on_insert;
ALTER TABLE public.apollo_news_articles ENABLE TRIGGER embed_apollo_news_on_update;
