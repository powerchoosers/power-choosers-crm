-- Add HNSW indexes to embedding columns for improved vector search performance
-- We use vector_cosine_ops because our search functions use the <=> operator.

-- Accounts
create index if not exists accounts_embedding_hnsw_idx 
on public.accounts 
using hnsw (embedding vector_cosine_ops);

-- Contacts
create index if not exists contacts_embedding_hnsw_idx 
on public.contacts 
using hnsw (embedding vector_cosine_ops);

-- Emails
create index if not exists emails_embedding_hnsw_idx 
on public.emails 
using hnsw (embedding vector_cosine_ops);

-- Calls
create index if not exists calls_embedding_hnsw_idx 
on public.calls 
using hnsw (embedding vector_cosine_ops);

-- Call Details
create index if not exists call_details_embedding_hnsw_idx 
on public.call_details 
using hnsw (embedding vector_cosine_ops);
