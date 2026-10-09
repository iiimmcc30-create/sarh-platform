-- Apple In-App Purchase / Google Play Billing (native digital services).
-- Additive only: two new tables, two enums, two PaymentMethod values.
-- No existing row or N-Genius code path is changed.

-- CreateEnum
CREATE TYPE "StorePlatform" AS ENUM ('app_store', 'google_play');

-- CreateEnum
CREATE TYPE "StorePurchaseStatus" AS ENUM ('processing', 'active', 'expired', 'revoked', 'failed');

-- AlterEnum (PostgreSQL 12+: new values are not used inside this migration)
ALTER TYPE "PaymentMethod" ADD VALUE 'app_store';
ALTER TYPE "PaymentMethod" ADD VALUE 'google_play';

-- CreateTable
CREATE TABLE "StorePurchase" (
    "id" TEXT NOT NULL,
    "platform" "StorePlatform" NOT NULL,
    "productId" TEXT NOT NULL,
    "productKind" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "originalTransactionId" TEXT,
    "purchaseToken" TEXT,
    "userId" TEXT NOT NULL,
    "status" "StorePurchaseStatus" NOT NULL DEFAULT 'processing',
    "autoRenew" BOOLEAN,
    "environment" TEXT,
    "listingId" TEXT,
    "paymentId" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreNotification" (
    "id" TEXT NOT NULL,
    "platform" "StorePlatform" NOT NULL,
    "notificationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "transactionId" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorePurchase_paymentId_key" ON "StorePurchase"("paymentId");

-- CreateIndex
CREATE INDEX "StorePurchase_userId_idx" ON "StorePurchase"("userId");

-- CreateIndex
CREATE INDEX "StorePurchase_originalTransactionId_idx" ON "StorePurchase"("originalTransactionId");

-- CreateIndex
CREATE INDEX "StorePurchase_purchaseToken_idx" ON "StorePurchase"("purchaseToken");

-- CreateIndex
CREATE INDEX "StorePurchase_status_idx" ON "StorePurchase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StorePurchase_platform_transactionId_key" ON "StorePurchase"("platform", "transactionId");

-- CreateIndex
CREATE INDEX "StoreNotification_transactionId_idx" ON "StoreNotification"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreNotification_platform_notificationId_key" ON "StoreNotification"("platform", "notificationId");

-- AddForeignKey
ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

