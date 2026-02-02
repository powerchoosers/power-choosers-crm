-- Enable pgvector extension if not already enabled
create extension if not exists vector;

-- Create meters table
create table if not exists meters (
  id uuid primary key default gen_random_uuid(),
  account_id text references accounts(id) on delete cascade,
  esid text,
  service_address text,
  status text default 'Active',
  embedding vector(768),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add indexes
create index if not exists meters_account_id_idx on meters(account_id);
create index if not exists meters_embedding_idx on meters using ivfflat (embedding vector_cosine_ops);

-- Enable RLS
alter table meters enable row level security;

-- Create RLS policies
create policy "Enable read access for authenticated users" on meters
  for select using (auth.role() = 'authenticated');

create policy "Enable insert access for authenticated users" on meters
  for insert with check (auth.role() = 'authenticated');

create policy "Enable update access for authenticated users" on meters
  for update using (auth.role() = 'authenticated');

create policy "Enable delete access for authenticated users" on meters
  for delete using (auth.role() = 'authenticated');
