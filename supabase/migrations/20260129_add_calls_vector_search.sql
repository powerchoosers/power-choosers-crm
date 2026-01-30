-- Change embedding column to 768 dimensions for calls (Gemini compatibility)
-- We need to ensure it's 768. If it was 1536, this will change it.
-- Any existing 1536 vectors will be invalid/truncated if we don't handle them, 
-- but since we are backfilling, we don't care about old OpenAI vectors.
ALTER TABLE calls DROP COLUMN IF EXISTS embedding;
ALTER TABLE calls ADD COLUMN embedding vector(768);

-- Handle call_details
ALTER TABLE call_details DROP COLUMN IF EXISTS embedding;
ALTER TABLE call_details ADD COLUMN embedding vector(768);

-- Create a function to search for calls
create or replace function match_calls (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns setof calls
language plpgsql
as $$
begin
  return query
  select *
  from calls
  where 1 - (calls.embedding <=> query_embedding) > match_threshold
  order by calls.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create a function to search for call_details (transcripts)
create or replace function match_call_details (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns setof call_details
language plpgsql
as $$
begin
  return query
  select *
  from call_details
  where 1 - (call_details.embedding <=> query_embedding) > match_threshold
  order by call_details.embedding <=> query_embedding
  limit match_count;
end;
$$;
