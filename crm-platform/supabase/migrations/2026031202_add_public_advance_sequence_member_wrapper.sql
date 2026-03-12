-- Expose a controlled RPC entrypoint for API routes that call:
-- supabase.rpc('advance_sequence_member', ...)
-- while keeping the core implementation in util.advance_sequence_member.

CREATE OR REPLACE FUNCTION public.advance_sequence_member(
  p_member_id text,
  p_outcome text DEFAULT 'completed'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM util.advance_sequence_member(p_member_id, p_outcome);
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_sequence_member(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_sequence_member(text, text) TO service_role;
