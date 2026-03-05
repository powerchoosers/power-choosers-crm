-- Migration: Add signature_fields to signature_requests
-- Allows storing dynamic X/Y coordinates for visual signature placement

ALTER TABLE "public"."signature_requests"
ADD COLUMN "signature_fields" JSONB DEFAULT '[]'::jsonb;
