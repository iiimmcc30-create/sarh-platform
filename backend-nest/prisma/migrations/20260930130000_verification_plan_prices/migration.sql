-- Additive data migration: activate the verification plans seeded by
-- 20260930090000_verification_tiers with their approved monthly prices.
--   Blue Badge (blue-badge): 29 SAR / month
--   Gold Badge (gold-badge): 59 SAR / month
-- The Plan table stays the single source of truth (editable in the admin
-- plans panel). Monthly billing only (yearlyPrice stays 0); renewal is manual
-- (reminders + a new payment), there is no automatic card charge.
-- Only the two seeded rows are touched, and a price an admin has already set
-- (monthlyPrice > 0) is never overwritten. No schema change.

UPDATE "Plan"
SET "monthlyPrice" = CASE WHEN "monthlyPrice" > 0 THEN "monthlyPrice" ELSE 29 END,
    "currency" = 'SAR',
    "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'blue-badge' AND "audience" = 'USER';

UPDATE "Plan"
SET "monthlyPrice" = CASE WHEN "monthlyPrice" > 0 THEN "monthlyPrice" ELSE 59 END,
    "currency" = 'SAR',
    "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'gold-badge' AND "audience" = 'USER';
