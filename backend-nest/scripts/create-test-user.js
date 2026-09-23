const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

(async () => {
  const prisma = new PrismaClient();
  const phone = '+966500000001';
  const password = 'Test1234';
  const hash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { phone } });
  let user;
  if (existing) {
    user = await prisma.user.update({
      where: { phone },
      data: { passwordHash: hash, isActive: true, deletedAt: null },
    });
    console.log('UPDATED_USER', user.id, user.username, user.phone);
  } else {
    user = await prisma.user.create({
      data: {
        username: 'testuser',
        phone,
        passwordHash: hash,
        displayName: 'مستخدم تجريبي',
        arabicName: 'مستخدم تجريبي',
        country: 'SA',
        role: 'USER',
        emailVerified: true,
      },
    });
    console.log('CREATED_USER', user.id, user.username, user.phone);
  }

  const freePlan = await prisma.plan.findFirst({
    where: { slug: 'free', audience: 'USER' },
  });
  if (freePlan) {
    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        planId: freePlan.slug,
        planDbId: freePlan.id,
        planAudience: 'USER',
        status: 'active',
        renewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        planId: freePlan.slug,
        planDbId: freePlan.id,
        status: 'active',
      },
    });
    console.log('SUBSCRIPTION_OK', freePlan.slug);
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  console.log('PASSWORD_OK', ok);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
