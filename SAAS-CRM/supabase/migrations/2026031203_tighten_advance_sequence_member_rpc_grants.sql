-- Restrict the RPC wrapper so only backend service_role can invoke it.

REVOKE ALL ON FUNCTION public.advance_sequence_member(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_sequence_member(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.advance_sequence_member(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.advance_sequence_member(text, text) TO service_role;
