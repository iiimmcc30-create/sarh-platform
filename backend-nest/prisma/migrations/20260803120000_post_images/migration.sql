-- Add multiple images support for posts
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill from legacy single image column
UPDATE "Post"
SET "images" = ARRAY["image"]
WHERE "image" IS NOT NULL
  AND cardinality("images") = 0;
