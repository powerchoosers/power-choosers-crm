-- Apollo News: persistent storage with pgvector for AI access + 7-day refresh tracking
-- Complements apollo_searches (company/contacts cache); this table is for news articles per domain.

-- 1. Refresh tracking: one row per domain we've ever fetched news for
create table if not exists public.apollo_news_refresh (
  key text primary key,  -- normalized domain (e.g. apollo.io)
  last_refreshed_at timestamptz not null default now(),
  created_at timestamptz default now()
);

alter table public.apollo_news_refresh enable row level security;

create policy "Allow authenticated read apollo_news_refresh"
  on public.apollo_news_refresh for select to authenticated using (true);
create policy "Allow service write apollo_news_refresh"
  on public.apollo_news_refresh for all to service_role using (true);

-- 2. News articles with embedding for AI/search (vector 768 = Gemini)
create table if not exists public.apollo_news_articles (
  id uuid primary key default gen_random_uuid(),
  domain text not null,                    -- normalized domain this article belongs to
  apollo_article_id text not null,        -- Apollo's news_articles[].id
  title text not null,
  url text,
  source_domain text,                     -- article source domain, e.g. prnewswire.com
  snippet text,
  published_at timestamptz,
  event_categories text[] default '{}',
  embedding vector(768),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (domain, apollo_article_id)
);

create index if not exists apollo_news_articles_domain_idx on public.apollo_news_articles (domain);
create index if not exists apollo_news_articles_published_idx on public.apollo_news_articles (published_at desc nulls last);
create index if not exists apollo_news_articles_embedding_idx on public.apollo_news_articles using hnsw (embedding vector_cosine_ops);

alter table public.apollo_news_articles enable row level security;

create policy "Allow authenticated read apollo_news_articles"
  on public.apollo_news_articles for select to authenticated using (true);
create policy "Allow service write apollo_news_articles"
  on public.apollo_news_articles for all to service_role using (true);

-- 3. Content function for embedding queue (used by embed Edge Function)
create or replace function public.apollo_news_embedding_input(record public.apollo_news_articles)
returns text
language plpgsql
immutable
as $$
begin
  return
    'Title: ' || coalesce(record.title, '') || E'\n' ||
    'Snippet: ' || coalesce(record.snippet, '') || E'\n' ||
    'Source: ' || coalesce(record.source_domain, '') || E'\n' ||
    'Domain: ' || coalesce(record.domain, '') || E'\n' ||
    'Categories: ' || coalesce(array_to_string(record.event_categories, ', '), '');
end;
$$;

-- 4. Trigger to queue embedding jobs for new/updated articles
drop trigger if exists embed_apollo_news_on_insert on public.apollo_news_articles;
create trigger embed_apollo_news_on_insert
  after insert on public.apollo_news_articles
  for each row
  execute function util.queue_embeddings('apollo_news_embedding_input', 'embedding');

drop trigger if exists embed_apollo_news_on_update on public.apollo_news_articles;
create trigger embed_apollo_news_on_update
  after update of title, snippet, source_domain, domain, event_categories
  on public.apollo_news_articles
  for each row
  execute function util.queue_embeddings('apollo_news_embedding_input', 'embedding');

comment on table public.apollo_news_refresh is 'Tracks last refresh time per domain for Apollo news; cron refreshes when older than 7 days';
comment on table public.apollo_news_articles is 'Apollo news articles per domain with pgvector embedding for AI search';
