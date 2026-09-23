/**
 * One-off: ensure free USER/BUTCHER plans exist on the connected DB.
 * Run with DATABASE_URL set.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const USER_FEATURES = [
  { key: 'maxAdsPer24Hours', value: '1', valueType: 'NUMBER' },
  { key: 'monthlyFeaturedAds', value: '0', valueType: 'NUMBER' },
  { key: 'monthlyPinnedAds', value: '0', valueType: 'NUMBER' },
  { key: 'monthlyLiveHours', value: '0', valueType: 'NUMBER' },
  { key: 'verifiedBadge', value: 'false', valueType: 'BOOLEAN' },
  { key: 'prioritySupport', value: 'false', valueType: 'BOOLEAN' },
  { key: 'prioritySearch', value: 'false', valueType: 'BOOLEAN' },
  { key: 'priorityHome', value: 'false', valueType: 'BOOLEAN' },
  { key: 'canCreateLive', value: 'false', valueType: 'BOOLEAN' },
];

const BUTCHER_FEATURES = [
  { key: 'storeEnabled', value: 'true', valueType: 'BOOLEAN' },
  { key: 'receiveOrders', value: 'true', valueType: 'BOOLEAN' },
  { key: 'analyticsDashboard', value: 'true', valueType: 'BOOLEAN' },
  { key: 'storeCommission', value: '5', valueType: 'NUMBER' },
  { key: 'monthlyLiveHours', value: '0', valueType: 'NUMBER' },
  { key: 'verifiedBadge', value: 'false', valueType: 'BOOLEAN' },
  { key: 'prioritySupport', value: 'false', valueType: 'BOOLEAN' },
  { key: 'prioritySearch', value: 'false', valueType: 'BOOLEAN' },
  { key: 'canCreateLive', value: 'false', valueType: 'BOOLEAN' },
];

async function ensureFree(audience) {
  const existing = await prisma.plan.findUnique({
    where: { slug_audience: { slug: 'free', audience } },
  });
  if (!existing) {
    const features = audience === 'USER' ? USER_FEATURES : BUTCHER_FEATURES;
    const created = await prisma.plan.create({
      data: {
        slug: 'free',
        name: 'مجاني',
        description:
          audience === 'USER'
            ? 'ابدأ التداول في سرح مجاناً'
            : 'باقة مجانية للملاحم',
        audience,
        monthlyPrice: 0,
        yearlyPrice: 0,
        currency: 'SAR',
        yearlyDiscount: 0,
        isActive: true,
        sortOrder: 0,
        features: { create: features },
      },
    });
    console.log('CREATED free', audience, created.id);
    return;
  }
  await prisma.plan.update({
    where: { id: existing.id },
    data: {
      monthlyPrice: 0,
      yearlyPrice: 0,
      isActive: true,
      sortOrder: 0,
      name: 'مجاني',
    },
  });
  console.log('RESET free', audience, existing.id);
}

async function main() {
  const all = await prisma.plan.findMany({ include: { features: true } });
  console.log(
    'BEFORE:',
    all.map((p) => ({
      slug: p.slug,
      audience: p.audience,
      monthlyPrice: p.monthlyPrice,
      sortOrder: p.sortOrder,
      features: p.features.length,
    })),
  );

  await ensureFree('USER');
  await ensureFree('BUTCHER');

  await prisma.plan.updateMany({
    where: { slug: { not: 'free' }, sortOrder: 0 },
    data: { sortOrder: 1 },
  });

  const after = await prisma.plan.findMany({
    orderBy: [{ audience: 'asc' }, { sortOrder: 'asc' }],
  });
  console.log(
    'AFTER:',
    after.map((p) => ({
      slug: p.slug,
      audience: p.audience,
      monthlyPrice: p.monthlyPrice,
      sortOrder: p.sortOrder,
      isActive: p.isActive,
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
