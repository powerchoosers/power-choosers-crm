ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "otherPhone" text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "primaryPhoneField" text DEFAULT 'mobile';

-- Backfill from metadata
UPDATE contacts
SET "otherPhone" = metadata->>'otherPhone'
WHERE "otherPhone" IS NULL AND metadata->>'otherPhone' IS NOT NULL;

UPDATE contacts
SET "workPhone" = metadata->>'workDirectPhone'
WHERE "workPhone" IS NULL AND metadata->>'workDirectPhone' IS NOT NULL;

UPDATE contacts
SET "mobile" = metadata->>'mobile'
WHERE "mobile" IS NULL AND metadata->>'mobile' IS NOT NULL;
