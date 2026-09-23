-- CreateTable
CREATE TABLE "ButcherOrderItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cutType" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "linePrice" DOUBLE PRECISION NOT NULL,
    "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ButcherOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ButcherOrderItem_orderId_idx" ON "ButcherOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "ButcherOrderItem_productId_idx" ON "ButcherOrderItem"("productId");

-- AddForeignKey
ALTER TABLE "ButcherOrderItem" ADD CONSTRAINT "ButcherOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ButcherOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherOrderItem" ADD CONSTRAINT "ButcherOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ButcherProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one item per existing order (preserves all legacy order data on header)
INSERT INTO "ButcherOrderItem" (
    "orderId",
    "productId",
    "cutType",
    "weightKg",
    "linePrice",
    "reservedQuantity"
)
SELECT
    o."id",
    o."productId",
    o."cutType",
    o."weightKg",
    o."totalPrice",
    o."reservedQuantity"
FROM "ButcherOrder" o
WHERE NOT EXISTS (
    SELECT 1 FROM "ButcherOrderItem" i WHERE i."orderId" = o."id"
);
