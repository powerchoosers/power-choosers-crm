ALTER TABLE "public"."sequences" ADD COLUMN IF NOT EXISTS "bgvector" jsonb DEFAULT '{}'::jsonb;
