-- Backfill from nested metadata (general)
UPDATE contacts
SET "workPhone" = metadata->'general'->>'workDirectPhone'
WHERE "workPhone" IS NULL AND metadata->'general'->>'workDirectPhone' IS NOT NULL;

UPDATE contacts
SET "mobile" = metadata->'general'->>'mobile'
WHERE "mobile" IS NULL AND metadata->'general'->>'mobile' IS NOT NULL;

UPDATE contacts
SET "otherPhone" = metadata->'general'->>'otherPhone'
WHERE "otherPhone" IS NULL AND metadata->'general'->>'otherPhone' IS NOT NULL;

-- Backfill from nested metadata (contact)
UPDATE contacts
SET "mobile" = metadata->'contact'->>'mobile'
WHERE "mobile" IS NULL AND metadata->'contact'->>'mobile' IS NOT NULL;
