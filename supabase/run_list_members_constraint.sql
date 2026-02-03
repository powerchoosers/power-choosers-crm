-- Run this in Supabase Dashboard → SQL Editor (one-time for list_members unique constraint)
-- Then run: supabase migration repair --status applied 20250203

ALTER TABLE list_members 
ADD CONSTRAINT list_members_list_target_unique 
UNIQUE ("listId", "targetId");

COMMENT ON CONSTRAINT list_members_list_target_unique ON list_members IS 
'Ensures a target (contact or account) can only be added to a list once. Enables efficient upsert operations.';
