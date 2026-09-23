-- AlterTable
ALTER TABLE "ContentSection" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "ContentSection" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ContentSectionVersion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentSectionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ContentSectionVersion_sectionId_version_key" ON "ContentSectionVersion"("sectionId", "version");
CREATE INDEX IF NOT EXISTS "ContentSectionVersion_sectionId_idx" ON "ContentSectionVersion"("sectionId");
CREATE INDEX IF NOT EXISTS "ContentSection_isActive_sortOrder_idx" ON "ContentSection"("isActive", "sortOrder");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ContentSectionVersion"
    ADD CONSTRAINT "ContentSectionVersion_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "ContentSection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
