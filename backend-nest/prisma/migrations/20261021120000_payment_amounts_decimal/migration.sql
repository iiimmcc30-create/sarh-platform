-- Money columns were PostgreSQL double precision (Prisma Float). Binary
-- fractions (19.99 stored as 19.989999…) are collapsed to halalas with ROUND
-- before the type change, so existing charged amounts stay the value the
-- application already compared in cents. Not a reset; no rows are deleted.

ALTER TABLE "Plan"
  ALTER COLUMN "monthlyPrice" TYPE DECIMAL(12,2) USING ROUND("monthlyPrice"::numeric, 2),
  ALTER COLUMN "yearlyPrice" TYPE DECIMAL(12,2) USING ROUND("yearlyPrice"::numeric, 2),
  ALTER COLUMN "yearlyDiscount" TYPE DECIMAL(12,2) USING ROUND("yearlyDiscount"::numeric, 2);

ALTER TABLE "Payment"
  ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "ListingBoost"
  ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "ListingPromotion"
  ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "ListingFee"
  ALTER COLUMN "price" TYPE DECIMAL(12,2) USING ROUND("price"::numeric, 2),
  ALTER COLUMN "commission" TYPE DECIMAL(12,2) USING ROUND("commission"::numeric, 2),
  ALTER COLUMN "saleAmount" TYPE DECIMAL(12,2) USING ROUND("saleAmount"::numeric, 2);

ALTER TABLE "ListingOffer"
  ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING ROUND("amount"::numeric, 2);
