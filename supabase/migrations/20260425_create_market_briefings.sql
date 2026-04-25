-- Market Briefings table for AI-generated market overviews
CREATE TABLE IF NOT EXISTS public.market_briefings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  briefing_type text NOT NULL DEFAULT 'daily_overview',
  headline text NOT NULL,
  summary text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  market_snapshot jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast latest-briefing lookups
CREATE INDEX IF NOT EXISTS idx_market_briefings_generated_at ON public.market_briefings (generated_at DESC);

-- RLS
ALTER TABLE public.market_briefings ENABLE ROW LEVEL SECURITY;

-- Public read access (this is public market data)
CREATE POLICY "Public read access for market briefings"
  ON public.market_briefings
  FOR SELECT
  USING (true);
