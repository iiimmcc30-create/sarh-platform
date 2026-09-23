-- Listing public comments (visible to all, like post comments)
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "commentsCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ListingComment" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ListingComment_listingId_idx" ON "ListingComment"("listingId");

DO $$ BEGIN
  ALTER TABLE "ListingComment" ADD CONSTRAINT "ListingComment_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ListingComment" ADD CONSTRAINT "ListingComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
