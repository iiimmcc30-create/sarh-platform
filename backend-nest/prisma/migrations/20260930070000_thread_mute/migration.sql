-- Additive, non-destructive: per-participant conversation mute.
-- A muted thread still stores and delivers messages; only push notifications
-- for that participant are skipped. No existing rows are modified.

-- AlterTable
ALTER TABLE "MessageThreadState" ADD COLUMN "mutedAt" TIMESTAMP(3);
