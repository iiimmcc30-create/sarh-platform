-- Production-safe upgrade for butcher order management

-- 1) Product inventory reservation fields
ALTER TABLE "ButcherProduct"
  ADD COLUMN "availableQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill available quantity from existing weight ranges when possible
UPDATE "ButcherProduct"
SET "availableQuantity" = COALESCE(NULLIF("weightMax", 0), NULLIF("weightMin", 0), 0)
WHERE "availableQuantity" = 0;

-- 2) Order table enhancements
ALTER TABLE "ButcherOrder"
  ADD COLUMN "orderNumber" TEXT,
  ADD COLUMN "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "cancelledBy" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

UPDATE "ButcherOrder"
SET "reservedQuantity" = GREATEST(COALESCE("weightKg", 0), 0)
WHERE "reservedQuantity" = 0;

-- 3) New operational tables
CREATE TABLE "OrderTimeline" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderTimeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderStatusAudit" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "previousStatus" "OrderStatus" NOT NULL,
  "newStatus" "OrderStatus" NOT NULL,
  "changedBy" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderNumberSequence" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderNumberSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderNumberSequence_year_key" ON "OrderNumberSequence"("year");
CREATE INDEX "OrderTimeline_orderId_createdAt_idx" ON "OrderTimeline"("orderId", "createdAt");
CREATE INDEX "OrderStatusAudit_orderId_changedAt_idx" ON "OrderStatusAudit"("orderId", "changedAt");
CREATE INDEX "OrderStatusAudit_changedBy_changedAt_idx" ON "OrderStatusAudit"("changedBy", "changedAt");

ALTER TABLE "OrderTimeline"
  ADD CONSTRAINT "OrderTimeline_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ButcherOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderStatusAudit"
  ADD CONSTRAINT "OrderStatusAudit_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ButcherOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Backfill order numbers for existing records
INSERT INTO "OrderNumberSequence" ("id", "year", "lastNumber", "updatedAt")
SELECT
  'seq-' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint::text || '-' || floor(random() * 1000000)::text,
  EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::int,
  COUNT(*)::int,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "OrderNumberSequence"
  WHERE "year" = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::int
);

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "ButcherOrder"
)
UPDATE "ButcherOrder" o
SET "orderNumber" = 'ORD-' || EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::int || '-' || LPAD(ordered.rn::text, 6, '0')
FROM ordered
WHERE o.id = ordered.id
  AND o."orderNumber" IS NULL;

ALTER TABLE "ButcherOrder"
  ALTER COLUMN "orderNumber" SET NOT NULL;

CREATE UNIQUE INDEX "ButcherOrder_orderNumber_key" ON "ButcherOrder"("orderNumber");
CREATE INDEX "ButcherOrder_orderNumber_idx" ON "ButcherOrder"("orderNumber");

-- 5) Initial timeline events for existing orders
INSERT INTO "OrderTimeline" ("id", "orderId", "status", "note", "createdBy", "createdAt")
SELECT
  'tl-' || o.id,
  o.id,
  o.status,
  'Backfilled initial timeline event',
  COALESCE(o."customerId", 'system'),
  o."createdAt"
FROM "ButcherOrder" o
WHERE NOT EXISTS (
  SELECT 1 FROM "OrderTimeline" t WHERE t."orderId" = o.id
);
