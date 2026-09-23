-- Reclassify existing butcher-order ledger rows. Leaves listing `commission` payments untouched.
UPDATE "Payment"
SET "referenceType" = 'order_commission'
WHERE "referenceType" = 'commission'
  AND (
    "orderId" LIKE 'BOC-%'
    OR COALESCE("metadata"->>'kind', '') = 'butcher_order_commission'
  );
