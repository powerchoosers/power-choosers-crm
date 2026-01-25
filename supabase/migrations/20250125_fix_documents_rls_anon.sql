
-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Drop existing restricted policies
DROP POLICY IF EXISTS "Allow authenticated users to view documents" ON public.documents;
DROP POLICY IF EXISTS "Vault Access" ON storage.objects;

-- Create public policy for documents table (Since auth is handled by Firebase, Supabase sees user as anon)
CREATE POLICY "Allow public access to documents"
ON public.documents FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Ensure storage policy exists for public access to vault
CREATE POLICY "Public Vault Access"
ON storage.objects FOR ALL
TO public
USING ( bucket_id = 'vault' )
WITH CHECK ( bucket_id = 'vault' );
