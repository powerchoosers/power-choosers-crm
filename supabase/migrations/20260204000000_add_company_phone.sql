-- Add companyPhone column to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "companyPhone" text;

-- Backfill from metadata if available
UPDATE contacts
SET "companyPhone" = metadata->>'companyPhone'
WHERE "companyPhone" IS NULL AND metadata->>'companyPhone' IS NOT NULL;
