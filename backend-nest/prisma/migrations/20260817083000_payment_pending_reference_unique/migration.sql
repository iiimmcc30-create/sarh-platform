-- Archive duplicate pending payments before adding the partial unique index.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "referenceId", "referenceType"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Payment"
  WHERE status = 'pending'
    AND "referenceId" IS NOT NULL
    AND "referenceType" IS NOT NULL
)
UPDATE "Payment" p
SET
  status = 'failed',
  "updatedAt" = NOW(),
  metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
    'archivedAt', NOW(),
    'archiveReason', 'duplicate_pending_payment_migration'
  )
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX "Payment_userId_referenceId_referenceType_pending_key"
ON "Payment" ("userId", "referenceId", "referenceType")
WHERE status = 'pending'
  AND "referenceId" IS NOT NULL
  AND "referenceType" IS NOT NULL;
