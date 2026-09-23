-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAI" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "KnowledgeSourceType" AS ENUM ('RSS', 'API');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "KnowledgeSourceType" NOT NULL DEFAULT 'RSS',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "originalTitle" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "summary" TEXT,
    "titleAr" TEXT,
    "publishedAt" TIMESTAMP(3),
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'PENDING',
    "postId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KnowledgeSyncLog" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeArticle_originalUrl_key" ON "KnowledgeArticle"("originalUrl");
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeArticle_postId_key" ON "KnowledgeArticle"("postId");
CREATE INDEX IF NOT EXISTS "KnowledgeSource_enabled_idx" ON "KnowledgeSource"("enabled");
CREATE INDEX IF NOT EXISTS "KnowledgeSource_type_idx" ON "KnowledgeSource"("type");
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_sourceId_idx" ON "KnowledgeArticle"("sourceId");
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_status_idx" ON "KnowledgeArticle"("status");
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_publishedAt_idx" ON "KnowledgeArticle"("publishedAt");
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_createdAt_idx" ON "KnowledgeArticle"("createdAt");
CREATE INDEX IF NOT EXISTS "KnowledgeSyncLog_createdAt_idx" ON "KnowledgeSyncLog"("createdAt");
CREATE INDEX IF NOT EXISTS "KnowledgeSyncLog_sourceId_idx" ON "KnowledgeSyncLog"("sourceId");
CREATE INDEX IF NOT EXISTS "KnowledgeSyncLog_level_idx" ON "KnowledgeSyncLog"("level");

DO $$ BEGIN
  ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeSyncLog" ADD CONSTRAINT "KnowledgeSyncLog_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
