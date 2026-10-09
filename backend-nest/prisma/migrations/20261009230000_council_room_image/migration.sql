-- «المجالس» «عرض صورة» (Gold): the image currently shown at the top of a council.
-- Additive only: nullable columns, no backfill, no constraints on existing rows.
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "imageListingId" TEXT;
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "imageById" TEXT;
ALTER TABLE "Council" ADD COLUMN IF NOT EXISTS "imageAt" TIMESTAMP(3);
