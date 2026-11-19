-- Additive: @mention rows and a notification type. No existing rows are rewritten.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'mention';

CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "mentionedId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mention_entityType_entityId_mentionedId_key" ON "Mention"("entityType", "entityId", "mentionedId");
CREATE INDEX "Mention_mentionedId_createdAt_idx" ON "Mention"("mentionedId", "createdAt");
CREATE INDEX "Mention_actorId_idx" ON "Mention"("actorId");

ALTER TABLE "Mention" ADD CONSTRAINT "Mention_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_mentionedId_fkey" FOREIGN KEY ("mentionedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
