-- Portal clients are matched to an account through contacts.email -> contacts.accountId.
-- Before this migration any signed-in user could insert a contact (and so link their own
-- email to any account), and contacts with no owner were readable by every role.
--
-- After: only admins can insert through the API; unowned contacts are visible to admins
-- only. Server routes using the service role key are not affected.
-- A future non-admin broker will need an insert rule that excludes portal clients.

drop policy if exists "Authenticated users can insert contacts" on public.contacts;
create policy "Admins insert contacts" on public.contacts
  for insert to authenticated
  with check (is_admin());

drop policy if exists "Agents see own contacts, admins see all" on public.contacts;
create policy "Agents see own contacts, admins see all" on public.contacts
  for select to authenticated
  using (
    "ownerId" = (select auth.uid())::text
    or is_admin()
    or lower(email) = lower((select auth.email()))
  );
