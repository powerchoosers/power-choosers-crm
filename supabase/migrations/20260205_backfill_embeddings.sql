-- Migration: Backfill Embeddings for Existing Records
-- Description: Trigger embedding generation for all accounts, contacts, and emails

-- This migration will trigger the embedding generation for all existing records
-- by updating their updated_at timestamp (or created_at if no updated_at exists)

-- For accounts: Update all records to trigger the embed_accounts_on_update trigger
-- We use a dummy update that doesn't actually change data but fires the trigger
UPDATE accounts
SET name = name
WHERE embedding IS NULL OR embedding IS NOT NULL;

-- For contacts: Update all records to trigger the embed_contacts_on_update trigger  
UPDATE contacts
SET "firstName" = "firstName"
WHERE embedding IS NULL OR embedding IS NOT NULL;

-- For emails: Update all records to trigger the embed_emails_on_update trigger
UPDATE emails
SET subject = subject
WHERE embedding IS NULL OR embedding IS NOT NULL;

-- Note: Calls will be handled automatically when transcripts are added in the future
-- The trigger embed_calls_on_insert will fire when new calls with transcripts are created
