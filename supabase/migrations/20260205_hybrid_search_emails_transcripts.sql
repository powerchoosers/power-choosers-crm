-- Migration: Hybrid Search for Emails and Call Transcripts
-- Description: Enable semantic search across emails and call transcripts for the AI

-- Ensure pg_trgm is enabled for trigram similarity
create extension if not exists pg_trgm;

-- Add FTS column to emails if not exists
alter table emails 
add column if not exists fts tsvector
generated always as (
  to_tsvector('english', 
    coalesce(subject, '') || ' ' || 
    coalesce(text, '') || ' ' ||
    coalesce("from", '')
  )
) stored;

-- Add FTS column to calls if not exists
alter table calls
add column if not exists fts tsvector
generated always as (
  to_tsvector('english',
    coalesce(transcript, '') || ' ' ||
    coalesce(summary, '') || ' ' ||
    coalesce(direction, '')
  )
) stored;

-- Create trigram indexes for fuzzy matching
create index if not exists emails_subject_trgm_idx
on public.emails using gin (subject gin_trgm_ops);

create index if not exists emails_from_trgm_idx
on public.emails using gin ("from" gin_trgm_ops);

-- Create FTS indexes
create index if not exists emails_fts_idx
on public.emails using gin (fts);

create index if not exists calls_fts_idx
on public.calls using gin (fts);

-- Hybrid Search for Emails
drop function if exists hybrid_search_emails(text, vector(768), int, float, float, int);

create or replace function hybrid_search_emails(
  query_text text,
  query_embedding vector(768),
  match_count int,
  full_text_weight float = 4.0,
  semantic_weight float = 0.5,
  rrf_k int = 50
)
returns setof emails
language sql
as $$
with norm as (
  select
    trim(
      regexp_replace(
        regexp_replace(coalesce(query_text, ''), '^\\s*["""''`]+|["""''`]+\\s*$', '', 'g'),
        '\\s+',
        ' ',
        'g'
      )
    ) as q
),
full_text as (
  select
    e.id,
    row_number() over(
      order by
        (case when lower(e.subject) = lower(n.q) then 1 else 0 end) desc,
        (case when e.subject ilike '%' || n.q || '%' then 1 else 0 end) desc,
        (case when e."from" ilike '%' || n.q || '%' then 1 else 0 end) desc,
        greatest(
          similarity(e.subject, n.q),
          similarity(e."from", n.q)
        ) desc,
        greatest(
          ts_rank_cd(e.fts, plainto_tsquery('english', n.q)),
          ts_rank_cd(e.fts, websearch_to_tsquery('english', n.q))
        ) desc,
        e.timestamp desc
    ) as rank_ix
  from
    public.emails e
    cross join norm n
  where
    n.q <> ''
    and (
      e.subject ilike '%' || n.q || '%'
      or e.text ilike '%' || n.q || '%'
      or e."from" ilike '%' || n.q || '%'
      or e.fts @@ plainto_tsquery('english', n.q)
      or e.fts @@ websearch_to_tsquery('english', n.q)
      or e.subject % n.q
    )
  limit least(match_count, 50) * 4
),
semantic as (
  select
    e.id,
    row_number() over (order by e.embedding <=> query_embedding) as rank_ix
  from
    public.emails e
  where
    query_embedding is not null
    and e.embedding is not null
  order by
    e.embedding <=> query_embedding
  limit least(match_count, 50) * 4
)
select
  e.*
from
  full_text
  full outer join semantic on full_text.id = semantic.id
  join public.emails e on coalesce(full_text.id, semantic.id) = e.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 50);
$$;

-- Hybrid Search for Call Transcripts
drop function if exists hybrid_search_calls(text, vector(768), int, float, float, int);

create or replace function hybrid_search_calls(
  query_text text,
  query_embedding vector(768),
  match_count int,
  full_text_weight float = 4.0,
  semantic_weight float = 0.5,
  rrf_k int = 50
)
returns setof calls
language sql
as $$
with norm as (
  select
    trim(
      regexp_replace(
        regexp_replace(coalesce(query_text, ''), '^\\s*["""''`]+|["""''`]+\\s*$', '', 'g'),
        '\\s+',
        ' ',
        'g'
      )
    ) as q
),
full_text as (
  select
    c.id,
    row_number() over(
      order by
        (case when c.transcript ilike '%' || n.q || '%' then 1 else 0 end) desc,
        (case when c.summary ilike '%' || n.q || '%' then 1 else 0 end) desc,
        greatest(
          ts_rank_cd(c.fts, plainto_tsquery('english', n.q)),
          ts_rank_cd(c.fts, websearch_to_tsquery('english', n.q))
        ) desc,
        c.timestamp desc
    ) as rank_ix
  from
    public.calls c
    cross join norm n
  where
    n.q <> ''
    and c.transcript is not null
    and c.transcript <> ''
    and (
      c.transcript ilike '%' || n.q || '%'
      or c.summary ilike '%' || n.q || '%'
      or c.fts @@ plainto_tsquery('english', n.q)
      or c.fts @@ websearch_to_tsquery('english', n.q)
    )
  limit least(match_count, 30) * 4
),
semantic as (
  select
    c.id,
    row_number() over (order by c.embedding <=> query_embedding) as rank_ix
  from
    public.calls c
  where
    query_embedding is not null
    and c.embedding is not null
    and c.transcript is not null
    and c.transcript <> ''
  order by
    c.embedding <=> query_embedding
  limit least(match_count, 30) * 4
)
select
  c.*
from
  full_text
  full outer join semantic on full_text.id = semantic.id
  join public.calls c on coalesce(full_text.id, semantic.id) = c.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 30);
$$;

-- Add email embedding input function
create or replace function email_embedding_input(record emails)
returns text
language plpgsql
immutable
as $$
begin
  return 
    'Subject: ' || coalesce(record.subject, '') || E'\n' ||
    'From: ' || coalesce(record."from", '') || E'\n' ||
    'Body: ' || coalesce(substring(record.text, 1, 2000), '');
end;
$$;

-- Add call embedding input function
create or replace function call_embedding_input(record calls)
returns text
language plpgsql
immutable
as $$
begin
  return 
    'Direction: ' || coalesce(record.direction, '') || E'\n' ||
    'Summary: ' || coalesce(record.summary, '') || E'\n' ||
    'Transcript: ' || coalesce(substring(record.transcript, 1, 2000), '');
end;
$$;

-- Triggers for automatic embedding generation
drop trigger if exists embed_emails_on_insert on emails;
create trigger embed_emails_on_insert
  after insert on emails
  for each row
  execute function util.queue_embeddings('email_embedding_input', 'embedding');

drop trigger if exists embed_emails_on_update on emails;
create trigger embed_emails_on_update
  after update of subject, text, "from"
  on emails
  for each row
  when (old is distinct from new)
  execute function util.queue_embeddings('email_embedding_input', 'embedding');

drop trigger if exists embed_calls_on_insert on calls;
create trigger embed_calls_on_insert
  after insert on calls
  for each row
  when (new.transcript is not null and new.transcript <> '')
  execute function util.queue_embeddings('call_embedding_input', 'embedding');

drop trigger if exists embed_calls_on_update on calls;
create trigger embed_calls_on_update
  after update of transcript, summary
  on calls
  for each row
  when (new.transcript is not null and new.transcript <> '' and old is distinct from new)
  execute function util.queue_embeddings('call_embedding_input', 'embedding');
