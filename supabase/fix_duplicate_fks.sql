-- Fix: Remove duplicate foreign key constraints
-- Run this in Supabase Dashboard → SQL Editor

-- Step 1: Find all FK constraints on list_members pointing to lists
SELECT conname 
FROM pg_constraint 
WHERE conrelid = 'list_members'::regclass 
  AND confrelid = 'lists'::regclass 
  AND contype = 'f';

-- Step 2: Drop ALL FK constraints from list_members to lists
DO $$ 
DECLARE
    constraint_rec RECORD;
BEGIN
    FOR constraint_rec IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'list_members'::regclass 
          AND confrelid = 'lists'::regclass 
          AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE list_members DROP CONSTRAINT IF EXISTS %I', constraint_rec.conname);
    END LOOP;
END $$;

-- Step 3: Drop ALL FK constraints from contacts to accounts
DO $$ 
DECLARE
    constraint_rec RECORD;
BEGIN
    FOR constraint_rec IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'contacts'::regclass 
          AND confrelid = 'accounts'::regclass 
          AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS %I', constraint_rec.conname);
    END LOOP;
END $$;

-- Step 4: Recreate SINGLE FK constraint for list_members -> lists
ALTER TABLE list_members
ADD CONSTRAINT list_members_listid_fkey
FOREIGN KEY ("listId") REFERENCES lists(id) ON DELETE CASCADE;

-- Step 5: Recreate SINGLE FK constraint for contacts -> accounts
ALTER TABLE contacts
ADD CONSTRAINT contacts_accountid_fkey
FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE SET NULL;

-- Step 6: Verify only one FK exists for each relationship
SELECT 
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  confrelid::regclass AS references_table
FROM pg_constraint
WHERE (
  (conrelid = 'list_members'::regclass AND confrelid = 'lists'::regclass)
  OR
  (conrelid = 'contacts'::regclass AND confrelid = 'accounts'::regclass)
)
AND contype = 'f'
ORDER BY conrelid, conname;
