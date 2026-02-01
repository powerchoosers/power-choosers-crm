-- Migration: Guaranteed Exact Matches for Hybrid Search
-- Description: Ensures that exact name matches bypass RRF drift and appear at the absolute top of search results.

-- Drop existing functions to allow return type changes
drop function if exists hybrid_search_accounts(text, vector, int, float, float, int);
drop function if exists hybrid_search_contacts(text, vector, int, float, float, int);

-- 1. Updated Accounts Search with Hard Override
create or replace function hybrid_search_accounts(
  query_text text,
  query_embedding vector(768),
  match_count int,
  full_text_weight float = 4.0,
  semantic_weight float = 0.5,
  rrf_k int = 50
)
returns table (
  id text,
  name text,
  industry text,
  city text,
  state text,
  "contractEndDate" date,
  "strikePrice" float8,
  "annualUsage" float8,
  metadata jsonb,
  rank_score float,
  full_text_debug float,
  semantic_debug float
)
language plpgsql
as $$
begin
  return query
  with exact_match as (
    select
      a.id,
      1000.0 as score
    from
      accounts a
    where
      a.name ilike query_text
  ),
  full_text as (
    select
      a.id,
      row_number() over(
        order by 
          ts_rank_cd(a.fts, plainto_tsquery(query_text)) desc,
          ts_rank_cd(a.fts, websearch_to_tsquery(query_text)) desc
      ) as rank_ix
    from
      accounts a
    where
      a.fts @@ plainto_tsquery(query_text)
      OR a.fts @@ websearch_to_tsquery(query_text)
      OR a.name ilike '%' || query_text || '%'
    limit least(match_count, 30) * 2
  ),
  semantic as (
    select
      a.id,
      row_number() over (order by a.embedding <=> query_embedding) as rank_ix
    from
      accounts a
    where a.embedding is not null
    order by a.embedding <=> query_embedding
    limit least(match_count, 30) * 2
  )
  select
    a.id,
    a.name,
    a.industry,
    a.city,
    a.state,
    a."contractEndDate",
    a."strikePrice",
    a."annualUsage",
    a.metadata,
    (
      coalesce(em.score, 0.0) +
      (coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight) +
      (coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight)
    )::float as rank_score,
    (coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight)::float as full_text_debug,
    (coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight)::float as semantic_debug
  from
    accounts a
    left join exact_match em on a.id = em.id
    left join full_text ft on a.id = ft.id
    left join semantic s on a.id = s.id
  where
    em.id is not null or ft.id is not null or s.id is not null
  order by
    rank_score desc
  limit
    least(match_count, 30);
end;
$$;

-- 2. Updated Contacts Search with Hard Override
create or replace function hybrid_search_contacts(
  query_text text,
  query_embedding vector(768),
  match_count int,
  full_text_weight float = 4.0,
  semantic_weight float = 0.5,
  rrf_k int = 50
)
returns table (
  id text,
  "accountId" text,
  "firstName" text,
  "lastName" text,
  email text,
  phone text,
  title text,
  city text,
  state text,
  metadata jsonb,
  rank_score float,
  full_text_debug float,
  semantic_debug float
)
language plpgsql
as $$
begin
  return query
  with exact_match as (
    select
      c.id,
      1000.0 as score
    from
      contacts c
    where
      (c."firstName" || ' ' || c."lastName") ilike query_text
      OR c.email ilike query_text
  ),
  full_text as (
    select
      c.id,
      row_number() over(
        order by 
          ts_rank_cd(c.fts, plainto_tsquery(query_text)) desc,
          ts_rank_cd(c.fts, websearch_to_tsquery(query_text)) desc
      ) as rank_ix
    from
      contacts c
    where
      c.fts @@ plainto_tsquery(query_text)
      OR c.fts @@ websearch_to_tsquery(query_text)
      OR c.email ilike query_text
      OR c."firstName" || ' ' || c."lastName" ilike '%' || query_text || '%'
    limit least(match_count, 30) * 2
  ),
  semantic as (
    select
      c.id,
      row_number() over (order by c.embedding <=> query_embedding) as rank_ix
    from
      contacts c
    where c.embedding is not null
    order by c.embedding <=> query_embedding
    limit least(match_count, 30) * 2
  )
  select
    c.id,
    c."accountId",
    c."firstName",
    c."lastName",
    c.email,
    c.phone,
    c.title,
    c.city,
    c.state,
    c.metadata,
    (
      coalesce(em.score, 0.0) +
      (coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight) +
      (coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight)
    )::float as rank_score,
    (coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight)::float as full_text_debug,
    (coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight)::float as semantic_debug
  from
    contacts c
    left join exact_match em on c.id = em.id
    left join full_text ft on c.id = ft.id
    left join semantic s on c.id = s.id
  where
    em.id is not null or ft.id is not null or s.id is not null
  order by
    rank_score desc
  limit
    least(match_count, 30);
end;
$$;
