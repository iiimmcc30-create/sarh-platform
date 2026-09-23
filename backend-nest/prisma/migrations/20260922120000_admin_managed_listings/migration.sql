-- Admin-managed listings: real Listing rows with no User account.
CREATE TYPE "ListingOrigin" AS ENUM ('USER', 'ADMIN_MANAGED');

ALTER TABLE "Listing" ADD COLUMN "origin" "ListingOrigin" NOT NULL DEFAULT 'USER';
ALTER TABLE "Listing" ADD COLUMN "displayUsername" TEXT;
ALTER TABLE "Listing" ADD COLUMN "displaySellerName" TEXT;
ALTER TABLE "Listing" ADD COLUMN "displayPhone" TEXT;
ALTER TABLE "Listing" ADD COLUMN "displayRegion" TEXT;

ALTER TABLE "Listing" ALTER COLUMN "sellerId" DROP NOT NULL;

CREATE INDEX "Listing_origin_idx" ON "Listing"("origin");

-- Existing rows stay USER with sellerId set and display fields null.
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_origin_identity_check" CHECK (
  (
    "origin" = 'USER'
    AND "sellerId" IS NOT NULL
    AND "displayUsername" IS NULL
    AND "displaySellerName" IS NULL
    AND "displayPhone" IS NULL
    AND "displayRegion" IS NULL
  )
  OR
  (
    "origin" = 'ADMIN_MANAGED'
    AND "sellerId" IS NULL
    AND "displayUsername" IS NOT NULL
    AND length(btrim("displayUsername")) > 0
    AND "displaySellerName" IS NOT NULL
    AND length(btrim("displaySellerName")) > 0
    AND "displayPhone" IS NOT NULL
    AND length(btrim("displayPhone")) > 0
    AND "displayRegion" IS NOT NULL
    AND length(btrim("displayRegion")) > 0
    AND "contactPhone" IS NOT NULL
    AND "contactPhone" = "displayPhone"
    AND "location" = "displayRegion"
    AND "arabicLocation" = "displayRegion"
  )
);
