/**
 * Seed official MEWA / Naama service links.
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-official-services.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SERVICES = [
  {
    title: 'إصدار سجل مربي',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين من ملاك الحيوانات لطلب إصدار سجل مربي.',
    category: 'veterinary',
    icon: 'document-text-outline',
    externalUrl:
      'https://anaam.mewa.gov.sa/anaam/ClinicRequestCardIssues/index?ClinicTypeId=fVfSs82hxvWEJfDm0UT+SA==',
    active: true,
  },
  {
    title: 'طلب موعد زيارة عيادة بيطرية',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين الحاصلين على سجل مربي من تقديم طلب موعد زيارة العيادة البيطرية التابعة لهم.',
    category: 'veterinary',
    icon: 'medical-outline',
    externalUrl:
      'https://naama.sa/services/details/443c9549-acdd-4a2a-a13a-2f878921c556',
    active: true,
  },
  {
    title: 'موعد التحصينات',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين من ملاك الحيوانات من طلب موعد من العيادة التابعة لتحصين المواشي.',
    category: 'veterinary',
    icon: 'shield-checkmark-outline',
    externalUrl:
      'https://naama.sa/services/details/167e9681-249e-4101-b714-aeacecd22a06',
    active: true,
  },
  {
    title: 'طلب ترقيم الماشية',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تسمح للمستفيدين بطلب ترقيم الماشية إلكترونياً.',
    category: 'livestock',
    icon: 'barcode-outline',
    externalUrl:
      'https://ui.naama.sa/livestocknumbering/livestock-numbering/enduser/livestock-numbering',
    active: true,
  },
  {
    title: 'إدارة بيانات الماشية',
    description:
      'خدمة إلكترونية مقدمة من وزارة البيئة والمياه والزراعة تمكن ملاك الماشية في المملكة من تحديث بيانات الماشية الخاصة بهم.',
    category: 'livestock',
    icon: 'list-outline',
    externalUrl:
      'https://ui.naama.sa/livestocknumbering/livestock-numbering/enduser/livestock-data-management',
    active: true,
  },
  {
    title: 'حجز موعد مسلخ',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة للحجز الإلكتروني للذبح في المسالخ، وتمكن المستفيدين أفراد أو أصحاب الملاحم من الحجز المسبق.',
    category: 'slaughter',
    icon: 'cut-outline',
    externalUrl: 'https://web.naama.sa/slaughter/appointment/termsconditions',
    active: true,
  },
];

async function main() {
  const count = await prisma.service.count();
  if (count > 0) {
    console.log('Services already seeded — skipping.');
    return;
  }
  await prisma.service.createMany({ data: DEFAULT_SERVICES });
  console.log(`Seeded ${DEFAULT_SERVICES.length} official services.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
