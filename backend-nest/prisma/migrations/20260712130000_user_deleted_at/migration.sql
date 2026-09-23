-- Add soft-delete column to User to match schema.prisma
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Index declared in schema.prisma (@@index([deletedAt]))
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");
