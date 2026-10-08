-- Additive data migration: weekly free boosts for verification plans.
--   Blue  (blue-badge):      0 per week
--   Blue+ (blue-plus-badge): 2 per week
--   Gold  (gold-badge):      4 per week
-- New plan feature key "weeklyFreeBoosts" (editable in the admin plans panel).
-- No schema change; an existing value (admin-set) is never overwritten.
-- A free boost is a 24h «مميز» recorded as a regular ListingBoost row
-- (amount 0, status paid, transactionId "FREE-WEEKLY-…"), no payment.

INSERT INTO "PlanFeature" ("id", "planId", "key", "value", "valueType")
SELECT gen_random_uuid()::text, p."id", 'weeklyFreeBoosts', f."value", 'NUMBER'::"FeatureValueType"
FROM "Plan" p
JOIN (VALUES
  ('blue-badge', '0'),
  ('blue-plus-badge', '2'),
  ('gold-badge', '4')
) AS f("slug", "value") ON f."slug" = p."slug"
WHERE p."audience" = 'USER'
ON CONFLICT ("planId", "key") DO NOTHING;
