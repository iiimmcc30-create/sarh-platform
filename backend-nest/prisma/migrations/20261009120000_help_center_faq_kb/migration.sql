-- Help Center overhaul (additive only, safe to run on production data).
--   * New FAQ categories: subscriptions, councils, safety, promotion, community.
--   * Faq.key (stable seed key, unique, nullable for admin-created rows).
--   * Faq.keywords (extra phrasings for search and «مساعد سرح» retrieval).
--   * Faq.actionRoute / Faq.actionLabel (optional deep-link button).
-- No existing row, column or value is changed or removed. The knowledge base
-- itself is upserted by SupportSeedService at boot (by key) and old seed rows
-- are only deactivated (isActive = false), never deleted.

ALTER TYPE "FaqCategory" ADD VALUE IF NOT EXISTS 'SUBSCRIPTIONS';
ALTER TYPE "FaqCategory" ADD VALUE IF NOT EXISTS 'COUNCILS';
ALTER TYPE "FaqCategory" ADD VALUE IF NOT EXISTS 'SAFETY';
ALTER TYPE "FaqCategory" ADD VALUE IF NOT EXISTS 'PROMOTION';
ALTER TYPE "FaqCategory" ADD VALUE IF NOT EXISTS 'COMMUNITY';

ALTER TABLE "Faq" ADD COLUMN IF NOT EXISTS "key" TEXT;
ALTER TABLE "Faq" ADD COLUMN IF NOT EXISTS "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Faq" ADD COLUMN IF NOT EXISTS "actionRoute" TEXT;
ALTER TABLE "Faq" ADD COLUMN IF NOT EXISTS "actionLabel" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Faq_key_key" ON "Faq"("key");
