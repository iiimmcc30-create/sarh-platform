const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

(async () => {
  const prisma = new PrismaClient();
  const phone = '+966500000002';
  const password = 'Test1234';
  const hash = await bcrypt.hash(password, 12);

  let user = await prisma.user.findUnique({ where: { phone } });
  if (user) {
    user = await prisma.user.update({
      where: { phone },
      data: {
        passwordHash: hash,
        role: 'BUTCHER',
        isActive: true,
        deletedAt: null,
        displayName: 'ملحمة تجريبية',
        arabicName: 'ملحمة تجريبية',
      },
    });
    console.log('UPDATED_USER', user.id, user.username, user.phone);
  } else {
    user = await prisma.user.create({
      data: {
        username: 'testbutcher',
        phone,
        passwordHash: hash,
        displayName: 'ملحمة تجريبية',
        arabicName: 'ملحمة تجريبية',
        country: 'SA',
        role: 'BUTCHER',
        emailVerified: true,
      },
    });
    console.log('CREATED_USER', user.id, user.username, user.phone);
  }

  const freePlan = await prisma.plan.findFirst({
    where: { slug: 'free', audience: 'BUTCHER' },
  });
  if (freePlan) {
    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        planId: freePlan.slug,
        planDbId: freePlan.id,
        planAudience: 'BUTCHER',
        status: 'active',
        renewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        planId: freePlan.slug,
        planDbId: freePlan.id,
        planAudience: 'BUTCHER',
        status: 'active',
      },
    });
    console.log('SUBSCRIPTION_OK', freePlan.slug);
  }

  let application = await prisma.butcherApplication.findFirst({
    where: { userId: user.id, status: 'APPROVED' },
    include: { sourcedButcher: true },
  });

  if (!application) {
    const last = await prisma.butcherApplication.findFirst({
      where: { userId: user.id },
      orderBy: { applicationNumber: 'desc' },
    });
    const applicationNumber = (last?.applicationNumber ?? 0) + 1;
    const now = new Date();

    application = await prisma.butcherApplication.create({
      data: {
        userId: user.id,
        applicationNumber,
        status: 'APPROVED',
        nameAr: 'ملحمة الاختبار',
        nameEn: 'Test Butcher',
        shopPhone: phone,
        commercialReg: '1010000000',
        country: 'SA',
        city: 'Riyadh',
        cityAr: 'الرياض',
        address: 'Test Street',
        addressAr: 'شارع الاختبار',
        lat: 24.7136,
        lng: 46.6753,
        bioAr: 'ملحمة تجريبية لاختبار الطلبات والمنتجات',
        bioEn: 'Test butcher for orders and products',
        specialties: ['lamb', 'beef'],
        openTime: '06:00',
        closeTime: '22:00',
        acceptedTermsAt: now,
        submittedAt: now,
        approvedAt: now,
      },
      include: { sourcedButcher: true },
    });
    console.log('CREATED_APPLICATION', application.id);
  } else {
    console.log('EXISTING_APPLICATION', application.id);
  }

  let butcher = await prisma.butcher.findUnique({ where: { userId: user.id } });
  if (!butcher) {
    butcher = await prisma.butcher.create({
      data: {
        userId: user.id,
        nameAr: 'ملحمة الاختبار',
        nameEn: 'Test Butcher',
        type: 'verified',
        country: 'SA',
        city: 'Riyadh',
        cityAr: 'الرياض',
        address: 'Test Street',
        addressAr: 'شارع الاختبار',
        lat: 24.7136,
        lng: 46.6753,
        phone,
        bioAr: 'ملحمة تجريبية لاختبار الطلبات والمنتجات',
        bioEn: 'Test butcher for orders and products',
        specialties: ['lamb', 'beef'],
        commercialReg: '1010000000',
        subscriptionActive: true,
        openTime: '06:00',
        closeTime: '22:00',
        closedDays: [],
        isOpen: true,
        sourceApplicationId: application.id,
      },
    });
    console.log('CREATED_BUTCHER', butcher.id);
  } else {
    butcher = await prisma.butcher.update({
      where: { id: butcher.id },
      data: {
        subscriptionActive: true,
        isOpen: true,
        deletedAt: null,
        sourceApplicationId: application.id,
      },
    });
    console.log('UPDATED_BUTCHER', butcher.id);
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  console.log('PASSWORD_OK', ok);
  console.log('---');
  console.log('LOGIN_PHONE +966 / 500000002');
  console.log('PASSWORD Test1234');
  console.log('OTP 123456 (if DEV_OTP=true)');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
