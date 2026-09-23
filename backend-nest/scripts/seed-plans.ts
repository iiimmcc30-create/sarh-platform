/**
 * Seed default subscription plans and features.
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-plans.ts
 */
import { PrismaClient, PlanAudience, FeatureValueType } from '@prisma/client';

const prisma = new PrismaClient();

type FeatureDef = {
  key: string;
  value: string;
  valueType: FeatureValueType;
};

type PlanDef = {
  slug: string;
  name: string;
  description: string;
  audience: PlanAudience;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  yearlyDiscount: number;
  sortOrder: number;
  features: FeatureDef[];
};

const DEFAULT_PLANS: PlanDef[] = [
  {
    slug: 'free',
    name: 'مجاني',
    description: 'ابدأ التداول في سرح مجاناً',
    audience: 'USER',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'SAR',
    yearlyDiscount: 0,
    sortOrder: 0,
    features: [
      { key: 'maxAdsPer24Hours', value: '1', valueType: 'NUMBER' },
      { key: 'monthlyFeaturedAds', value: '0', valueType: 'NUMBER' },
      { key: 'monthlyPinnedAds', value: '0', valueType: 'NUMBER' },
      { key: 'monthlyLiveHours', value: '0', valueType: 'NUMBER' },
      { key: 'verifiedBadge', value: 'false', valueType: 'BOOLEAN' },
      { key: 'prioritySupport', value: 'false', valueType: 'BOOLEAN' },
      { key: 'prioritySearch', value: 'false', valueType: 'BOOLEAN' },
      { key: 'priorityHome', value: 'false', valueType: 'BOOLEAN' },
      { key: 'canCreateLive', value: 'false', valueType: 'BOOLEAN' },
    ],
  },
  {
    slug: 'sarh-pro',
    name: 'سرح برو',
    description: 'الباقة المميزة للمتداولين والمربين النشطين',
    audience: 'USER',
    monthlyPrice: 299,
    yearlyPrice: 2990,
    currency: 'SAR',
    yearlyDiscount: 0,
    sortOrder: 1,
    features: [
      { key: 'maxAdsPer24Hours', value: '-1', valueType: 'NUMBER' },
      { key: 'monthlyFeaturedAds', value: '10', valueType: 'NUMBER' },
      { key: 'monthlyPinnedAds', value: '10', valueType: 'NUMBER' },
      { key: 'monthlyLiveHours', value: '30', valueType: 'NUMBER' },
      { key: 'verifiedBadge', value: 'true', valueType: 'BOOLEAN' },
      { key: 'prioritySupport', value: 'true', valueType: 'BOOLEAN' },
      { key: 'prioritySearch', value: 'true', valueType: 'BOOLEAN' },
      { key: 'priorityHome', value: 'true', valueType: 'BOOLEAN' },
      { key: 'canCreateLive', value: 'true', valueType: 'BOOLEAN' },
    ],
  },
  {
    slug: 'free',
    name: 'مجاني',
    description: 'باقة مجانية للملاحم',
    audience: 'BUTCHER',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'SAR',
    yearlyDiscount: 0,
    sortOrder: 0,
    features: [
      { key: 'storeEnabled', value: 'true', valueType: 'BOOLEAN' },
      { key: 'receiveOrders', value: 'true', valueType: 'BOOLEAN' },
      { key: 'analyticsDashboard', value: 'true', valueType: 'BOOLEAN' },
      { key: 'storeCommission', value: '1', valueType: 'NUMBER' },
      { key: 'monthlyLiveHours', value: '0', valueType: 'NUMBER' },
      { key: 'verifiedBadge', value: 'false', valueType: 'BOOLEAN' },
      { key: 'prioritySupport', value: 'false', valueType: 'BOOLEAN' },
      { key: 'prioritySearch', value: 'false', valueType: 'BOOLEAN' },
      { key: 'canCreateLive', value: 'false', valueType: 'BOOLEAN' },
    ],
  },
  {
    slug: 'growth',
    name: 'نمو',
    description: 'باقة النمو للملاحم والمتاجر الموثّقة',
    audience: 'BUTCHER',
    monthlyPrice: 399,
    yearlyPrice: 3990,
    currency: 'SAR',
    yearlyDiscount: 0,
    sortOrder: 1,
    features: [
      { key: 'storeEnabled', value: 'true', valueType: 'BOOLEAN' },
      { key: 'receiveOrders', value: 'true', valueType: 'BOOLEAN' },
      { key: 'analyticsDashboard', value: 'true', valueType: 'BOOLEAN' },
      { key: 'storeCommission', value: '0', valueType: 'NUMBER' },
      { key: 'monthlyLiveHours', value: '20', valueType: 'NUMBER' },
      { key: 'verifiedBadge', value: 'true', valueType: 'BOOLEAN' },
      { key: 'prioritySupport', value: 'true', valueType: 'BOOLEAN' },
      { key: 'prioritySearch', value: 'true', valueType: 'BOOLEAN' },
      { key: 'canCreateLive', value: 'true', valueType: 'BOOLEAN' },
    ],
  },
];

async function seedPlan(def: PlanDef) {
  const plan = await prisma.plan.upsert({
    where: {
      slug_audience: { slug: def.slug, audience: def.audience },
    },
    create: {
      slug: def.slug,
      name: def.name,
      description: def.description,
      audience: def.audience,
      monthlyPrice: def.monthlyPrice,
      yearlyPrice: def.yearlyPrice,
      currency: def.currency,
      yearlyDiscount: def.yearlyDiscount,
      sortOrder: def.sortOrder,
      isActive: true,
    },
    update: {
      name: def.name,
      description: def.description,
      monthlyPrice: def.monthlyPrice,
      yearlyPrice: def.yearlyPrice,
      currency: def.currency,
      yearlyDiscount: def.yearlyDiscount,
      sortOrder: def.sortOrder,
      isActive: true,
    },
  });

  for (const feature of def.features) {
    await prisma.planFeature.upsert({
      where: {
        planId_key: { planId: plan.id, key: feature.key },
      },
      create: {
        planId: plan.id,
        key: feature.key,
        value: feature.value,
        valueType: feature.valueType,
      },
      update: {
        value: feature.value,
        valueType: feature.valueType,
      },
    });
  }

  return plan;
}

async function linkSubscriptions() {
  const plans = await prisma.plan.findMany({
    include: { features: true },
  });

  const subs = await prisma.subscription.findMany({
    select: { id: true, planId: true, planAudience: true },
  });

  for (const sub of subs) {
    const plan = plans.find(
      (p) => p.slug === sub.planId && p.audience === sub.planAudience,
    );
    if (plan) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { planDbId: plan.id },
      });
    }
  }
}

async function main() {
  console.log('Seeding subscription plans...');
  for (const def of DEFAULT_PLANS) {
    const plan = await seedPlan(def);
    console.log(`  ✓ ${plan.audience}/${plan.slug}`);
  }
  await linkSubscriptions();
  console.log('Linked existing subscriptions to plan records.');
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
