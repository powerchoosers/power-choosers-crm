-- Add unique constraint to esid column in meters table
ALTER TABLE meters ADD CONSTRAINT meters_esid_key UNIQUE (esid);
