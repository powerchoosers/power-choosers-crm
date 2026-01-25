
-- 1. Ensure Vault Bucket Exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('vault', 'vault', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on Documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 3. Clean up OLD Policies (Drop everything to be safe)
DROP POLICY IF EXISTS "Allow all access to documents" ON public.documents;
DROP POLICY IF EXISTS "Allow authenticated users to view documents" ON public.documents;
DROP POLICY IF EXISTS "Allow public access to documents" ON public.documents;

DROP POLICY IF EXISTS "Vault Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Vault Access" ON storage.objects;
DROP POLICY IF EXISTS "Give me access" ON storage.objects; -- Common default

-- 4. Create NEW Permissive Policy for Documents (Public/Anon access)
CREATE POLICY "Enable access to all users"
ON public.documents FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 5. Create NEW Permissive Policy for Storage Vault (Public/Anon access)
CREATE POLICY "Enable access to vault objects"
ON storage.objects FOR ALL
TO public
USING ( bucket_id = 'vault' )
WITH CHECK ( bucket_id = 'vault' );
