-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "promoted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN "promotedUntil" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "promotionWeight" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Listing" ADD COLUMN "promotionTier" TEXT;

-- CreateIndex
CREATE INDEX "Listing_promoted_idx" ON "Listing"("promoted");
CREATE INDEX "Listing_promotionWeight_idx" ON "Listing"("promotionWeight");

-- CreateTable
CREATE TABLE "ListingPromotion" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'standard',
    "weight" INTEGER NOT NULL DEFAULT 100,
    "durationDays" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "FeeStatus" NOT NULL DEFAULT 'pending',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "promotedViews" INTEGER NOT NULL DEFAULT 0,
    "baselineViews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingPromotion_listingId_idx" ON "ListingPromotion"("listingId");
CREATE INDEX "ListingPromotion_userId_idx" ON "ListingPromotion"("userId");
CREATE INDEX "ListingPromotion_status_idx" ON "ListingPromotion"("status");
CREATE INDEX "ListingPromotion_expiresAt_idx" ON "ListingPromotion"("expiresAt");
CREATE INDEX "ListingPromotion_tier_idx" ON "ListingPromotion"("tier");

-- AddForeignKey
ALTER TABLE "ListingPromotion" ADD CONSTRAINT "ListingPromotion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListingPromotion" ADD CONSTRAINT "ListingPromotion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "PaymentReferenceType" ADD VALUE 'promoted_ad';
