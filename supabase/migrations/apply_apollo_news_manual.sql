-- Run this in Supabase Dashboard → SQL Editor if "supabase db push" fails due to migration history.
-- Creates Apollo news tables + 7-day refresh cron. Safe to run once.

-- 1. Refresh tracking
create table if not exists public.apollo_news_refresh (
  key text primary key,
  last_refreshed_at timestamptz not null default now(),
  created_at timestamptz default now()
);

alter table public.apollo_news_refresh enable row level security;

drop policy if exists "Allow authenticated read apollo_news_refresh" on public.apollo_news_refresh;
create policy "Allow authenticated read apollo_news_refresh"
  on public.apollo_news_refresh for select to authenticated using (true);
drop policy if exists "Allow service write apollo_news_refresh" on public.apollo_news_refresh;
create policy "Allow service write apollo_news_refresh"
  on public.apollo_news_refresh for all to service_role using (true);

-- 2. News articles with vector
create table if not exists public.apollo_news_articles (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  apollo_article_id text not null,
  title text not null,
  url text,
  source_domain text,
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

drop policy if exists "Allow authenticated read apollo_news_articles" on public.apollo_news_articles;
create policy "Allow authenticated read apollo_news_articles"
  on public.apollo_news_articles for select to authenticated using (true);
drop policy if exists "Allow service write apollo_news_articles" on public.apollo_news_articles;
create policy "Allow service write apollo_news_articles"
  on public.apollo_news_articles for all to service_role using (true);

-- 3. Content function for embeddings
create or replace function public.apollo_news_embedding_input(record public.apollo_news_articles)
returns text language plpgsql immutable as $$
begin
  return
    'Title: ' || coalesce(record.title, '') || E'\n' ||
    'Snippet: ' || coalesce(record.snippet, '') || E'\n' ||
    'Source: ' || coalesce(record.source_domain, '') || E'\n' ||
    'Domain: ' || coalesce(record.domain, '') || E'\n' ||
    'Categories: ' || coalesce(array_to_string(record.event_categories, ', '), '');
end; $$;

-- 4. Triggers for embed queue
drop trigger if exists embed_apollo_news_on_insert on public.apollo_news_articles;
create trigger embed_apollo_news_on_insert
  after insert on public.apollo_news_articles
  for each row execute function util.queue_embeddings('apollo_news_embedding_input', 'embedding');

drop trigger if exists embed_apollo_news_on_update on public.apollo_news_articles;
create trigger embed_apollo_news_on_update
  after update of title, snippet, source_domain, domain, event_categories
  on public.apollo_news_articles
  for each row execute function util.queue_embeddings('apollo_news_embedding_input', 'embedding');

-- 5. Cron: refresh stale domains daily (idempotent: unschedule then schedule)
do $$ begin perform cron.unschedule('refresh-apollo-news-7day'); exception when others then null; end; $$;

create or replace function util.refresh_apollo_news_via_backend() returns void language plpgsql security definer as $$
declare cron_url text; cron_secret text;
begin
  begin select decrypted_secret into cron_url from vault.decrypted_secrets where name = 'apollo_news_cron_url' limit 1; exception when others then return; end;
  if cron_url is null or cron_url = '' then return; end if;
  begin select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'apollo_news_cron_secret' limit 1; exception when others then cron_secret := null; end;
  perform net.http_post(url => rtrim(cron_url, '/') || '/api/cron/refresh-apollo-news', headers => jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(cron_secret, '')), body => '{}'::jsonb, timeout_milliseconds => 120000);
end; $$;

select cron.schedule('refresh-apollo-news-7day', '0 2 * * *', $$select util.refresh_apollo_news_via_backend();$$);
