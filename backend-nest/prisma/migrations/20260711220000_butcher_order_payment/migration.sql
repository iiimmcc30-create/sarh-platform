-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('unpaid', 'paid', 'failed', 'refunded');

-- AlterEnum
ALTER TYPE "PaymentReferenceType" ADD VALUE 'butcher_order';

-- AlterTable
ALTER TABLE "ButcherOrder" ADD COLUMN "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'unpaid',
ADD COLUMN "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ButcherOrder_paymentStatus_idx" ON "ButcherOrder"("paymentStatus");
