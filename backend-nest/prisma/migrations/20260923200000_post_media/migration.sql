-- CreateEnum
CREATE TYPE "PostMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "PostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "PostMediaType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostMedia_postId_sortOrder_idx" ON "PostMedia"("postId", "sortOrder");

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill image-only rows so existing posts expose ordered PostMedia
INSERT INTO "PostMedia" ("id", "postId", "url", "type", "sortOrder", "createdAt", "updatedAt")
SELECT
  'pm_' || p."id" || '_' || t.ord::text,
  p."id",
  t.img,
  'IMAGE',
  (t.ord - 1),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Post" p
CROSS JOIN LATERAL unnest(p."images") WITH ORDINALITY AS t(img, ord)
WHERE cardinality(p."images") > 0
  AND t.img IS NOT NULL
  AND length(trim(t.img)) > 0;

INSERT INTO "PostMedia" ("id", "postId", "url", "type", "sortOrder", "createdAt", "updatedAt")
SELECT
  'pm_' || p."id" || '_img',
  p."id",
  p."image",
  'IMAGE',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Post" p
WHERE p."image" IS NOT NULL
  AND length(trim(p."image")) > 0
  AND cardinality(p."images") = 0
  AND NOT EXISTS (
    SELECT 1 FROM "PostMedia" m WHERE m."postId" = p."id"
  );
