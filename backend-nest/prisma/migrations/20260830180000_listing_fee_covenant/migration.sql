-- Additive listing-fee / covenant fields. Does not drop or recompute existing ListingFee rows.

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "covenantAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "covenantAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "covenantVersion" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "sellerDeclaredSold" BOOLEAN;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "sellerDeclaredSoldAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "ListingFee" ALTER COLUMN "dueDate" DROP NOT NULL;
ALTER TABLE "ListingFee" ADD COLUMN IF NOT EXISTS "saleAmount" DOUBLE PRECISION;
ALTER TABLE "ListingFee" ADD COLUMN IF NOT EXISTS "saleDeclaredAt" TIMESTAMP(3);

-- Unpaid listing-fee must not hide a live listing.
UPDATE "Listing"
SET "status" = 'active'
WHERE "status" = 'pending_fee' AND "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "AdminAccountAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccountAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAccountAction_userId_createdAt_idx" ON "AdminAccountAction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAccountAction_actorId_idx" ON "AdminAccountAction"("actorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminAccountAction_userId_fkey'
  ) THEN
    ALTER TABLE "AdminAccountAction"
      ADD CONSTRAINT "AdminAccountAction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminAccountAction_actorId_fkey'
  ) THEN
    ALTER TABLE "AdminAccountAction"
      ADD CONSTRAINT "AdminAccountAction_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- New enum value in its own statements; used in the follow-up migration.
ALTER TYPE "PaymentReferenceType" ADD VALUE IF NOT EXISTS 'order_commission';
