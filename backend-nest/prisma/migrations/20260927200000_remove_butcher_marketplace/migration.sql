-- Remove the legacy butcher marketplace (all butcher data was test-only).
-- Order: clean shared-table rows that use butcher values -> drop butcher tables
-- -> drop butcher columns -> recreate enums without butcher values.

-- 1) Shared rows that reference butcher features --------------------------------

-- Butcher payments (IntegrationOrder rows cascade via FK).
DELETE FROM "Payment"
WHERE "referenceType" IN ('butcher_order', 'butcher_checkout', 'order_commission');

-- Butcher accounts become regular users (keeps their core Sarh data intact).
UPDATE "User" SET "role" = 'USER' WHERE "role" = 'BUTCHER';

-- Butcher-audience subscriptions move to the USER free plan.
UPDATE "Subscription"
SET "planAudience" = 'USER',
    "planId" = 'free',
    "planDbId" = (SELECT "id" FROM "Plan" WHERE "slug" = 'free' AND "audience" = 'USER' LIMIT 1)
WHERE "planAudience" = 'BUTCHER';

-- Any other subscription still pointing at a butcher plan.
UPDATE "Subscription"
SET "planId" = 'free',
    "planDbId" = (SELECT "id" FROM "Plan" WHERE "slug" = 'free' AND "audience" = 'USER' LIMIT 1)
WHERE "planDbId" IN (SELECT "id" FROM "Plan" WHERE "audience" = 'BUTCHER');

-- Butcher plans (PlanFeature rows cascade).
DELETE FROM "Plan" WHERE "audience" = 'BUTCHER';

-- Butcher chat threads.
DELETE FROM "Message"
WHERE "threadId" IN (
  SELECT "id" FROM "MessageThread" WHERE "type" = 'BUTCHER' OR "butcherId" IS NOT NULL
);
DELETE FROM "MessageThread" WHERE "type" = 'BUTCHER' OR "butcherId" IS NOT NULL;

-- Support tickets: drop order links and butcher categories.
UPDATE "SupportTicket" SET "orderId" = NULL WHERE "orderId" IS NOT NULL;
UPDATE "SupportTicket" SET "category" = 'OTHER_HELP' WHERE "category" = 'ORDER_HELP';
UPDATE "SupportTicket" SET "category" = 'OTHER' WHERE "category" = 'BUTCHERS';

-- FAQ, notifications, settings and banners that only served butchers.
DELETE FROM "Faq" WHERE "category" = 'BUTCHERS';
DELETE FROM "Notification" WHERE "type" = 'order_update';
DELETE FROM "AppSetting" WHERE "key" = 'butcherApplicationsEnabled';
DELETE FROM "ExploreSarhBanner" WHERE "href" = '/butchers' OR "href" LIKE '/butchers/%';

-- 2) Drop butcher-only foreign keys on shared tables ----------------------------

ALTER TABLE "MessageThread" DROP CONSTRAINT IF EXISTS "MessageThread_butcherId_fkey";
ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_orderId_fkey";

-- 3) Drop butcher tables (children first) ---------------------------------------

DROP TABLE IF EXISTS "ButcherDaftraProduct";
DROP TABLE IF EXISTS "ButcherDaftraIntegration";
DROP TABLE IF EXISTS "OrderStatusAudit";
DROP TABLE IF EXISTS "OrderTimeline";
DROP TABLE IF EXISTS "ButcherOrderItem";
DROP TABLE IF EXISTS "ButcherOrder";
DROP TABLE IF EXISTS "ButcherCheckoutReservation";
DROP TABLE IF EXISTS "ButcherCheckout";
DROP TABLE IF EXISTS "OrderNumberSequence";
DROP TABLE IF EXISTS "ButcherReview";
DROP TABLE IF EXISTS "ButcherFavorite";
DROP TABLE IF EXISTS "ButcherStory";
DROP TABLE IF EXISTS "ButcherOffer";
DROP TABLE IF EXISTS "ButcherProduct";
DROP TABLE IF EXISTS "ButcherMarketBanner";
DROP TABLE IF EXISTS "Butcher";
DROP TABLE IF EXISTS "ButcherApplicationTimelineEvent";
DROP TABLE IF EXISTS "ButcherApplicationDocument";
DROP TABLE IF EXISTS "ButcherApplication";

-- 4) Drop butcher columns on shared tables --------------------------------------

DROP INDEX IF EXISTS "MessageThread_butcherId_idx";
ALTER TABLE "MessageThread" DROP COLUMN IF EXISTS "butcherId";

DROP INDEX IF EXISTS "SupportTicket_orderId_idx";
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "orderId";

ALTER TABLE "Message" DROP COLUMN IF EXISTS "orderId";

-- 5) Drop butcher-only enums ----------------------------------------------------

DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "OrderPaymentStatus";
DROP TYPE IF EXISTS "ButcherCheckoutStatus";
DROP TYPE IF EXISTS "ButcherReservationStatus";
DROP TYPE IF EXISTS "ButcherType";
DROP TYPE IF EXISTS "MeatCategory";
DROP TYPE IF EXISTS "StoryType";
DROP TYPE IF EXISTS "ButcherApplicationStatus";
DROP TYPE IF EXISTS "ButcherApplicationDocumentType";
DROP TYPE IF EXISTS "ButcherApplicationDocumentStatus";
DROP TYPE IF EXISTS "ButcherApplicationTimelineAction";
DROP TYPE IF EXISTS "DaftraIntegrationStatus";
DROP TYPE IF EXISTS "DaftraAuthMethod";

-- 6) Recreate shared enums without butcher values -------------------------------
-- (Postgres cannot drop enum values: rename -> create -> cast -> drop old.)

-- Role
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MODERATOR');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "Role_old";

-- PlanAudience
ALTER TYPE "PlanAudience" RENAME TO "PlanAudience_old";
CREATE TYPE "PlanAudience" AS ENUM ('USER');
ALTER TABLE "Plan" ALTER COLUMN "audience" TYPE "PlanAudience" USING ("audience"::text::"PlanAudience");
ALTER TABLE "Subscription" ALTER COLUMN "planAudience" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "planAudience" TYPE "PlanAudience" USING ("planAudience"::text::"PlanAudience");
ALTER TABLE "Subscription" ALTER COLUMN "planAudience" SET DEFAULT 'USER';
DROP TYPE "PlanAudience_old";

-- MessageThreadType
ALTER TYPE "MessageThreadType" RENAME TO "MessageThreadType_old";
CREATE TYPE "MessageThreadType" AS ENUM ('DIRECT');
ALTER TABLE "MessageThread" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "MessageThread" ALTER COLUMN "type" TYPE "MessageThreadType" USING ("type"::text::"MessageThreadType");
ALTER TABLE "MessageThread" ALTER COLUMN "type" SET DEFAULT 'DIRECT';
DROP TYPE "MessageThreadType_old";

-- PaymentReferenceType
ALTER TYPE "PaymentReferenceType" RENAME TO "PaymentReferenceType_old";
CREATE TYPE "PaymentReferenceType" AS ENUM ('subscription', 'fee', 'listing_fee', 'featured_ad', 'pinned_ad', 'promoted_ad', 'commission');
ALTER TABLE "Payment" ALTER COLUMN "referenceType" TYPE "PaymentReferenceType" USING ("referenceType"::text::"PaymentReferenceType");
DROP TYPE "PaymentReferenceType_old";

-- NotificationType
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('like', 'follow', 'comment', 'repost', 'offer', 'fee_due', 'subscription_renew', 'new_message', 'live_start', 'system', 'story_reaction', 'story_reply');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::text::"NotificationType");
DROP TYPE "NotificationType_old";

-- FaqCategory
ALTER TYPE "FaqCategory" RENAME TO "FaqCategory_old";
CREATE TYPE "FaqCategory" AS ENUM ('ACCOUNT', 'ADS', 'MARKET', 'BUY_SELL', 'PAYMENT', 'VERIFICATION', 'TECHNICAL', 'GENERAL');
ALTER TABLE "Faq" ALTER COLUMN "category" TYPE "FaqCategory" USING ("category"::text::"FaqCategory");
DROP TYPE "FaqCategory_old";