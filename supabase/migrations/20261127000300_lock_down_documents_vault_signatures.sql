-- NOT YET APPLIED: waiting for Lewis's go-ahead.
-- Closes three open doors found while building the client portal:
--   * public.documents was readable and writable by anyone holding the public API key
--   * the private "vault" storage bucket had an allow-all policy for every role
--   * public.signature_requests (including signing access tokens) was readable by anyone
-- Server routes use the service role key and are not affected. The CRM in the browser
-- keeps working for admins.

drop policy if exists "Enable access to all users" on public.documents;
create policy "Admins manage documents" on public.documents
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Enable access to all users" on public.signature_requests;
drop policy if exists "Allow authenticated users full access to signature_requests" on public.signature_requests;
drop policy if exists "Allow anon to select signature_requests based on access_token" on public.signature_requests;
create policy "Admins manage signature requests" on public.signature_requests
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Enable access to vault objects" on storage.objects;
create policy "Admins manage vault objects" on storage.objects
  for all to authenticated
  using (bucket_id = 'vault' and public.is_admin())
  with check (bucket_id = 'vault' and public.is_admin());
