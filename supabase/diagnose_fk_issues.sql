-- Diagnostic: Check for duplicate foreign keys
-- Run this in Supabase Dashboard → SQL Editor

-- Check list_members foreign keys
SELECT 
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS references_table,
  a.attname AS column_name
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE conrelid = 'list_members'::regclass 
  AND contype = 'f'
ORDER BY conname;

-- Check contacts foreign keys
SELECT 
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS references_table,
  a.attname AS column_name
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE conrelid = 'contacts'::regclass 
  AND contype = 'f'
ORDER BY conname;
