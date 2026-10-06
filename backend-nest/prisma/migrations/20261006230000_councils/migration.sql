-- «المجالس» (Voice Councils): new enums/tables only. No existing table is altered;
-- every foreign key lives on the new tables and points at "User" / "Council".
-- Written to be re-runnable (IF NOT EXISTS / guarded DO blocks).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CouncilVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CouncilStatus" AS ENUM ('LIVE', 'ENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CouncilMemberRole" AS ENUM ('OWNER', 'MODERATOR', 'SPEAKER', 'LISTENER', 'BANNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CouncilSpeakRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Council" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "CouncilVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "CouncilStatus" NOT NULL DEFAULT 'LIVE',
    "agoraChannelName" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "modCanManageRequests" BOOLEAN NOT NULL DEFAULT true,
    "modCanMute" BOOLEAN NOT NULL DEFAULT true,
    "modCanRemove" BOOLEAN NOT NULL DEFAULT true,
    "modCanBan" BOOLEAN NOT NULL DEFAULT false,
    "hostLastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Council_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CouncilMember" (
    "id" TEXT NOT NULL,
    "councilId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CouncilMemberRole" NOT NULL DEFAULT 'LISTENER',
    "seatIndex" INTEGER,
    "micMuted" BOOLEAN NOT NULL DEFAULT true,
    "mutedByModerator" BOOLEAN NOT NULL DEFAULT false,
    "rulesAcceptedAt" TIMESTAMP(3),
    "kickedUntil" TIMESTAMP(3),
    "bannedAt" TIMESTAMP(3),
    "bannedById" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CouncilSpeakRequest" (
    "id" TEXT NOT NULL,
    "councilId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CouncilSpeakRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CouncilSpeakRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CouncilInvite" (
    "id" TEXT NOT NULL,
    "councilId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouncilInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Council_agoraChannelName_key" ON "Council"("agoraChannelName");
CREATE UNIQUE INDEX IF NOT EXISTS "Council_inviteCode_key" ON "Council"("inviteCode");
CREATE INDEX IF NOT EXISTS "Council_ownerId_status_idx" ON "Council"("ownerId", "status");
CREATE INDEX IF NOT EXISTS "Council_status_visibility_startedAt_idx" ON "Council"("status", "visibility", "startedAt");
CREATE INDEX IF NOT EXISTS "CouncilMember_userId_idx" ON "CouncilMember"("userId");
CREATE INDEX IF NOT EXISTS "CouncilMember_councilId_role_idx" ON "CouncilMember"("councilId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "CouncilMember_councilId_userId_key" ON "CouncilMember"("councilId", "userId");
-- One member per seat (NULL seatIndex = not on stage; Postgres allows many NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS "CouncilMember_councilId_seatIndex_key" ON "CouncilMember"("councilId", "seatIndex");
CREATE INDEX IF NOT EXISTS "CouncilSpeakRequest_councilId_status_createdAt_idx" ON "CouncilSpeakRequest"("councilId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CouncilSpeakRequest_userId_idx" ON "CouncilSpeakRequest"("userId");
CREATE INDEX IF NOT EXISTS "CouncilInvite_userId_idx" ON "CouncilInvite"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CouncilInvite_councilId_userId_key" ON "CouncilInvite"("councilId", "userId");

-- 12-seat stage: seats are 0..11, so together with the unique index above no council
-- can ever hold a 13th speaker, even if application logic were bypassed.
DO $$ BEGIN
  ALTER TABLE "CouncilMember" ADD CONSTRAINT "CouncilMember_seatIndex_range"
    CHECK ("seatIndex" IS NULL OR ("seatIndex" >= 0 AND "seatIndex" <= 11));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Council" ADD CONSTRAINT "Council_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouncilMember" ADD CONSTRAINT "CouncilMember_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouncilMember" ADD CONSTRAINT "CouncilMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouncilSpeakRequest" ADD CONSTRAINT "CouncilSpeakRequest_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouncilSpeakRequest" ADD CONSTRAINT "CouncilSpeakRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouncilInvite" ADD CONSTRAINT "CouncilInvite_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouncilInvite" ADD CONSTRAINT "CouncilInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
