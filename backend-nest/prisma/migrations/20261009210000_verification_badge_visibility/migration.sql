-- «التوثيق» hub: subscriber visibility preferences.
-- Additive only: two NOT NULL booleans with a false default (existing rows
-- keep showing the badge and the «بائع ذهبي» label exactly as before).
-- Re-runnable (IF NOT EXISTS).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hideVerifiedBadge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hideGoldSellerLabel" BOOLEAN NOT NULL DEFAULT false;
