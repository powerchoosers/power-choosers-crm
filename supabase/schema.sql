-- Enable extensions
create extension if not exists vector;
create extension if not exists "uuid-ossp";

-- ⚠️ RESET SCHEMA (Drop tables to ensure clean slate for migration)
drop table if exists notifications cascade;
drop table if exists activities cascade;
drop table if exists posts cascade;
drop table if exists deals cascade;
drop table if exists agents cascade;
drop table if exists sequence_members cascade;
drop table if exists sequence_activations cascade;
drop table if exists sequences cascade;
drop table if exists list_members cascade;
drop table if exists lists cascade;
drop table if exists tasks cascade;
drop table if exists emails cascade;
drop table if exists threads cascade;
drop table if exists suppressions cascade;
drop table if exists call_details cascade;
drop table if exists call_logs cascade;
drop table if exists calls cascade;
drop table if exists contacts cascade;
drop table if exists accounts cascade;
drop table if exists users cascade;

-- USERS (Settings & Profile)
create table users (
  id text primary key, -- Firebase Auth ID (or Email for legacy)
  email text unique,
  first_name text,
  last_name text,
  photo_url text,
  hosted_photo_url text,
  job_title text,
  phone text,
  linkedin_url text,
  bio text,
  settings jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- AGENTS (Sales Agents)
create table agents (
  id text primary key, -- Email address is used as ID in legacy
  name text,
  email text unique,
  territory text,
  skills text[], -- Array of strings
  status text, -- 'online', 'offline', 'busy'
  role text, -- 'sales_agent'
  goals jsonb default '{}'::jsonb,
  performance jsonb default '{}'::jsonb,
  "assignedPhoneNumber" text,
  "assignedEmailAddress" text,
  "lastActive" timestamp with time zone,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

-- ACCOUNTS (Companies)
create table accounts (
  id text primary key,
  name text,
  domain text,
  industry text,
  status text default 'active',
  employees int,
  revenue text,
  description text,
  logo_url text,
  phone text,
  linkedin_url text,
  address text,
  city text,
  state text,
  zip text,
  country text,
  electricity_supplier text,
  annual_usage text,
  current_rate text,
  contract_end_date date,
  service_addresses jsonb default '[]'::jsonb,
  "ownerId" text, 
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb
);

-- CONTACTS (People)
create table contacts (
  id text primary key,
  "accountId" text, -- Removed FK constraint for migration
  "firstName" text,
  "lastName" text,
  name text,
  email text,
  phone text,
  mobile text,
  "workPhone" text,
  title text,
  "linkedinUrl" text,
  status text default 'active',
  "ownerId" text,
  "lastActivityAt" timestamp with time zone,
  "lastContactedAt" timestamp with time zone,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb
);

-- DEALS (Sales Pipeline)
create table deals (
  id text primary key,
  title text,
  "accountId" text, -- Removed FK constraint for migration
  stage text, -- 'interested', 'proposal', 'won', 'lost'
  amount numeric, -- Total deal value
  "closeDate" date,
  "ownerId" text,
  "assignedTo" text,
  
  -- Energy Deal Specifics
  "annualUsage" numeric,
  mills numeric,
  "contractLength" int,
  "commissionType" text,
  "yearlyCommission" numeric,
  
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

-- CALLS (Voice Logs)
create table calls (
  id text primary key,
  "callSid" text,
  "from" text,
  "to" text,
  direction text,
  status text,
  duration int,
  timestamp timestamp with time zone,
  "recordingUrl" text,
  transcript text,
  summary text,
  "aiInsights" jsonb,
  "accountId" text, -- Removed FK constraint for migration
  "contactId" text, -- Removed FK constraint for migration
  embedding vector(1536),
  "createdAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

-- CALL LOGS (Raw Logs if distinct)
create table call_logs (
  id text primary key,
  "callSid" text,
  "from" text,
  "to" text,
  status text,
  duration int,
  timestamp timestamp with time zone,
  metadata jsonb default '{}'::jsonb
);

-- CALL DETAILS (Heavy data offloaded)
create table call_details (
  id text primary key, -- references calls(id) usually, but we keep it flexible
  transcript text,
  "formattedTranscript" text,
  "aiInsights" jsonb,
  "conversationalIntelligence" jsonb,
  metadata jsonb default '{}'::jsonb
);

-- THREADS (Email Threads)
create table threads (
  id text primary key,
  "subjectNormalized" text,
  participants jsonb default '[]'::jsonb,
  "lastSnippet" text,
  "lastFrom" text,
  "lastMessageAt" timestamp with time zone,
  "messageCount" int default 0,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

-- EMAILS (Full History & Scheduled)
create table emails (
  id text primary key,
  "contactId" text, -- Removed FK constraint for migration
  "accountId" text, -- Removed FK constraint for migration
  "threadId" text, -- Removed FK constraint for migration
  "from" text,
  "to" jsonb,
  "cc" jsonb,
  "bcc" jsonb,
  subject text,
  html text,
  text text,
  status text,
  type text,
  is_read boolean default false,
  is_starred boolean default false,
  is_deleted boolean default false,
  "scheduledSendTime" timestamp with time zone,
  "aiPrompt" text,
  "openCount" int default 0,
  "clickCount" int default 0,
  opens jsonb default '[]'::jsonb,
  clicks jsonb default '[]'::jsonb,
  timestamp timestamp with time zone,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb
);

-- SUPPRESSIONS (Unsubscribes)
create table suppressions (
  id text primary key, -- email address
  reason text,
  details text,
  source text,
  "suppressedAt" timestamp with time zone,
  "createdAt" timestamp with time zone default now()
);

-- TASKS
create table tasks (
  id text primary key,
  title text,
  description text,
  status text,
  priority text,
  "dueDate" timestamp with time zone,
  "contactId" text, -- Removed FK constraint for migration
  "accountId" text, -- Removed FK constraint for migration
  "ownerId" text,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

-- LISTS
create table lists (
  id text primary key,
  name text,
  kind text,
  "ownerId" text,
  "assignedTo" text,
  "createdBy" text,
  "createdAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

create table list_members (
  id text primary key,
  "listId" text, -- Removed FK constraint for migration
  "targetId" text,
  "targetType" text,
  "addedAt" timestamp with time zone default now()
);

-- SEQUENCES
create table sequences (
  id text primary key,
  name text,
  description text,
  steps jsonb,
  status text,
  "ownerId" text,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

create table sequence_members (
  id text primary key, -- usually combo of sequenceId_contactId
  "sequenceId" text, -- Removed FK constraint for migration
  "targetId" text, -- contactId
  "targetType" text,
  "hasEmail" boolean,
  "skipEmailSteps" boolean,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now()
);

create table sequence_activations (
  id text primary key,
  "sequenceId" text, -- Removed FK constraint for migration
  "contactIds" jsonb,
  status text,
  "processedContacts" int default 0,
  "totalContacts" int default 0,
  "ownerId" text,
  "errorMessage" text,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now()
);

-- ACTIVITIES (Agent & System Logs)
create table activities (
  id text primary key,
  "userId" text, -- Agent email or User ID
  type text, -- 'call', 'email', 'task_completed', etc.
  timestamp timestamp with time zone,
  details jsonb default '{}'::jsonb,
  "createdAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

-- POSTS (CMS/Blog)
create table posts (
  id text primary key,
  title text,
  slug text unique,
  content text, -- HTML or Markdown
  status text, -- 'published', 'draft'
  category text,
  "featuredImage" text,
  "publishDate" timestamp with time zone,
  "authorId" text,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

-- NOTIFICATIONS
create table notifications (
  id text primary key,
  "userId" text,
  "ownerId" text,
  title text,
  message text,
  type text,
  read boolean default false,
  link text,
  data jsonb default '{}'::jsonb,
  "createdAt" timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

-- Indexes
create index idx_accounts_domain on accounts(domain);
create index idx_contacts_email on contacts(email);
create index idx_emails_contact on emails("contactId");
create index idx_emails_status on emails(status);
create index idx_tasks_owner on tasks("ownerId");
create index idx_notifications_user on notifications("userId");
create index idx_activities_user on activities("userId");
create index idx_posts_slug on posts(slug);
create index idx_deals_stage on deals(stage);

-- RLS
alter table users enable row level security;
alter table agents enable row level security;
alter table accounts enable row level security;
alter table contacts enable row level security;
alter table calls enable row level security;
alter table call_logs enable row level security;
alter table call_details enable row level security;
alter table emails enable row level security;
alter table threads enable row level security;
alter table suppressions enable row level security;
alter table tasks enable row level security;
alter table lists enable row level security;
alter table list_members enable row level security;
alter table sequences enable row level security;
alter table sequence_members enable row level security;
alter table sequence_activations enable row level security;
alter table notifications enable row level security;
alter table activities enable row level security;
alter table deals enable row level security;
alter table posts enable row level security;

-- Permissive Policy
create policy "Allow all access" on users for all using (auth.role() = 'authenticated');
create policy "Allow all access" on agents for all using (auth.role() = 'authenticated');
create policy "Allow all access" on accounts for all using (auth.role() = 'authenticated');
create policy "Allow all access" on contacts for all using (auth.role() = 'authenticated');
create policy "Allow all access" on calls for all using (auth.role() = 'authenticated');
create policy "Allow all access" on call_logs for all using (auth.role() = 'authenticated');
create policy "Allow all access" on call_details for all using (auth.role() = 'authenticated');
create policy "Allow all access" on emails for all using (auth.role() = 'authenticated');
create policy "Allow all access" on threads for all using (auth.role() = 'authenticated');
create policy "Allow all access" on suppressions for all using (auth.role() = 'authenticated');
create policy "Allow all access" on tasks for all using (auth.role() = 'authenticated');
create policy "Allow all access" on lists for all using (auth.role() = 'authenticated');
create policy "Allow all access" on list_members for all using (auth.role() = 'authenticated');
create policy "Allow all access" on sequences for all using (auth.role() = 'authenticated');
create policy "Allow all access" on sequence_members for all using (auth.role() = 'authenticated');
create policy "Allow all access" on sequence_activations for all using (auth.role() = 'authenticated');
create policy "Allow all access" on notifications for all using (auth.role() = 'authenticated');
create policy "Allow all access" on activities for all using (auth.role() = 'authenticated');
create policy "Allow all access" on deals for all using (auth.role() = 'authenticated');
create policy "Allow all access" on posts for all using (auth.role() = 'authenticated');
