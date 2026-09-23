-- Last successful name/username change. Nullable so existing users can change immediately.
-- No backfill and no DEFAULT — a timestamp here starts a cooldown.
ALTER TABLE "User" ADD COLUMN "nameChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);
