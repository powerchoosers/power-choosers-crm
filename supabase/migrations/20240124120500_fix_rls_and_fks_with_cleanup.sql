-- Fix RLS Policies for Anon Access (Migration Mode)
drop policy if exists "Allow all access" on users;
drop policy if exists "Allow all access" on agents;
drop policy if exists "Allow all access" on accounts;
drop policy if exists "Allow all access" on contacts;
drop policy if exists "Allow all access" on calls;
drop policy if exists "Allow all access" on call_logs;
drop policy if exists "Allow all access" on call_details;
drop policy if exists "Allow all access" on emails;
drop policy if exists "Allow all access" on threads;
drop policy if exists "Allow all access" on suppressions;
drop policy if exists "Allow all access" on tasks;
drop policy if exists "Allow all access" on lists;
drop policy if exists "Allow all access" on list_members;
drop policy if exists "Allow all access" on sequences;
drop policy if exists "Allow all access" on sequence_members;
drop policy if exists "Allow all access" on sequence_activations;
drop policy if exists "Allow all access" on notifications;
drop policy if exists "Allow all access" on activities;
drop policy if exists "Allow all access" on deals;
drop policy if exists "Allow all access" on posts;

create policy "Allow all access" on users for all using (true);
create policy "Allow all access" on agents for all using (true);
create policy "Allow all access" on accounts for all using (true);
create policy "Allow all access" on contacts for all using (true);
create policy "Allow all access" on calls for all using (true);
create policy "Allow all access" on call_logs for all using (true);
create policy "Allow all access" on call_details for all using (true);
create policy "Allow all access" on emails for all using (true);
create policy "Allow all access" on threads for all using (true);
create policy "Allow all access" on suppressions for all using (true);
create policy "Allow all access" on tasks for all using (true);
create policy "Allow all access" on lists for all using (true);
create policy "Allow all access" on list_members for all using (true);
create policy "Allow all access" on sequences for all using (true);
create policy "Allow all access" on sequence_members for all using (true);
create policy "Allow all access" on sequence_activations for all using (true);
create policy "Allow all access" on notifications for all using (true);
create policy "Allow all access" on activities for all using (true);
create policy "Allow all access" on deals for all using (true);
create policy "Allow all access" on posts for all using (true);

-- Clean up invalid references before adding constraints
-- (Orphaned records that point to non-existent parents)

UPDATE contacts SET "accountId" = NULL WHERE "accountId" NOT IN (SELECT id FROM accounts);
UPDATE deals SET "accountId" = NULL WHERE "accountId" NOT IN (SELECT id FROM accounts);
UPDATE calls SET "accountId" = NULL WHERE "accountId" NOT IN (SELECT id FROM accounts);
UPDATE calls SET "contactId" = NULL WHERE "contactId" NOT IN (SELECT id FROM contacts);
UPDATE emails SET "accountId" = NULL WHERE "accountId" NOT IN (SELECT id FROM accounts);
UPDATE emails SET "contactId" = NULL WHERE "contactId" NOT IN (SELECT id FROM contacts);
UPDATE emails SET "threadId" = NULL WHERE "threadId" NOT IN (SELECT id FROM threads);
UPDATE tasks SET "accountId" = NULL WHERE "accountId" NOT IN (SELECT id FROM accounts);
UPDATE tasks SET "contactId" = NULL WHERE "contactId" NOT IN (SELECT id FROM contacts);
-- list_members and sequence tables usually rely on valid IDs more strictly, but let's be safe
DELETE FROM list_members WHERE "listId" NOT IN (SELECT id FROM lists);
DELETE FROM sequence_members WHERE "sequenceId" NOT IN (SELECT id FROM sequences);
DELETE FROM sequence_activations WHERE "sequenceId" NOT IN (SELECT id FROM sequences);

-- Restore Foreign Key Constraints (to enable joins)
alter table contacts 
  add constraint contacts_accountId_fkey 
  foreign key ("accountId") 
  references accounts(id) 
  on delete set null;

alter table deals 
  add constraint deals_accountId_fkey 
  foreign key ("accountId") 
  references accounts(id) 
  on delete set null;

alter table calls 
  add constraint calls_accountId_fkey 
  foreign key ("accountId") 
  references accounts(id) 
  on delete set null;

alter table calls 
  add constraint calls_contactId_fkey 
  foreign key ("contactId") 
  references contacts(id) 
  on delete set null;

alter table emails 
  add constraint emails_accountId_fkey 
  foreign key ("accountId") 
  references accounts(id) 
  on delete set null;

alter table emails 
  add constraint emails_contactId_fkey 
  foreign key ("contactId") 
  references contacts(id) 
  on delete set null;

alter table emails 
  add constraint emails_threadId_fkey 
  foreign key ("threadId") 
  references threads(id) 
  on delete set null;

alter table tasks 
  add constraint tasks_accountId_fkey 
  foreign key ("accountId") 
  references accounts(id) 
  on delete set null;

alter table tasks 
  add constraint tasks_contactId_fkey 
  foreign key ("contactId") 
  references contacts(id) 
  on delete set null;

alter table list_members 
  add constraint list_members_listId_fkey 
  foreign key ("listId") 
  references lists(id) 
  on delete cascade;

alter table sequence_members 
  add constraint sequence_members_sequenceId_fkey 
  foreign key ("sequenceId") 
  references sequences(id) 
  on delete cascade;

alter table sequence_activations 
  add constraint sequence_activations_sequenceId_fkey 
  foreign key ("sequenceId") 
  references sequences(id) 
  on delete cascade;
