-- Recreate documents table with account_id instead of contact_id
drop table if exists public.documents;

create table public.documents (
  id uuid default gen_random_uuid() primary key,
  account_id text references public.accounts(id) on delete cascade,
  name text not null,
  size text,
  type text,
  url text,
  storage_path text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.documents enable row level security;

-- Policy for documents table
create policy "Allow all access to documents"
  on public.documents for all
  using (true)
  with check (true);

-- Ensure bucket exists (idempotent)
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;
