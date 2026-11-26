-- Restrict who can read and change deals and meters.
--
-- Before this migration:
--   * deals had an "Allow all access" policy (USING true, all commands, all roles), so anyone
--     holding the public API key could read, change, or delete every deal without signing in.
--   * meters could be read and changed by any signed-in user, including portal clients.
--
-- After:
--   * deals: admins see and change all; other staff only deals they own (by auth uid or email);
--     portal clients keep read-only access to their own account's deals through the existing
--     "Portal clients read own account deals" policy.
--   * meters: readable when the meter's account is visible to you under the accounts policies
--     (admins, account owners, and portal clients for their own account); only admins and the
--     account owner can add, change, or delete them.
--   * nothing for the anon role.
--
-- Server routes that use the service role key are not affected.

-- ── deals ────────────────────────────────────────────────────────────────────
drop policy if exists "Allow all access" on public.deals;

create policy "Staff read own deals, admins read all" on public.deals
  for select to authenticated
  using (is_admin() or "ownerId" = (select auth.uid())::text or lower("ownerId") = lower((select auth.email())));

create policy "Staff insert own deals, admins insert all" on public.deals
  for insert to authenticated
  with check (is_admin() or "ownerId" = (select auth.uid())::text or lower("ownerId") = lower((select auth.email())));

create policy "Staff update own deals, admins update all" on public.deals
  for update to authenticated
  using (is_admin() or "ownerId" = (select auth.uid())::text or lower("ownerId") = lower((select auth.email())))
  with check (is_admin() or "ownerId" = (select auth.uid())::text or lower("ownerId") = lower((select auth.email())));

create policy "Staff delete own deals, admins delete all" on public.deals
  for delete to authenticated
  using (is_admin() or "ownerId" = (select auth.uid())::text or lower("ownerId") = lower((select auth.email())));

-- ── meters ───────────────────────────────────────────────────────────────────
drop policy if exists "Enable read access for authenticated users" on public.meters;
drop policy if exists "Enable insert access for authenticated users" on public.meters;
drop policy if exists "Enable update access for authenticated users" on public.meters;
drop policy if exists "Enable delete access for authenticated users" on public.meters;

-- The subquery runs under the caller's own accounts policies, so a meter is visible exactly
-- when its account is.
create policy "Read meters of accounts you can see" on public.meters
  for select to authenticated
  using (account_id in (select a.id from public.accounts a));

create policy "Staff insert meters on own accounts, admins on all" on public.meters
  for insert to authenticated
  with check (is_admin() or account_id in (
    select a.id from public.accounts a
    where a."ownerId" = (select auth.uid())::text or lower(a."ownerId") = lower((select auth.email()))));

create policy "Staff update meters on own accounts, admins on all" on public.meters
  for update to authenticated
  using (is_admin() or account_id in (
    select a.id from public.accounts a
    where a."ownerId" = (select auth.uid())::text or lower(a."ownerId") = lower((select auth.email()))))
  with check (is_admin() or account_id in (
    select a.id from public.accounts a
    where a."ownerId" = (select auth.uid())::text or lower(a."ownerId") = lower((select auth.email()))));

create policy "Staff delete meters on own accounts, admins on all" on public.meters
  for delete to authenticated
  using (is_admin() or account_id in (
    select a.id from public.accounts a
    where a."ownerId" = (select auth.uid())::text or lower(a."ownerId") = lower((select auth.email()))));
