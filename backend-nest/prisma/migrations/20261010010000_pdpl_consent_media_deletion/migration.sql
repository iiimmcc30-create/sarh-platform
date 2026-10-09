-- PDPL: consent log + durable media deletion queue.
-- Additive only: two new tables, no change to existing rows or columns.

CREATE TABLE IF NOT EXISTS "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policy" TEXT NOT NULL DEFAULT 'privacy',
    "policyVersion" TEXT NOT NULL,
    "source" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConsentRecord_userId_policy_policyVersion_key"
    ON "ConsentRecord"("userId", "policy", "policyVersion");
CREATE INDEX IF NOT EXISTS "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ConsentRecord_userId_fkey'
    ) THEN
        ALTER TABLE "ConsentRecord"
            ADD CONSTRAINT "ConsentRecord_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "MediaDeletionJob" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "MediaDeletionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MediaDeletionJob_processedAt_createdAt_idx"
    ON "MediaDeletionJob"("processedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "MediaDeletionJob_userId_idx" ON "MediaDeletionJob"("userId");
