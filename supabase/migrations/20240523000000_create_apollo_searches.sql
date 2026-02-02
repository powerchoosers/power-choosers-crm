create table if not exists apollo_searches (
  key text primary key, -- domain or company name used as lookup key
  data jsonb not null, -- stores { company, contacts, timestamp }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add RLS policies
alter table apollo_searches enable row level security;

create policy "Allow authenticated read access"
  on apollo_searches for select
  to authenticated
  using (true);

create policy "Allow authenticated insert access"
  on apollo_searches for insert
  to authenticated
  with check (true);

create policy "Allow authenticated update access"
  on apollo_searches for update
  to authenticated
  using (true);
