-- Trim duplicate prospect_radar policies and the leftover generic discovered_at index.
-- The active partial index still covers the main feed path.

DROP INDEX IF EXISTS public.idx_prospect_radar_discovered_at;

DROP POLICY IF EXISTS "Authenticated users can read prospect_radar" ON public.prospect_radar;
DROP POLICY IF EXISTS "Authenticated users can update prospect_radar" ON public.prospect_radar;
