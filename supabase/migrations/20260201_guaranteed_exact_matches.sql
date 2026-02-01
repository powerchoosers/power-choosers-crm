-- Migration: Guaranteed Exact Matches for Hybrid Search
-- Description: Ensures that exact name matches bypass RRF drift and appear at the absolute top of search results.

create extension if not exists pg_trgm;

create index if not exists accounts_name_trgm_idx
on public.accounts using gin (name gin_trgm_ops);

create index if not exists accounts_domain_trgm_idx
on public.accounts using gin (domain gin_trgm_ops);

create index if not exists contacts_name_trgm_idx
on public.contacts using gin (name gin_trgm_ops);

create index if not exists contacts_email_trgm_idx
on public.contacts using gin (email gin_trgm_ops);

drop function if exists hybrid_search_accounts(text, vector(768), int, float, float, int);

create or replace function hybrid_search_accounts(
  query_text text,
  query_embedding vector(768),
  match_count int,
  full_text_weight float = 4.0,
  semantic_weight float = 0.5,
  rrf_k int = 50
)
returns setof accounts
language sql
as $$
with norm as (
  select
    trim(
      regexp_replace(
        regexp_replace(coalesce(query_text, ''), '^\\s*["“”''`]+|["“”''`]+\\s*$', '', 'g'),
        '\\s+',
        ' ',
        'g'
      )
    ) as q
),
exact_ids as (
  select
    a.id
  from
    public.accounts a
    cross join norm n
  where
    n.q <> ''
    and lower(a.name) = lower(n.q)
  limit least(match_count, 30)
),
full_text as (
  select
    a.id,
    row_number() over(
      order by
        (case when lower(a.name) = lower(n.q) then 1 else 0 end) desc,
        (case when lower(a.name) like lower(n.q) || '%' then 1 else 0 end) desc,
        (case when a.name ilike '%' || n.q || '%' then 1 else 0 end) desc,
        similarity(a.name, n.q) desc,
        greatest(
          ts_rank_cd(a.fts, plainto_tsquery('english', n.q)),
          ts_rank_cd(a.fts, websearch_to_tsquery('english', n.q))
        ) desc,
        a.name asc
    ) as rank_ix
  from
    public.accounts a
    cross join norm n
  where
    n.q <> ''
    and (
      lower(a.name) = lower(n.q)
      or lower(a.name) like lower(n.q) || '%'
      or a.name ilike '%' || n.q || '%'
      or a.fts @@ plainto_tsquery('english', n.q)
      or a.fts @@ websearch_to_tsquery('english', n.q)
      or a.name % n.q
    )
  limit least(match_count, 30) * 4
),
semantic as (
  select
    a.id,
    row_number() over (order by a.embedding <=> query_embedding) as rank_ix
  from
    public.accounts a
  where
    query_embedding is not null
    and a.embedding is not null
  order by
    a.embedding <=> query_embedding
  limit least(match_count, 30) * 4
),
candidates as (
  select id from exact_ids
  union
  select id from full_text
  union
  select id from semantic
)
select
  a.*
from
  candidates c
  join public.accounts a on a.id = c.id
  left join exact_ids ex on ex.id = a.id
  left join full_text ft on ft.id = a.id
  left join semantic se on se.id = a.id
order by
  (case when ex.id is not null then 1 else 0 end) desc,
  coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + se.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 30);
$$;

drop function if exists hybrid_search_contacts(text, vector(768), int, float, float, int);

create or replace function hybrid_search_contacts(
  query_text text,
  query_embedding vector(768),
  match_count int,
  full_text_weight float = 4.0,
  semantic_weight float = 0.5,
  rrf_k int = 50
)
returns setof contacts
language sql
as $$
with norm as (
  select
    trim(
      regexp_replace(
        regexp_replace(coalesce(query_text, ''), '^\\s*["“”''`]+|["“”''`]+\\s*$', '', 'g'),
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
        (case when lower(coalesce(c.name, concat_ws(' ', c."firstName", c."lastName"))) = lower(n.q) then 1 else 0 end) desc,
        (case when lower(c.email) = lower(n.q) then 1 else 0 end) desc,
        (case when lower(coalesce(c.name, concat_ws(' ', c."firstName", c."lastName"))) like lower(n.q) || '%' then 1 else 0 end) desc,
        (case when c.email ilike n.q || '%' then 1 else 0 end) desc,
        (case when coalesce(c.name, concat_ws(' ', c."firstName", c."lastName")) ilike '%' || n.q || '%' then 1 else 0 end) desc,
        greatest(
          similarity(coalesce(c.name, concat_ws(' ', c."firstName", c."lastName")), n.q),
          similarity(c.email, n.q)
        ) desc,
        greatest(
          ts_rank_cd(c.fts, plainto_tsquery('english', n.q)),
          ts_rank_cd(c.fts, websearch_to_tsquery('english', n.q))
        ) desc
    ) as rank_ix
  from
    public.contacts c
    cross join norm n
  where
    n.q <> ''
    and (
      c.email ilike n.q
      or coalesce(c.name, concat_ws(' ', c."firstName", c."lastName")) ilike n.q
      or c.email ilike '%' || n.q || '%'
      or coalesce(c.name, concat_ws(' ', c."firstName", c."lastName")) ilike '%' || n.q || '%'
      or c.fts @@ plainto_tsquery('english', n.q)
      or c.fts @@ websearch_to_tsquery('english', n.q)
      or coalesce(c.name, concat_ws(' ', c."firstName", c."lastName")) % n.q
      or c.email % n.q
    )
  limit least(match_count, 30) * 4
),
semantic as (
  select
    c.id,
    row_number() over (order by c.embedding <=> query_embedding) as rank_ix
  from
    public.contacts c
  where
    query_embedding is not null
    and c.embedding is not null
  order by
    c.embedding <=> query_embedding
  limit least(match_count, 30) * 4
)
select
  c.*
from
  full_text
  full outer join semantic on full_text.id = semantic.id
  join public.contacts c on coalesce(full_text.id, semantic.id) = c.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 30);
$$;
