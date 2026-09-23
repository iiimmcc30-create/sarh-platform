/**
 * Seed default admin settings and sample support tickets only.
 * Does NOT create or modify user passwords — login uses existing DB accounts.
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-admin.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const defaults = [
    { key: 'maintenanceMode', value: false, labelAr: 'وضع الصيانة', category: 'system' },
    { key: 'allowRegistration', value: true, labelAr: 'السماح بالتسجيل', category: 'auth' },
    { key: 'liveStreamsEnabled', value: true, labelAr: 'تفعيل البث المباشر', category: 'features' },
    { key: 'butcherApplicationsEnabled', value: true, labelAr: 'طلبات الملاحم', category: 'features' },
    {
      key: 'features.paidPromotionEnabled',
      value: true,
      labelAr: 'ترويج الإعلان (الظهور المدفوع)',
      category: 'paid_services',
    },
    {
      key: 'features.paidPinEnabled',
      value: true,
      labelAr: 'تثبيت الإعلان',
      category: 'paid_services',
    },
    {
      key: 'features.paidFeatureEnabled',
      value: true,
      labelAr: 'تمييز الإعلان',
      category: 'paid_services',
    },
    {
      key: 'features.listingFeesEnabled',
      value: true,
      labelAr: 'سداد الرسوم والتعهد وزر ترقية الإعلان',
      category: 'paid_services',
    },
  ];

  for (const s of defaults) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      create: s,
      update: {},
    });
  }
  console.log('Default settings seeded (existing values preserved)');

  const ticketCount = await prisma.supportTicket.count();
  if (ticketCount === 0) {
    await prisma.supportTicket.createMany({
      data: [
        {
          ticketNumber: 'TKT-00001',
          category: 'technical',
          priority: 'NORMAL',
          status: 'OPEN',
          subject: 'مشكلة في تسجيل الدخول',
          description: 'لا أستطيع تسجيل الدخول عبر رقم الجوال',
        },
        {
          ticketNumber: 'TKT-00002',
          category: 'payment',
          priority: 'URGENT',
          status: 'OPEN',
          subject: 'لم يتم خصم المبلغ',
          description: 'تم الدفع ولم يُفعّل الاشتراك',
        },
        {
          ticketNumber: 'TKT-00003',
          category: 'content',
          priority: 'LOW',
          status: 'CLOSED',
          subject: 'بلاغ محتوى',
          description: 'منشور مخالف للشروط',
        },
      ],
    });
    console.log('Sample support tickets seeded');
  }

  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'MODERATOR'] }, isActive: true },
    select: { username: true, email: true, role: true },
  });
  console.log(
    `Active admin accounts in DB (${admins.length}):`,
    admins.map((a) => `${a.username} / ${a.email ?? '—'} [${a.role}]`).join(', ') || 'none',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
