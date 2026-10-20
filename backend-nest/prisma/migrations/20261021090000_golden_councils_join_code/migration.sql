ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "joinCode" TEXT;
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "golden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "goldenGrantedAt" TIMESTAMP(3);
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "goldenGrantedById" TEXT;
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "stageImages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "stageIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CouncilMember" ADD COLUMN IF NOT EXISTS "cameraAllowed" BOOLEAN NOT NULL DEFAULT false;

-- Existing private councils keep working: their join code is the old invite code.
UPDATE "Council" SET "joinCode" = "inviteCode" WHERE "visibility" = 'PRIVATE' AND "joinCode" IS NULL;

ALTER TABLE "CouncilInvite" ADD COLUMN IF NOT EXISTS "oneTime" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "CouncilCodeRequestStatus" AS ENUM ('PENDING', 'INVITED', 'CODE_SENT', 'IGNORED');

CREATE TABLE "CouncilCodeRequest" (
    "id" TEXT NOT NULL,
    "councilId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CouncilCodeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    CONSTRAINT "CouncilCodeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CouncilCodeRequest_councilId_userId_key" ON "CouncilCodeRequest"("councilId", "userId");
CREATE INDEX "CouncilCodeRequest_councilId_status_createdAt_idx" ON "CouncilCodeRequest"("councilId", "status", "createdAt");

ALTER TABLE "CouncilCodeRequest" ADD CONSTRAINT "CouncilCodeRequest_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouncilCodeRequest" ADD CONSTRAINT "CouncilCodeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
