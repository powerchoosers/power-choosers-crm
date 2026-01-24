-- Fix RLS Policies for Anon Access (Migration Mode)
-- Since we are using Firebase Auth on the client, Supabase sees the user as 'anon'.
-- We need to allow 'anon' role to access the tables for now.
-- In production, we should ideally switch to Supabase Auth or use a custom JWT.

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

-- Restore Foreign Key Constraints (to enable joins)
-- We use 'alter table ... add constraint' which is safe if data is valid.
-- If data is invalid (orphaned records), this might fail. We should use 'not valid' option if possible or clean data.
-- Postgres supports 'NOT VALID' for adding constraints without checking existing rows immediately.

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
