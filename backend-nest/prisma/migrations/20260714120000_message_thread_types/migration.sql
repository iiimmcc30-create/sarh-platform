-- Separate user DMs from butcher shop chats

CREATE TYPE "MessageThreadType" AS ENUM ('DIRECT', 'BUTCHER');

ALTER TABLE "MessageThread" ADD COLUMN IF NOT EXISTS "type" "MessageThreadType" NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "MessageThread" ADD COLUMN IF NOT EXISTS "butcherId" TEXT;
ALTER TABLE "MessageThread" ADD COLUMN IF NOT EXISTS "scopeKey" TEXT NOT NULL DEFAULT 'direct';

-- Drop old unique pair constraint (name from Prisma default)
DROP INDEX IF EXISTS "MessageThread_participant1_participant2_key";
ALTER TABLE "MessageThread" DROP CONSTRAINT IF EXISTS "MessageThread_participant1_participant2_key";

CREATE UNIQUE INDEX "MessageThread_participant1_participant2_scopeKey_key"
  ON "MessageThread"("participant1", "participant2", "scopeKey");

CREATE INDEX IF NOT EXISTS "MessageThread_type_idx" ON "MessageThread"("type");
CREATE INDEX IF NOT EXISTS "MessageThread_butcherId_idx" ON "MessageThread"("butcherId");

ALTER TABLE "MessageThread"
  DROP CONSTRAINT IF EXISTS "MessageThread_butcherId_fkey";

ALTER TABLE "MessageThread"
  ADD CONSTRAINT "MessageThread_butcherId_fkey"
  FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: threads involving a butcher owner become BUTCHER shop chats
UPDATE "MessageThread" AS mt
SET
  type = 'BUTCHER',
  "butcherId" = b.id,
  "scopeKey" = 'butcher:' || b.id
FROM "Butcher" AS b
WHERE b."deletedAt" IS NULL
  AND (mt.participant1 = b."userId" OR mt.participant2 = b."userId")
  AND mt.type = 'DIRECT';
