-- Change vector dimensions from 1536 (OpenAI default) to 768 (Gemini default)
-- This is necessary because the columns might have been created with 1536 previously
alter table accounts alter column embedding type vector(768);
alter table contacts alter column embedding type vector(768);
alter table emails alter column embedding type vector(768);

-- Re-define functions just in case they were created with wrong signatures (though my previous file used 768)
-- If they exist with 768, this is fine.
