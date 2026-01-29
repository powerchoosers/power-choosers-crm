create table if not exists ai_cache (
  key text primary key,
  insights jsonb,
  cached_at bigint,
  source text,
  transcript_length int,
  created_at timestamp with time zone default now()
);

alter table ai_cache enable row level security;

create policy "Allow full access to service role"
  on ai_cache
  for all
  to service_role
  using (true)
  with check (true);
