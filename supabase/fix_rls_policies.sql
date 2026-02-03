-- Quick fix: Apply RLS policies to allow authenticated users full access
-- Run this in Supabase Dashboard → SQL Editor

-- Enable RLS on core tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Allow all access" ON accounts;
DROP POLICY IF EXISTS "Allow all access" ON contacts;
DROP POLICY IF EXISTS "Allow all access" ON lists;
DROP POLICY IF EXISTS "Allow all access" ON list_members;
DROP POLICY IF EXISTS "Allow all access" ON calls;
DROP POLICY IF EXISTS "Allow all access" ON emails;
DROP POLICY IF EXISTS "Allow all access" ON tasks;

-- Create permissive policies for authenticated users
CREATE POLICY "Allow all access" ON accounts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all access" ON contacts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all access" ON lists FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all access" ON list_members FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all access" ON calls FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all access" ON emails FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all access" ON tasks FOR ALL USING (auth.role() = 'authenticated');
