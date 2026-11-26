-- Lock down functions that could be called through the API without signing in.
--
-- Before this migration these SECURITY DEFINER functions were executable by `anon`:
--   * enroll_in_sequence        - an outsider could enroll any contact in an email sequence
--   * get_contacts_by_list      - an outsider could read every contact in a list (bypassing RLS)
--   * get_contacts_count_by_list, get_accounts_count_by_list(text) - list sizes
--   * fn_cleanup_list_members   - a trigger function; never meant to be called directly
--
-- After:
--   * enroll_in_sequence: signed-in users only. Admins can enroll anyone; other staff only
--     contacts they own. The service role and direct database calls are unchanged.
--   * the three list readers run as the caller (SECURITY INVOKER), so row-level security
--     applies, and are no longer callable when signed out. The app itself calls the
--     `*_filtered` and six-argument versions, which this migration does not touch.
--   * fn_cleanup_list_members: not callable through the API. Its triggers still fire.
--
-- is_admin() is deliberately left callable: row-level security policies call it as the
-- current role, and it only reports whether the caller's own email is an admin.

create or replace function public.enroll_in_sequence(p_sequence_id text, p_contact_ids text[], p_owner_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'util'
as $function$
DECLARE
  v_contact_id TEXT;
  v_member_id TEXT;
  v_enrolled_count INT := 0;
  v_skipped_count INT := 0;
  v_role TEXT := auth.role();
BEGIN
  -- API callers carry a role claim. No claim means a direct database call (cron, SQL editor).
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    IF v_role <> 'authenticated' THEN
      RAISE EXCEPTION 'Sign in to enroll contacts in a sequence' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_admin() AND EXISTS (
      SELECT 1 FROM unnest(p_contact_ids) AS req(contact_id)
      LEFT JOIN public.contacts c ON c.id = req.contact_id
      WHERE c.id IS NULL
         OR NOT (c."ownerId" = auth.uid()::text OR lower(c."ownerId") = lower(auth.email()))
    ) THEN
      RAISE EXCEPTION 'You can only enroll contacts you own' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOREACH v_contact_id IN ARRAY p_contact_ids LOOP
    IF EXISTS (
      SELECT 1 FROM sequence_members
      WHERE "sequenceId" = p_sequence_id
      AND "targetId" = v_contact_id
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO sequence_members (
      id, "sequenceId", "targetId", "targetType", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid()::text,
      p_sequence_id,
      v_contact_id,
      'contact',
      NOW(),
      NOW()
    ) RETURNING id INTO v_member_id;

    PERFORM util.advance_sequence_member(v_member_id);

    v_enrolled_count := v_enrolled_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enrolled', v_enrolled_count,
    'skipped', v_skipped_count,
    'total', array_length(p_contact_ids, 1)
  );
END;
$function$;

revoke execute on function public.enroll_in_sequence(text, text[], text) from public, anon;
grant execute on function public.enroll_in_sequence(text, text[], text) to authenticated, service_role;

alter function public.get_contacts_by_list(text) security invoker set search_path = public, pg_catalog;
alter function public.get_contacts_count_by_list(text) security invoker set search_path = public, pg_catalog;
alter function public.get_accounts_count_by_list(text) security invoker set search_path = public, pg_catalog;

revoke execute on function public.get_contacts_by_list(text) from public, anon;
revoke execute on function public.get_contacts_count_by_list(text) from public, anon;
revoke execute on function public.get_accounts_count_by_list(text) from public, anon;
grant execute on function
  public.get_contacts_by_list(text),
  public.get_contacts_count_by_list(text),
  public.get_accounts_count_by_list(text)
  to authenticated, service_role;

revoke execute on function public.fn_cleanup_list_members() from public, anon, authenticated;
