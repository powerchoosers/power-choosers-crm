
-- Allow public access to calls for now to support Firebase auth users
-- Since the app uses Firebase Auth, Supabase's auth.role() will be 'anon'
-- unless a custom auth bridge is implemented.

DO $$
BEGIN
    -- Drop existing policies if they exist to avoid conflicts
    DROP POLICY IF EXISTS "Allow all access" ON calls;
    DROP POLICY IF EXISTS "Enable read access for all users" ON calls;
    
    -- Create a permissive read policy
    CREATE POLICY "Enable read access for all users"
    ON public.calls FOR SELECT
    TO public
    USING (true);

    -- Also allow insert/update if needed for the dialer
    DROP POLICY IF EXISTS "Enable insert for all users" ON calls;
    CREATE POLICY "Enable insert for all users"
    ON public.calls FOR INSERT
    TO public
    WITH CHECK (true);

    DROP POLICY IF EXISTS "Enable update for all users" ON calls;
    CREATE POLICY "Enable update for all users"
    ON public.calls FOR UPDATE
    TO public
    USING (true)
    WITH CHECK (true);
END $$;
