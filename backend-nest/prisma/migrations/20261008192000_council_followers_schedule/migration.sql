-- «المجالس» subscriber perks (additive only):
--   * followersOnly (Gold hosts): only followers / invited users may join.
--   * SCHEDULED status + scheduledFor (Blue+ / Gold hosts) and «ذكّرني»
--     reminders (new CouncilReminder table), notified once at start.
-- New nullable / defaulted columns, one new enum value and one new table.
-- Re-runnable (IF NOT EXISTS / guarded DO blocks).

-- New enum value (not used inside this migration).
ALTER TYPE "CouncilStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';

ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "followersOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "remindersSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Council_status_scheduledFor_idx" ON "Council"("status", "scheduledFor");

CREATE TABLE IF NOT EXISTS "CouncilReminder" (
    "id" TEXT NOT NULL,
    "councilId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouncilReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CouncilReminder_councilId_userId_key" ON "CouncilReminder"("councilId", "userId");
CREATE INDEX IF NOT EXISTS "CouncilReminder_userId_idx" ON "CouncilReminder"("userId");

DO $$ BEGIN
  ALTER TABLE "CouncilReminder" ADD CONSTRAINT "CouncilReminder_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouncilReminder" ADD CONSTRAINT "CouncilReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
