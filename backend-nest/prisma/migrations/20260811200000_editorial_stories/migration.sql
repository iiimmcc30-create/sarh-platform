-- CreateTable
CREATE TABLE IF NOT EXISTS "EditorialStory" (
    "id" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 20,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "EditorialStory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EditorialStory_deletedAt_idx" ON "EditorialStory"("deletedAt");
CREATE INDEX IF NOT EXISTS "EditorialStory_isActive_sortOrder_idx" ON "EditorialStory"("isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "EditorialStory_publishedAt_idx" ON "EditorialStory"("publishedAt");
CREATE INDEX IF NOT EXISTS "EditorialStory_createdAt_idx" ON "EditorialStory"("createdAt");
