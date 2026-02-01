-- Enable required extensions
create extension if not exists pgmq;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Create util schema if it doesn't exist
create schema if not exists util;

-- Utility function to get the Supabase project URL
create or replace function util.project_url()
returns text
language plpgsql
security definer
as $$
declare
  secret_value text;
begin
  -- Retrieve the project URL from Vault
  -- Note: You must set this secret in your project dashboard or seed.sql
  -- For local dev, we default to internal docker alias if not found
  begin
    select decrypted_secret into secret_value from vault.decrypted_secrets where name = 'project_url';
  exception when others then
    secret_value := null;
  end;
  
  if secret_value is null then
    return 'http://kong:8000'; -- Default internal URL for Supabase local stack
  end if;
  
  return secret_value;
end;
$$;

-- Generic function to invoke Edge Function
create or replace function util.invoke_edge_function(
  name text,
  body jsonb,
  timeout_milliseconds int = 5 * 60 * 1000
)
returns void
language plpgsql
as $$
declare
  headers_raw text;
  auth_header text;
  url text;
begin
  headers_raw := current_setting('request.headers', true);
  auth_header := case
    when headers_raw is not null then (headers_raw::json->>'authorization')
    else null
  end;

  url := util.project_url() || '/functions/v1/' || name;

  perform net.http_post(
    url => url,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', auth_header
    ),
    body => body,
    timeout_milliseconds => timeout_milliseconds
  );
end;
$$;

-- Create Queue
select pgmq.create('embedding_jobs');

-- Trigger function to queue jobs
create or replace function util.queue_embeddings()
returns trigger
language plpgsql
security definer
as $$
declare
  content_function text = TG_ARGV[0];
  embedding_column text = TG_ARGV[1];
begin
  perform pgmq.send(
    queue_name => 'embedding_jobs',
    msg => jsonb_build_object(
      'id', NEW.id,
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'contentFunction', content_function,
      'embeddingColumn', embedding_column
    )
  );
  return NEW;
end;
$$;

-- Process function
create or replace function util.process_embeddings(
  batch_size int = 10,
  max_requests int = 10,
  timeout_milliseconds int = 5 * 60 * 1000
)
returns void
language plpgsql
as $$
declare
  job_batches jsonb[];
  batch jsonb;
begin
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
$$;

-- Schedule cron (Every 1 minute)
select cron.schedule(
  'process-embeddings',
  '* * * * *', -- Every minute
  $$
  select util.process_embeddings();
  $$
);

-- Content Functions
create or replace function account_embedding_input(record accounts)
returns text
language plpgsql
immutable
as $$
begin
  return 
    'Account Name: ' || coalesce(record.name, '') || E'\n' ||
    'Industry: ' || coalesce(record.industry, '') || E'\n' ||
    'Description: ' || coalesce(record.description, '') || E'\n' ||
    'Location: ' || coalesce(record.city, '') || ', ' || coalesce(record.state, '');
end;
$$;

create or replace function contact_embedding_input(record contacts)
returns text
language plpgsql
immutable
as $$
begin
  return 
    'Contact Name: ' || coalesce(record."firstName", '') || ' ' || coalesce(record."lastName", '') || E'\n' ||
    'Title: ' || coalesce(record.title, '') || E'\n' ||
    'Email: ' || coalesce(record.email, '') || E'\n' ||
    'Location: ' || coalesce(record.city, '') || ', ' || coalesce(record.state, '');
end;
$$;

-- Triggers
drop trigger if exists embed_accounts_on_insert on accounts;
create trigger embed_accounts_on_insert
  after insert on accounts
  for each row
  execute function util.queue_embeddings('account_embedding_input', 'embedding');

drop trigger if exists embed_accounts_on_update on accounts;
create trigger embed_accounts_on_update
  after update of name, industry, description, city, state
  on accounts
  for each row
  execute function util.queue_embeddings('account_embedding_input', 'embedding');

drop trigger if exists embed_contacts_on_insert on contacts;
create trigger embed_contacts_on_insert
  after insert on contacts
  for each row
  execute function util.queue_embeddings('contact_embedding_input', 'embedding');

drop trigger if exists embed_contacts_on_update on contacts;
create trigger embed_contacts_on_update
  after update of "firstName", "lastName", title, city, state
  on contacts
  for each row
  execute function util.queue_embeddings('contact_embedding_input', 'embedding');
