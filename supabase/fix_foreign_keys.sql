-- Fix foreign key relationships between contacts and accounts
-- Run this in Supabase Dashboard → SQL Editor

-- Drop the FK if it exists (in case it's malformed)
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_accountid_fkey;

-- Recreate the FK with proper naming
ALTER TABLE contacts 
ADD CONSTRAINT contacts_accountid_fkey 
FOREIGN KEY ("accountId") 
REFERENCES accounts(id) 
ON DELETE SET NULL;

-- Verify the constraint was created
SELECT 
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS foreign_table
FROM pg_constraint 
WHERE conname = 'contacts_accountid_fkey';
