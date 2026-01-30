-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Add embedding column to accounts table
alter table accounts add column if not exists embedding vector(768);

-- Add embedding column to contacts table
alter table contacts add column if not exists embedding vector(768);

-- Add embedding column to emails table
alter table emails add column if not exists embedding vector(768);

-- Create a function to search for accounts
create or replace function match_accounts (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns setof accounts
language plpgsql
as $$
begin
  return query
  select *
  from accounts
  where 1 - (accounts.embedding <=> query_embedding) > match_threshold
  order by accounts.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create a function to search for contacts
create or replace function match_contacts (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns setof contacts
language plpgsql
as $$
begin
  return query
  select *
  from contacts
  where 1 - (contacts.embedding <=> query_embedding) > match_threshold
  order by contacts.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create a function to search for emails
create or replace function match_emails (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns setof emails
language plpgsql
as $$
begin
  return query
  select *
  from emails
  where 1 - (emails.embedding <=> query_embedding) > match_threshold
  order by emails.embedding <=> query_embedding
  limit match_count;
end;
$$;
