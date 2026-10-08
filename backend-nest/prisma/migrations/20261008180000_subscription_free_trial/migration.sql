-- Free one-week Blue+ trial (one per account, ever).
-- Additive and nullable only: existing rows are untouched (NULL = never used
-- the trial). Idempotent so it is safe to re-run.

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
