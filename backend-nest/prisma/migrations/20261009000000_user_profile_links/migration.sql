-- Profile links (X-style links under the bio): one nullable JSONB column on
-- "User". Additive only; no existing data is touched. NULL = never set (the API
-- falls back to the legacy "website" column). Re-runnable.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileLinks" JSONB;
