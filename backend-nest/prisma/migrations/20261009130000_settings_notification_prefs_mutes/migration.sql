-- Settings redesign: per-type push preferences + muted accounts.
-- Additive only, no existing data touched, re-runnable.
--   1) "User"."notificationPrefs" JSONB NULL (NULL / missing key = on).
--   2) "UserMute" table (muter hides the muted user's posts/stories in feeds).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;

CREATE TABLE IF NOT EXISTS "UserMute" (
    "id" TEXT NOT NULL,
    "muterId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserMute_muterId_mutedId_key" ON "UserMute"("muterId", "mutedId");
CREATE INDEX IF NOT EXISTS "UserMute_muterId_idx" ON "UserMute"("muterId");
CREATE INDEX IF NOT EXISTS "UserMute_mutedId_idx" ON "UserMute"("mutedId");

DO $$ BEGIN
  ALTER TABLE "UserMute" ADD CONSTRAINT "UserMute_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "UserMute" ADD CONSTRAINT "UserMute_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
