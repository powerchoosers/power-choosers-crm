alter function util.link_call_to_contact_by_phone() security definer;
alter function util.reconcile_contact_calls_by_phone() security definer;

revoke all on function util.normalized_phone(text) from public, anon, authenticated;
revoke all on function util.link_call_to_contact_by_phone() from public, anon, authenticated;
revoke all on function util.reconcile_contact_calls_by_phone() from public, anon, authenticated;
