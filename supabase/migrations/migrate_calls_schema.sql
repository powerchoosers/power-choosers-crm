-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- Rename columns if they exist in camelCase
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='callSid') THEN
    ALTER TABLE calls RENAME COLUMN "callSid" TO call_sid;
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='from') THEN
    ALTER TABLE calls RENAME COLUMN "from" TO from_phone;
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='to') THEN
    ALTER TABLE calls RENAME COLUMN "to" TO to_phone;
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='recordingUrl') THEN
    ALTER TABLE calls RENAME COLUMN "recordingUrl" TO recording_url;
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='aiInsights') THEN
    ALTER TABLE calls RENAME COLUMN "aiInsights" TO ai_insights;
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='accountId') THEN
    ALTER TABLE calls RENAME COLUMN "accountId" TO account_id;
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='contactId') THEN
    ALTER TABLE calls RENAME COLUMN "contactId" TO contact_id;
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='createdAt') THEN
    ALTER TABLE calls RENAME COLUMN "createdAt" TO created_at;
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calls' AND column_name='summary') THEN
    ALTER TABLE calls RENAME COLUMN "summary" TO ai_summary;
  END IF;
END $$;

-- Add missing columns
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_sid text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_sec integer default 0;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_time timestamptz default now();
ALTER TABLE calls ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS formatted_transcript text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_channels text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_track text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_source text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS conversational_intelligence jsonb;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS target_phone text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS business_phone text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_email text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();

-- Create Indexes (if not exists is safe)
create index if not exists calls_timestamp_idx on calls(timestamp desc);
create index if not exists calls_owner_id_idx on calls(owner_id);
create index if not exists calls_contact_id_idx on calls(contact_id);
create index if not exists calls_account_id_idx on calls(account_id);
create index if not exists calls_call_sid_idx on calls(call_sid);
