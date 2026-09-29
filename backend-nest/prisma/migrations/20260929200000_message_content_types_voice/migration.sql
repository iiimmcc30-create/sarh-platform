-- Additive, non-destructive: official message content types (incl. VOICE) + media metadata.
-- No rows are deleted or rewritten except the type backfill below, which only
-- classifies existing image/video messages (their URL columns are untouched).

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'VOICE');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "type" "MessageContentType" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "Message" ADD COLUMN "audioUrl" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaDurationMs" INTEGER;
ALTER TABLE "Message" ADD COLUMN "mediaMimeType" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaSizeBytes" INTEGER;

-- Backfill kind for legacy media rows (metadata only).
UPDATE "Message" SET "type" = 'VIDEO' WHERE "videoUrl" IS NOT NULL AND "type" = 'TEXT';
UPDATE "Message" SET "type" = 'IMAGE' WHERE "imageUrl" IS NOT NULL AND "videoUrl" IS NULL AND "type" = 'TEXT';
