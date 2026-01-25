-- Create documents table
create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  contact_id text references public.contacts(id) on delete cascade,
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

-- Create storage bucket 'vault' if it doesn't exist
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;

-- Policy for storage objects in vault
create policy "Vault Access"
  on storage.objects for all
  using ( bucket_id = 'vault' )
  with check ( bucket_id = 'vault' );
