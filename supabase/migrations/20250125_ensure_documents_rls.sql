
-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Allow all access to documents" ON public.documents;
DROP POLICY IF EXISTS "Allow authenticated users to view documents" ON public.documents;
DROP POLICY IF EXISTS "Vault Access" ON storage.objects;

-- Create permissive policy for documents table
CREATE POLICY "Allow authenticated users to view documents"
ON public.documents FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Ensure storage policy exists
CREATE POLICY "Vault Access"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'vault' )
WITH CHECK ( bucket_id = 'vault' );
