-- Listing comment replies (one level): nullable self-relation + index.
-- Additive only, no existing data touched, re-runnable.
--   "ListingComment"."parentId" TEXT NULL → "ListingComment"("id"), ON DELETE CASCADE
--   (deleting a comment removes its replies).

ALTER TABLE "ListingComment" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

CREATE INDEX IF NOT EXISTS "ListingComment_parentId_idx" ON "ListingComment"("parentId");

DO $$ BEGIN
  ALTER TABLE "ListingComment" ADD CONSTRAINT "ListingComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ListingComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
