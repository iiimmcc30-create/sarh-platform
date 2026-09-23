-- Payment-first butcher checkout: hold inventory without a Final ButcherOrder
-- until N-Genius confirms. Legacy unpaid ButcherOrder rows are unchanged.

ALTER TYPE "PaymentReferenceType" ADD VALUE IF NOT EXISTS 'butcher_checkout';

CREATE TYPE "ButcherCheckoutStatus" AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'expired');

CREATE TYPE "ButcherReservationStatus" AS ENUM ('held', 'converted', 'released');

CREATE TABLE "ButcherCheckout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" "ButcherCheckoutStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deliveryType" TEXT NOT NULL DEFAULT 'pickup',
    "deliveryAddress" TEXT,
    "notes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "itemsSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButcherCheckout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ButcherCheckoutReservation" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" "ButcherReservationStatus" NOT NULL DEFAULT 'held',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ButcherCheckoutReservation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ButcherOrder" ADD COLUMN "checkoutId" TEXT;
ALTER TABLE "ButcherOrder" ADD COLUMN "paymentId" TEXT;

CREATE UNIQUE INDEX "ButcherCheckout_paymentId_key" ON "ButcherCheckout"("paymentId");
CREATE INDEX "ButcherCheckout_userId_status_idx" ON "ButcherCheckout"("userId", "status");
CREATE INDEX "ButcherCheckout_butcherId_status_idx" ON "ButcherCheckout"("butcherId", "status");
CREATE INDEX "ButcherCheckout_status_expiresAt_idx" ON "ButcherCheckout"("status", "expiresAt");

-- One active payment-first attempt per customer+butcher (prevents double holds on retry races).
CREATE UNIQUE INDEX "ButcherCheckout_userId_butcherId_pending_key"
ON "ButcherCheckout" ("userId", "butcherId")
WHERE status = 'pending';

CREATE INDEX "ButcherCheckoutReservation_checkoutId_idx" ON "ButcherCheckoutReservation"("checkoutId");
CREATE INDEX "ButcherCheckoutReservation_userId_status_idx" ON "ButcherCheckoutReservation"("userId", "status");
CREATE INDEX "ButcherCheckoutReservation_productId_status_idx" ON "ButcherCheckoutReservation"("productId", "status");
CREATE INDEX "ButcherCheckoutReservation_status_expiresAt_idx" ON "ButcherCheckoutReservation"("status", "expiresAt");

CREATE UNIQUE INDEX "ButcherOrder_checkoutId_key" ON "ButcherOrder"("checkoutId");
CREATE UNIQUE INDEX "ButcherOrder_paymentId_key" ON "ButcherOrder"("paymentId");

ALTER TABLE "ButcherCheckout" ADD CONSTRAINT "ButcherCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ButcherCheckout" ADD CONSTRAINT "ButcherCheckout_butcherId_fkey" FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ButcherCheckout" ADD CONSTRAINT "ButcherCheckout_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ButcherCheckoutReservation" ADD CONSTRAINT "ButcherCheckoutReservation_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "ButcherCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ButcherCheckoutReservation" ADD CONSTRAINT "ButcherCheckoutReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ButcherCheckoutReservation" ADD CONSTRAINT "ButcherCheckoutReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ButcherProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ButcherOrder" ADD CONSTRAINT "ButcherOrder_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "ButcherCheckout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ButcherOrder" ADD CONSTRAINT "ButcherOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
