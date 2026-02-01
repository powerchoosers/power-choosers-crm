-- Improve Hybrid Search with Exact Match Prioritization

-- 1. Updated Accounts Search
create or replace function hybrid_search_accounts(
  query_text text,
  query_embedding vector(768),
  match_count int,
  full_text_weight float = 1,
  semantic_weight float = 1,
  rrf_k int = 50
)
returns setof accounts
language sql
as $$
with full_text as (
  select
    id,
    row_number() over(
      order by 
        -- Priority 1: Exact Name Match
        (case when name ilike query_text then 1 else 0 end) desc,
        -- Priority 2: Starts With Name
        (case when name ilike query_text || '%' then 1 else 0 end) desc,
        -- Priority 3: FTS Rank
        ts_rank_cd(fts, websearch_to_tsquery(query_text)) desc
    ) as rank_ix
  from
    accounts
  where
    fts @@ websearch_to_tsquery(query_text)
    OR name ilike '%' || query_text || '%'
  limit least(match_count, 30) * 2
),
semantic as (
  select
    id,
    row_number() over (order by embedding <=> query_embedding) as rank_ix
  from
    accounts
  where embedding is not null
  order by rank_ix
  limit least(match_count, 30) * 2
)
select
  accounts.*
from
  full_text
  full outer join semantic
    on full_text.id = semantic.id
  join accounts
    on coalesce(full_text.id, semantic.id) = accounts.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 30);
$$;

-- 2. Updated Contacts Search
create or replace function hybrid_search_contacts(
  query_text text,
  query_embedding vector(768),
  match_count int,
  full_text_weight float = 1,
  semantic_weight float = 1,
  rrf_k int = 50
)
returns setof contacts
language sql
as $$
with full_text as (
  select
    id,
    row_number() over(
      order by 
        -- Priority 1: Exact Full Name or Email Match
        (case when "firstName" || ' ' || "lastName" ilike query_text then 1 else 0 end) desc,
        (case when email ilike query_text then 1 else 0 end) desc,
        -- Priority 2: Starts With Name
        (case when "firstName" ilike query_text || '%' then 1 else 0 end) desc,
        -- Priority 3: FTS Rank
        ts_rank_cd(fts, websearch_to_tsquery(query_text)) desc
    ) as rank_ix
  from
    contacts
  where
    fts @@ websearch_to_tsquery(query_text)
    OR email ilike query_text
    OR "firstName" || ' ' || "lastName" ilike '%' || query_text || '%'
  limit least(match_count, 30) * 2
),
semantic as (
  select
    id,
    row_number() over (order by embedding <=> query_embedding) as rank_ix
  from
    contacts
  where embedding is not null
  order by rank_ix
  limit least(match_count, 30) * 2
)
select
  contacts.*
from
  full_text
  full outer join semantic
    on full_text.id = semantic.id
  join contacts
    on coalesce(full_text.id, semantic.id) = contacts.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 30);
$$;
