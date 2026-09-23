-- Database-driven subscription plans migration
-- Preserves existing subscriptions; maps legacy plan IDs to new slugs.

-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('USER', 'BUTCHER');
CREATE TYPE "FeatureValueType" AS ENUM ('BOOLEAN', 'NUMBER', 'STRING', 'JSON');

-- CreateTable Plan
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "audience" "PlanAudience" NOT NULL,
    "monthlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yearlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "yearlyDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlanFeature
CREATE TABLE "PlanFeature" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" "FeatureValueType" NOT NULL,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

-- Add new subscription columns before converting planId
ALTER TABLE "Subscription" ADD COLUMN "planAudience" "PlanAudience" NOT NULL DEFAULT 'USER';
ALTER TABLE "Subscription" ADD COLUMN "planDbId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Subscription" ADD COLUMN "featuredAdsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "pinnedAdsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "dailyAdsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "dailyAdsWindowStart" TIMESTAMP(3);

-- Convert planId from enum to text (preserve data)
ALTER TABLE "Subscription" ALTER COLUMN "planId" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "planId" TYPE TEXT USING ("planId"::TEXT);
ALTER TABLE "Subscription" ALTER COLUMN "planId" SET DEFAULT 'free';

-- Map legacy plan IDs to new slugs
UPDATE "Subscription" SET "planId" = 'sarh-pro' WHERE "planId" IN ('starter', 'pro', 'vip');

-- Set butcher audience for users with butcher role on paid plans (growth migration handled at runtime)
UPDATE "Subscription" s
SET "planAudience" = 'BUTCHER'
FROM "User" u
WHERE s."userId" = u.id AND u.role = 'BUTCHER';

-- Drop legacy enum
DROP TYPE "PlanId";

-- Indexes & constraints
CREATE UNIQUE INDEX "Plan_slug_audience_key" ON "Plan"("slug", "audience");
CREATE INDEX "Plan_audience_isActive_sortOrder_idx" ON "Plan"("audience", "isActive", "sortOrder");
CREATE UNIQUE INDEX "PlanFeature_planId_key_key" ON "PlanFeature"("planId", "key");
CREATE INDEX "PlanFeature_planId_idx" ON "PlanFeature"("planId");
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");
CREATE INDEX "Subscription_planDbId_idx" ON "Subscription"("planDbId");

ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planDbId_fkey" FOREIGN KEY ("planDbId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
