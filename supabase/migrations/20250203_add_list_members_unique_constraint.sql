-- Migration: Add unique constraint to list_members table
-- This prevents duplicate entries and allows for efficient upsert operations
-- Date: 2025-02-03
-- Purpose: Optimize bulk import list assignments and prevent duplicate memberships

-- Add unique constraint on listId + targetId combination
ALTER TABLE list_members 
ADD CONSTRAINT list_members_list_target_unique 
UNIQUE ("listId", "targetId");

-- Create index for faster lookups (if not already created by the constraint)
-- The unique constraint above automatically creates an index, but we document it here for clarity
-- CREATE INDEX IF NOT EXISTS idx_list_members_list_target ON list_members ("listId", "targetId");

-- Add comment to table
COMMENT ON CONSTRAINT list_members_list_target_unique ON list_members IS 
'Ensures a target (contact or account) can only be added to a list once. Enables efficient upsert operations.';
