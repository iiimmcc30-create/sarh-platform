-- Additive, non-destructive: verification badge tiers (Blue / Gold) sold as
-- monthly subscriptions on top of the existing Plan / Subscription tables.
-- No existing rows are modified. Existing verified users keep verified = true
-- with verifiedTier = NULL, which the apps render as the (current) blue badge.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "verifiedTier" TEXT;
ALTER TABLE "User" ADD COLUMN "subscriptionBadge" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AccountVerificationRequest" ADD COLUMN "requestedTier" TEXT;
ALTER TABLE "AccountVerificationRequest" ADD COLUMN "approvedTier" TEXT;

-- Seed the two verification plans INACTIVE with a 0 PLACEHOLDER price.
-- PRICES ARE NOT DECIDED: an admin must set monthlyPrice in the admin plans
-- panel and activate the plan before anything can be purchased
-- (PlanResolverService only offers active plans with monthlyPrice > 0).
INSERT INTO "Plan" ("id", "slug", "name", "description", "audience", "monthlyPrice", "yearlyPrice", "currency", "yearlyDiscount", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'blue-badge', 'الشارة الزرقاء', 'توثيق للأفراد والبائعين', 'USER', 0, 0, 'SAR', 0, false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'gold-badge', 'الشارة الذهبية', 'توثيق للتجار والبائعين المحترفين', 'USER', 0, 0, 'SAR', 0, false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug", "audience") DO NOTHING;

-- Benefits (Blue: +3 daily listings, search priority; Gold: +6, search + home priority).
-- verifiedBadge stays false on purpose: the badge is granted only when the
-- verification request is approved AND the subscription is active.
INSERT INTO "PlanFeature" ("id", "planId", "key", "value", "valueType")
SELECT gen_random_uuid()::text, p."id", f."key", f."value", f."valueType"::"FeatureValueType"
FROM "Plan" p
JOIN (VALUES
  ('blue-badge', 'extraDailyListings', '3', 'NUMBER'),
  ('blue-badge', 'prioritySearch', 'true', 'BOOLEAN'),
  ('blue-badge', 'priorityHome', 'false', 'BOOLEAN'),
  ('blue-badge', 'verifiedBadge', 'false', 'BOOLEAN'),
  ('gold-badge', 'extraDailyListings', '6', 'NUMBER'),
  ('gold-badge', 'prioritySearch', 'true', 'BOOLEAN'),
  ('gold-badge', 'priorityHome', 'true', 'BOOLEAN'),
  ('gold-badge', 'verifiedBadge', 'false', 'BOOLEAN')
) AS f("slug", "key", "value", "valueType") ON f."slug" = p."slug"
WHERE p."audience" = 'USER'
ON CONFLICT ("planId", "key") DO NOTHING;
