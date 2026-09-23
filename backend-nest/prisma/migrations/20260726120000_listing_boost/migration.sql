-- Listing boost (تمييز / تثبيت): schema was in Prisma but never migrated

-- CreateEnum
CREATE TYPE "BoostType" AS ENUM ('featured', 'pinned');

-- AlterEnum
ALTER TYPE "PaymentReferenceType" ADD VALUE 'featured_ad';
ALTER TYPE "PaymentReferenceType" ADD VALUE 'pinned_ad';
ALTER TYPE "PaymentReferenceType" ADD VALUE 'commission';

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "featuredUntil" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "pinnedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ListingBoost" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boostType" "BoostType" NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "FeeStatus" NOT NULL DEFAULT 'pending',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingBoost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Listing_pinned_idx" ON "Listing"("pinned");
CREATE INDEX IF NOT EXISTS "ListingBoost_listingId_idx" ON "ListingBoost"("listingId");
CREATE INDEX IF NOT EXISTS "ListingBoost_userId_idx" ON "ListingBoost"("userId");
CREATE INDEX IF NOT EXISTS "ListingBoost_status_idx" ON "ListingBoost"("status");
CREATE INDEX IF NOT EXISTS "ListingBoost_expiresAt_idx" ON "ListingBoost"("expiresAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ListingBoost" ADD CONSTRAINT "ListingBoost_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ListingBoost" ADD CONSTRAINT "ListingBoost_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
