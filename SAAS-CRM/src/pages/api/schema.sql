-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- Calls Table
create table if not exists calls (
  id text primary key, -- Using text for Twilio Call SID (e.g. CA...)
  call_sid text not null unique,
  twilio_sid text,
  to_phone text,
  from_phone text,
  status text,
  duration integer default 0,
  duration_sec integer default 0,
  timestamp timestamptz default now(),
  call_time timestamptz default now(),
  outcome text,
  transcript text,
  formatted_transcript text,
  ai_summary text,
  ai_insights jsonb,
  recording_url text,
  recording_channels text,
  recording_track text,
  recording_source text,
  conversational_intelligence jsonb,
  
  -- CRM Links
  account_id text references accounts(id),
  account_name text,
  contact_id text references contacts(id),
  contact_name text,
  
  -- Phone Context
  target_phone text,
  business_phone text,
  source text,
  
  -- Ownership
  owner_id text,
  assigned_to text,
  created_by text,
  agent_email text,
  user_email text,
  
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  
  metadata jsonb -- For any extra fields
);

-- Indexes for performance
create index if not exists calls_timestamp_idx on calls(timestamp desc);
create index if not exists calls_owner_id_idx on calls(owner_id);
create index if not exists calls_contact_id_idx on calls(contact_id);
create index if not exists calls_account_id_idx on calls(account_id);
create index if not exists calls_call_sid_idx on calls(call_sid);
