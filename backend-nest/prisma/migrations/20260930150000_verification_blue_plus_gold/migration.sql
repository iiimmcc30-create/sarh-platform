-- Additive data migration: final verification plans (Blue, Blue+, Gold).
--   Blue  (blue-badge):      29 SAR / month, +3 daily listings, blue badge  (unchanged)
--   Blue+ (blue-plus-badge): 59 SAR / month, +6 daily listings, BLUE badge  (new plan)
--   Gold  (gold-badge):      99 SAR / month, +10 daily listings, gold badge (was 59 / +6)
-- Gold requires a merchant document before payment (enforced by the API).
-- The Plan table stays the single source of truth (editable in the admin
-- plans panel). Monthly billing only, manual renewal, no automatic charge.
-- No schema change. User."verifiedTier" is a free TEXT column: existing
-- values (NULL / 'blue' / 'gold') stay valid and the new value 'blue_plus'
-- renders the blue badge in every app build (only 'gold' is gold).
-- A price or limit an admin has already changed is never overwritten.

-- Blue+ plan (active, between Blue and Gold).
INSERT INTO "Plan" ("id", "slug", "name", "description", "audience", "monthlyPrice", "yearlyPrice", "currency", "yearlyDiscount", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'blue-plus-badge', 'Blue+ الشارة الزرقاء', 'للمستخدمين النشطين: شارة زرقاء وإعلانات يومية أكثر', 'USER', 59, 0, 'SAR', 0, true, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug", "audience") DO NOTHING;

-- Blue+ benefits. verifiedBadge stays false on purpose (the badge is managed
-- by VerificationBadgeService, not the legacy verifiedBadge side effect).
INSERT INTO "PlanFeature" ("id", "planId", "key", "value", "valueType")
SELECT gen_random_uuid()::text, p."id", f."key", f."value", f."valueType"::"FeatureValueType"
FROM "Plan" p
JOIN (VALUES
  ('blue-plus-badge', 'extraDailyListings', '6', 'NUMBER'),
  ('blue-plus-badge', 'prioritySearch', 'true', 'BOOLEAN'),
  ('blue-plus-badge', 'priorityHome', 'false', 'BOOLEAN'),
  ('blue-plus-badge', 'verifiedBadge', 'false', 'BOOLEAN')
) AS f("slug", "key", "value", "valueType") ON f."slug" = p."slug"
WHERE p."audience" = 'USER'
ON CONFLICT ("planId", "key") DO NOTHING;

-- Gold: 99 SAR / month. Only the placeholder (0) or the previous default (59)
-- is replaced; any other admin-set price is kept.
UPDATE "Plan"
SET "monthlyPrice" = CASE WHEN "monthlyPrice" IN (0, 59) THEN 99 ELSE "monthlyPrice" END,
    "currency" = 'SAR',
    "isActive" = true,
    "sortOrder" = 20,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'gold-badge' AND "audience" = 'USER';

-- Gold: +10 daily listings (replaces the previous default 6 only).
UPDATE "PlanFeature" pf
SET "value" = '10'
FROM "Plan" p
WHERE pf."planId" = p."id"
  AND p."slug" = 'gold-badge' AND p."audience" = 'USER'
  AND pf."key" = 'extraDailyListings'
  AND pf."value" IN ('0', '6');

INSERT INTO "PlanFeature" ("id", "planId", "key", "value", "valueType")
SELECT gen_random_uuid()::text, p."id", 'extraDailyListings', '10', 'NUMBER'::"FeatureValueType"
FROM "Plan" p
WHERE p."slug" = 'gold-badge' AND p."audience" = 'USER'
ON CONFLICT ("planId", "key") DO NOTHING;
